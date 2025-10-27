import { selectDestinationForBuild } from "../../../shared/utils/bazel-utils.js";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import type { DestinationTreeItem } from "../../../presentation/tree-providers/destination-tree.provider.js";

export async function selectDestinationForBuildCommand(context: ExtensionContext, item?: DestinationTreeItem) {
  if (item) {
    context.destinationsManager.setWorkspaceDestinationForBuild(item.destination);
    return;
  }

  context.updateProgressStatus("Searching for destination");
  const destinations = await context.destinationsManager.getDestinations({
    mostUsedSort: true,
  });

  await selectDestinationForBuild(context, {
    destinations: destinations,
    supportedPlatforms: undefined, // All platforms
  });
}

export async function removeRecentDestinationCommand(context: ExtensionContext, item?: DestinationTreeItem) {
  if (!item) {
    return;
  }

  const manager = context.destinationsManager;
  manager.removeRecentDestination(item.destination);
}
