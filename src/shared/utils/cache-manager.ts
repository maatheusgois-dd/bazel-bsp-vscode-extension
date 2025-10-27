import type { BazelPackageInfo, BazelScheme, BazelTarget, BazelXcodeConfiguration } from "../../domain/entities/bazel/types.js";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../logger/logger.js";

/**
 * Cache Manager for swiftbazel
 * Caches Bazel workspace data for fast loading
 */

export interface BazelWorkspaceData {
  workspacePath: string;
  packages: BazelPackageInfo[];
  allTargets: BazelTarget[];
  allTestTargets: BazelTarget[];
  allSchemes: BazelScheme[];
  allConfigurations: BazelXcodeConfiguration[];
  lastScanned?: number;
}

export interface CacheData {
  // Bazel workspaces
  bazelWorkspaces: Record<string, BazelWorkspaceData>;

  // Discovery cache
  discoveredBazelPaths: string[];

  // Cache metadata
  version: string;
  createdAt: number;
  lastCleared?: number;
}

class CacheManager {
  private data: CacheData;
  private context?: ExtensionContext;
  private readonly CACHE_VERSION = "2.0.0"; // Bumped to invalidate old Xcode caches

  constructor() {
    this.data = this.initializeEmptyCache();
  }

  private initializeEmptyCache(): CacheData {
    return {
      bazelWorkspaces: {},
      discoveredBazelPaths: [],
      version: this.CACHE_VERSION,
      createdAt: Date.now(),
    };
  }

  async setContext(context: ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    if (!this.context) return;

    try {
      commonLogger.log("🔄 Loading cache from storage...");
      const storedData = this.context.getWorkspaceState("cacheData" as any) as any;

      if (storedData && typeof storedData === "object") {
        // Validate stored data structure and version
        if ((storedData as any).version === this.CACHE_VERSION) {
          this.data = storedData as CacheData;
          const bazelCount = Object.keys(this.data.bazelWorkspaces).length;
          const discoveredPaths = this.data.discoveredBazelPaths.length;

          commonLogger.log(
            `✅ Cache loaded successfully: ${bazelCount} bazel workspaces, ${discoveredPaths} discovered paths`,
          );

          if (bazelCount > 0) {
            const workspacePaths = Object.keys(this.data.bazelWorkspaces);
            commonLogger.log(
              `📂 Cached Bazel workspaces: ${workspacePaths.slice(0, 3).join(", ")}${bazelCount > 3 ? ` +${bazelCount - 3} more` : ""}`,
            );
          }
        } else {
          const storedVersion = (storedData as any).version || "unknown";
          commonLogger.log(
            `⚠️ Cache version mismatch (stored: ${storedVersion}, current: ${this.CACHE_VERSION}), initializing fresh cache`,
          );
          this.data = this.initializeEmptyCache();
        }
      } else {
        commonLogger.log("📭 No existing cache found, initializing fresh cache");
        this.data = this.initializeEmptyCache();
      }
    } catch (error) {
      commonLogger.error("Failed to load cache from storage", { error });
      this.data = this.initializeEmptyCache();
    }
  }

  private async saveToStorage(): Promise<void> {
    if (!this.context) return;

    try {
      await this.context.updateWorkspaceState("cacheData" as any, this.data);
      commonLogger.log("💾 Cache saved to storage");
    } catch (error) {
      commonLogger.error("Failed to save cache to storage", { error });
    }
  }

  /**
   * Cache a Bazel workspace with its packages and targets
   */
  async cacheBazelWorkspace(data: BazelWorkspaceData): Promise<void> {
    this.data.bazelWorkspaces[data.workspacePath] = {
      ...data,
      lastScanned: Date.now(),
    };
    await this.saveToStorage();
  }

  /**
   * Get cached Bazel workspace data
   */
  getBazelWorkspace(workspacePath: string): BazelWorkspaceData | undefined {
    return this.data.bazelWorkspaces[workspacePath];
  }

  /**
   * Cache discovered Bazel BUILD file paths
   */
  async cacheDiscoveredBazelPaths(paths: string[]): Promise<void> {
    this.data.discoveredBazelPaths = paths;
    await this.saveToStorage();
  }

  /**
   * Get cached discovered Bazel paths
   */
  getDiscoveredBazelPaths(): string[] {
    return this.data.discoveredBazelPaths;
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    commonLogger.log("🗑️ Clearing all cache data...");
    this.data = this.initializeEmptyCache();
    this.data.lastCleared = Date.now();
    await this.saveToStorage();
    commonLogger.log("✅ Cache cleared successfully");
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      bazelWorkspaceCount: Object.keys(this.data.bazelWorkspaces).length,
      discoveredPathsCount: this.data.discoveredBazelPaths.length,
      version: this.data.version,
      createdAt: this.data.createdAt,
      lastCleared: this.data.lastCleared,
    };
  }

  /**
   * Get all cached Bazel workspaces
   */
  getAllBazelWorkspaces(): BazelWorkspaceData[] {
    return Object.values(this.data.bazelWorkspaces);
  }

  /**
   * Cache Bazel workspace with packages (helper method)
   */
  async cacheBazelWorkspacePackages(workspacePath: string, packages: BazelPackageInfo[]): Promise<void> {
    const allTargets: BazelTarget[] = [];
    const allTestTargets: BazelTarget[] = [];
    const allSchemes: BazelScheme[] = [];
    const allConfigurations: BazelXcodeConfiguration[] = [];

    for (const pkg of packages) {
      allTargets.push(...pkg.parseResult.targets);
      allTestTargets.push(...pkg.parseResult.targetsTest);
      allSchemes.push(...pkg.parseResult.xcschemes);
      allConfigurations.push(...pkg.parseResult.xcode_configurations);
    }

    await this.cacheBazelWorkspace({
      workspacePath,
      packages,
      allTargets,
      allTestTargets,
      allSchemes,
      allConfigurations,
    });
  }

  /**
   * Get cached Bazel packages for a workspace
   */
  getBazelPackages(workspacePath: string): BazelPackageInfo[] {
    const workspace = this.data.bazelWorkspaces[workspacePath];
    return workspace?.packages || [];
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();

// Keep backward compatibility with old name
export const superCache = cacheManager;
