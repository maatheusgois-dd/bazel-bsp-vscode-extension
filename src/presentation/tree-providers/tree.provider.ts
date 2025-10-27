// Re-export tree item types for backward compatibility
export { BazelTreeItem, type IBazelTreeProvider } from "./items/bazel-tree-item.js";

// The new query-based tree provider
export { BazelQueryTreeProvider } from "./bazel-query-tree.provider.js";
