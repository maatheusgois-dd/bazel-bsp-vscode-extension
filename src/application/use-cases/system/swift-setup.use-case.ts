import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../../../shared/logger/logger.js";
import { createDirectory, isFileExists, readJsonFile } from "../../../shared/utils/files.js";

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
    const configPath = path.join(bspDir, "skbsp.json");
    const wrapperPath = path.join(bspDir, "bazel-wrapper.sh");

    // Get selected target
    const selectedTargetData = context.buildManager.getSelectedBazelTargetData();
    if (!selectedTargetData) {
      throw new Error("No Bazel target selected.\n\n" + "Please select a Bazel target first from BAZEL TARGETS view.");
    }

    // Create .bsp directory
    await createDirectory(bspDir);

    // Generate BSP config
    const bspConfig = {
      name: "sourcekit-bazel-bsp",
      version: "0.2.0",
      bspVersion: "2.2.0",
      languages: ["c", "cpp", "objective-c", "objective-cpp", "swift"],
      argv: [
        ".bsp/sourcekit-bazel-bsp",
        "serve",
        "--target",
        `${selectedTargetData.buildLabel}_ios_skbsp`,
        "--bazel-wrapper",
        ".bsp/bazel-wrapper.sh",
        "--build-test-suffix",
        "_(PLAT)_skbsp",
        "--build-test-platform-placeholder",
        "(PLAT)",
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
