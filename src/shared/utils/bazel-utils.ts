import path from "node:path";
import * as vscode from "vscode";
import { type QuickPickItem, showQuickPick } from "../utils/quick-pick.js";

import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { getWorkspaceConfig } from "../utils/config.js";
import { ExtensionError } from "../errors/errors.js";
import { createDirectory, findFilesRecursive, isFileExists, removeDirectory } from "../utils/files.js";
import { commonLogger } from "../logger/logger.js";
import { cacheManager } from "../utils/cache-manager.js";
import type { DestinationPlatform } from "../constants/destination-constants";
import type { Destination } from "../../domain/entities/destination/types.js";
import { splitSupportedDestinatinos } from "../utils/destination-utils.js";
import type { SimulatorDestination } from "../../domain/entities/destination/simulator-types.js";

export type SelectedDestination = {
  type: "simulator" | "device";
  udid: string;
  name?: string;
};

/**
 * Ask user to select one of the Booted/Shutdown simulators
 */
export async function askSimulator(
  context: ExtensionContext,
  options: {
    title: string;
    state: "Booted" | "Shutdown";
    error: string;
  },
): Promise<SimulatorDestination> {
  let simulators = await context.destinationsManager.getSimulators({
    sort: true,
  });

  if (options?.state) {
    simulators = simulators.filter((simulator) => simulator.state === options.state);
  }

  if (simulators.length === 0) {
    throw new ExtensionError(options.error);
  }
  if (simulators.length === 1) {
    return simulators[0];
  }

  const selected = await showQuickPick({
    title: options.title,
    items: simulators.map((simulator) => {
      return {
        label: simulator.label,
        context: {
          simulator: simulator,
        },
      };
    }),
  });

  return selected.context.simulator;
}

/**
 * Ask user to select simulator or device to run on
 */
export async function askDestinationToRunOn(context: ExtensionContext): Promise<Destination> {
  // For Bazel, we support all platforms
  const supportedPlatforms = undefined;

  context.updateProgressStatus("Searching for destinations");
  const destinations = await context.destinationsManager.getDestinations({
    mostUsedSort: true,
  });

  // If we have cached desination, use it
  const cachedDestination = context.destinationsManager.getSelectedXcodeDestinationForBuild();
  if (cachedDestination) {
    const destination = destinations.find(
      (destination) => destination.id === cachedDestination.id && destination.type === cachedDestination.type,
    );
    if (destination) {
      return destination;
    }
  }

  return await selectDestinationForBuild(context, {
    destinations: destinations,
    supportedPlatforms: supportedPlatforms,
  });
}

export async function selectDestinationForBuild(
  context: ExtensionContext,
  options: {
    destinations: Destination[];
    supportedPlatforms: DestinationPlatform[] | undefined;
  },
): Promise<Destination> {
  const { supported, unsupported } = splitSupportedDestinatinos({
    destinations: options.destinations,
    supportedPlatforms: options.supportedPlatforms,
  });

  const supportedItems: QuickPickItem<Destination>[] = supported.map((destination) => ({
    label: destination.name,
    iconPath: new vscode.ThemeIcon(destination.icon),
    detail: destination.quickPickDetails,
    context: destination,
  }));
  const unsupportedItems: QuickPickItem<Destination>[] = unsupported.map((destination) => ({
    label: destination.name,
    iconPath: new vscode.ThemeIcon(destination.icon),
    detail: destination.quickPickDetails,
    context: destination,
  }));

  const items: QuickPickItem<Destination>[] = [];
  if (unsupported.length === 0 && supported.length === 0) {
    // Show that no destinations found
    items.push({
      label: "No destinations found",
      kind: vscode.QuickPickItemKind.Separator,
    });
  } else if (supported.length > 0 && unsupported.length > 0) {
    // Split supported and unsupported destinations
    items.push({
      label: "Supported platforms",
      kind: vscode.QuickPickItemKind.Separator,
    });
    items.push(...supportedItems);
    items.push({
      label: "Other",
      kind: vscode.QuickPickItemKind.Separator,
    });
    items.push(...unsupportedItems);
  } else {
    // Just make flat list, one is empty and another is not
    items.push(...supportedItems);
    items.push(...unsupportedItems);
  }

  const selected = await showQuickPick<Destination>({
    title: "Select destination to run on",
    items: items,
  });

  const destination = selected.context;

  context.destinationsManager.setWorkspaceDestinationForBuild(destination);
  return destination;
}

export async function getDestinationById(
  context: ExtensionContext,
  options: { destinationId: string },
): Promise<Destination> {
  const desinations = await context.destinationsManager.getDestinations();
  const destination = desinations.find((destination) => destination.id === options.destinationId);

  if (destination) {
    return destination;
  }

  throw new ExtensionError("Destination not found", {
    context: {
      destinationId: options.destinationId,
    },
  });
}

/**
 * Ask user to select scheme to build
 */
/** @deprecated Bazel uses targets, not schemes */
export async function askSchemeForBuild(
  context: ExtensionContext,
  options: {
    title?: string;
    xcworkspace: string;
    ignoreCache?: boolean;
  },
): Promise<string> {
  // Return a default scheme name for compatibility
  return "bazel";
}

/**
 * Get the path of the current workspace
 * @throws {ExtensionError} If no workspace is open
 */
export function getWorkspacePath(): string {
  try {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      throw new ExtensionError("No workspace folder found. Please open a folder or workspace first.");
    }

    const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
    if (!workspaceFolder) {
      throw new ExtensionError("Invalid workspace folder path");
    }
    return workspaceFolder;
  } catch (error) {
    // Log the error for debugging purposes
    commonLogger.error("Failed to get workspace path", { error });
    throw new ExtensionError("No workspace folder found. Please open a folder or workspace first.");
  }
}

/**
 * Prepare storage path for the extension. It's a folder where we store all intermediate files
 */
export async function prepareStoragePath(context: ExtensionContext): Promise<string> {
  const storagePath = context.storageUri?.fsPath;
  if (!storagePath) {
    throw new ExtensionError("No storage path found");
  }
  // Creatre folder at storagePath, because vscode doesn't create it automatically
  await createDirectory(storagePath);
  return storagePath;
}

/**
 * Prepare bundle directory for the given schema in the storage path
 */
export async function prepareBundleDir(context: ExtensionContext, schema: string): Promise<string> {
  const storagePath = await prepareStoragePath(context);

  const bundleDir = path.join(storagePath, "bundle", schema);

  // Remove old bundle if exists
  await removeDirectory(bundleDir);

  // Remove old .xcresult if exists
  const xcresult = path.join(storagePath, "bundle", `${schema}.xcresult`);
  await removeDirectory(xcresult);

  return bundleDir;
}

export function prepareDerivedDataPath(): string | null {
  const configPath = getWorkspaceConfig("build.derivedDataPath");

  // No config -> path will be provided by xcodebuild
  if (!configPath) {
    return null;
  }

  // Expand relative path to absolute
  let derivedDataPath: string = configPath;
  if (!path.isAbsolute(configPath)) {
    // Example: .biuld/ -> /Users/username/Projects/project/.build
    derivedDataPath = path.join(getWorkspacePath(), configPath);
  }

  return derivedDataPath;
}

export function getCurrentBazelWorkspacePath(context: ExtensionContext): string | undefined {
  const configPath = getWorkspaceConfig("build.xcodeWorkspacePath");
  if (configPath) {
    context.updateWorkspaceState("build.xcodeWorkspacePath", undefined);
    if (path.isAbsolute(configPath)) {
      return configPath;
    }
    return path.join(getWorkspacePath(), configPath);
  }

  const cachedPath = context.getWorkspaceState("build.xcodeWorkspacePath");
  if (cachedPath) {
    return cachedPath;
  }

  return undefined;
}

/**
 * Get the path of the currently selected Xcode workspace or ask user to select one
 */
export async function askBazelWorkspacePath(context: ExtensionContext, specificPath?: string): Promise<string> {
  context.updateProgressStatus("Searching for workspace");

  // If a specific path is provided, use it directly
  if (specificPath) {
    return specificPath;
  }

  const xcworkspace = getCurrentBazelWorkspacePath(context);
  if (xcworkspace) {
    return xcworkspace;
  }

  const selectedPath = await selectBazelWorkspace({
    autoselect: true,
  });

  context.updateWorkspaceState("build.xcodeWorkspacePath", selectedPath);
  context.buildManager.refresh();
  return selectedPath;
}

/**
 * Detect xcode workspace in the given directory
 */
export async function detectBazelWorkspacesPaths(): Promise<string[]> {
  const workspace = getWorkspacePath();

  // Look for BUILD.bazel files for Bazel projects
  const bazelBuildPaths = await findFilesRecursive({
    directory: workspace,
    depth: 4,
    maxResults: 50, // Limit Bazel files to prevent performance issues
    matcher: (file) => {
      return file.name === "BUILD.bazel" || file.name === "BUILD";
    },
  });

  return bazelBuildPaths;
}

/**
 * Find Bazel workspace in the given directory and ask user to select it
 */
export async function selectBazelWorkspace(options: { autoselect: boolean }): Promise<string> {
  const workspacePath = getWorkspacePath();

  // Get all BUILD.bazel and BUILD files
  const paths = await detectBazelWorkspacesPaths();

  // No files, nothing to do
  if (paths.length === 0) {
    throw new ExtensionError("No Bazel projects found", {
      context: {
        cwd: workspacePath,
      },
    });
  }

  // One file, use it and save it to the cache
  if (paths.length === 1 && options.autoselect) {
    const path = paths[0];
    commonLogger.log(`Bazel project was detected`, {
      workspace: workspacePath,
      path: path,
    });
    return path;
  }

  // More then one, ask user to select
  const selected = await showQuickPick({
    title: "Select Bazel project",
    items: paths
      .sort((a, b) => {
        // Sort by depth to show less nested paths first
        const aDepth = a.split(path.sep).length;
        const bDepth = b.split(path.sep).length;
        return aDepth - bDepth;
      })
      .map((bazelPath) => {
        // show only relative path, to make it more readable
        const relativePath = path.relative(workspacePath, bazelPath);

        return {
          label: relativePath,
          detail: "Bazel",
          context: {
            path: bazelPath,
          },
        };
      }),
  });
  return selected.context.path;
}

export async function restartSwiftLSP() {
  // Restart SourceKit Language Server
  try {
    await vscode.commands.executeCommand("swift.restartLSPServer");
  } catch (error) {
    commonLogger.warn("Error restarting SourceKit Language Server", {
      error: error,
    });
  }
}

/**
 * Find the Bazel workspace root by looking for WORKSPACE files
 */
export function findBazelWorkspaceRoot(startPath: string): string {
  let currentPath = path.dirname(startPath);
  const fs = require("node:fs");

  // Walk up the directory tree looking for Bazel workspace indicators
  while (currentPath !== path.dirname(currentPath)) {
    // Stop at filesystem root
    // Check for Bazel workspace files
    const workspaceFiles = ["WORKSPACE", "WORKSPACE.bazel", "MODULE.bazel"];

    for (const workspaceFile of workspaceFiles) {
      const workspaceFilePath = path.join(currentPath, workspaceFile);
      try {
        if (fs.existsSync(workspaceFilePath)) {
          return currentPath;
        }
      } catch (error) {
        // Ignore permission errors and continue
      }
    }

    // Move up one directory
    currentPath = path.dirname(currentPath);
  }

  // If no WORKSPACE file found, use the directory of the BUILD.bazel file itself
  return path.dirname(startPath);
}

// Import new comprehensive Bazel parser
import { BazelParser, type BazelTarget as NewBazelTarget } from "../../infrastructure/bazel/bazel-cli.adapter.js";

// Legacy compatibility types - keeping for backwards compatibility
export interface BazelTarget {
  name: string;
  type: "library" | "test" | "binary";
  buildLabel: string;
  testLabel?: string;
  deps: string[];
}

export interface BazelPackage {
  name: string;
  path: string;
  targets: BazelTarget[];
}

/**
 * Parse a BUILD.bazel file using the new comprehensive Bazel parser
 * (Maintains backwards compatibility with legacy interface)
 */
export async function parseBazelBuildFile(buildFilePath: string): Promise<BazelPackage | null> {
  // Validate input
  if (!buildFilePath || typeof buildFilePath !== "string" || buildFilePath.length === 0) {
    return null;
  }

  // Check for suspicious path patterns
  if (buildFilePath.startsWith("@") || buildFilePath.includes("undefined") || buildFilePath.includes("null")) {
    return null;
  }

  try {
    const fs = await import("node:fs/promises");

    // Check if file exists first
    try {
      await fs.access(buildFilePath);
    } catch (accessError) {
      return null;
    }

    const content = await fs.readFile(buildFilePath, "utf-8");

    // Use the new comprehensive parser
    const parseResult = BazelParser.parse(content, buildFilePath);

    // Convert to legacy format for backwards compatibility
    const packagePath = path.dirname(buildFilePath);
    const packageName = path.basename(packagePath);

    // Combine both regular targets and test targets into legacy format
    const allNewTargets = [...parseResult.targets, ...parseResult.targetsTest];

    // Convert new format to legacy format
    const legacyTargets: BazelTarget[] = allNewTargets.map((newTarget: NewBazelTarget) => ({
      name: newTarget.name,
      type: newTarget.type,
      buildLabel: newTarget.buildLabel,
      testLabel: newTarget.testLabel,
      deps: newTarget.deps,
    }));

    return {
      name: packageName,
      path: packagePath,
      targets: legacyTargets,
    };
  } catch (error) {
    commonLogger.warn("Failed to parse BUILD.bazel file", {
      buildFilePath,
      error,
    });
    return null;
  }
}

/**
 * Get all Bazel packages and their targets from the workspace
 * Now uses the new comprehensive parser with super cache integration
 */
export async function getBazelPackages(
  targetWorkspace?: string,
  options?: { refresh?: boolean },
): Promise<BazelPackage[]> {
  // Use provided workspace or fall back to current workspace
  const workspace = targetWorkspace || getWorkspacePath();

  // Check super cache first (unless refresh is forced)
  if (!options?.refresh) {
    const cachedPackages = cacheManager.getBazelPackages(workspace);
    if (cachedPackages.length > 0) {
      console.log(`📦 Using cached Bazel packages for ${workspace}: ${cachedPackages.length} packages`);

      // Convert BazelPackageInfo to BazelPackage for backwards compatibility
      const legacyPackages: BazelPackage[] = cachedPackages.map((pkg) => ({
        name: pkg.name,
        path: pkg.path,
        targets: [...pkg.parseResult.targets, ...pkg.parseResult.targetsTest].map((target) => ({
          name: target.name,
          type: target.type,
          buildLabel: target.buildLabel,
          testLabel: target.testLabel,
          deps: target.deps,
        })),
      }));

      return legacyPackages;
    }
  }

  // Not cached or refresh forced - scan and parse
  console.log(`🔍 Scanning Bazel BUILD files in ${workspace}...`);

  // Find all BUILD.bazel files
  const buildFiles = await findFilesRecursive({
    directory: workspace,
    depth: 10, // Allow deeper search for Bazel projects
    maxResults: 100, // Prevent performance issues
    matcher: (file) => {
      return file.name === "BUILD.bazel" || file.name === "BUILD";
    },
  });

  console.log(`  - Found ${buildFiles.length} BUILD files (parsing with new comprehensive parser)`);

  const packages: BazelPackage[] = [];
  const bazelPackageInfos: any[] = []; // Using any to match BazelPackageInfo from super-cache

  for (const buildFile of buildFiles) {
    try {
      const content = await (await import("node:fs/promises")).readFile(buildFile, "utf-8");
      const packagePath = path.dirname(buildFile);

      // Parse using new comprehensive parser
      const parseResult = BazelParser.parse(content, buildFile);

      // Create BazelPackageInfo for super cache
      const bazelPackageInfo = {
        name: path.basename(packagePath),
        path: packagePath,
        parseResult,
      };
      bazelPackageInfos.push(bazelPackageInfo);

      // Create legacy BazelPackage for backwards compatibility
      const allTargets = [...parseResult.targets, ...parseResult.targetsTest];
      const legacyTargets: BazelTarget[] = allTargets.map((target) => ({
        name: target.name,
        type: target.type,
        buildLabel: target.buildLabel,
        testLabel: target.testLabel,
        deps: target.deps,
      }));

      packages.push({
        name: path.basename(packagePath),
        path: packagePath,
        targets: legacyTargets,
      });
    } catch (error) {
      console.error(`Failed to parse BUILD file ${buildFile}:`, error);
    }
  }

  // Cache all packages in super cache
  if (bazelPackageInfos.length > 0) {
    await cacheManager.cacheBazelWorkspacePackages(workspace, bazelPackageInfos);
  }

  return packages;
}
