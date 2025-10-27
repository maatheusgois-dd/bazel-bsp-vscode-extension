// Re-export tree item types for backward compatibility
export type { BazelWorkspaceEventData, BuildEventData, BazelWorkspaceCacheData } from "./tree-types.js";
export { WorkspaceGroupTreeItem, type IWorkspaceTreeProvider } from "./items/bazel-workspace-item.js";
export { WorkspaceSectionTreeItem } from "./items/bazel-section-item.js";
export { BuildTreeItem, type IBuildTreeProvider } from "./items/build-tree-item.js";
export { BazelTreeItem, type IBazelTreeProvider } from "./items/bazel-tree-item.js";

// The new query-based tree provider
export { BazelQueryTreeProvider } from "./bazel-query-tree.provider.js";
