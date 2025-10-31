import * as vscode from "vscode";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { getWorkspaceConfig } from "../../shared/utils/config.js";

const DEFAULT_SCOPE_ID = "__DEFAULT_SCOPE_ID";

/**
 * Status bar item for showing what currently swiftbazel is doing
 *
 * Usually, it's enough to call `update` method with the text you want to show
 * and if it in the context of a command, it will be automatically removed when
 * the command is finished. Otherwise, you need to call `remove` method to remove it
 * from the status bar manually.
 */
export class ProgressStatusBar {
  _context: ExtensionContext | undefined = undefined;
  statusBar: vscode.StatusBarItem;
  cancelButton: vscode.StatusBarItem;
  enabled = true;

  messageMapping: Map<string, string> = new Map();
  cancellableMapping: Map<string, boolean> = new Map();
  private cancelCallbacks: Map<string, () => void> = new Map();

  constructor() {
    // Status bar ID allows to separate the different status bar items from the same extension
    const statusBarId = "swiftbazel.system.progressStatusBar";
    this.statusBar = vscode.window.createStatusBarItem(statusBarId, vscode.StatusBarAlignment.Left, 0);
    this.statusBar.command = "swiftbazel.system.openTerminalPanel";
    this.statusBar.name = "SwiftBazel: Command Status";

    // Create cancel button (shown to the left of progress status)
    const cancelButtonId = "swiftbazel.system.progressCancelButton";
    this.cancelButton = vscode.window.createStatusBarItem(cancelButtonId, vscode.StatusBarAlignment.Left, 1);
    this.cancelButton.text = "$(x) Cancel";
    this.cancelButton.tooltip = "Cancel current operation";
    this.cancelButton.command = "swiftbazel.system.cancelCurrentOperation";
    this.cancelButton.name = "SwiftBazel: Cancel Operation";
  }

  dispose() {
    this.statusBar.dispose();
    this.cancelButton.dispose();
    this.messageMapping.clear();
    this.cancellableMapping.clear();
    this.cancelCallbacks.clear();
  }

  get context(): ExtensionContext {
    if (!this._context) {
      throw new Error("Context is not set");
    }
    return this._context;
  }

  set context(context: ExtensionContext) {
    this._context = context;

    this.updateConfig();

    // Every time a command or task is finished we remove message of the current scope
    // and update the status bar accordingly
    context.on("executionScopeClosed", (scope) => {
      const scopeId = scope.id ?? DEFAULT_SCOPE_ID;
      this.messageMapping.delete(scopeId);
      this.cancellableMapping.delete(scopeId);
      this.cancelCallbacks.delete(scopeId);
      this.displayBar();
    });

    context.on("workspaceConfigChanged", () => {
      this.updateConfig();
    });
  }

  updateText(text: string, cancellable = false) {
    const scopeId = this.context.getExecutionScopeId() ?? DEFAULT_SCOPE_ID;
    this.messageMapping.set(scopeId, text);
    this.cancellableMapping.set(scopeId, cancellable);
    this.displayBar();
  }

  /**
   * Register a cancel callback for the current scope
   */
  registerCancelCallback(callback: () => void) {
    const scopeId = this.context.getExecutionScopeId() ?? DEFAULT_SCOPE_ID;
    this.cancelCallbacks.set(scopeId, callback);
  }

  /**
   * Cancel the current operation
   */
  cancelCurrentOperation() {
    const scopeId = this.context.getExecutionScopeId() ?? DEFAULT_SCOPE_ID;
    const callback = this.cancelCallbacks.get(scopeId);

    if (callback) {
      callback();
      // Remove the operation from tracking
      this.messageMapping.delete(scopeId);
      this.cancellableMapping.delete(scopeId);
      this.cancelCallbacks.delete(scopeId);
      this.displayBar();
    }
  }

  updateConfig() {
    const enabled = getWorkspaceConfig("system.showProgressStatusBar") ?? true;
    if (this.enabled === enabled) {
      return; // nothing changed, no need to update
    }

    this.enabled = enabled;
    if (enabled) {
      // user enabled the status bar, show it if there are any messages
      this.displayBar();
    } else {
      // user disabled the status bar, hide it despite the messages
      this.statusBar.hide();
    }
  }

  displayBar() {
    if (!this.enabled) {
      this.cancelButton.hide();
      return;
    }

    // No messages to show, hide the status bar for now
    if (this.messageMapping.size === 0) {
      this.statusBar.hide();
      this.cancelButton.hide();
      return;
    }

    this.statusBar.show();

    // Check if any operation is cancellable
    const anyCancellable = Array.from(this.cancellableMapping.values()).some((c) => c);

    if (anyCancellable) {
      this.cancelButton.show();
    } else {
      this.cancelButton.hide();
    }

    // In simplest case, when we have only one message, we can show it directly in the status bar
    if (this.messageMapping.size === 1) {
      const text = this.messageMapping.values().next().value;
      this.statusBar.text = `$(gear~spin) ${text}...`;

      const isCancellable = Array.from(this.cancellableMapping.values())[0];
      if (isCancellable) {
        this.statusBar.tooltip = new vscode.MarkdownString(
          "Click to open terminal\n\n$(x) Click **Cancel** button to stop",
        );
      } else {
        this.statusBar.tooltip = "Click to open terminal";
      }
      return;
    }

    // In cases when we have multiple parallel commands running, we can show the status bar
    // with the number of commands running and a tooltip with the list of commands
    // that are running. Not idea, but better than nothing.
    this.statusBar.text = `$(gear~spin) ${this.messageMapping.size} commands running...`;
    const tooltip = new vscode.MarkdownString(
      `Active commands:\n${Array.from(this.messageMapping.values())
        .map((text) => `- ${text}...`)
        .join("\n")}\n${anyCancellable ? "\n$(x) Click **Cancel** button to stop" : ""}`,
    );
    tooltip.isTrusted = true;
    this.statusBar.tooltip = tooltip;
    return;
  }
}
