import * as vscode from "vscode";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import type { ToolTreeItem } from "../../../presentation/tree-providers/tools-tree.provider.js";
import { runTask } from "../../../shared/utils/tasks.js";
import { askTool } from "../../../shared/utils/tools-utils.js";

/**
 * Command to install tool from the tool tree view in the sidebar using brew
 */
export async function installToolCommand(context: ExtensionContext, item?: ToolTreeItem) {
  const tool = item?.tool ?? (await askTool({ title: "Select tool to install" }));

  context.updateProgressStatus("Installing tool");
  await runTask(context, {
    name: "Install Tool",
    error: "Error installing tool",
    terminateLocked: false,
    lock: "swiftbazel.tools.install",
    callback: async (terminal) => {
      await terminal.execute({
        command: tool.install.command,
        args: tool.install.args,
        env: {
          // We don't run the command in ptty, that's why we need to tell homebrew to use color
          // output explicitly
          HOMEBREW_COLOR: "1",
        },
      });

      context.toolsManager.refresh();
    },
  });
}

/**
 * Command to open documentation in the browser from the tool tree view in the sidebar
 */
export async function openDocumentationCommand(_context: ExtensionContext, item?: ToolTreeItem) {
  const tool = item?.tool ?? (await askTool({ title: "Select tool to open documentation" }));
  await vscode.env.openExternal(vscode.Uri.parse(tool.documentation));
}
