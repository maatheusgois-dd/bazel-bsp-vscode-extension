import type { BazelTreeNode } from "../../../domain/entities/bazel/types.js";
import { BazelParser } from "../../../infrastructure/bazel/bazel-parser.js";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../../../shared/logger/logger.js";

export interface RecentTarget {
  name: string;
  type: "runnable" | "test" | "buildable";
  buildLabel: string;
  pathParts: string[];
}

/**
 * Manages recent Bazel targets with persistence
 */
export class RecentTargetsManager {
  private recentTargets: RecentTarget[] = [];
  private readonly MAX_RECENT_TARGETS = 3;
  private readonly CACHE_KEY = "bazelQuery.recentTargets";

  constructor(private context?: ExtensionContext) {}

  /**
   * Load recent targets from cache
   * Validates targets still exist in the query result
   */
  loadFromCache(queryResult: BazelTreeNode): void {
    commonLogger.log("loadRecentTargetsFromCache called");

    try {
      commonLogger.log("Checking context", {
        hasContext: !!this.context,
      });

      if (!this.context) {
        commonLogger.log("No context available for loading recent targets");
        return;
      }

      const cached = this.context.getWorkspaceState(this.CACHE_KEY);
      commonLogger.log("Retrieved cached data", {
        hasCached: !!cached,
        isArray: Array.isArray(cached),
        cached: cached,
      });

      if (!cached || !Array.isArray(cached)) {
        commonLogger.log("No cached recent targets found or invalid format");
        return;
      }

      // Validate that cached targets still exist in the query result
      const validRecents: RecentTarget[] = [];
      for (const recent of cached as RecentTarget[]) {
        if (!recent.buildLabel || !recent.pathParts || !recent.name || !recent.type) {
          commonLogger.debug("Skipping invalid recent target", { recent });
          continue;
        }

        const targets = BazelParser.getTargetsAtPath(queryResult, recent.pathParts);
        if (!targets) {
          commonLogger.debug("Target path no longer exists", { pathParts: recent.pathParts });
          continue;
        }

        // Check if target still exists in the appropriate category
        const targetExists =
          (recent.type === "runnable" && targets.runnable.includes(recent.name)) ||
          (recent.type === "test" && targets.test.includes(recent.name)) ||
          (recent.type === "buildable" && targets.buildable.includes(recent.name));

        if (targetExists) {
          validRecents.push({
            name: recent.name,
            type: recent.type,
            buildLabel: recent.buildLabel,
            pathParts: recent.pathParts,
          });
          commonLogger.debug("Valid recent target", { name: recent.name, targetType: recent.type });
        } else {
          commonLogger.debug("Target no longer exists in tree", { name: recent.name });
        }
      }

      this.recentTargets = validRecents.slice(0, this.MAX_RECENT_TARGETS);
      commonLogger.log("✅ Loaded recent targets from cache", {
        cached: cached.length,
        valid: this.recentTargets.length,
        targets: this.recentTargets.map((t) => t.name),
      });
    } catch (error) {
      commonLogger.error("Failed to load recent targets from cache", { error });
    }
  }

  /**
   * Save recent targets to cache
   */
  private saveToCache(): void {
    try {
      if (!this.context) {
        commonLogger.debug("No context available for saving recent targets");
        return;
      }

      this.context.updateWorkspaceState(this.CACHE_KEY, this.recentTargets);
      commonLogger.log("💾 Saved recent targets to cache", { count: this.recentTargets.length });
    } catch (error) {
      commonLogger.error("Failed to save recent targets to cache", { error });
    }
  }

  /**
   * Add a target to recents
   */
  addTarget(buildLabel: string, queryResult: BazelTreeNode): void {
    // Parse the build label: //Apps/Consumer/ConsumerApp:Caviar
    const match = buildLabel.match(/^\/\/(.+):(.+)$/);
    if (!match) {
      return;
    }

    const [, pathStr, targetName] = match;
    const pathParts = pathStr.split("/");

    // Determine target type from the query result
    const targets = BazelParser.getTargetsAtPath(queryResult, pathParts);
    if (!targets) {
      return;
    }

    let targetType: "runnable" | "test" | "buildable" | undefined;
    if (targets.runnable.includes(targetName)) {
      targetType = "runnable";
    } else if (targets.test.includes(targetName)) {
      targetType = "test";
    } else if (targets.buildable.includes(targetName)) {
      targetType = "buildable";
    }

    if (!targetType) {
      return;
    }

    // Remove if already in list
    this.recentTargets = this.recentTargets.filter((t) => t.buildLabel !== buildLabel);

    // Add to front
    this.recentTargets.unshift({
      name: targetName,
      type: targetType,
      buildLabel: buildLabel,
      pathParts: pathParts,
    });

    // Keep only last 3
    this.recentTargets = this.recentTargets.slice(0, this.MAX_RECENT_TARGETS);

    // Save to cache
    this.saveToCache();
  }

  /**
   * Get all recent targets
   */
  getAll(): RecentTarget[] {
    return this.recentTargets;
  }

  /**
   * Clear all recent targets
   */
  clear(): void {
    this.recentTargets = [];
    this.saveToCache();
  }

  /**
   * Get count of recent targets
   */
  getCount(): number {
    return this.recentTargets.length;
  }
}
