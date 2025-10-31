import * as vscode from "vscode";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";

export class BazelTargetStatusBar {
  context: ExtensionContext;
  item: vscode.StatusBarItem;

  constructor(options: { context: ExtensionContext }) {
    this.context = options.context;

    const itemId = "swiftbazel.bazel.statusBar";
    this.item = vscode.window.createStatusBarItem(itemId, vscode.StatusBarAlignment.Left, -1);
    this.item.name = "swiftbazel: Selected Bazel Target";
    this.item.tooltip = "Currently selected Bazel target";

    this.update();
    this.item.show();

    // Listen for target selection changes from BuildManager
    this.context.buildManager.on("selectedBazelTargetUpdated", () => {
      this.update();
    });
  }

  update() {
    const selectedTargetData = this.context.buildManager.getSelectedBazelTargetData();

    if (selectedTargetData) {
      const targetType = selectedTargetData.targetType;
      let icon = "$(package)";

      if (targetType === "test") {
        icon = "$(beaker)";
      } else if (targetType === "binary") {
        icon = "$(gear)";
      }

      this.item.text = `${icon} ${selectedTargetData.targetName}`;
      this.item.tooltip = `Selected Bazel Target: ${selectedTargetData.targetName} (${targetType})\nPackage: ${selectedTargetData.packageName}\nClick to open Bazel Targets view`;
      this.item.command = {
        command: "workbench.view.extension.swiftbazel-view",
        title: "Open Bazel Targets",
      };
    } else {
      this.item.text = "$(target) No Bazel target";
      this.item.tooltip = "No Bazel target selected\nClick to open Bazel Targets view";
      this.item.command = {
        command: "workbench.view.extension.swiftbazel-view",
        title: "Open Bazel Targets",
      };
    }
  }

  dispose() {
    this.item.dispose();
  }
}
