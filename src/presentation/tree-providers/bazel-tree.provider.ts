import * as vscode from "vscode";
import type { BazelQueryResult } from "../../domain/entities/bazel/types.js";
import { BazelParser } from "../../infrastructure/bazel/bazel-parser.js";
import { commonLogger } from "../../shared/logger/logger.js";
import { getWorkspacePath } from "../../shared/utils/bazel-utils.js";
import {
  BazelQueryCategoryItem, // Keep for backward compatibility
  BazelQueryFolderItem,
  BazelQueryRecentsSectionItem,
  BazelQueryTargetItem,
} from "./items/bazel-query-tree-item.js";
import { RecentTargetsManager } from "./helpers/recent-targets-manager.js";

/**
 * Tree provider for bazel query-based target discovery
 * Supports lazy loading at the last folder level before targets
 */
export class BazelTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private queryResult: BazelQueryResult | null = null;
  private isLoading = false;
  private loadError: string | null = null;
  private workspaceRoot: string;
  private buildManager: any;
  private recentsManager: RecentTargetsManager;

  constructor(buildManager?: any) {
    this.workspaceRoot = getWorkspacePath();
    this.buildManager = buildManager;
    this.recentsManager = new RecentTargetsManager(buildManager?._context);

    // Listen to selection changes to update highlighting and recents
    if (this.buildManager) {
      this.buildManager.on("selectedBazelTargetUpdated", () => {
        this.updateRecentTargets();
        this._onDidChangeTreeData.fire(undefined);
      });
    }

    // Load targets on initialization (will load recents after query completes)
    void this.loadTargets();
  }

  /**
   * Update recent targets list when a target is selected
   */
  private updateRecentTargets(): void {
    const selectedTarget = this.getSelectedBazelTargetData();
    if (!selectedTarget?.buildLabel || !this.queryResult) {
      return;
    }

    // Delegate to the recents manager
    this.recentsManager.addTarget(selectedTarget.buildLabel, this.queryResult.tree);
  }

  /**
   * Get selected target data (for highlighting)
   */
  getSelectedBazelTargetData(): any {
    return this.buildManager?.getSelectedBazelTargetData();
  }

  /**
   * Load all targets using bazel query
   */
  async loadTargets(): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;
    this.loadError = null;
    this._onDidChangeTreeData.fire(undefined);

    try {
      const cwd = getWorkspacePath();
      this.queryResult = await BazelParser.queryAllTargets(cwd);
      commonLogger.log("Loaded bazel targets", {
        statistics: this.queryResult.statistics,
      });

      // Load cached recent targets after query completes
      this.recentsManager.loadFromCache(this.queryResult.tree);
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
      commonLogger.error("Failed to load bazel targets", { error });
    } finally {
      this.isLoading = false;
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  /**
   * Refresh the tree by reloading targets
   */
  refresh(): void {
    this.queryResult = null;
    void this.loadTargets();
  }

  /**
   * Clear recent targets
   */
  clearRecents(): void {
    this.recentsManager.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get tree items for display
   */
  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    // Root level - show loading, error, or root item
    if (!element) {
      if (this.isLoading) {
        const loadingItem = new vscode.TreeItem("Loading bazel targets...", vscode.TreeItemCollapsibleState.None);
        loadingItem.iconPath = new vscode.ThemeIcon("loading~spin");
        return [loadingItem];
      }

      if (this.loadError) {
        const errorItem = new vscode.TreeItem(`Error: ${this.loadError}`, vscode.TreeItemCollapsibleState.None);
        errorItem.iconPath = new vscode.ThemeIcon("error");
        errorItem.contextValue = "bazelQueryError";
        errorItem.command = {
          command: "swiftbazel.bazelQuery.refresh",
          title: "Retry",
        };
        return [errorItem];
      }

      if (!this.queryResult) {
        const emptyItem = new vscode.TreeItem("No targets found", vscode.TreeItemCollapsibleState.None);
        emptyItem.iconPath = new vscode.ThemeIcon("info");
        return [emptyItem];
      }

      const items: vscode.TreeItem[] = [];

      // First, add Recents section if there are recent targets
      if (this.recentsManager.getCount() > 0) {
        items.push(new BazelQueryRecentsSectionItem(this.recentsManager.getCount()));
      }

      // Then, add top-level folders (Apps, Packages, etc.)
      const folders = this.getChildrenAtPath([]);
      items.push(...folders);

      return items;
    }

    // Recents section - show recent targets
    if (element instanceof BazelQueryRecentsSectionItem) {
      return this.recentsManager.getAll().map(
        (recent) => new BazelQueryTargetItem(recent.name, recent.type, recent.pathParts, this.workspaceRoot, this),
      );
    }

    // Folder item - show both targets AND subfolders
    if (element instanceof BazelQueryFolderItem) {
      const items: vscode.TreeItem[] = [];

      // First, if this folder has direct targets, add them at the top
      if (element.hasTargets) {
        const targetItems = this.loadTargetsForFolder(element.pathParts);
        items.push(...targetItems);
      }

      // Then, add child folders after targets
      const childFolders = this.getChildrenAtPath(element.pathParts);
      items.push(...childFolders);

      return items;
    }

    // Category item - show targets (deprecated, keeping for backward compatibility)
    if (element instanceof BazelQueryCategoryItem) {
      return element.targets.map(
        (targetName) =>
          new BazelQueryTargetItem(targetName, element.category, element.pathParts, this.workspaceRoot, this),
      );
    }

    return [];
  }

  /**
   * Get child folders at a specific path
   */
  private getChildrenAtPath(pathParts: string[]): vscode.TreeItem[] {
    if (!this.queryResult) return [];

    const children = BazelParser.getChildrenAtPath(this.queryResult.tree, pathParts);

    return children.map((childName) => {
      const childPath = [...pathParts, childName];
      const hasTargets = this.queryResult ? BazelParser.hasTargetsAtPath(this.queryResult.tree, childPath) : false;

      return new BazelQueryFolderItem(childName, childPath, hasTargets);
    });
  }

  /**
   * Load targets for a specific folder (lazy loading)
   */
  private loadTargetsForFolder(pathParts: string[]): vscode.TreeItem[] {
    if (!this.queryResult) return [];

    const targets = BazelParser.getTargetsAtPath(this.queryResult.tree, pathParts);
    if (!targets) return [];

    commonLogger.log("Loading targets for folder", {
      path: pathParts.join("/"),
      targets: targets,
    });

    const items: vscode.TreeItem[] = [];

    // Add all targets directly (no category grouping)
    // Order: runnable, test, buildable
    // Pass this provider for selection state checking
    for (const targetName of targets.runnable) {
      items.push(new BazelQueryTargetItem(targetName, "runnable", pathParts, this.workspaceRoot, this));
    }

    for (const targetName of targets.test) {
      items.push(new BazelQueryTargetItem(targetName, "test", pathParts, this.workspaceRoot, this));
    }

    for (const targetName of targets.buildable) {
      items.push(new BazelQueryTargetItem(targetName, "buildable", pathParts, this.workspaceRoot, this));
    }

    return items;
  }

  /**
   * Get tree item representation
   */
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get the current query result (for external use)
   */
  getQueryResult(): BazelQueryResult | null {
    return this.queryResult;
  }
}
