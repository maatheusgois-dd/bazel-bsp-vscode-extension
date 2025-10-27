import path from "node:path";
import * as vscode from "vscode";
import type { BazelTreeItem, WorkspaceGroupTreeItem, WorkspaceTreeProvider } from "./tree";

import type { ExtensionContext } from "../common/commands";
import { getWorkspaceConfig } from "../common/config";
import { ExtensionError } from "../common/errors";
import { exec } from "../common/exec";
import { commonLogger } from "../common/logger";
import { Timer } from "../common/timer";

import { type Command, type TaskTerminal, runTask } from "../common/tasks";
import { DEFAULT_BUILD_PROBLEM_MATCHERS } from "./constants";
import {
  askDestinationToRunOn,
  detectBazelWorkspacesPaths,
  getWorkspacePath,
  parseBazelBuildFile,
  selectBazelWorkspace,
} from "./utils";

function writeTimingResults(terminal: TaskTerminal, timer: Timer, toolType: "bazel", operation: string) {
  const elapsedSeconds = (timer.elapsed / 1000).toFixed(2);
  terminal.write(`\n⏱️  ${toolType} ${operation} total time: ${elapsedSeconds}s\n`, { newLine: true });
}

/**
 * Reconstruct a BazelTreeItem from cached serialized data
 */
async function reconstructBazelItemFromCache(context: ExtensionContext): Promise<BazelTreeItem | undefined> {
  const selectedTargetData = context.buildManager.getSelectedBazelTargetData();
  if (!selectedTargetData) {
    return undefined;
  }

  try {
    // Parse the BUILD file to get the full package and target data
    const bazelPackage = await parseBazelBuildFile(selectedTargetData.workspacePath);
    if (!bazelPackage) {
      return undefined;
    }

    // Find the target in the package
    const target = bazelPackage.targets.find((t) => t.buildLabel === selectedTargetData.buildLabel);
    if (!target) {
      return undefined;
    }

    // Reconstruct the BazelTreeItem (minimal version for commands)
    const bazelItem: BazelTreeItem = {
      target,
      package: bazelPackage,
      workspacePath: selectedTargetData.workspacePath,
      provider: null as any, // Not needed for commands
    } as BazelTreeItem;

    // Update the in-memory cache in BuildManager
    context.buildManager.setSelectedBazelTarget(bazelItem);

    return bazelItem;
  } catch (error) {
    commonLogger.error("Failed to reconstruct Bazel item from cache", { error, selectedTargetData });
    return undefined;
  }
}

/**
 * Build a Bazel target
 */
export async function bazelBuildCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  // If no bazelItem provided, try to get from saved target
  if (!bazelItem) {
    const selectedTarget = context.buildManager.getSelectedBazelTarget();
    if (selectedTarget) {
      bazelItem = selectedTarget;
    } else {
      // Try to reconstruct from cached data
      bazelItem = await reconstructBazelItemFromCache(context);
      if (!bazelItem) {
        vscode.window.showErrorMessage(
          "No Bazel target selected. Please select a target from the BUILDS tree view first.",
        );
        return;
      }
    }
  }

  const timer = new Timer();

  await runTask(context, {
    name: `Bazel Build: ${bazelItem?.target.name}`,
    lock: "swiftbazel.bazel.build",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      terminal.write(`Building Bazel target: ${bazelItem?.target.buildLabel}\n\n`);

      await terminal.execute({
        command: "sh",
        args: [
          "-c",
          `cd "${bazelItem?.package.path}" && bazel build ${bazelItem?.target.buildLabel} --platforms=@build_bazel_apple_support//platforms:ios_sim_arm64`,
        ],
      });

      terminal.write(`\n✅ Build completed for ${bazelItem?.target.name}\n`);
      writeTimingResults(terminal, timer, "bazel", "build");
    },
  });
}

/**
 * Test a Bazel target
 */
export async function bazelTestCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  // If no bazelItem provided, try to get from saved target
  if (!bazelItem) {
    const selectedTarget = context.buildManager.getSelectedBazelTarget();
    if (selectedTarget) {
      bazelItem = selectedTarget;
    } else {
      // Try to reconstruct from cached data
      bazelItem = await reconstructBazelItemFromCache(context);
      if (!bazelItem) {
        vscode.window.showErrorMessage(
          "No Bazel target selected. Please select a target from the BUILDS tree view first.",
        );
        return;
      }
    }
  }

  if (!bazelItem?.target.testLabel) {
    vscode.window.showErrorMessage(`Target ${bazelItem?.target.name} is not a test target`);
    return;
  }

  const timer = new Timer();

  await runTask(context, {
    name: `Bazel Test: ${bazelItem?.target.name}`,
    lock: "swiftbazel.bazel.test",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      terminal.write(`Running Bazel tests: ${bazelItem?.target.testLabel}\n\n`);

      await terminal.execute({
        command: "sh",
        args: ["-c", `cd "${bazelItem?.package.path}" && bazel test ${bazelItem?.target.testLabel!} --test_output=all`],
      });

      terminal.write(`\n✅ Tests completed for ${bazelItem?.target.name}\n`);
      writeTimingResults(terminal, timer, "bazel", "test");
    },
  });
}

/**
 * Run a Bazel target (launch app on iOS simulator)
 */
export async function bazelRunCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  // If no bazelItem provided, try to get from saved target
  if (!bazelItem) {
    const selectedTarget = context.buildManager.getSelectedBazelTarget();
    if (selectedTarget) {
      bazelItem = selectedTarget;
    } else {
      // Try to reconstruct from cached data
      bazelItem = await reconstructBazelItemFromCache(context);
      if (!bazelItem) {
        vscode.window.showErrorMessage(
          "No Bazel target selected. Please select a target from the BUILDS tree view first.",
        );
        return;
      }
    }
  }

  if (bazelItem?.target.type !== "binary") {
    vscode.window.showErrorMessage(`Target ${bazelItem?.target.name} is not a runnable target (must be a binary/app)`);
    return;
  }

  const timer = new Timer();

  await runTask(context, {
    name: `Bazel Run: ${bazelItem?.target.name}`,
    lock: "swiftbazel.bazel.run",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      terminal.write(`Running Bazel target: ${bazelItem?.target.buildLabel}\n\n`);

      const runArgs = ["run", bazelItem?.target.buildLabel];

      // For simulators: use bazel run directly
      runArgs.push("--platforms=@build_bazel_apple_support//platforms:ios_sim_arm64");

      await terminal.execute({
        command: "sh",
        args: ["-c", `cd "${bazelItem?.package.path}" && bazel ${runArgs.join(" ")}`],
      });

      terminal.write(`\n✅ Launch completed for ${bazelItem?.target.name}\n`);
      writeTimingResults(terminal, timer, "bazel", "run");
    },
  });
}

/**
 * Debug a Bazel target (launch app with debug support)
 */
export async function bazelDebugCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  const selectedBazelItem = bazelItem || context.buildManager.getSelectedBazelTarget();
  if (!selectedBazelItem) {
    vscode.window.showErrorMessage("No Bazel target selected. Please select a target first.");
    return;
  }

  if (selectedBazelItem.target.type !== "binary") {
    vscode.window.showErrorMessage(
      `Target ${selectedBazelItem.target.name} is not a runnable target (must be a binary/app)`,
    );
    return;
  }

  // Use the same destination selection pattern as launchCommand
  context.updateProgressStatus("Searching for destination");
  const destination = await askDestinationToRunOn(context);

  // Get launch configuration
  const launchArgs = getWorkspaceConfig("build.launchArgs") ?? [];
  const launchEnv = getWorkspaceConfig("build.launchEnv") ?? {};

  const timer = new Timer();

  await runTask(context, {
    name: `Bazel Debug: ${selectedBazelItem.target.name}`,
    lock: "swiftbazel.bazel.debug",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      const { enhancedBazelDebugCommand } = await import("./debug/bazel-debug.js");

      await enhancedBazelDebugCommand(context, terminal, {
        bazelItem: selectedBazelItem,
        destination: destination as any,
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
  targetInfo: { buildLabel: string; workspacePath: string } | BazelTreeItem,
  workspaceTreeProvider: any,
): Promise<void> {
  if (!targetInfo) {
    vscode.window.showErrorMessage("No Bazel target provided");
    return;
  }

  // Get the workspace tree provider
  if (!workspaceTreeProvider) {
    vscode.window.showErrorMessage("Workspace tree provider not available");
    return;
  }

  // Handle both old format (BazelTreeItem) and new format (target info)
  let bazelItem: any; // Mock BazelTreeItem

  if ("target" in targetInfo) {
    // Old format - direct BazelTreeItem
    bazelItem = targetInfo as BazelTreeItem;
  } else {
    // New format - parse BUILD.bazel file to get target data
    const { buildLabel, workspacePath } = targetInfo;
    let actualWorkspacePath = workspacePath;

    if (!actualWorkspacePath) {
      // Try to find the workspace path from currentBazelTargets cache
      for (const [cachedBuildLabel, cachedTarget] of workspaceTreeProvider.currentBazelTargets) {
        if (cachedBuildLabel === buildLabel) {
          actualWorkspacePath = (cachedTarget as any).package.path;
          break;
        }
      }

      if (!actualWorkspacePath) {
        vscode.window.showErrorMessage("Could not determine workspace path for Bazel target");
        return;
      }
    }

    // Parse the BUILD.bazel file to get full target data
    const bazelPackage = await workspaceTreeProvider.getCachedBazelPackage(actualWorkspacePath);
    if (!bazelPackage) {
      vscode.window.showErrorMessage("Failed to parse Bazel BUILD file");
      return;
    }

    const target = bazelPackage.targets.find((t: any) => t.buildLabel === buildLabel);
    if (!target) {
      vscode.window.showErrorMessage(`Target ${buildLabel} not found in BUILD file`);
      return;
    }

    bazelItem = {
      target: target,
      package: bazelPackage,
    };
  }

  // Validate the final bazelItem
  if (!bazelItem || !bazelItem.target || !bazelItem.target.name || !bazelItem.package) {
    vscode.window.showErrorMessage("Invalid Bazel target data");
    return;
  }

  context.buildManager.setSelectedBazelTarget(bazelItem);

  // Update the tree view to show selection
  workspaceTreeProvider.setSelectedBazelTarget(bazelItem);

  vscode.window.showInformationMessage(`✅ Selected Bazel target: ${bazelItem.target.name} (${bazelItem.target.type})`);
}

/**
 * Build the currently selected Bazel target
 */
export async function buildSelectedBazelTargetCommand(
  context: ExtensionContext,
  workspaceTreeProvider?: any,
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
  workspaceTreeProvider?: any,
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
 */
export async function selectBazelWorkspaceCommand(context: ExtensionContext, item?: WorkspaceGroupTreeItem) {
  context.updateProgressStatus("Searching for workspace");

  if (item) {
    // Set loading state on this specific item only
    item.setLoading(true);

    try {
      context.buildManager.setCurrentWorkspacePath(item.workspacePath);
      vscode.window.showInformationMessage(`✅ Selected Bazel workspace: ${path.basename(item.workspacePath)}`);
    } catch (error) {
      commonLogger.error("Failed to select workspace", { error });
      vscode.window.showErrorMessage(`Failed to select workspace: ${error}`);
    } finally {
      item.setLoading(false);
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
      } catch (error) {
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
  workspaceTreeProvider?: any,
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
