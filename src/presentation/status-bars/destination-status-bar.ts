import * as vscode from "vscode";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";

export class DestinationStatusBar {
  context: ExtensionContext;
  item: vscode.StatusBarItem;

  constructor(options: { context: ExtensionContext }) {
    this.context = options.context;
    const itemId = "bazelbsp.destinations.statusBar";
    this.item = vscode.window.createStatusBarItem(itemId, vscode.StatusBarAlignment.Left, 0);
    this.item.name = "Bazel BSP: Current Destination";
    this.item.command = "bazelbsp.destinations.select";
    this.item.tooltip = "Select destination for debugging";
    void this.update();
    this.item.show();
    this.context.destinationsManager.on("xcodeDestinationForBuildUpdated", () => {
      void this.update();
    });
  }

  update() {
    const destination = this.context.destinationsManager.getSelectedXcodeDestinationForBuild();
    if (destination) {
      this.item.text = `$(bazelbsp-device-mobile-check) ${destination.name}`;
    } else {
      this.item.text = "$(bazelbsp-device-mobile-question) No destination selected";
    }
  }

  dispose() {
    this.item.dispose();
  }
}
