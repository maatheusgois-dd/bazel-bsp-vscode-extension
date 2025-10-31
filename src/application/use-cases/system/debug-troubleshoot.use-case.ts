import * as vscode from "vscode";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";

/**
 * Troubleshoot debug session and breakpoint issues
 * This helps when breakpoints become "unverified" after switching targets
 */
export async function troubleshootBreakpointsCommand(context: ExtensionContext): Promise<void> {
  const steps = [
    "Stopping any active debug sessions",
    "Restarting Swift LSP Server",
    "Clearing debug caches",
    "Refreshing workspace",
  ];

  let currentStep = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Troubleshooting Breakpoints",
      cancellable: false,
    },
    async (progress) => {
      // Step 1: Stop debug sessions
      progress.report({ increment: 25, message: steps[currentStep++] });
      const activeSessions = vscode.debug.activeDebugSession;
      if (activeSessions) {
        await vscode.debug.stopDebugging(activeSessions);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Step 2: Restart Swift LSP
      progress.report({ increment: 25, message: steps[currentStep++] });
      try {
        await vscode.commands.executeCommand("swift.restartLSPServer");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (_error) {
        // Swift extension might not be available
      }

      // Step 3: Clear workspace state for debug
      progress.report({ increment: 25, message: steps[currentStep++] });
      context.updateWorkspaceState("build.lastLaunchedApp", undefined);

      // Step 4: Refresh current file
      progress.report({ increment: 25, message: steps[currentStep++] });
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await vscode.commands.executeCommand("workbench.action.files.revert");
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    },
  );

  vscode.window.showInformationMessage(
    "✅ Breakpoint troubleshooting complete. Try setting breakpoints again.",
    "Open Debug Console",
  );
}
