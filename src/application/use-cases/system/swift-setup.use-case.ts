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

    vscode.window
      .showInformationMessage(
        `✅ Swift extension configured for BSP!\n\nWorkspace: ${workspaceFolder.name}\nBackground Indexing: ON\nSettings: .vscode/settings.json\n\n💡 Reload window to apply changes`,
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
