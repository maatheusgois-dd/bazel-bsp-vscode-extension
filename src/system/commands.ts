import * as vscode from "vscode";
import type { ExtensionContext } from "../common/commands";

export async function resetswiftbazelCache(context: ExtensionContext) {
  context.updateProgressStatus("Resetting swiftbazel cache");
  context.resetWorkspaceState();
  vscode.window.showInformationMessage("✅ swiftbazel cache has been reset");
}

export async function openTerminalPanel() {
  vscode.window.terminals.at(-1)?.show();
}
