import type { WorkspaceGroupTreeItem } from "./items/bazel-workspace-item";

// Type definitions for tree events
export type BazelWorkspaceEventData = WorkspaceGroupTreeItem | undefined | null;
export type BuildEventData = any | undefined | null;

// Persistent cache interface for Bazel workspaces
export interface BazelWorkspaceCacheData {
  version: string;
  timestamp: number;
  workspacePaths: string[];
  recentWorkspacePaths: string[];
  workspaceRoot: string;
}
