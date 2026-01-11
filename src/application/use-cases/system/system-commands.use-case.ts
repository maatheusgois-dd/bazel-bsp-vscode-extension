import * as vscode from "vscode";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";

export async function resetbazelbspCache(context: ExtensionContext) {
  context.updateProgressStatus("Resetting bazelbsp cache");
  context.resetWorkspaceState();
  vscode.window.showInformationMessage("✅ bazelbsp cache has been reset");
}

export async function openTerminalPanel() {
  vscode.window.terminals.at(-1)?.show();
}
