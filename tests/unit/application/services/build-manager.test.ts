import { BuildManager, type SelectedBazelTargetData } from "../../../../src/application/services/build-manager.service";
import type { ExtensionContext } from "../../../../src/infrastructure/vscode/extension-context";
import type { BazelTreeItem } from "../../../../src/presentation/tree-providers/export.provider";
import { commonLogger } from "../../../../src/shared/logger/logger";

// Mock logger
jest.mock("../../../../src/shared/logger/logger", () => ({
  commonLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("BuildManager", () => {
  let buildManager: BuildManager;
  let mockContext: ExtensionContext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ExtensionContext
    mockContext = {
      getWorkspaceState: jest.fn(),
      updateWorkspaceState: jest.fn(),
    } as any;

    buildManager = new BuildManager();
  });

  describe("initializeWithContext", () => {
    it("should initialize with context", async () => {
      (mockContext.getWorkspaceState as jest.Mock).mockReturnValue(undefined);

      await buildManager.initializeWithContext(mockContext);

      expect(buildManager.context).toBe(mockContext);
    });

    it("should restore selected Bazel target from cache", async () => {
      const cachedTarget: SelectedBazelTargetData = {
        targetName: "MyApp",
        targetType: "binary",
        buildLabel: "//Apps/MyApp:MyApp",
        packageName: "MyApp",
        packagePath: "/path/to/MyApp",
        workspacePath: "/workspace",
      };

      (mockContext.getWorkspaceState as jest.Mock).mockReturnValue(cachedTarget);

      await buildManager.initializeWithContext(mockContext);

      expect(commonLogger.log).toHaveBeenCalledWith("📦 Restoring selected Bazel target from cache", {
        target: "MyApp",
      });
    });

    it("should handle no cached target", async () => {
      (mockContext.getWorkspaceState as jest.Mock).mockReturnValue(undefined);

      await buildManager.initializeWithContext(mockContext);

      expect(commonLogger.log).not.toHaveBeenCalledWith(expect.stringContaining("Restoring"), expect.anything());
    });
  });

  describe("context getter", () => {
    it("should throw error when context not initialized", () => {
      expect(() => buildManager.context).toThrow("BuildManager context is not initialized");
    });

    it("should return context when initialized", async () => {
      await buildManager.initializeWithContext(mockContext);

      expect(buildManager.context).toBe(mockContext);
    });
  });

  describe("refresh", () => {
    it("should emit updated event", async () => {
      await buildManager.initializeWithContext(mockContext);

      const listener = jest.fn();
      buildManager.on("updated", listener);

      buildManager.refresh();

      expect(listener).toHaveBeenCalled();
    });

    it("should support multiple event listeners", async () => {
      await buildManager.initializeWithContext(mockContext);

      const listener1 = jest.fn();
      const listener2 = jest.fn();

      buildManager.on("updated", listener1);
      buildManager.on("updated", listener2);

      buildManager.refresh();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe("setCurrentWorkspacePath", () => {
    beforeEach(async () => {
      await buildManager.initializeWithContext(mockContext);
    });

    it("should update workspace state", () => {
      buildManager.setCurrentWorkspacePath("/new/workspace/path");

      expect(mockContext.updateWorkspaceState).toHaveBeenCalledWith("build.xcodeWorkspacePath", "/new/workspace/path");
    });

    it("should emit event by default", () => {
      const listener = jest.fn();
      buildManager.on("currentWorkspacePathUpdated", listener);

      buildManager.setCurrentWorkspacePath("/workspace");

      expect(listener).toHaveBeenCalledWith("/workspace");
    });

    it("should skip refresh when skipRefresh is true", () => {
      const listener = jest.fn();
      buildManager.on("updated", listener);

      buildManager.setCurrentWorkspacePath("/workspace", true);

      expect(listener).not.toHaveBeenCalled();
    });

    it("should refresh by default", () => {
      const listener = jest.fn();
      buildManager.on("updated", listener);

      buildManager.setCurrentWorkspacePath("/workspace");

      expect(listener).toHaveBeenCalled();
    });
  });

  describe("setSelectedBazelTarget", () => {
    beforeEach(async () => {
      await buildManager.initializeWithContext(mockContext);
    });

    it("should set selected target and serialize data", () => {
      const target: BazelTreeItem = {
        target: {
          name: "MyApp",
          type: "binary",
          buildLabel: "//Apps/MyApp:MyApp",
          deps: [],
        },
        package: {
          name: "MyApp",
          path: "/path/to/MyApp",
          targets: [],
        },
        workspacePath: "/workspace",
        provider: null as any,
      };

      buildManager.setSelectedBazelTarget(target);

      const expectedData: SelectedBazelTargetData = {
        targetName: "MyApp",
        targetType: "binary",
        buildLabel: "//Apps/MyApp:MyApp",
        testLabel: undefined,
        packageName: "MyApp",
        packagePath: "/path/to/MyApp",
        workspacePath: "/workspace",
      };

      expect(mockContext.updateWorkspaceState).toHaveBeenCalledWith("build.selectedBazelTarget", expectedData);
    });

    it("should emit selectedBazelTargetUpdated event", () => {
      const listener = jest.fn();
      buildManager.on("selectedBazelTargetUpdated", listener);

      const target: BazelTreeItem = {
        target: {
          name: "TestTarget",
          type: "test",
          buildLabel: "//Tests:TestTarget",
          testLabel: "//Tests:TestTarget",
          deps: [],
        },
        package: {
          name: "Tests",
          path: "/tests",
          targets: [],
        },
        workspacePath: "/ws",
        provider: null as any,
      };

      buildManager.setSelectedBazelTarget(target);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          targetName: "TestTarget",
          targetType: "test",
          testLabel: "//Tests:TestTarget",
        }),
      );
    });

    it("should clear target when undefined is passed", () => {
      buildManager.setSelectedBazelTarget(undefined);

      expect(mockContext.updateWorkspaceState).toHaveBeenCalledWith("build.selectedBazelTarget", undefined);
    });

    it("should handle test targets with testLabel", () => {
      const testTarget: BazelTreeItem = {
        target: {
          name: "UnitTests",
          type: "test",
          buildLabel: "//Tests:UnitTests",
          testLabel: "//Tests:UnitTests_test",
          deps: [],
        },
        package: {
          name: "Tests",
          path: "/tests",
          targets: [],
        },
        workspacePath: "/ws",
        provider: null as any,
      };

      buildManager.setSelectedBazelTarget(testTarget);

      expect(mockContext.updateWorkspaceState).toHaveBeenCalledWith(
        "build.selectedBazelTarget",
        expect.objectContaining({
          testLabel: "//Tests:UnitTests_test",
        }),
      );
    });
  });

  describe("getSelectedBazelTarget", () => {
    it("should return undefined when no target selected", () => {
      const result = buildManager.getSelectedBazelTarget();

      expect(result).toBeUndefined();
    });

    it("should return selected target", async () => {
      await buildManager.initializeWithContext(mockContext);

      const target: BazelTreeItem = {
        target: {
          name: "App",
          type: "binary",
          buildLabel: "//App:App",
          deps: [],
        },
        package: {
          name: "App",
          path: "/app",
          targets: [],
        },
        workspacePath: "/ws",
        provider: null as any,
      };

      buildManager.setSelectedBazelTarget(target);

      const result = buildManager.getSelectedBazelTarget();

      expect(result).toBe(target);
    });
  });

  describe("getSelectedBazelTargetData", () => {
    beforeEach(async () => {
      await buildManager.initializeWithContext(mockContext);
    });

    it("should return serialized data from in-memory target", () => {
      const target: BazelTreeItem = {
        target: {
          name: "MyApp",
          type: "binary",
          buildLabel: "//Apps/MyApp:MyApp",
          deps: [],
        },
        package: {
          name: "MyApp",
          path: "/path/to/MyApp",
          targets: [],
        },
        workspacePath: "/workspace",
        provider: null as any,
      };

      buildManager.setSelectedBazelTarget(target);

      const result = buildManager.getSelectedBazelTargetData();

      expect(result).toEqual({
        targetName: "MyApp",
        targetType: "binary",
        buildLabel: "//Apps/MyApp:MyApp",
        testLabel: undefined,
        packageName: "MyApp",
        packagePath: "/path/to/MyApp",
        workspacePath: "/workspace",
      });
    });

    it("should fallback to cached data when no in-memory target", () => {
      const cachedData: SelectedBazelTargetData = {
        targetName: "CachedApp",
        targetType: "binary",
        buildLabel: "//Apps/CachedApp:CachedApp",
        packageName: "CachedApp",
        packagePath: "/path",
        workspacePath: "/ws",
      };

      (mockContext.getWorkspaceState as jest.Mock).mockReturnValue(cachedData);

      const result = buildManager.getSelectedBazelTargetData();

      expect(result).toEqual(cachedData);
    });

    it("should return undefined when no target available", () => {
      (mockContext.getWorkspaceState as jest.Mock).mockReturnValue(undefined);

      const result = buildManager.getSelectedBazelTargetData();

      expect(result).toBeUndefined();
    });
  });

  describe("event system", () => {
    beforeEach(async () => {
      await buildManager.initializeWithContext(mockContext);
    });

    it("should support updated event", () => {
      const listener = jest.fn();
      buildManager.on("updated", listener);

      buildManager.refresh();

      expect(listener).toHaveBeenCalled();
    });

    it("should support currentWorkspacePathUpdated event", () => {
      const listener = jest.fn();
      buildManager.on("currentWorkspacePathUpdated", listener);

      buildManager.setCurrentWorkspacePath("/new/path");

      expect(listener).toHaveBeenCalledWith("/new/path");
    });

    it("should support selectedBazelTargetUpdated event", () => {
      const listener = jest.fn();
      buildManager.on("selectedBazelTargetUpdated", listener);

      const target: BazelTreeItem = {
        target: { name: "App", type: "binary", buildLabel: "//App:App", deps: [] },
        package: { name: "App", path: "/app", targets: [] },
        workspacePath: "/ws",
        provider: null as any,
      };

      buildManager.setSelectedBazelTarget(target);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ targetName: "App" }));
    });

    it("should emit undefined when target is cleared", () => {
      const listener = jest.fn();
      buildManager.on("selectedBazelTargetUpdated", listener);

      buildManager.setSelectedBazelTarget(undefined);

      expect(listener).toHaveBeenCalledWith(undefined);
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete target selection workflow", async () => {
      await buildManager.initializeWithContext(mockContext);

      const updateListener = jest.fn();
      const targetListener = jest.fn();

      buildManager.on("updated", updateListener);
      buildManager.on("selectedBazelTargetUpdated", targetListener);

      // Set workspace path
      buildManager.setCurrentWorkspacePath("/workspace");
      expect(updateListener).toHaveBeenCalled();

      // Select target
      const target: BazelTreeItem = {
        target: { name: "MyApp", type: "binary", buildLabel: "//Apps/MyApp:MyApp", deps: [] },
        package: { name: "MyApp", path: "/apps/myapp", targets: [] },
        workspacePath: "/workspace",
        provider: null as any,
      };

      buildManager.setSelectedBazelTarget(target);
      expect(targetListener).toHaveBeenCalled();

      // Verify target is retrievable
      expect(buildManager.getSelectedBazelTarget()).toBe(target);
      expect(buildManager.getSelectedBazelTargetData()?.targetName).toBe("MyApp");
    });

    it("should persist and restore target across sessions", async () => {
      const savedData: SelectedBazelTargetData = {
        targetName: "RestoredApp",
        targetType: "binary",
        buildLabel: "//Apps/Restored:App",
        packageName: "Restored",
        packagePath: "/path",
        workspacePath: "/ws",
      };

      (mockContext.getWorkspaceState as jest.Mock).mockReturnValue(savedData);

      await buildManager.initializeWithContext(mockContext);

      // Should log restoration
      expect(commonLogger.log).toHaveBeenCalledWith(
        "📦 Restoring selected Bazel target from cache",
        expect.objectContaining({ target: "RestoredApp" }),
      );

      // Data should be retrievable
      const data = buildManager.getSelectedBazelTargetData();
      expect(data).toEqual(savedData);
    });
  });
});
