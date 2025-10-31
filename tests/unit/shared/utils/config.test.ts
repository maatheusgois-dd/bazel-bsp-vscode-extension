import {
  getWorkspaceConfig,
  isWorkspaceConfigIsDefined,
  updateWorkspaceConfig,
} from "../../../../src/shared/utils/config";
import * as vscode from "vscode";

// Mock vscode
jest.mock("vscode", () => ({
  workspace: {
    getConfiguration: jest.fn(),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
}));

describe("Config Utils", () => {
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
  });

  describe("getWorkspaceConfig", () => {
    it("should get configuration value for valid key", () => {
      mockConfig.get.mockReturnValue("/path/to/workspace");

      const result = getWorkspaceConfig("build.xcodeWorkspacePath");

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith("swiftbazel");
      expect(mockConfig.get).toHaveBeenCalledWith("build.xcodeWorkspacePath");
      expect(result).toBe("/path/to/workspace");
    });

    it("should return undefined for unset configuration", () => {
      mockConfig.get.mockReturnValue(undefined);

      const result = getWorkspaceConfig("build.derivedDataPath");

      expect(result).toBeUndefined();
    });

    it("should handle boolean configuration values", () => {
      mockConfig.get.mockReturnValue(true);

      const result = getWorkspaceConfig("build.xcbeautifyEnabled");

      expect(result).toBe(true);
    });

    it("should handle array configuration values", () => {
      const buildArgs = ["--verbose", "--debug"];
      mockConfig.get.mockReturnValue(buildArgs);

      const result = getWorkspaceConfig("build.args");

      expect(result).toEqual(buildArgs);
    });

    it("should handle object configuration values", () => {
      const envVars = { NODE_ENV: "test", DEBUG: "true" };
      mockConfig.get.mockReturnValue(envVars);

      const result = getWorkspaceConfig("build.env");

      expect(result).toEqual(envVars);
    });

    it("should handle string enum configuration values", () => {
      mockConfig.get.mockReturnValue("v2");

      const result = getWorkspaceConfig("system.taskExecutor");

      expect(result).toBe("v2");
    });
  });

  describe("isWorkspaceConfigIsDefined", () => {
    it("should return true when config is defined", () => {
      mockConfig.get.mockReturnValue("some-value");

      const result = isWorkspaceConfigIsDefined("build.xcodeWorkspacePath");

      expect(result).toBe(true);
    });

    it("should return false when config is undefined", () => {
      mockConfig.get.mockReturnValue(undefined);

      const result = isWorkspaceConfigIsDefined("build.derivedDataPath");

      expect(result).toBe(false);
    });

    it("should return true for falsy but defined values (false)", () => {
      mockConfig.get.mockReturnValue(false);

      const result = isWorkspaceConfigIsDefined("build.xcbeautifyEnabled");

      expect(result).toBe(true);
    });

    it("should return true for falsy but defined values (empty string)", () => {
      mockConfig.get.mockReturnValue("");

      const result = isWorkspaceConfigIsDefined("build.configuration");

      expect(result).toBe(true);
    });

    it("should return true for falsy but defined values (0)", () => {
      mockConfig.get.mockReturnValue(0);

      const result = isWorkspaceConfigIsDefined("build.args");

      expect(result).toBe(true);
    });

    it("should return true for empty array", () => {
      mockConfig.get.mockReturnValue([]);

      const result = isWorkspaceConfigIsDefined("build.launchArgs");

      expect(result).toBe(true);
    });

    it("should return true for empty object", () => {
      mockConfig.get.mockReturnValue({});

      const result = isWorkspaceConfigIsDefined("build.launchEnv");

      expect(result).toBe(true);
    });
  });

  describe("updateWorkspaceConfig", () => {
    it("should update configuration value", async () => {
      await updateWorkspaceConfig("build.xcodeWorkspacePath", "/new/path");

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith("swiftbazel");
      expect(mockConfig.update).toHaveBeenCalledWith(
        "build.xcodeWorkspacePath",
        "/new/path",
        vscode.ConfigurationTarget.Workspace,
      );
    });

    it("should update boolean configuration", async () => {
      await updateWorkspaceConfig("build.xcbeautifyEnabled", true);

      expect(mockConfig.update).toHaveBeenCalledWith(
        "build.xcbeautifyEnabled",
        true,
        vscode.ConfigurationTarget.Workspace,
      );
    });

    it("should update array configuration", async () => {
      const newArgs = ["--new-flag"];
      await updateWorkspaceConfig("build.args", newArgs);

      expect(mockConfig.update).toHaveBeenCalledWith("build.args", newArgs, vscode.ConfigurationTarget.Workspace);
    });

    it("should update object configuration", async () => {
      const newEnv = { KEY: "value" };
      await updateWorkspaceConfig("build.env", newEnv);

      expect(mockConfig.update).toHaveBeenCalledWith("build.env", newEnv, vscode.ConfigurationTarget.Workspace);
    });

    it("should handle update errors gracefully", async () => {
      mockConfig.update.mockRejectedValue(new Error("Update failed"));

      await expect(updateWorkspaceConfig("build.xcodeWorkspacePath", "/path")).rejects.toThrow("Update failed");
    });

    it("should update to undefined to clear config", async () => {
      await updateWorkspaceConfig("build.derivedDataPath", "" as any);

      expect(mockConfig.update).toHaveBeenCalledWith("build.derivedDataPath", "", vscode.ConfigurationTarget.Workspace);
    });

    it("should always update at Workspace scope", async () => {
      await updateWorkspaceConfig("system.logLevel", "debug");

      expect(mockConfig.update).toHaveBeenCalledWith("system.logLevel", "debug", vscode.ConfigurationTarget.Workspace);
    });
  });

  describe("integration scenarios", () => {
    it("should handle get-check-update workflow", async () => {
      // Check if defined
      mockConfig.get.mockReturnValue(undefined);
      expect(isWorkspaceConfigIsDefined("build.configuration")).toBe(false);

      // Update value
      await updateWorkspaceConfig("build.configuration", "Debug");

      // Get updated value
      mockConfig.get.mockReturnValue("Debug");
      expect(getWorkspaceConfig("build.configuration")).toBe("Debug");
      expect(isWorkspaceConfigIsDefined("build.configuration")).toBe(true);
    });

    it("should handle multiple config operations", async () => {
      mockConfig.get.mockReturnValue("Release");
      expect(getWorkspaceConfig("build.configuration")).toBe("Release");

      mockConfig.get.mockReturnValue("arm64");
      expect(getWorkspaceConfig("build.arch")).toBe("arm64");

      await updateWorkspaceConfig("build.configuration", "Debug");
      await updateWorkspaceConfig("build.arch", "x86_64");

      expect(mockConfig.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("type safety", () => {
    it("should maintain type consistency for build mode", () => {
      const validModes: Array<"debug" | "release" | "release-with-symbols" | "ask"> = [
        "debug",
        "release",
        "release-with-symbols",
        "ask",
      ];

      for (const mode of validModes) {
        mockConfig.get.mockReturnValue(mode);
        const result = getWorkspaceConfig("bazel.buildMode");
        expect(result).toBe(mode);
      }
    });

    it("should maintain type consistency for task executor", () => {
      mockConfig.get.mockReturnValue("v1");
      expect(getWorkspaceConfig("system.taskExecutor")).toBe("v1");

      mockConfig.get.mockReturnValue("v2");
      expect(getWorkspaceConfig("system.taskExecutor")).toBe("v2");
    });

    it("should maintain type consistency for log level", () => {
      const logLevels: Array<"debug" | "info" | "warn" | "error"> = ["debug", "info", "warn", "error"];

      for (const level of logLevels) {
        mockConfig.get.mockReturnValue(level);
        const result = getWorkspaceConfig("system.logLevel");
        expect(result).toBe(level);
      }
    });
  });
});
