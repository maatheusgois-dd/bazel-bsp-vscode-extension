import * as vscode from "vscode";

/**
 * Tree item representing the Recents section
 */
export class BazelQueryRecentsSectionItem extends vscode.TreeItem {
  constructor(public readonly recentCount: number) {
    super("Recents", vscode.TreeItemCollapsibleState.Expanded);

    this.contextValue = "bazelQueryRecents";
    this.iconPath = new vscode.ThemeIcon("history");
    this.description = `${recentCount}`;
    this.tooltip = "Recently selected targets";
  }
}

/**
 * Tree item representing a folder in the bazel query tree structure
 */
export class BazelQueryFolderItem extends vscode.TreeItem {
  public readonly pathParts: string[];

  constructor(
    label: string,
    pathParts: string[],
    public readonly hasTargets: boolean,
    bazelIcon?: vscode.Uri,
  ) {
    // If this folder has targets, make it collapsible (lazy loading)
    // Otherwise, make it expandable to show subfolders
    const state = hasTargets ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded;

    super(label, state);

    this.pathParts = pathParts;
    this.contextValue = hasTargets ? "bazelQueryFolder-withTargets" : "bazelQueryFolder";

    // Use Bazel icon if provided, otherwise use default folder icon
    this.iconPath = bazelIcon || new vscode.ThemeIcon("folder");

    this.tooltip = `/${pathParts.join("/")}`;
  }
}

/**
 * Tree item representing a bazel target (runnable, test, or buildable)
 * Compatible with BazelTreeItem interface for commands
 */
export class BazelQueryTargetItem extends vscode.TreeItem {
  public readonly targetName: string;
  public readonly targetType: "runnable" | "test" | "buildable";
  public readonly fullPath: string;

  // Make it compatible with BazelTreeItem for commands
  public readonly target: {
    name: string;
    type: "library" | "test" | "binary";
    buildLabel: string;
    testLabel?: string;
    deps: string[];
  };

  // Package info for commands
  public readonly package: {
    name: string;
    path: string;
    targets: any[];
  };

  // Workspace path for commands
  public readonly workspacePath: string;

  // Provider for selection state
  public provider?: { getSelectedBazelTargetData(): any };

  constructor(
    targetName: string,
    targetType: "runnable" | "test" | "buildable",
    pathParts: string[],
    workspaceRoot: string,
    provider?: { getSelectedBazelTargetData(): any },
  ) {
    super(targetName, vscode.TreeItemCollapsibleState.None);

    this.targetName = targetName;
    this.targetType = targetType;
    this.fullPath = `//${pathParts.join("/")}:${targetName}`;
    this.provider = provider;

    // Convert targetType to legacy type
    const legacyType = targetType === "runnable" ? "binary" : targetType === "test" ? "test" : "library";

    // Create target structure compatible with commands
    this.target = {
      name: targetName,
      type: legacyType,
      buildLabel: this.fullPath,
      testLabel: targetType === "test" ? this.fullPath : undefined,
      deps: [],
    };

    // Create package structure - use the workspace root + path parts for the actual filesystem path
    const relativePath = pathParts.join("/");
    const absolutePath = `${workspaceRoot}/${relativePath}`;
    this.package = {
      name: pathParts[pathParts.length - 1] || "root",
      path: absolutePath,
      targets: [],
    };

    // Workspace path is the full BUILD file path
    this.workspacePath = `${absolutePath}/BUILD.bazel`;

    // Check if this target is currently selected
    const selectedTargetData = this.provider?.getSelectedBazelTargetData();
    const isSelected = selectedTargetData?.buildLabel === this.target.buildLabel;

    // Use different color for selected vs unselected targets
    const iconColor = isSelected
      ? new vscode.ThemeColor("swiftbazel.simulator.booted")
      : new vscode.ThemeColor("swiftbazel.scheme");

    if (isSelected) {
      this.description = "✓";
    }

    // Set icon based on target type
    if (targetType === "runnable") {
      this.iconPath = new vscode.ThemeIcon("play", iconColor);
      this.contextValue = "bazelTarget-runnable";
    } else if (targetType === "test") {
      this.iconPath = new vscode.ThemeIcon("beaker", iconColor);
      this.contextValue = "bazelTarget-test";
    } else {
      this.iconPath = new vscode.ThemeIcon("package", iconColor);
      this.contextValue = "bazelTarget-buildable";
    }

    this.tooltip = `${this.fullPath}\nType: ${targetType}`;

    // Set command to select the target when clicked
    // Pass serializable data including target and package info
    this.command = {
      command: "swiftbazel.bazel.selectTarget",
      title: "Select Bazel Target",
      arguments: [
        {
          target: this.target,
          package: this.package,
          workspacePath: this.workspacePath,
        },
      ],
    };
  }
}

/**
 * Tree item representing a category section (Runnable, Tests, Buildable)
 */
export class BazelQueryCategoryItem extends vscode.TreeItem {
  public readonly category: "runnable" | "test" | "buildable";
  public readonly targets: string[];
  public readonly pathParts: string[];

  constructor(category: "runnable" | "test" | "buildable", targets: string[], pathParts: string[]) {
    const label = category === "runnable" ? "▶️ Runnable" : category === "test" ? "🧪 Tests" : "🔨 Buildable";

    super(label, vscode.TreeItemCollapsibleState.Expanded);

    this.category = category;
    this.targets = targets;
    this.pathParts = pathParts;
    this.contextValue = `bazelCategory-${category}`;
    this.description = `${targets.length}`;
  }
}

/**
 * Root tree item for the Bazel Query view
 */
export class BazelQueryRootItem extends vscode.TreeItem {
  constructor(
    public readonly statistics: {
      runnable: number;
      test: number;
      buildable: number;
      total: number;
    },
  ) {
    super("Bazel Targets", vscode.TreeItemCollapsibleState.Expanded);

    this.contextValue = "bazelQueryRoot";
    this.iconPath = new vscode.ThemeIcon("symbol-namespace");
    this.description = `${statistics.total} targets`;
    this.tooltip = [
      `Total: ${statistics.total}`,
      `Runnable: ${statistics.runnable}`,
      `Tests: ${statistics.test}`,
      `Buildable: ${statistics.buildable}`,
    ].join("\n");
  }
}
