import path from "node:path";
import * as vscode from "vscode";
import type { BazelTreeItem } from "../../../presentation/tree-providers/export.provider.js";

import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../../../shared/logger/logger.js";
import { getWorkspaceConfig } from "../../../shared/utils/config.js";
import { ErrorManager } from "../../../shared/utils/error-manager.js";
import { exec } from "../../../shared/utils/exec.js";
import { ProgressManager, ProgressSteps } from "../../../shared/utils/progress-manager.js";
import { Timer } from "../../../shared/utils/timer.js";

import { DEFAULT_BUILD_PROBLEM_MATCHERS } from "../../../shared/constants/build-constants.js";
import {
  askDestinationToRunOn,
  detectBazelWorkspacesPaths,
  selectBazelWorkspace,
} from "../../../shared/utils/bazel-utils.js";
import { type TaskTerminal, runTask } from "../../../shared/utils/tasks.js";

function writeTimingResults(terminal: TaskTerminal, timer: Timer, toolType: "bazel", operation: string) {
  const elapsedSeconds = (timer.elapsed / 1000).toFixed(2);
  terminal.write(`\n⏱️  ${toolType} ${operation} total time: ${elapsedSeconds}s\n`, { newLine: true });
}

/**
 * Reconstruct a BazelTreeItem from cached serialized data
 * For query-based targets, we already have all the data in selectedTargetData
 */
async function reconstructBazelItemFromCache(context: ExtensionContext): Promise<BazelTreeItem | undefined> {
  const selectedTargetData = context.buildManager.getSelectedBazelTargetData();
  if (!selectedTargetData) {
    return undefined;
  }

  // Reconstruct from cached data without parsing BUILD files
  const bazelItem: BazelTreeItem = {
    target: {
      name: selectedTargetData.targetName,
      type: selectedTargetData.targetType,
      buildLabel: selectedTargetData.buildLabel,
      testLabel: selectedTargetData.testLabel,
      deps: [],
    },
    package: {
      name: selectedTargetData.packageName,
      path: selectedTargetData.packagePath,
      targets: [],
    },
    workspacePath: selectedTargetData.workspacePath,
    provider: null as any, // Not needed for commands
  } as BazelTreeItem;

  return bazelItem;
}

/**
 * Resolve Bazel target from parameter, selected target, or cache
 * @throws Error if no target can be resolved
 */
async function resolveTargetItem(
  context: ExtensionContext,
  bazelItem: BazelTreeItem | undefined,
  errorManager: ErrorManager,
): Promise<BazelTreeItem> {
  if (bazelItem) {
    return bazelItem;
  }

  const selectedTarget = context.buildManager.getSelectedBazelTarget();
  if (selectedTarget) {
    return selectedTarget;
  }

  // Try to reconstruct from cached data
  const cachedTarget = await reconstructBazelItemFromCache(context);
  if (cachedTarget) {
    return cachedTarget;
  }

  errorManager.handleNoTargetSelected();
}

/**
 * Get build mode from config/cache or ask user
 */
async function getBuildMode(context: ExtensionContext, forceAsk: boolean = false): Promise<"debug" | "release" | "release-with-symbols" | undefined> {
  // Check config first
  const configMode = getWorkspaceConfig("bazel.buildMode");
  
  if (!forceAsk && configMode && configMode !== "ask") {
    // Config has explicit preference
    return configMode;
  }

  // Check workspace state (last used mode)
  const savedMode = context.getWorkspaceState("bazel.buildMode");
  
  if (!forceAsk && savedMode) {
    // Use last saved mode
    return savedMode;
  }

  // Ask user
  const buildMode = await vscode.window.showQuickPick(
    [
      {
        label: "$(archive) Release",
        description: "Optimized, no debug symbols (smallest, fastest)",
        value: "release" as const,
        picked: savedMode === "release" || !savedMode,
      },
      {
        label: "$(package) Release with Symbols",
        description: "Optimized with debug symbols (for crash reports)",
        value: "release-with-symbols" as const,
        picked: savedMode === "release-with-symbols",
      },
      {
        label: "$(bug) Debug",
        description: "Unoptimized with debug symbols (for debugging)",
        value: "debug" as const,
        picked: savedMode === "debug",
      },
    ],
    {
      title: "Select Build Mode",
      placeHolder: "Choose build mode (saved for future builds)",
    },
  );

  if (!buildMode) {
    return undefined; // User cancelled
  }

  // Save selection for next time
  context.updateWorkspaceState("bazel.buildMode", buildMode.value);

  return buildMode.value;
}

/**
 * Build a Bazel target
 */
export async function bazelBuildCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  const errorManager = new ErrorManager(context);
  const targetItem = await resolveTargetItem(context, bazelItem, errorManager);

  // Get destination to determine build platform
  const destination = await askDestinationToRunOn(context);

  // Get build mode from config/cache
  const buildMode = await getBuildMode(context);
  
  if (buildMode === undefined) {
    return; // User cancelled
  }

  const timer = new Timer();
  const progress = new ProgressManager({
    steps: ProgressSteps.BUILD,
    context,
    taskName: `Build: ${targetItem?.target.name}`,
  });

  await runTask(context, {
    name: `Bazel Build: ${targetItem?.target.name}`,
    lock: "swiftbazel.bazel.build",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      const modeLabel = buildMode === "debug" ? "Debug" : buildMode === "release-with-symbols" ? "Release with Symbols" : "Release";
      terminal.write(`Building Bazel target: ${targetItem?.target.buildLabel}\n`);
      terminal.write(`Build mode: ${modeLabel}\n\n`);

      progress.nextStep("Resolving dependencies");
      terminal.write("📦 Resolving dependencies...\n");

      progress.nextStep("Compiling sources");
      terminal.write("🔨 Compiling sources...\n");

      // Use unified build logic
      const { buildBazelTarget } = await import("../../../infrastructure/bazel/bazel-build.js");
      await buildBazelTarget({
        bazelItem: targetItem,
        destination: destination as any,
        buildMode,
        terminal,
        context,
      });

      progress.nextStep("Linking binaries");
      progress.nextStep("Code signing");
      progress.nextStep("Finalizing build");
      terminal.write(`\n✅ Build completed for ${targetItem?.target.name}\n`);

      progress.complete();
      writeTimingResults(terminal, timer, "bazel", "build");
    },
  });
}

/**
 * Select Bazel build mode (debug or release)
 */
export async function selectBazelBuildModeCommand(context: ExtensionContext): Promise<void> {
  const buildMode = await getBuildMode(context, true);
  
  if (buildMode === undefined) {
    return; // User cancelled
  }

  const modeLabels = {
    debug: "Debug (unoptimized with symbols)",
    "release-with-symbols": "Release with Symbols (optimized with symbols)",
    release: "Release (optimized, no symbols)",
  };
  
  // Emit event to update status bar
  vscode.commands.executeCommand("swiftbazel.internal.updateBuildModeStatusBar");
  
  vscode.window.showInformationMessage(
    `✅ Build mode set to: ${modeLabels[buildMode]}`
  );
}

/**
 * Test a Bazel target
 */
export async function bazelTestCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  const errorManager = new ErrorManager(context);
  const targetItem = await resolveTargetItem(context, bazelItem, errorManager);

  if (!targetItem?.target.testLabel) {
    errorManager.handleNotTestTarget(targetItem?.target.name || "unknown");
  }

  const testLabel = targetItem?.target.testLabel;
  if (!testLabel) {
    errorManager.handleValidationError("Test label is required for test targets");
  }

  const timer = new Timer();
  const progress = new ProgressManager({
    steps: ProgressSteps.TEST,
    context,
    taskName: `Test: ${targetItem?.target.name}`,
  });

  await runTask(context, {
    name: `Bazel Test: ${targetItem?.target.name}`,
    lock: "swiftbazel.bazel.test",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      terminal.write(`Running Bazel tests: ${testLabel}\n\n`);

      progress.nextStep("Building test target");
      terminal.write("🔨 Building test target...\n");

      progress.nextStep("Preparing test environment");
      terminal.write("🧪 Preparing test environment...\n");

      progress.nextStep("Running tests");
      terminal.write("▶️  Running tests...\n");

      await terminal.execute({
        command: "sh",
        args: ["-c", `cd "${targetItem?.package.path}" && bazel test ${testLabel} --test_output=all`],
      });

      progress.nextStep("Collecting results");
      terminal.write(`\n✅ Tests completed for ${targetItem?.target.name}\n`);

      progress.complete();
      writeTimingResults(terminal, timer, "bazel", "test");
    },
  });
}

/**
 * Run a Bazel target (launch app on iOS simulator)
 */
export async function bazelRunCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  const errorManager = new ErrorManager(context);
  const targetItem = await resolveTargetItem(context, bazelItem, errorManager);

  if (targetItem?.target.type !== "binary") {
    errorManager.handleNotRunnableTarget(targetItem?.target.name || "unknown");
  }

  // Get destination
  const destination = await askDestinationToRunOn(context);

  // Get launch configuration
  const launchArgs = getWorkspaceConfig("build.launchArgs") ?? [];
  const launchEnv = getWorkspaceConfig("build.launchEnv") ?? {};

  const timer = new Timer();

  await runTask(context, {
    name: `Bazel Run: ${targetItem?.target.name}`,
    lock: "swiftbazel.bazel.run",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      if (!targetItem) {
        errorManager.handleNoTargetSelected();
        return; // TypeScript needs this
      }

      const { buildAndLaunchBazelApp } = await import("../../../infrastructure/vscode/debug/build-and-launch.js");

      // Use unified build and launch workflow without debugger
      await buildAndLaunchBazelApp(context, terminal, {
        bazelItem: targetItem,
        destination: destination as any,
        attachDebugger: false,
        launchArgs,
        launchEnv,
      });

      writeTimingResults(terminal, timer, "bazel", "run");
    },
  });
}

/**
 * Debug a Bazel target (launch app with debug support)
 */
export async function bazelDebugCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  const errorManager = new ErrorManager(context);
  const targetItem = await resolveTargetItem(context, bazelItem, errorManager);

  if (targetItem?.target.type !== "binary") {
    errorManager.handleNotRunnableTarget(targetItem?.target.name || "unknown");
  }

  // Get destination
  const destination = await askDestinationToRunOn(context);

  // Get launch configuration
  const launchArgs = getWorkspaceConfig("build.launchArgs") ?? [];
  const launchEnv = getWorkspaceConfig("build.launchEnv") ?? {};

  const timer = new Timer();

  await runTask(context, {
    name: `Bazel Debug: ${targetItem?.target.name}`,
    lock: "swiftbazel.bazel.debug",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      if (!targetItem) {
        errorManager.handleNoTargetSelected();
        return; // TypeScript needs this
      }

      const { buildAndLaunchBazelApp } = await import("../../../infrastructure/vscode/debug/build-and-launch.js");

      // Use unified build and launch workflow with debugger attached
      await buildAndLaunchBazelApp(context, terminal, {
        bazelItem: targetItem,
        destination: destination as any,
        attachDebugger: true,
        launchArgs,
        launchEnv,
      });

      writeTimingResults(terminal, timer, "bazel", "debug");
    },
  });
}

/**
 * Select a Bazel target as the active target for build/test commands
 */
export async function selectBazelTargetCommand(
  context: ExtensionContext,
  targetInfo: { target: any; package: any; workspacePath: string } | BazelTreeItem,
  _treeProvider: any,
): Promise<void> {
  if (!targetInfo) {
    vscode.window.showErrorMessage("No Bazel target provided");
    return;
  }

  // Both old and new format have target and package properties
  const bazelItem = targetInfo as BazelTreeItem;

  // Validate the bazelItem
  if (!bazelItem || !bazelItem.target || !bazelItem.target.name || !bazelItem.package) {
    vscode.window.showErrorMessage("Invalid Bazel target data");
    return;
  }

  context.buildManager.setSelectedBazelTarget(bazelItem);

  vscode.window.showInformationMessage(`✅ Selected Bazel target: ${bazelItem.target.name} (${bazelItem.target.type})`);
}

/**
 * Build the currently selected Bazel target
 */
export async function buildSelectedBazelTargetCommand(
  context: ExtensionContext,
  _workspaceTreeProvider?: any,
): Promise<void> {
  const bazelItem = context.buildManager.getSelectedBazelTarget();
  if (!bazelItem) {
    // No target selected - fall back to asking user to select one
    await bazelBuildCommand(context);
    return;
  }

  await bazelBuildCommand(context, bazelItem);
}

/**
 * Test the currently selected Bazel target
 */
export async function testSelectedBazelTargetCommand(
  context: ExtensionContext,
  _workspaceTreeProvider?: any,
): Promise<void> {
  const bazelItem = context.buildManager.getSelectedBazelTarget();
  if (!bazelItem) {
    // No target selected - fall back to asking user to select one
    await bazelTestCommand(context);
    return;
  }

  if (!bazelItem.target.testLabel) {
    vscode.window.showErrorMessage(`Target ${bazelItem.target.name} is not a test target`);
    return;
  }

  await bazelTestCommand(context, bazelItem);
}

/**
 * Select Bazel project and save it to the workspace state
 * @deprecated Legacy function for old workspace tree
 */
export async function selectBazelWorkspaceCommand(context: ExtensionContext, item?: any) {
  context.updateProgressStatus("Searching for workspace");

  if (item) {
    // Set loading state on this specific item only
    if (item.setLoading) {
      item.setLoading(true);
    }

    try {
      context.buildManager.setCurrentWorkspacePath(item.workspacePath);
      vscode.window.showInformationMessage(`✅ Selected Bazel workspace: ${path.basename(item.workspacePath)}`);
    } catch (error) {
      commonLogger.error("Failed to select workspace", { error });
      vscode.window.showErrorMessage(`Failed to select workspace: ${error}`);
    } finally {
      if (item.setLoading) {
        item.setLoading(false);
      }
    }
    return;
  }

  // Manual selection via quick pick
  vscode.window.showInformationMessage("Selecting Bazel project...");
  const workspace = await selectBazelWorkspace({
    autoselect: false,
  });

  if (workspace) {
    context.buildManager.setCurrentWorkspacePath(workspace);
  }
}

/**
 * Diagnose build setup
 */
export async function diagnoseBuildSetupCommand(context: ExtensionContext): Promise<void> {
  context.updateProgressStatus("Diagnosing build setup");

  await runTask(context, {
    name: "swiftbazel.build.diagnose",
    lock: "swiftbazel.build",
    terminateLocked: true,
    callback: async (terminal) => {
      const _write = (text: string) => terminal.write(text);
      const _writeQuote = (text: string) => terminal.write(`> ${text}\n`);

      _write("swiftbazel: Diagnose Build Setup\n");
      _write("=================================\n\n");

      // Check for Bazel
      try {
        const result = await exec({
          command: "bazel",
          args: ["version"],
        });
        _write("✅ Bazel is installed:\n");
        _writeQuote(result);
      } catch (_error) {
        _write("❌ Bazel is not installed or not in PATH\n");
      }

      // Check for BUILD files
      _write("🌼 Check whether your project folder contains BUILD.bazel or BUILD files\n");
      const bazelPaths = await detectBazelWorkspacesPaths();
      if (bazelPaths.length > 0) {
        _write("✅ Found Bazel project paths:\n");
        for (const path of bazelPaths) {
          _write(`   - ${path}\n`);
        }
      } else {
        _write("❌ No BUILD.bazel or BUILD files found in the workspace\n");
      }

      _write("\n🎉 Diagnosis complete!\n");
      context.simpleTaskCompletionEmitter.fire();
    },
  });
}

/**
 * Run the currently selected Bazel target
 */
export async function runSelectedBazelTargetCommand(
  context: ExtensionContext,
  _workspaceTreeProvider?: any,
): Promise<void> {
  const bazelItem = context.buildManager.getSelectedBazelTarget();
  if (!bazelItem) {
    // No target selected - fall back to asking user to select one
    await bazelRunCommand(context);
    return;
  }

  if (bazelItem.target.type !== "binary") {
    vscode.window.showErrorMessage(`Target ${bazelItem.target.name} is not a runnable target (must be a binary/app)`);
    return;
  }

  await bazelRunCommand(context, bazelItem);
}
