import { showQuickPick } from "../utils/quick-pick.js";

import { TOOLS, type Tool } from "../constants/tools-constants.js";

/**
 * Ask user to select a tool from the list of available tools
 */
export async function askTool(options: { title: string }): Promise<Tool> {
  const tools = TOOLS;
  const selected = await showQuickPick({
    title: options.title,
    items: tools.map((tool) => {
      return {
        label: tool.label,
        context: {
          tool: tool,
        },
      };
    }),
  });
  return selected.context.tool;
}
