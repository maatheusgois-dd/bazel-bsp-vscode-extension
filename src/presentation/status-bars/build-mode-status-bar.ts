import * as vscode from "vscode";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { getWorkspaceConfig } from "../../shared/utils/config.js";

export class BuildModeStatusBar {
  context: ExtensionContext;
  item: vscode.StatusBarItem;

  constructor(options: { context: ExtensionContext }) {
    this.context = options.context;

    const itemId = "swiftbazel.bazel.buildMode.statusBar";
    this.item = vscode.window.createStatusBarItem(itemId, vscode.StatusBarAlignment.Left, -2);
    this.item.name = "swiftbazel: Build Mode";
    this.item.tooltip = "Click to change build mode";
    this.item.command = "swiftbazel.bazel.selectBuildMode";

    this.update();
    this.item.show();
  }

  update() {
    // Check config first
    const configMode = getWorkspaceConfig("bazel.buildMode");

    // Check workspace state (last used mode)
    const savedMode = this.context.getWorkspaceState("bazel.buildMode");

    let mode: "debug" | "release" | "release-with-symbols" | "ask" = "ask";
    let displayText = "$(question) Ask";
    let icon = "$(question)";

    if (configMode && configMode !== "ask") {
      mode = configMode;
    } else if (savedMode) {
      mode = savedMode;
    }

    if (mode === "debug") {
      icon = "$(bug)";
      displayText = `${icon} Debug`;
      this.item.tooltip = "Build Mode: Debug (unoptimized with symbols)\nClick to change";
    } else if (mode === "release-with-symbols") {
      icon = "$(package)";
      displayText = `${icon} Release+Sym`;
      this.item.tooltip = "Build Mode: Release with Symbols (optimized with symbols)\nClick to change";
    } else if (mode === "release") {
      icon = "$(archive)";
      displayText = `${icon} Release`;
      this.item.tooltip = "Build Mode: Release (optimized, no symbols)\nClick to change";
    } else {
      displayText = `${icon} Ask`;
      this.item.tooltip = "Build Mode: Ask each time\nClick to set default";
    }

    this.item.text = displayText;
  }

  dispose() {
    this.item.dispose();
  }
}
