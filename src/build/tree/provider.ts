import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import type { ExtensionContext } from "../../common/commands";
import { commonLogger } from "../../common/logger";
import { cacheManager } from "../../common/cache-manager";
import type { BuildManager } from "../manager";
import type { SelectedBazelTargetData } from "../manager";
import { getCurrentBazelWorkspacePath, getWorkspacePath } from "../utils";
import { type BazelPackage, parseBazelBuildFile } from "../utils";
import { BazelTreeItem, type IBazelTreeProvider } from "./items/bazel-tree-item";
import { type IWorkspaceTreeProvider, WorkspaceGroupTreeItem } from "./items/bazel-workspace-item";
import { WorkspaceSectionTreeItem } from "./items/bazel-section-item";
import type { BazelWorkspaceCacheData, BazelWorkspaceEventData } from "./types";

export class WorkspaceTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, IWorkspaceTreeProvider, IBazelTreeProvider
{
  private _onDidChangeTreeData = new vscode.EventEmitter<BazelWorkspaceEventData>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  public context: ExtensionContext | undefined;
  public buildManager: BuildManager;

  public defaultWorkspacePath: string | undefined;
  private workspaces: WorkspaceGroupTreeItem[] = [];
  private recentWorkspaces: WorkspaceGroupTreeItem[] = [];
  private isLoadingWorkspaces = false;
  private recentWorkspacesStorage: string[] = [];
  private searchTerm = "";
  private isSearchActive = false;

  // Cached filtered data
  private cachedFilteredWorkspaces: WorkspaceGroupTreeItem[] | null = null;
  private cachedFilteredRecentWorkspaces: WorkspaceGroupTreeItem[] | null = null;
  private lastComputedSearchTerm = "";

  // Cache parsed BUILD.bazel files
  private cachedBazelFiles = new Map<string, BazelPackage | null>();
  private bazelFileCacheTimestamps = new Map<string, number>();

  // Cache of currently displayed Bazel targets
  public currentBazelTargets = new Map<string, BazelTreeItem>();

  // Persistent cache
  private persistentCacheKey = "swiftbazel.bazel.workspaces.cache";
  private persistentCacheVersion = "2.0.0";

  // Limits
  private readonly MAX_WORKSPACES = 1000;
  private readonly MAX_RECENT_WORKSPACES = 3;

  // Loading state
  private sectionsLoading = new Set<string>(["bazel"]);
  private workspacesSorted = true;

  // Throttled operations
  private refreshThrottleTimer: NodeJS.Timeout | null = null;
  private cacheSaveTimer: NodeJS.Timeout | null = null;

  constructor(options: { context: ExtensionContext; buildManager: BuildManager }) {
    this.context = options.context;
    this.buildManager = options.buildManager;
    this.defaultWorkspacePath = getCurrentBazelWorkspacePath(this.context);

    this.buildManager.on("updated", () => this.refresh());
    this.buildManager.on("currentWorkspacePathUpdated", (workspacePath) => {
      this.defaultWorkspacePath = workspacePath;
      if (workspacePath) {
        this.addToRecentWorkspaces(workspacePath);
      }
      this.refresh();
    });

    this.updateSearchContext();
    this.initializeWorkspaces();
  }

  refreshTreeItem(item: WorkspaceGroupTreeItem | null): void {
    this._onDidChangeTreeData.fire(item);
  }

  private invalidateFilterCache(): void {
    this.cachedFilteredWorkspaces = null;
    this.cachedFilteredRecentWorkspaces = null;
    this.lastComputedSearchTerm = "";
  }

  private invalidateDataCache(): void {
    this.invalidateFilterCache();
    this.cachedBazelFiles.clear();
    this.bazelFileCacheTimestamps.clear();
    this.currentBazelTargets.clear();
  }

  public setSearchTerm(searchTerm: string): void {
    const previousSearchTerm = this.searchTerm;
    this.searchTerm = searchTerm.toLowerCase();
    this.isSearchActive = searchTerm.length > 0;

    this.updateSearchContext();

    if (previousSearchTerm !== this.searchTerm) {
      if (!this.searchTerm) {
        this.computeFilteredCache();
        this._onDidChangeTreeData.fire(null);
        return;
      }

      this._onDidChangeTreeData.fire(null);
      setTimeout(() => {
        this.computeFilteredCache();
        this._onDidChangeTreeData.fire(null);
      }, 50);
    }
  }

  public clearSearch(): void {
    if (this.searchTerm !== "" || this.isSearchActive) {
      this.searchTerm = "";
      this.isSearchActive = false;
      this.computeFilteredCache();
      this.updateSearchContext();
      this._onDidChangeTreeData.fire(null);
    }
  }

  private updateSearchContext(): void {
    void vscode.commands.executeCommand("setContext", "swiftbazel.builds.searchActive", this.isSearchActive);
  }

  private computeFilteredCache(): void {
    if (!this.isSearchActive || !this.searchTerm) {
      this.cachedFilteredWorkspaces = null;
      this.cachedFilteredRecentWorkspaces = null;
      this.lastComputedSearchTerm = "";
      return;
    }

    if (this.searchTerm === this.lastComputedSearchTerm) {
      return;
    }

    this.cachedFilteredWorkspaces = this.filterWorkspaces(this.workspaces);
    this.cachedFilteredRecentWorkspaces = this.filterWorkspaces(this.recentWorkspaces);
    this.lastComputedSearchTerm = this.searchTerm;
  }

  public getSearchTerm(): string {
    return this.searchTerm;
  }

  // Bazel target management
  public getSelectedBazelTargetData(): SelectedBazelTargetData | undefined {
    return this.buildManager.getSelectedBazelTargetData();
  }

  public setSelectedBazelTarget(target: BazelTreeItem | null): void {
    this.buildManager.setSelectedBazelTarget(target ?? undefined);
    this._onDidChangeTreeData.fire(null);

    const targetData = this.getSelectedBazelTargetData();
    void vscode.commands.executeCommand("setContext", "swiftbazel.bazel.hasSelectedTarget", !!targetData);
    void vscode.commands.executeCommand(
      "setContext",
      "swiftbazel.bazel.selectedTargetType",
      targetData?.targetType || null,
    );
  }

  public getBazelTargetByLabel(buildLabel: string): BazelTreeItem | null {
    return this.currentBazelTargets.get(buildLabel) || null;
  }

  private filterWorkspaces(workspaces: WorkspaceGroupTreeItem[]): WorkspaceGroupTreeItem[] {
    if (!this.isSearchActive || !this.searchTerm) {
      return workspaces;
    }

    const searchTerm = this.searchTerm;
    const filtered: WorkspaceGroupTreeItem[] = [];

    for (const workspace of workspaces) {
      const label = workspace.label;
      if (label && typeof label === "string" && label.toLowerCase().includes(searchTerm)) {
        filtered.push(workspace);
        continue;
      }

      if (workspace.workspacePath.toLowerCase().includes(searchTerm)) {
        filtered.push(workspace);
        continue;
      }

      // Check if Bazel targets match
      const bazelPackage = this.cachedBazelFiles.get(workspace.workspacePath);
      if (
        bazelPackage?.targets.some(
          (t) => t.name.toLowerCase().includes(searchTerm) || t.buildLabel.toLowerCase().includes(searchTerm),
        )
      ) {
        filtered.push(workspace);
      }
    }

    return filtered;
  }

  private refresh(): void {
    this.invalidateDataCache();
    this._onDidChangeTreeData.fire(null);
  }

  private addToRecentWorkspaces(workspacePath: string): void {
    this.recentWorkspacesStorage = this.recentWorkspacesStorage.filter((p) => p !== workspacePath);
    this.recentWorkspacesStorage.unshift(workspacePath);
    this.recentWorkspacesStorage = this.recentWorkspacesStorage.slice(0, this.MAX_RECENT_WORKSPACES);

    this.recentWorkspaces = this.recentWorkspacesStorage.map(
      (p) =>
        new WorkspaceGroupTreeItem({
          workspacePath: p,
          provider: this,
          isRecent: true,
        }),
    );

    this.invalidateFilterCache();
    this.throttledCacheSave();
  }

  private throttledRefresh(): void {
    if (this.refreshThrottleTimer) return;
    this.refreshThrottleTimer = setTimeout(() => {
      this._onDidChangeTreeData.fire(undefined);
      this.refreshThrottleTimer = null;
    }, 100);
  }

  private throttledCacheSave(): void {
    if (this.cacheSaveTimer) return;
    this.cacheSaveTimer = setTimeout(() => {
      void this.saveToPersistentCache();
      this.cacheSaveTimer = null;
    }, 2000);
  }

  private shouldSkipWorkspace(workspacePath: string): boolean {
    const workspaceRoot = getWorkspacePath();
    const relativePath = path.relative(workspaceRoot, workspacePath);

    if (relativePath.split(path.sep).length > 6) return true;

    const skipPatterns = [
      /\/node_modules\//,
      /\/\.git\//,
      /\/\.build\//,
      /\/DerivedData\//,
      /\/Pods\//,
      /\/vendor\//,
      /\/third_party\//,
      /\/external\//,
      /\/deps\//,
      /\/\.bazel\//,
      /\/bazel-out\//,
      /\/bazel-bin\//,
      /\/bazel-testlogs\//,
      /\/build\//i,
      /\/temp\//i,
      /\/tmp\//i,
    ];

    if (skipPatterns.some((p) => p.test(workspacePath))) return true;

    // For Bazel files, skip generic parent directories
    if (workspacePath.endsWith("BUILD") || workspacePath.endsWith("BUILD.bazel")) {
      const parentDir = path.basename(path.dirname(workspacePath));
      if (parentDir.length < 3 || /^[0-9]+$/.test(parentDir)) return true;
    }

    return false;
  }

  private prioritizeWorkspaces(workspacePaths: string[]): string[] {
    const workspaceRoot = getWorkspacePath();
    return workspacePaths
      .map((wp) => ({
        path: wp,
        score: this.getWorkspaceScore(wp, workspaceRoot),
      }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.path);
  }

  private getWorkspaceScore(workspacePath: string, workspaceRoot: string): number {
    let score = 0;
    const relativePath = path.relative(workspaceRoot, workspacePath);
    const depth = relativePath.split(path.sep).length;

    score += Math.max(0, 10 - depth);
    if (depth === 1) score += 20;
    if (workspacePath === this.defaultWorkspacePath) score += 50;
    if (relativePath.match(/^(Sources?|Apps?|Projects?)\//i)) score += 15;
    if (relativePath.match(/test|spec|example|demo|sample/i)) score -= 5;

    return score;
  }

  private addWorkspace(workspacePath: string): void {
    if (this.workspaces.length >= this.MAX_WORKSPACES) return;
    if (this.workspaces.some((w) => w.workspacePath === workspacePath)) return;
    if (this.shouldSkipWorkspace(workspacePath)) return;

    const workspaceItem = new WorkspaceGroupTreeItem({
      workspacePath,
      provider: this,
    });

    this.workspaces.push(workspaceItem);
    this.workspacesSorted = false;
    this.invalidateFilterCache();
    this.throttledRefresh();

    if (workspacePath === this.defaultWorkspacePath) {
      this.addToRecentWorkspaces(workspacePath);
    }
  }

  private sortWorkspaces(): void {
    this.workspaces.sort((a, b) => {
      const nameA = path.basename(path.dirname(a.workspacePath)).toLowerCase();
      const nameB = path.basename(path.dirname(b.workspacePath)).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  private getSectionedWorkspaces(): WorkspaceSectionTreeItem[] {
    if (!this.workspacesSorted && this.workspaces.length > 1) {
      this.sortWorkspaces();
      this.workspacesSorted = true;
    }

    const sections: WorkspaceSectionTreeItem[] = [];
    const filteredRecent = this.isSearchActive ? this.cachedFilteredRecentWorkspaces || [] : this.recentWorkspaces;
    const filteredWorkspaces = this.isSearchActive ? this.cachedFilteredWorkspaces || [] : this.workspaces;

    if (filteredRecent.length > 0) {
      sections.push(new WorkspaceSectionTreeItem("recent", filteredRecent, this.searchTerm));
    }

    const isLoading = this.sectionsLoading.has("bazel");
    if (filteredWorkspaces.length > 0 || isLoading) {
      sections.push(
        new WorkspaceSectionTreeItem("bazel", filteredWorkspaces, this.searchTerm, this.workspaces.length, isLoading),
      );
    }

    return sections;
  }

  private async initializeWorkspaces(): Promise<void> {
    try {
      const cacheLoaded = await this.loadFromPersistentCache();
      if (cacheLoaded) {
        this._onDidChangeTreeData.fire(undefined);
      }
      void this.loadWorkspacesStreamingly();
    } catch (error) {
      console.error("Failed to initialize workspaces:", error);
      void this.loadWorkspacesStreamingly();
    }
  }

  private async loadFromPersistentCache(): Promise<boolean> {
    try {
      const globalState = (this.context as any)?._context?.globalState;
      const cachedData = globalState?.get(this.persistentCacheKey) as BazelWorkspaceCacheData | undefined;

      if (!cachedData || cachedData.version !== this.persistentCacheVersion) return false;
      if (cachedData.workspaceRoot !== getWorkspacePath()) return false;
      if (Date.now() - cachedData.timestamp > 7 * 24 * 60 * 60 * 1000) return false;

      let workspacePathsToLoad = cachedData.workspacePaths.filter((p: string) => p && !this.shouldSkipWorkspace(p));
      if (workspacePathsToLoad.length > this.MAX_WORKSPACES) {
        workspacePathsToLoad = this.prioritizeWorkspaces(workspacePathsToLoad).slice(0, this.MAX_WORKSPACES);
      }

      this.workspaces = workspacePathsToLoad.map(
        (wp: string) => new WorkspaceGroupTreeItem({ workspacePath: wp, provider: this, isRecent: false }),
      );

      this.recentWorkspacesStorage = cachedData.recentWorkspacePaths
        .filter((p: string) => p)
        .slice(0, this.MAX_RECENT_WORKSPACES);
      this.recentWorkspaces = this.recentWorkspacesStorage.map(
        (p: string) => new WorkspaceGroupTreeItem({ workspacePath: p, provider: this, isRecent: true }),
      );

      this.sortWorkspaces();
      this.workspacesSorted = true;
      this.invalidateDataCache();
      this._onDidChangeTreeData.fire(undefined);

      return true;
    } catch (error) {
      console.error("Failed to load persistent cache:", error);
      return false;
    }
  }

  private async saveToPersistentCache(): Promise<void> {
    try {
      if (!this.context) return;

      let workspacePathsToSave = this.workspaces.map((w) => w.workspacePath);
      if (workspacePathsToSave.length > this.MAX_WORKSPACES) {
        workspacePathsToSave = this.prioritizeWorkspaces(workspacePathsToSave).slice(0, this.MAX_WORKSPACES);
      }

      const cacheData: BazelWorkspaceCacheData = {
        version: this.persistentCacheVersion,
        timestamp: Date.now(),
        workspacePaths: workspacePathsToSave,
        recentWorkspacePaths: this.recentWorkspacesStorage.slice(0, this.MAX_RECENT_WORKSPACES),
        workspaceRoot: getWorkspacePath(),
      };

      await (this.context as any)._context.globalState.update(this.persistentCacheKey, cacheData);
    } catch (error) {
      console.error("Failed to save persistent cache:", error);
    }
  }

  public async clearPersistentCache(): Promise<void> {
    try {
      if (this.context) {
        await (this.context as any)._context.globalState.update(this.persistentCacheKey, undefined);
      }
    } catch (error) {
      console.error("Failed to clear persistent cache:", error);
    }
  }

  public async getCachedBazelPackage(buildFilePath: string): Promise<BazelPackage | null> {
    const now = Date.now();
    const cacheMaxAge = 30000; // 30 seconds

    if (!buildFilePath) return null;

    const cachedTimestamp = this.bazelFileCacheTimestamps.get(buildFilePath);
    const cachedPackage = this.cachedBazelFiles.get(buildFilePath);

    if (cachedPackage !== undefined && cachedTimestamp && now - cachedTimestamp < cacheMaxAge) {
      return cachedPackage;
    }

    try {
      const bazelPackage = await parseBazelBuildFile(buildFilePath);
      this.cachedBazelFiles.set(buildFilePath, bazelPackage);
      this.bazelFileCacheTimestamps.set(buildFilePath, now);
      return bazelPackage;
    } catch (error) {
      console.error(`Failed to parse BUILD.bazel file: ${buildFilePath}`, error);
      this.cachedBazelFiles.set(buildFilePath, null);
      this.bazelFileCacheTimestamps.set(buildFilePath, now);
      return null;
    }
  }

  public async loadWorkspacesStreamingly(): Promise<void> {
    if (this.isLoadingWorkspaces) return;
    this.isLoadingWorkspaces = true;

    try {
      const cacheLoaded = await this.loadFromPersistentCache();
      if (!cacheLoaded) {
        this.workspaces = [];
        const cachedWorkspacePath = this.context && getCurrentBazelWorkspacePath(this.context);
        if (cachedWorkspacePath) {
          this.addWorkspace(cachedWorkspacePath);
        }
      }

      this.sectionsLoading = new Set<string>(["bazel"]);
      const discoveredWorkspaces = new Set<string>(this.workspaces.map((w) => w.workspacePath));

      await this.searchBazelWorkspaces(discoveredWorkspaces);

      this.isLoadingWorkspaces = false;
      this._onDidChangeTreeData.fire(undefined);
      await this.saveToPersistentCache();
    } catch (error) {
      commonLogger.error("Failed to load workspaces", { error });
      this.isLoadingWorkspaces = false;
    }
  }

  private async searchBazelWorkspaces(discoveredWorkspaces: Set<string>): Promise<void> {
    const workspace = getWorkspacePath();
    this._onDidChangeTreeData.fire(undefined);

    await this.findFilesIncrementally({
      directory: workspace,
      depth: 4,
      maxResults: 50,
      matcher: (file) => file.name === "BUILD.bazel" || file.name === "BUILD",
      processFile: (filePath) => {
        if (!discoveredWorkspaces.has(filePath) && !this.shouldSkipWorkspace(filePath)) {
          discoveredWorkspaces.add(filePath);
          this.addWorkspace(filePath);
        }
      },
    });

    this.sectionsLoading.delete("bazel");
    this._onDidChangeTreeData.fire(undefined);
  }

  private async findFilesIncrementally(options: {
    directory: string;
    matcher: (file: Dirent) => boolean;
    processFile: (filePath: string) => void;
    depth?: number;
    maxResults?: number;
  }): Promise<void> {
    const depth = options.depth ?? 0;
    let processedCount = 0;

    try {
      const files = await fs.readdir(options.directory, { withFileTypes: true });

      for (const file of files) {
        if (options.maxResults && processedCount >= options.maxResults) break;

        const fullPath = path.join(options.directory, file.name);

        if (options.matcher(file)) {
          options.processFile(fullPath);
          processedCount++;
        }

        if (file.isDirectory() && depth > 0 && !this.shouldSkipDirectory(file.name)) {
          const remainingResults = options.maxResults ? Math.max(0, options.maxResults - processedCount) : undefined;
          if (!options.maxResults || processedCount < options.maxResults) {
            void this.findFilesIncrementally({
              directory: fullPath,
              matcher: options.matcher,
              processFile: options.processFile,
              depth: depth - 1,
              maxResults: remainingResults,
            });
          }
        }
      }
    } catch (error) {
      // Silently skip unreadable directories
    }
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      "node_modules",
      ".git",
      ".build",
      "DerivedData",
      "Pods",
      "vendor",
      "third_party",
      "external",
      "deps",
      ".bazel",
      "bazel-out",
      "bazel-bin",
      "bazel-testlogs",
      "build",
      "temp",
      "tmp",
    ];
    return skipDirs.includes(dirName) || dirName.startsWith(".");
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      if (this.workspaces.length === 0 && !this.isLoadingWorkspaces) {
        this.initializeWorkspaces();
      }

      const sections = this.getSectionedWorkspaces();
      const results: vscode.TreeItem[] = [];

      if (this.isSearchActive && this.searchTerm.length > 0) {
        const searchStatusItem = new vscode.TreeItem(
          `🔍 Filtering: "${this.searchTerm}"`,
          vscode.TreeItemCollapsibleState.None,
        );
        searchStatusItem.iconPath = new vscode.ThemeIcon("search-stop");
        searchStatusItem.command = { command: "swiftbazel.build.clearSearch", title: "Clear Search" };
        results.push(searchStatusItem);
      }

      results.push(...sections);

      if (this.isLoadingWorkspaces) {
        const loadingItem = new vscode.TreeItem(
          "Searching for Bazel workspaces...",
          vscode.TreeItemCollapsibleState.None,
        );
        loadingItem.iconPath = new vscode.ThemeIcon("loading~spin");
        results.push(loadingItem);
      }

      return results;
    }

    if (element instanceof WorkspaceSectionTreeItem) {
      return element.workspaces;
    }

    if (element instanceof WorkspaceGroupTreeItem) {
      // Only handle Bazel workspaces
      if (element.workspacePath.endsWith("BUILD.bazel") || element.workspacePath.endsWith("BUILD")) {
        const bazelPackage = await this.getCachedBazelPackage(element.workspacePath);

        if (bazelPackage) {
          const targetItems = bazelPackage.targets.map((target) => {
            const bazelTreeItem = new BazelTreeItem({
              target,
              package: bazelPackage,
              provider: this,
              workspacePath: element.workspacePath,
            });
            this.currentBazelTargets.set(target.buildLabel, bazelTreeItem);
            return bazelTreeItem;
          });

          if (this.isSearchActive && this.searchTerm.length > 0) {
            return targetItems.filter((item) => item.target.name.toLowerCase().includes(this.searchTerm));
          }

          return targetItems;
        }
      }
      return [];
    }

    return [];
  }

  async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
    return element;
  }

  setItemLoading(item: WorkspaceGroupTreeItem, isLoading: boolean): void {
    if (!item.isRecent) return;
    item.isLoading = isLoading;
    this.refreshTreeItem(item);
  }
}
