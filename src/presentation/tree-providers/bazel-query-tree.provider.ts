import * as vscode from "vscode";
import type { BazelQueryResult, BazelTreeNode, BazelTargetCategory } from "../../domain/entities/bazel/types.js";
import { BazelParser } from "../../infrastructure/bazel/bazel-parser.js";
import { commonLogger } from "../../shared/logger/logger.js";
import { getWorkspacePath } from "../../shared/utils/bazel-utils.js";
import {
  BazelQueryCategoryItem, // Keep for backward compatibility
  BazelQueryFolderItem,
  BazelQueryRootItem,
  BazelQueryTargetItem,
  BazelQueryRecentsSectionItem,
} from "./items/bazel-query-tree-item.js";

/**
 * Tree provider for bazel query-based target discovery
 * Supports lazy loading at the last folder level before targets
 */
export class BazelQueryTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private queryResult: BazelQueryResult | null = null;
  private isLoading = false;
  private loadError: string | null = null;
  private workspaceRoot: string;
  private buildManager: any;
  
  // Recent targets storage (last 3 selected)
  private recentTargets: Array<{
    name: string;
    type: 'runnable' | 'test' | 'buildable';
    buildLabel: string;
    pathParts: string[];
  }> = [];
  private readonly MAX_RECENT_TARGETS = 3;

  constructor(buildManager?: any) {
    this.workspaceRoot = getWorkspacePath();
    this.buildManager = buildManager;
    
    // Listen to selection changes to update highlighting and recents
    if (this.buildManager) {
      this.buildManager.on("selectedBazelTargetUpdated", () => {
        this.updateRecentTargets();
        this._onDidChangeTreeData.fire();
      });
    }
    
    // Load targets on initialization (will load recents after query completes)
    void this.loadTargets();
  }
  
  /**
   * Load recent targets from cache
   * Must be called after queryResult is available to validate targets still exist
   */
  private loadRecentTargetsFromCache(): void {
    commonLogger.log("loadRecentTargetsFromCache called");
    
    try {
      commonLogger.log("Checking buildManager context", {
        hasBuildManager: !!this.buildManager,
        hasContext: !!this.buildManager?._context,
      });
      
      if (!this.buildManager?._context) {
        commonLogger.log("No context available for loading recent targets");
        return;
      }
      
      const cached = this.buildManager._context.getWorkspaceState("bazelQuery.recentTargets");
      commonLogger.log("Retrieved cached data", {
        hasCached: !!cached,
        isArray: Array.isArray(cached),
        cached: cached,
      });
      
      if (!cached || !Array.isArray(cached)) {
        commonLogger.log("No cached recent targets found or invalid format");
        return;
      }
      
      if (!this.queryResult) {
        commonLogger.log("Query result not available yet, skipping recent targets load");
        return;
      }
      
      // Validate that cached targets still exist in the query result
      const validRecents = [];
      for (const recent of cached) {
        if (!recent.buildLabel || !recent.pathParts) {
          commonLogger.debug("Skipping invalid recent target", { recent });
          continue;
        }
        
        const targets = BazelParser.getTargetsAtPath(this.queryResult.tree, recent.pathParts);
        if (!targets) {
          commonLogger.debug("Target path no longer exists", { pathParts: recent.pathParts });
          continue;
        }
        
        // Check if target still exists in the appropriate category
        const targetExists = 
          (recent.type === 'runnable' && targets.runnable.includes(recent.name)) ||
          (recent.type === 'test' && targets.test.includes(recent.name)) ||
          (recent.type === 'buildable' && targets.buildable.includes(recent.name));
        
        if (targetExists) {
          validRecents.push(recent);
          commonLogger.debug("Valid recent target", { name: recent.name, type: recent.type });
        } else {
          commonLogger.debug("Target no longer exists in tree", { name: recent.name });
        }
      }
      
      this.recentTargets = validRecents.slice(0, this.MAX_RECENT_TARGETS);
      commonLogger.log("✅ Loaded recent targets from cache", { 
        cached: cached.length,
        valid: this.recentTargets.length,
        targets: this.recentTargets.map(t => t.name),
      });
    } catch (error) {
      commonLogger.error("Failed to load recent targets from cache", { error });
    }
  }
  
  /**
   * Save recent targets to cache
   */
  private saveRecentTargetsToCache(): void {
    try {
      if (!this.buildManager?._context) {
        commonLogger.debug("No context available for saving recent targets");
        return;
      }
      
      this.buildManager._context.updateWorkspaceState("bazelQuery.recentTargets", this.recentTargets);
      commonLogger.log("💾 Saved recent targets to cache", { count: this.recentTargets.length });
    } catch (error) {
      commonLogger.error("Failed to save recent targets to cache", { error });
    }
  }
  
  /**
   * Update recent targets list when a target is selected
   */
  private updateRecentTargets(): void {
    const selectedTarget = this.getSelectedBazelTargetData();
    if (!selectedTarget?.buildLabel || !this.queryResult) {
      return;
    }
    
    // Parse the build label: //Apps/Consumer/ConsumerApp:Caviar
    const match = selectedTarget.buildLabel.match(/^\/\/(.+):(.+)$/);
    if (!match) {
      return;
    }
    
    const [, pathStr, targetName] = match;
    const pathParts = pathStr.split('/');
    
    // Determine target type from the query result
    const targets = BazelParser.getTargetsAtPath(this.queryResult.tree, pathParts);
    if (!targets) {
      return;
    }
    
    let targetType: 'runnable' | 'test' | 'buildable' | undefined;
    if (targets.runnable.includes(targetName)) {
      targetType = 'runnable';
    } else if (targets.test.includes(targetName)) {
      targetType = 'test';
    } else if (targets.buildable.includes(targetName)) {
      targetType = 'buildable';
    }
    
    if (!targetType) {
      return;
    }
    
    // Remove if already in list
    this.recentTargets = this.recentTargets.filter(
      t => t.buildLabel !== selectedTarget.buildLabel
    );
    
    // Add to front
    this.recentTargets.unshift({
      name: targetName,
      type: targetType,
      buildLabel: selectedTarget.buildLabel,
      pathParts: pathParts,
    });
    
    // Keep only last 3
    this.recentTargets = this.recentTargets.slice(0, this.MAX_RECENT_TARGETS);
    
    // Save to cache
    this.saveRecentTargetsToCache();
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
    this._onDidChangeTreeData.fire();

    try {
      const cwd = getWorkspacePath();
      this.queryResult = await BazelParser.queryAllTargets(cwd);
      commonLogger.log("Loaded bazel targets", {
        statistics: this.queryResult.statistics,
      });
      
      // Load cached recent targets after query completes
      this.loadRecentTargetsFromCache();
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
      commonLogger.error("Failed to load bazel targets", { error });
    } finally {
      this.isLoading = false;
      this._onDidChangeTreeData.fire();
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
    this.recentTargets = [];
    this.saveRecentTargetsToCache();
    this._onDidChangeTreeData.fire();
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
        const errorItem = new vscode.TreeItem(
          `Error: ${this.loadError}`,
          vscode.TreeItemCollapsibleState.None
        );
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
      if (this.recentTargets.length > 0) {
        items.push(new BazelQueryRecentsSectionItem(this.recentTargets.length));
      }
      
      // Then, add top-level folders (Apps, Packages, etc.)
      const folders = this.getChildrenAtPath([]);
      items.push(...folders);
      
      return items;
    }
    
    // Recents section - show recent targets
    if (element instanceof BazelQueryRecentsSectionItem) {
      return this.recentTargets.map(recent => 
        new BazelQueryTargetItem(
          recent.name,
          recent.type,
          recent.pathParts,
          this.workspaceRoot,
          this
        )
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
        (targetName) => new BazelQueryTargetItem(targetName, element.category, element.pathParts, this.workspaceRoot, this)
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
      const hasTargets = BazelParser.hasTargetsAtPath(this.queryResult!.tree, childPath);
      
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

