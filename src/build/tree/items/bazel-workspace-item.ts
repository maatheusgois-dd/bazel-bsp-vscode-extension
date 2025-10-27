import path from "node:path";
import * as vscode from "vscode";
import { getWorkspacePath } from "../../utils";

// Forward declaration to avoid circular dependency
export interface IWorkspaceTreeProvider {
  context?: { extensionPath: string };
  defaultWorkspacePath?: string;
  setItemLoading(item: WorkspaceGroupTreeItem, loading: boolean): void;
}

export class WorkspaceGroupTreeItem extends vscode.TreeItem {
  public provider: IWorkspaceTreeProvider;
  public workspacePath: string;
  public isRecent: boolean;
  public isLoading = false;
  public uniqueId: string;

  constructor(options: {
    workspacePath: string;
    provider: IWorkspaceTreeProvider;
    isRecent?: boolean;
    isLoading?: boolean;
  }) {
    // For Bazel BUILD files, use the parent directory name
    let displayName = "";

    if (path.basename(options.workspacePath) === "BUILD.bazel" || path.basename(options.workspacePath) === "BUILD") {
      const parentDir = path.dirname(options.workspacePath);
      const parentFolderName = path.basename(parentDir);

      // Get context for deeper paths if needed
      const grandParentDir = path.dirname(parentDir);
      const grandParentFolderName = path.basename(grandParentDir);

      // Determine how many parent folders to include based on the workspace path depth
      const workspaceRoot = getWorkspacePath();
      const relativePath = path.relative(workspaceRoot, options.workspacePath);
      const folderDepth = relativePath.split(path.sep).length - 1; // -1 for the filename itself

      if (folderDepth > 2) {
        // For deep paths, show more context
        displayName = `${grandParentFolderName}/${parentFolderName}`;
      } else {
        // For shallow paths, just show immediate parent
        displayName = parentFolderName;
      }
    } else {
      // Fallback for other paths
      displayName = path.basename(options.workspacePath);
    }

    // Set collapsible state based on whether it's in the Recents section or is a Bazel workspace
    const isRecent = !!options.isRecent;
    const isCurrentWorkspace = options.provider.defaultWorkspacePath === options.workspacePath;
    const isBazelWorkspace = options.workspacePath.endsWith("BUILD.bazel") || options.workspacePath.endsWith("BUILD");

    // Items in Recents are expandable, others are not
    const collapsibleState = isRecent ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;

    // What constructs the display of the tree item
    super(displayName, collapsibleState);

    this.workspacePath = options.workspacePath;
    this.provider = options.provider;
    this.isRecent = isRecent;
    this.isLoading = !!options.isLoading;

    // Create a unique ID that combines path and whether it's a recent item
    this.uniqueId = `${this.workspacePath}:${this.isRecent ? "recent" : "regular"}`;

    let description = "";
    let color: vscode.ThemeColor = new vscode.ThemeColor("foreground");

    // Only show checkmark on selected workspace
    if (isCurrentWorkspace) {
      description = `${description} ✓`;
      color = new vscode.ThemeColor("swiftbazel.workspace");
    }

    // Add loading indicator
    if (this.isLoading) {
      description = `${description} (loading...)`;
    }

    if (description) {
      this.description = description;
    }

    // Set icon based on file type - only Bazel support
    if (path.basename(this.workspacePath) === "BUILD.bazel" || path.basename(this.workspacePath) === "BUILD") {
      this.iconPath = vscode.Uri.joinPath(
        vscode.Uri.file(this.provider.context?.extensionPath || ""),
        "images",
        "bazel.png",
      );
    } else {
      this.iconPath = new vscode.ThemeIcon("folder", color);
    }

    this.contextValue = "workspace-group";
    this.tooltip = this.workspacePath;
  }

  // Set loading state and refresh the UI
  setLoading(loading: boolean): void {
    this.isLoading = loading;
    // Update the loading state in the provider
    if (this.provider) {
      this.provider.setItemLoading(this, loading);
    }
  }
}
