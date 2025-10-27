import events from "node:events";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import type { BazelTreeItem } from "../../presentation/tree-providers/export.provider.js";
import { commonLogger } from "../../shared/logger/logger.js";

type IEventMap = {
  updated: [];
  currentWorkspacePathUpdated: [workspacePath: string | undefined];
  selectedBazelTargetUpdated: [target: SelectedBazelTargetData | undefined];
};

// Serializable data for selected Bazel target (no circular references)
export interface SelectedBazelTargetData {
  targetName: string;
  targetType: "library" | "test" | "binary";
  buildLabel: string;
  testLabel?: string;
  packageName: string;
  packagePath: string;
  workspacePath: string;
}
type IEventKey = keyof IEventMap;

export class BuildManager {
  private emitter = new events.EventEmitter<IEventMap>();
  public _context: ExtensionContext | undefined = undefined;

  on<K extends IEventKey>(event: K, listener: (...args: IEventMap[K]) => void): void {
    this.emitter.on(event, listener as any);
  }

  async initializeWithContext(context: ExtensionContext): Promise<void> {
    this._context = context;

    // Restore selected Bazel target from workspace state
    const savedTargetData = context.getWorkspaceState("build.selectedBazelTarget") as
      | SelectedBazelTargetData
      | undefined;
    if (savedTargetData) {
      commonLogger.log("📦 Restoring selected Bazel target from cache", { target: savedTargetData.targetName });
      // Note: We save the serialized data but don't reconstruct the full BazelTreeItem here
      // The tree provider will handle reconstructing the full item when needed
    }
  }

  get context(): ExtensionContext {
    if (!this._context) {
      throw new Error("BuildManager context is not initialized");
    }
    return this._context;
  }

  refresh(): void {
    this.emitter.emit("updated");
  }

  setCurrentWorkspacePath(workspacePath: string, skipRefresh?: boolean) {
    this.context.updateWorkspaceState("build.xcodeWorkspacePath", workspacePath);

    if (!skipRefresh) {
      this.refresh();
    }

    this.emitter.emit("currentWorkspacePathUpdated", workspacePath);
  }

  // Bazel target selection
  private selectedBazelTarget: BazelTreeItem | undefined;

  setSelectedBazelTarget(target: BazelTreeItem | undefined) {
    this.selectedBazelTarget = target;

    // Serialize target data for persistence
    let serializedData: SelectedBazelTargetData | undefined;
    if (target) {
      serializedData = {
        targetName: target.target.name,
        targetType: target.target.type,
        buildLabel: target.target.buildLabel,
        testLabel: target.target.testLabel,
        packageName: target.package.name,
        packagePath: target.package.path,
        workspacePath: target.workspacePath,
      };
    }

    this.context.updateWorkspaceState("build.selectedBazelTarget", serializedData);
    this.emitter.emit("selectedBazelTargetUpdated", serializedData);
  }

  getSelectedBazelTarget(): BazelTreeItem | undefined {
    return this.selectedBazelTarget;
  }

  getSelectedBazelTargetData(): SelectedBazelTargetData | undefined {
    // First try to get from in-memory target
    const target = this.selectedBazelTarget;
    if (target) {
      return {
        targetName: target.target.name,
        targetType: target.target.type,
        buildLabel: target.target.buildLabel,
        testLabel: target.target.testLabel,
        packageName: target.package.name,
        packagePath: target.package.path,
        workspacePath: target.workspacePath,
      };
    }

    // Fallback to cached serialized data if in-memory target is not available
    return this.context.getWorkspaceState("build.selectedBazelTarget") as SelectedBazelTargetData | undefined;
  }
}
