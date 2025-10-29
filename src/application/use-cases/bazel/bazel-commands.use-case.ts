import path from "node:path";
import * as vscode from "vscode";
import type { BazelTreeItem } from "../../../presentation/tree-providers/export.provider.js";

import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../../../shared/logger/logger.js";
import { getWorkspaceConfig } from "../../../shared/utils/config.js";
import { exec } from "../../../shared/utils/exec.js";
import { Timer } from "../../../shared/utils/timer.js";
import { ErrorManager } from "../../../shared/utils/error-manager.js";
import { ProgressManager, ProgressSteps } from "../../../shared/utils/progress-manager.js";

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
 * Build a Bazel target
 */
export async function bazelBuildCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  const errorManager = new ErrorManager(context);
  
  // If no bazelItem provided, try to get from saved target
  if (!bazelItem) {
    const selectedTarget = context.buildManager.getSelectedBazelTarget();
    if (selectedTarget) {
      bazelItem = selectedTarget;
    } else {
      // Try to reconstruct from cached data
      bazelItem = await reconstructBazelItemFromCache(context);
      if (!bazelItem) {
        errorManager.handleNoTargetSelected();
      }
    }
  }

  // Get destination to determine build platform
  context.updateProgressStatus("Searching for destination");
  const destination = await askDestinationToRunOn(context);

  const timer = new Timer();
  const progress = new ProgressManager({
    steps: ProgressSteps.BUILD,
    context,
    taskName: `Build: ${bazelItem?.target.name}`,
  });

  await runTask(context, {
    name: `Bazel Build: ${bazelItem?.target.name}`,
    lock: "swiftbazel.bazel.build",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      terminal.write(`Building Bazel target: ${bazelItem?.target.buildLabel}\n\n`);

      progress.nextStep("Resolving dependencies");
      terminal.write("📦 Resolving dependencies...\n");

      progress.nextStep("Compiling sources");
      terminal.write("🔨 Compiling sources...\n");

      // Build flags based on destination type
      let platformFlag: string;
      if (destination.type === "iOSSimulator") {
        platformFlag = "--platforms=@build_bazel_apple_support//platforms:ios_sim_arm64";
        terminal.write(`   Building for iOS Simulator...\n`);
      } else if (destination.type === "iOSDevice") {
        platformFlag = "--ios_multi_cpus=arm64";
        terminal.write(`   Building for iOS Device (${destination.name})...\n`);
      } else {
        platformFlag = "--platforms=@build_bazel_apple_support//platforms:ios_sim_arm64";
        terminal.write(`   Building for ${destination.type}...\n`);
      }

      await terminal.execute({
        command: "sh",
        args: [
          "-c",
          `cd "${bazelItem?.package.path}" && bazel build ${bazelItem?.target.buildLabel} ${platformFlag}`,
        ],
      });

      progress.nextStep("Linking binaries");
      progress.nextStep("Code signing");
      progress.nextStep("Finalizing build");
      terminal.write(`\n✅ Build completed for ${bazelItem?.target.name}\n`);
      
      progress.complete();
      writeTimingResults(terminal, timer, "bazel", "build");
    },
  });
}

/**
 * Test a Bazel target
 */
export async function bazelTestCommand(context: ExtensionContext, bazelItem?: BazelTreeItem): Promise<void> {
  const errorManager = new ErrorManager(context);
  
  // If no bazelItem provided, try to get from saved target
  if (!bazelItem) {
    const selectedTarget = context.buildManager.getSelectedBazelTarget();
    if (selectedTarget) {
      bazelItem = selectedTarget;
    } else {
      // Try to reconstruct from cached data
      bazelItem = await reconstructBazelItemFromCache(context);
      if (!bazelItem) {
        errorManager.handleNoTargetSelected();
      }
    }
  }

  if (!bazelItem?.target.testLabel) {
    errorManager.handleNotTestTarget(bazelItem?.target.name || "unknown");
  }

  const timer = new Timer();
  const progress = new ProgressManager({
    steps: ProgressSteps.TEST,
    context,
    taskName: `Test: ${bazelItem?.target.name}`,
  });

  await runTask(context, {
    name: `Bazel Test: ${bazelItem?.target.name}`,
    lock: "swiftbazel.bazel.test",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      terminal.write(`Running Bazel tests: ${bazelItem?.target.testLabel}\n\n`);

      progress.nextStep("Building test target");
      terminal.write("🔨 Building test target...\n");

      progress.nextStep("Preparing test environment");
      terminal.write("🧪 Preparing test environment...\n");

      progress.nextStep("Running tests");
      terminal.write("▶️  Running tests...\n");

      await terminal.execute({
        command: "sh",
        args: ["-c", `cd "${bazelItem?.package.path}" && bazel test ${bazelItem?.target.testLabel!} --test_output=all`],
      });

      progress.nextStep("Collecting results");
      terminal.write(`\n✅ Tests completed for ${bazelItem?.target.name}\n`);
      
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
  
  // If no bazelItem provided, try to get from saved target
  if (!bazelItem) {
    const selectedTarget = context.buildManager.getSelectedBazelTarget();
    if (selectedTarget) {
      bazelItem = selectedTarget;
    } else {
      // Try to reconstruct from cached data
      bazelItem = await reconstructBazelItemFromCache(context);
      if (!bazelItem) {
        errorManager.handleNoTargetSelected();
      }
    }
  }

  if (bazelItem?.target.type !== "binary") {
    errorManager.handleNotRunnableTarget(bazelItem?.target.name || "unknown");
  }

  // Get destination
  context.updateProgressStatus("Searching for destination");
  const destination = await askDestinationToRunOn(context);

  // Get launch configuration
  const launchArgs = getWorkspaceConfig("build.launchArgs") ?? [];
  const launchEnv = getWorkspaceConfig("build.launchEnv") ?? {};

  const timer = new Timer();

  await runTask(context, {
    name: `Bazel Run: ${bazelItem?.target.name}`,
    lock: "swiftbazel.bazel.run",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      const { buildAndLaunchBazelApp } = await import("../../../infrastructure/vscode/debug/build-and-launch.js");

      // Use unified build and launch workflow without debugger
      await buildAndLaunchBazelApp(context, terminal, {
        bazelItem: bazelItem!,
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
  
  // If no bazelItem provided, try to get from saved target
  if (!bazelItem) {
    const selectedTarget = context.buildManager.getSelectedBazelTarget();
    if (selectedTarget) {
      bazelItem = selectedTarget;
    } else {
      // Try to reconstruct from cached data
      bazelItem = await reconstructBazelItemFromCache(context);
      if (!bazelItem) {
        errorManager.handleNoTargetSelected();
      }
    }
  }

  if (bazelItem?.target.type !== "binary") {
    errorManager.handleNotRunnableTarget(bazelItem?.target.name || "unknown");
  }

  // Get destination
  context.updateProgressStatus("Searching for destination");
  const destination = await askDestinationToRunOn(context);

  // Get launch configuration
  const launchArgs = getWorkspaceConfig("build.launchArgs") ?? [];
  const launchEnv = getWorkspaceConfig("build.launchEnv") ?? {};

  const timer = new Timer();

  await runTask(context, {
    name: `Bazel Debug: ${bazelItem?.target.name}`,
    lock: "swiftbazel.bazel.debug",
    terminateLocked: true,
    problemMatchers: DEFAULT_BUILD_PROBLEM_MATCHERS,
    callback: async (terminal) => {
      const { buildAndLaunchBazelApp } = await import("../../../infrastructure/vscode/debug/build-and-launch.js");

      // Use unified build and launch workflow with debugger attached
      await buildAndLaunchBazelApp(context, terminal, {
        bazelItem: bazelItem!,
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
