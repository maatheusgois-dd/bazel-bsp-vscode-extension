import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../../../shared/logger/logger.js";
import { createDirectory, isFileExists, readJsonFile } from "../../../shared/utils/files.js";
import { exec } from "../../../shared/utils/exec.js";

/**
 * Setup Swift extension for optimal Bazel development
 */
export async function setupSwiftExtensionCommand(context: ExtensionContext): Promise<void> {
  context.updateProgressStatus("Configuring Swift extension");

  try {
    // Use workspace root folder for workspace-level settings
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const vscodeDir = path.join(workspacePath, ".vscode");
    const settingsPath = path.join(vscodeDir, "settings.json");

    // Ensure .vscode directory exists
    await createDirectory(vscodeDir);

    // Read existing settings or create new
    let settings: any = {};
    if (await isFileExists(settingsPath)) {
      try {
        settings = await readJsonFile(settingsPath);
      } catch (error) {
        commonLogger.warn("Failed to parse existing settings.json, will overwrite", { error });
      }
    }

    // Enable SourceKit-LSP background indexing (required for BSP)
    // Values: "on" | "off" | "auto"
    settings["swift.sourcekit-lsp.backgroundIndexing"] = "on";

    commonLogger.log("Enabled Swift background indexing for workspace", {
      workspace: workspacePath,
    });

    // Write settings.json
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");

    // Check if .bsp/ configuration exists
    const bspDir = path.join(workspacePath, ".bsp");
    const hasBSPConfig = await isFileExists(bspDir);

    let message = `✅ Swift extension configured!\n\nWorkspace: ${workspaceFolder.name}\nBackground Indexing: ON\nSettings: .vscode/settings.json`;

    if (!hasBSPConfig) {
      message +=
        "\n\n⚠️ .bsp/ configuration not found!\n\n" +
        "To complete BSP setup, you need to:\n" +
        "1. Add sourcekit-bazel-bsp to MODULE.bazel\n" +
        "2. Run: bazel run //:setup_sourcekit_bsp\n\n" +
        "See: github.com/spotify/sourcekit-bazel-bsp";
    } else {
      message += "\n\n✅ .bsp/ configuration detected";
    }

    message += "\n\n💡 Reload window to apply changes";

    vscode.window
      .showInformationMessage(message, "Reload Window", hasBSPConfig ? "Open Settings" : "Learn More")
      .then((selection) => {
        if (selection === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        } else if (selection === "Open Settings") {
          vscode.commands.executeCommand("vscode.open", vscode.Uri.file(settingsPath));
        } else if (selection === "Learn More") {
          vscode.env.openExternal(vscode.Uri.parse("https://github.com/spotify/sourcekit-bazel-bsp/tree/main"));
        }
      });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    commonLogger.error("Failed to configure Swift extension", { error });
    vscode.window.showErrorMessage(`Failed to configure Swift extension: ${errorMsg}`);
  }
}

/**
 * Check if Swift extension is properly configured
 */
export async function checkSwiftExtensionSetup(): Promise<{
  backgroundIndexing: string;
  customLSP: string | undefined;
}> {
  const config = vscode.workspace.getConfiguration();

  const backgroundIndexing = config.get<string>("swift.sourcekit-lsp.backgroundIndexing") ?? "auto";
  const customLSP = config.get<string>("swift.sourcekit-lsp.serverPath");

  return {
    backgroundIndexing,
    customLSP,
  };
}

/**
 * Show Swift extension configuration status
 */
export async function showSwiftConfigStatusCommand(context: ExtensionContext): Promise<void> {
  const status = await checkSwiftExtensionSetup();

  const isEnabled = status.backgroundIndexing === "on" || status.backgroundIndexing === "auto";
  const message = `**Swift Extension Configuration**\n\nBackground Indexing: ${isEnabled ? `✅ ${status.backgroundIndexing}` : "❌ off (required for BSP)"}\nCustom SourceKit-LSP: ${status.customLSP || "❌ Using Xcode default"}`;

  const markdown = new vscode.MarkdownString(message);
  markdown.isTrusted = true;

  if (status.backgroundIndexing === "off") {
    const action = await vscode.window.showWarningMessage(
      "Swift background indexing is disabled. This is required for Build Server Protocol (BSP) integration.",
      "Enable Now",
      "Learn More",
    );

    if (action === "Enable Now") {
      await setupSwiftExtensionCommand(context);
    } else if (action === "Learn More") {
      await vscode.env.openExternal(vscode.Uri.parse("https://github.com/spotify/sourcekit-bazel-bsp/tree/main"));
    }
  } else {
    vscode.window.showInformationMessage(message.replace(/\*\*/g, ""));
  }
}

/**
 * Setup BSP configuration for selected Bazel target
 *
 * This command tries to use the setup_sourcekit_bsp rule if available,
 * otherwise falls back to manual config generation.
 */
export async function setupBSPConfigCommand(context: ExtensionContext): Promise<void> {
  context.updateProgressStatus("Configuring Build Server Protocol");

  try {
    // Get workspace root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const bspDir = path.join(workspacePath, ".bsp");

    // Determine which setup_sourcekit_bsp target to use
    // Priority: 1. Target-specific rule, 2. Package generic rule, 3. Root rule
    let setupTarget: string | null = null;
    let usesBazelRule = false;

    // First, check if selected target has target-specific or package-specific setup_sourcekit_bsp
    const selectedTargetData = context.buildManager.getSelectedBazelTargetData();
    if (selectedTargetData) {
      // Extract package path from build label (e.g., "//Apps/MyApp:MyApp" -> "//Apps/MyApp")
      const packagePath = selectedTargetData.buildLabel.substring(0, selectedTargetData.buildLabel.lastIndexOf(":"));
      const targetName = selectedTargetData.targetName;

      // Generate possible setup rule names by convention
      const targetSpecificSetup = `${packagePath}:setup_${targetName.toLowerCase()}_bsp`;
      const packageGenericSetup = `${packagePath}:setup_sourcekit_bsp`;

      // Check if this package has setup rules
      const packageBuildPath = path.join(selectedTargetData.packagePath, "BUILD.bazel");
      const packageBuildAltPath = path.join(selectedTargetData.packagePath, "BUILD");

      commonLogger.log("Checking for BSP setup rules", {
        targetName,
        packagePath: selectedTargetData.packagePath,
        checkingPaths: [packageBuildPath, packageBuildAltPath],
        lookingFor: [
          `setup_${targetName.toLowerCase()}_bsp (target-specific)`,
          `setup_sourcekit_bsp (package generic)`,
        ],
      });

      const packageBuildFile = (await isFileExists(packageBuildPath))
        ? packageBuildPath
        : (await isFileExists(packageBuildAltPath))
          ? packageBuildAltPath
          : null;

      if (packageBuildFile) {
        try {
          const packageBuildContent = await fs.readFile(packageBuildFile, "utf8");

          // Priority 1: Target-specific setup rule (e.g., setup_doordashred_bsp)
          const targetSpecificRuleName = `setup_${targetName.toLowerCase()}_bsp`;
          if (packageBuildContent.includes(`name = "${targetSpecificRuleName}"`)) {
            setupTarget = targetSpecificSetup;
            usesBazelRule = true;
            commonLogger.log(`✅ Found target-specific setup: ${setupTarget}`);
            commonLogger.log("💡 This will index only the selected target (faster!)");
          }
          // Priority 2: Package generic setup rule (e.g., setup_sourcekit_bsp)
          else if (packageBuildContent.includes("setup_sourcekit_bsp")) {
            setupTarget = packageGenericSetup;
            usesBazelRule = true;
            commonLogger.log(`✅ Found package-generic setup: ${setupTarget}`);
            commonLogger.log("💡 This will index all targets in the package");
          }
        } catch (error) {
          commonLogger.warn("Failed to check package BUILD file", { error });
        }
      }
    }

    // If no package-specific rule, check root BUILD file
    if (!usesBazelRule) {
      const rootBuildPath = path.join(workspacePath, "BUILD");
      const rootBuildBazelPath = path.join(workspacePath, "BUILD.bazel");
      const buildFilePath = (await isFileExists(rootBuildBazelPath))
        ? rootBuildBazelPath
        : (await isFileExists(rootBuildPath))
          ? rootBuildPath
          : null;

      commonLogger.log("Checking for root setup_sourcekit_bsp", {
        checkingPaths: [rootBuildBazelPath, rootBuildPath],
      });

      if (buildFilePath) {
        try {
          const buildContent = await fs.readFile(buildFilePath, "utf8");
          if (buildContent.includes("setup_sourcekit_bsp")) {
            setupTarget = "//:setup_sourcekit_bsp";
            usesBazelRule = true;
            commonLogger.log("✅ Found root setup target: //:setup_sourcekit_bsp");
          }
        } catch (error) {
          commonLogger.warn("Failed to read root BUILD file", { error });
        }
      }
    }

    if (usesBazelRule && setupTarget) {
      // Use the proper Bazel command to generate config
      commonLogger.log("Using Bazel rule to generate BSP config", { setupTarget });

      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      context.updateProgressStatus(`Running bazelisk run ${setupTarget}`);

      try {
        const { stdout, stderr } = await execAsync(`bazelisk run ${setupTarget}`, {
          cwd: workspacePath,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });

        commonLogger.log("setup_sourcekit_bsp output", { stdout, stderr });

        // Check if config was generated
        const configPath = path.join(bspDir, "skbsp.json");
        const hasBSPConfig = await isFileExists(configPath);

        if (!hasBSPConfig) {
          throw new Error("setup_sourcekit_bsp ran but didn't generate .bsp/skbsp.json");
        }

        // Check if binary exists
        const binaryPath = path.join(bspDir, "sourcekit-bazel-bsp");
        const hasBinary = await isFileExists(binaryPath);

        let message = `✅ BSP configuration generated!\n\nUsed: bazelisk run ${setupTarget}\nConfig: .bsp/skbsp.json`;

        if (!hasBinary) {
          message +=
            "\n\n⚠️ sourcekit-bazel-bsp binary not found!\n\n" +
            "Download from:\n" +
            "github.com/spotify/sourcekit-bazel-bsp/releases\n\n" +
            "Place at: .bsp/sourcekit-bazel-bsp";
        } else {
          message += "\n✅ Binary detected";
        }

        message += "\n\n💡 Reload window to activate BSP";

        vscode.window.showInformationMessage(message, "Reload Window", "Open Config").then((selection) => {
          if (selection === "Reload Window") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          } else if (selection === "Open Config") {
            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(configPath));
          }
        });

        return;
      } catch (execError: any) {
        commonLogger.error("Failed to run setup_sourcekit_bsp", { execError });
        throw new Error(
          `Failed to run bazelisk run ${setupTarget}\n\n` +
            `Error: ${execError.message}\n\n` +
            `Make sure:\n` +
            `- setup_sourcekit_bsp rule is defined in BUILD\n` +
            `- *_ios_skbsp targets exist for your libraries`,
        );
      }
    }

    // Fallback: Manual config generation
    commonLogger.log("setup_sourcekit_bsp rule not found, using manual config generation");

    // Get selected target (already declared above, just verify it exists)
    if (!selectedTargetData) {
      throw new Error("No Bazel target selected.\n\n" + "Please select a Bazel target first from BAZEL TARGETS view.");
    }

    // Create .bsp directory
    await createDirectory(bspDir);

    const configPath = path.join(bspDir, "skbsp.json");
    const wrapperPath = path.join(bspDir, "bazel-wrapper.sh");

    // Generate BSP config
    const targetName = selectedTargetData.targetName;
    const bspConfig = {
      name: "sourcekit-bazel-bsp",
      version: "0.2.0",
      bspVersion: "2.2.0",
      languages: ["c", "cpp", "objective-c", "objective-cpp", "swift"],
      argv: [
        ".bsp/sourcekit-bazel-bsp",
        "serve",
        "--target",
        selectedTargetData.buildLabel,
        "--bazel-wrapper",
        "bazelisk",
        "--build-test-suffix",
        "_(PLAT)_skbsp",
        "--build-test-platform-placeholder",
        "(PLAT)",
        "--index-build-batch-size",
        "10",
        "--index-flag",
        "config=skbsp",
        "--files-to-watch",
        `${targetName}/**/*.swift,${targetName}/**/*.h,${targetName}/**/*.m`,
      ],
    };

    // Write config
    await fs.writeFile(configPath, JSON.stringify(bspConfig, null, 2), "utf8");

    // Create bazel wrapper script
    const wrapperScript = `#!/bin/bash
# Bazel wrapper for sourcekit-bazel-bsp
# Disables BuildBuddy BES to avoid permission errors

# Extract the command (first argument) and pass BES flag after it
if [ $# -gt 0 ]; then
    cmd="$1"
    shift
    exec bazel "$cmd" --bes_backend= "$@"
else
    exec bazel "$@"
fi
`;

    await fs.writeFile(wrapperPath, wrapperScript, "utf8");
    await fs.chmod(wrapperPath, 0o755); // Make executable

    // Check if sourcekit-bazel-bsp binary exists
    const binaryPath = path.join(bspDir, "sourcekit-bazel-bsp");
    const hasBinary = await isFileExists(binaryPath);

    let message = `✅ BSP configuration created!\n\nTarget: ${selectedTargetData.targetName}\nConfig: .bsp/skbsp.json\nWrapper: .bsp/bazel-wrapper.sh`;

    if (!hasBinary) {
      message +=
        "\n\n⚠️ sourcekit-bazel-bsp binary not found!\n\n" +
        "Download from:\n" +
        "github.com/spotify/sourcekit-bazel-bsp/releases\n\n" +
        "Place the binary at:\n" +
        ".bsp/sourcekit-bazel-bsp";
    } else {
      message += "\n\n✅ Binary detected";
    }

    message += "\n\n💡 Reload window to activate BSP";

    vscode.window
      .showInformationMessage(message, "Reload Window", hasBinary ? "Open Config" : "Download Binary")
      .then((selection) => {
        if (selection === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        } else if (selection === "Open Config") {
          vscode.commands.executeCommand("vscode.open", vscode.Uri.file(configPath));
        } else if (selection === "Download Binary") {
          vscode.env.openExternal(vscode.Uri.parse("https://github.com/spotify/sourcekit-bazel-bsp/releases"));
        }
      });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    commonLogger.error("Failed to setup BSP config", { error });
    vscode.window.showErrorMessage(`Failed to setup BSP: ${errorMsg}`);
  }
}

/**
 * Monitor sourcekit-bazel-bsp logs in real-time
 * Useful for debugging BSP indexing issues
 */
export async function monitorBSPLogsCommand(_context: ExtensionContext): Promise<void> {
  try {
    // Check if sourcekit-bazel-bsp is running
    try {
      await exec({
        command: "pgrep",
        args: ["-x", "sourcekit-bazel-bsp"],
      });

      // If we get here, process is running
      commonLogger.log("✅ sourcekit-bazel-bsp is running");
    } catch (error) {
      // Process not found
      const action = await vscode.window.showWarningMessage(
        "sourcekit-bazel-bsp is not running.\n\nOpen a Swift file to start BSP, then run this command again.",
        "OK",
        "Show Instructions",
      );

      if (action === "Show Instructions") {
        vscode.window.showInformationMessage(
          "To start BSP:\n1. Open any Swift file in your project\n2. Wait a few seconds for SourceKit-LSP to start\n3. Run this command again to see logs",
        );
      }
      return;
    }

    commonLogger.log("🔍 Starting BSP log monitoring...");
    commonLogger.log("Streaming logs from: sourcekit-bazel-bsp");
    commonLogger.log("─────────────────────────────────────────────────────────────");

    // Create terminal to run log stream
    const terminal = vscode.window.createTerminal({
      name: "BSP Logs",
      iconPath: new vscode.ThemeIcon("debug-console"),
    });

    // Show the terminal
    terminal.show();

    // Execute log stream command
    terminal.sendText("log stream --process sourcekit-bazel-bsp --debug");

    // Also start background monitoring using Node's spawn to pipe logs to commonLogger
    const { spawn } = await import("node:child_process");
    const logProcess = spawn("log", ["stream", "--process", "sourcekit-bazel-bsp", "--debug"]);

    // Handle stdout
    logProcess.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          // Color code based on log level
          if (line.includes("error") || line.includes("Error") || line.includes("ERROR")) {
            commonLogger.error(`[BSP] ${line.trim()}`);
          } else if (line.includes("warning") || line.includes("Warning") || line.includes("WARN")) {
            commonLogger.warn(`[BSP] ${line.trim()}`);
          } else {
            commonLogger.log(`[BSP] ${line.trim()}`);
          }
        }
      }
    });

    // Handle stderr
    logProcess.stderr.on("data", (data: Buffer) => {
      const error = data.toString().trim();
      if (error) {
        commonLogger.error(`[BSP Error] ${error}`);
      }
    });

    // Handle process exit
    logProcess.on("close", (code) => {
      if (code !== null) {
        commonLogger.log(`🛑 BSP log monitoring stopped (exit code: ${code})`);
      }
    });

    // Show success message
    const selection = await vscode.window.showInformationMessage(
      "✅ BSP log monitoring started!\n\nLogs are being streamed to:\n• Terminal: 'BSP Logs'\n• Output: 'SwiftBazel - DoorDash'",
      "Show Terminal",
      "Show Output",
      "Stop Monitoring",
    );

    if (selection === "Show Terminal") {
      terminal.show();
    } else if (selection === "Show Output") {
      commonLogger.show();
    } else if (selection === "Stop Monitoring") {
      logProcess.kill();
      terminal.dispose();
      commonLogger.log("🛑 Stopping BSP log monitoring...");
    }

    commonLogger.log("✅ BSP log monitoring active");
    commonLogger.log("💡 Tip: Look for 'Building target' and 'Indexing' messages");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    commonLogger.error("Failed to start BSP log monitoring", { error });
    vscode.window.showErrorMessage(`Failed to monitor BSP logs: ${errorMsg}`);
  }
}
