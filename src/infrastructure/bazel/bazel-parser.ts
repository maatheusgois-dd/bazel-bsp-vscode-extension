import type {
  BazelQueryResult,
  BazelQueryTarget,
  BazelTargetCategory,
  BazelTreeNode,
} from "../../domain/entities/bazel/types.js";
import { commonLogger } from "../../shared/logger/logger.js";
import { exec } from "../../shared/utils/exec.js";
import { getWorkspaceConfig } from "../../shared/utils/config.js";

/**
 * Bazel Target Parser
 *
 * Uses `bazel query` to identify:
 * - Runnable targets (applications, extensions, app clips)
 * - Test targets (unit tests, swift tests)
 * - Buildable targets (libraries)
 */

interface TargetTypeConfig {
  readonly RUNNABLE: readonly string[];
  readonly TEST: readonly string[];
  readonly BUILDABLE: readonly string[];
  readonly IGNORE: readonly string[];
}

const TARGET_TYPES: TargetTypeConfig = {
  RUNNABLE: ["ios_application", "ios_extension", "ios_app_clip", "macos_application"] as const,
  TEST: [
    "ios_unit_test",
    "swift_test",
    // Note: '_ios_internal_unit_test_bundle' excluded as it's a duplicate of ios_unit_test
  ] as const,
  BUILDABLE: [
    "swift_library",
    "objc_library",
    "swift_library_group",
    // Note: 'ios_framework' excluded - they're build products of swift_library
  ] as const,
  IGNORE: [
    "_ios_internal_unit_test_bundle", // Internal implementation detail, duplicate of ios_unit_test
    "ios_framework", // Build products of swift_library, causes duplicates
    "xcodeproj", // Xcode project generation, not actual runnable targets
    "xcodeproj_runner", // Xcode project runner helper
  ] as const,
} as const;

// biome-ignore lint/complexity/noStaticOnlyClass: Parser class provides organized namespace for related parsing functions
export class BazelParser {
  /**
   * Run bazel query and parse all targets
   */
  static async queryAllTargets(cwd?: string): Promise<BazelQueryResult> {
    // Build query expression with exclusions if configured
    const excludePaths = getWorkspaceConfig("bazel.queryExcludePaths") || [];

    let queryExpression = "//...";
    if (excludePaths.length > 0) {
      const exclusionsExpr = excludePaths.join(" + ");
      queryExpression = `//... except (${exclusionsExpr})`;
      commonLogger.log(`Running bazel query with exclusions: ${queryExpression}`);
    } else {
      commonLogger.log("Running bazel query //... to discover targets");
    }

    try {
      const output = await exec({
        command: "bazel",
        args: ["query", queryExpression, "--output=label_kind"],
        cwd,
        cancellable: true,
        progressTitle: "Discovering Bazel targets",
      });

      const lines = output
        .trim()
        .split("\n")
        .filter((line) => line.trim());
      commonLogger.log(`Parsed ${lines.length} targets from bazel query`);

      const targets = BazelParser.parseTargets(lines);
      const tree = BazelParser.buildTree(targets);

      return {
        generated: new Date().toISOString(),
        statistics: {
          runnable: targets.runnable.length,
          test: targets.test.length,
          buildable: targets.buildable.length,
          total: targets.runnable.length + targets.test.length + targets.buildable.length,
        },
        tree,
      };
    } catch (error) {
      commonLogger.error("Error running bazel query", { error });
      throw new Error(`Failed to run bazel query: ${error}`);
    }
  }

  /**
   * Parse bazel query output lines into categorized targets
   */
  private static parseTargets(lines: string[]): {
    runnable: BazelQueryTarget[];
    test: BazelQueryTarget[];
    buildable: BazelQueryTarget[];
  } {
    const targets = {
      runnable: [] as BazelQueryTarget[],
      test: [] as BazelQueryTarget[],
      buildable: [] as BazelQueryTarget[],
    };

    for (const line of lines) {
      if (!line.trim()) continue;

      // Format: "rule_type rule target_name"
      const match = line.match(/^(\S+)\s+rule\s+(\S+)$/);
      if (!match) continue;

      const [, ruleType, targetName] = match;

      // Skip ignored target types
      if (TARGET_TYPES.IGNORE.includes(ruleType)) {
        continue;
      }

      if (TARGET_TYPES.RUNNABLE.includes(ruleType)) {
        targets.runnable.push({ type: ruleType, target: targetName });
      } else if (TARGET_TYPES.TEST.includes(ruleType)) {
        targets.test.push({ type: ruleType, target: targetName });
      } else if (TARGET_TYPES.BUILDABLE.includes(ruleType)) {
        targets.buildable.push({ type: ruleType, target: targetName });
      }
      // Ignore everything else - no "other" category
    }

    return targets;
  }

  /**
   * Build a tree structure from categorized targets
   * Only stores target names (leafs) at the final path location
   */
  private static buildTree(targets: {
    runnable: BazelQueryTarget[];
    test: BazelQueryTarget[];
    buildable: BazelQueryTarget[];
  }): BazelTreeNode {
    const tree: BazelTreeNode = {};

    // Helper function to set value in nested object
    const setNestedValue = (
      obj: BazelTreeNode,
      pathParts: string[],
      leaf: string,
      category: keyof BazelTargetCategory,
    ) => {
      let current: any = obj;

      // Navigate/create the path
      for (const part of pathParts) {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }

      // Initialize categories if not exists
      if (!current.runnable) current.runnable = [];
      if (!current.test) current.test = [];
      if (!current.buildable) current.buildable = [];

      // Add leaf to appropriate category
      if (!current[category].includes(leaf)) {
        current[category].push(leaf);
      }
    };

    // Process each category
    const processTargets = (targetList: BazelQueryTarget[], category: keyof BazelTargetCategory) => {
      for (const item of targetList) {
        // Parse target: //Apps/Consumer/ConsumerApp:DoorDash
        const match = item.target.match(/^\/\/(.+):(.+)$/);
        if (!match) {
          commonLogger.warn("Failed to parse target", { target: item.target });
          continue;
        }

        const [, path, leaf] = match;
        const pathParts = path.split("/");

        setNestedValue(tree, pathParts, leaf, category);
      }
    };

    processTargets(targets.runnable, "runnable");
    processTargets(targets.test, "test");
    processTargets(targets.buildable, "buildable");

    commonLogger.log("Built tree structure", {
      sampleKeys: Object.keys(tree).slice(0, 10),
      totalTopLevelKeys: Object.keys(tree).length,
    });

    return tree;
  }

  /**
   * Get targets at a specific path in the tree
   * This is used for lazy loading - only fetch when user expands
   */
  static getTargetsAtPath(tree: BazelTreeNode, pathParts: string[]): BazelTargetCategory | null {
    let current: any = tree;

    for (const part of pathParts) {
      if (!current[part]) {
        return null;
      }
      current = current[part];
    }

    // Check if this is a leaf node with targets
    if (current.runnable || current.test || current.buildable) {
      return {
        runnable: current.runnable || [],
        test: current.test || [],
        buildable: current.buildable || [],
      };
    }

    return null;
  }

  /**
   * Get child directories at a specific path
   * Used to show folder structure before reaching target leafs
   */
  static getChildrenAtPath(tree: BazelTreeNode, pathParts: string[]): string[] {
    let current: any = tree;

    for (const part of pathParts) {
      if (!current[part]) {
        commonLogger.log("Path part not found in tree", {
          pathParts: pathParts,
          missingPart: part,
        });
        return [];
      }
      current = current[part];
    }

    // Return all keys that aren't target category keys
    const keys = Object.keys(current).filter((key) => key !== "runnable" && key !== "test" && key !== "buildable");

    commonLogger.log("Got children at path", {
      path: pathParts.join("/"),
      children: keys,
      hasTargets: BazelParser.hasTargetsAtPath(tree, pathParts),
    });

    return keys;
  }

  /**
   * Check if a path has targets (is a leaf node)
   */
  static hasTargetsAtPath(tree: BazelTreeNode, pathParts: string[]): boolean {
    const targets = BazelParser.getTargetsAtPath(tree, pathParts);
    return targets !== null;
  }
}
