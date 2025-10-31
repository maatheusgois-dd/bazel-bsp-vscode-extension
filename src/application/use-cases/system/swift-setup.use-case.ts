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
    // Get the selected Bazel target to determine the folder
    const selectedTargetData = context.buildManager.getSelectedBazelTargetData();

    if (!selectedTargetData) {
      throw new Error(
        "No Bazel target selected.\n\n" +
          "Please select a Bazel target first:\n" +
          "1. Open BAZEL TARGETS view\n" +
          "2. Click on a target to select it\n" +
          "3. Run this command again",
      );
    }

    // Use package path (directory containing BUILD file) - same as build/clean commands
    const targetFolder = selectedTargetData.packagePath;
    const vscodeDir = path.join(targetFolder, ".vscode");
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

    commonLogger.log("Enabled Swift background indexing for target folder", {
      folder: targetFolder,
    });

    // Ask if user wants to set custom sourcekit-lsp path
    const useCustomLSP = await vscode.window.showQuickPick(
      [
        {
          label: "Use Xcode's SourceKit-LSP",
          description: "Default - Works but may have performance issues",
          value: false,
        },
        {
          label: "Use Custom SourceKit-LSP",
          description: "Recommended - Better performance with latest features",
          value: true,
        },
      ],
      {
        title: "SourceKit-LSP Configuration",
        placeHolder: "Choose SourceKit-LSP version to use",
      },
    );

    if (!useCustomLSP) {
      vscode.window.showInformationMessage("✅ Swift extension configured for Bazel development");
      return;
    }

    if (useCustomLSP.value) {
      // Prompt for custom sourcekit-lsp path
      const customPath = await vscode.window.showInputBox({
        title: "Custom SourceKit-LSP Binary Path",
        prompt: "Enter absolute path to sourcekit-lsp binary (leave empty to skip)",
        placeHolder: "/usr/local/bin/sourcekit-lsp",
        validateInput: (value) => {
          if (!value) return null; // Empty is OK
          if (!value.startsWith("/")) {
            return "Path must be absolute (start with /)";
          }
          if (!value.includes("sourcekit-lsp")) {
            return "Path should point to sourcekit-lsp binary";
          }
          return null;
        },
      });

      if (customPath) {
        settings["swift.sourcekit-lsp.serverPath"] = customPath;
        commonLogger.log("Set custom SourceKit-LSP path", { path: customPath });
      }
    }

    // Write settings.json
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");

    const relativePath = path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "", settingsPath);

    vscode.window
      .showInformationMessage(
        `✅ Swift extension configured!\n\nFolder: ${selectedTargetData.packageName}\nBackground Indexing: Enabled\nSettings: ${relativePath}`,
        "Reload Window",
        "Open Settings",
      )
      .then((selection) => {
        if (selection === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        } else if (selection === "Open Settings") {
          vscode.commands.executeCommand("vscode.open", vscode.Uri.file(settingsPath));
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
