import { ToolsManager } from "../../../../src/application/services/tools-manager.service";
import { exec } from "../../../../src/shared/utils/exec";

// Mock exec
jest.mock("../../../../src/shared/utils/exec");

// Mock tools constants
jest.mock("../../../../src/shared/constants/tools-constants", () => ({
  TOOLS: [
    {
      id: "bazel",
      label: "Bazel",
      check: { command: "bazel", args: ["--version"] },
      install: { command: "brew", args: ["install", "bazel"] },
      documentation: "https://bazel.build",
    },
    {
      id: "xcbeautify",
      label: "xcbeautify",
      check: { command: "xcbeautify", args: ["--version"] },
      install: { command: "brew", args: ["install", "xcbeautify"] },
      documentation: "https://github.com/cpisciotta/xcbeautify",
    },
  ],
}));

describe("ToolsManager", () => {
  let toolsManager: ToolsManager;

  beforeEach(() => {
    jest.clearAllMocks();
    toolsManager = new ToolsManager();
  });

  describe("refresh", () => {
    it("should check all tools and mark installed ones", async () => {
      // Bazel is installed
      (exec as jest.Mock).mockResolvedValueOnce("bazel 6.0.0");
      // xcbeautify is not installed
      (exec as jest.Mock).mockRejectedValueOnce(new Error("command not found"));

      const tools = await toolsManager.refresh();

      expect(tools).toHaveLength(2);
      expect(tools[0].label).toBe("Bazel");
      expect(tools[0].isInstalled).toBe(true);
      expect(tools[1].label).toBe("xcbeautify");
      expect(tools[1].isInstalled).toBe(false);
    });

    it("should check each tool with correct command", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      await toolsManager.refresh();

      expect(exec).toHaveBeenCalledWith({
        command: "bazel",
        args: ["--version"],
      });
      expect(exec).toHaveBeenCalledWith({
        command: "xcbeautify",
        args: ["--version"],
      });
    });

    it("should emit updated event after refresh", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      const listener = jest.fn();
      toolsManager.on("updated", listener);

      await toolsManager.refresh();

      expect(listener).toHaveBeenCalled();
    });

    it("should cache results", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      await toolsManager.refresh();

      const tools = await toolsManager.getTools();

      expect(tools).toHaveLength(2);
      expect(tools.every((t) => t.isInstalled)).toBe(true);
    });

    it("should handle all tools installed", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      const tools = await toolsManager.refresh();

      expect(tools.every((tool) => tool.isInstalled)).toBe(true);
    });

    it("should handle all tools not installed", async () => {
      (exec as jest.Mock).mockRejectedValue(new Error("not found"));

      const tools = await toolsManager.refresh();

      expect(tools.every((tool) => !tool.isInstalled)).toBe(true);
    });

    it("should handle mixed installation state", async () => {
      (exec as jest.Mock)
        .mockResolvedValueOnce("bazel installed") // Bazel installed
        .mockRejectedValueOnce(new Error("not found")); // xcbeautify not installed

      const tools = await toolsManager.refresh();

      const installedCount = tools.filter((t) => t.isInstalled).length;
      const notInstalledCount = tools.filter((t) => !t.isInstalled).length;

      expect(installedCount).toBe(1);
      expect(notInstalledCount).toBe(1);
    });
  });

  describe("getTools", () => {
    it("should return cached tools when available", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      // First call - triggers refresh
      const tools1 = await toolsManager.getTools();

      // Second call - returns cached
      const tools2 = await toolsManager.getTools();

      expect(tools1).toEqual(tools2);
      expect(exec).toHaveBeenCalledTimes(2); // Only called once during refresh
    });

    it("should refresh when refresh option is true", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      await toolsManager.getTools();

      // Force refresh
      await toolsManager.getTools({ refresh: true });

      expect(exec).toHaveBeenCalledTimes(4); // 2 tools × 2 calls
    });

    it("should refresh when cache is undefined", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      const tools = await toolsManager.getTools();

      expect(tools).toHaveLength(2);
      expect(exec).toHaveBeenCalled();
    });

    it("should include all tool properties", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      const tools = await toolsManager.getTools();

      for (const tool of tools) {
        expect(tool).toHaveProperty("label");
        expect(tool).toHaveProperty("id");
        expect(tool).toHaveProperty("check");
        expect(tool).toHaveProperty("install");
        expect(tool).toHaveProperty("documentation");
        expect(tool).toHaveProperty("isInstalled");
      }
    });
  });

  describe("event system", () => {
    it("should support updated event", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      const listener = jest.fn();
      toolsManager.on("updated", listener);

      await toolsManager.refresh();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should support multiple listeners for updated event", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      const listener1 = jest.fn();
      const listener2 = jest.fn();

      toolsManager.on("updated", listener1);
      toolsManager.on("updated", listener2);

      await toolsManager.refresh();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("should not emit event on getTools without refresh", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      // Prime cache
      await toolsManager.refresh();

      const listener = jest.fn();
      toolsManager.on("updated", listener);

      // Get cached tools
      await toolsManager.getTools();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("integration scenarios", () => {
    it("should handle real-world tool checking workflow", async () => {
      // Simulate checking tools
      (exec as jest.Mock).mockResolvedValueOnce("bazel 6.0.0").mockRejectedValueOnce(new Error("not found"));

      const tools = await toolsManager.refresh();

      // Bazel is installed
      const bazel = tools.find((t) => t.label === "Bazel");
      expect(bazel?.isInstalled).toBe(true);

      // xcbeautify is not installed
      const xcbeautify = tools.find((t) => t.label === "xcbeautify");
      expect(xcbeautify?.isInstalled).toBe(false);
    });

    it("should handle tool installation check lifecycle", async () => {
      const listener = jest.fn();
      toolsManager.on("updated", listener);

      // Initial check - nothing installed
      (exec as jest.Mock).mockRejectedValue(new Error("not found"));
      let tools = await toolsManager.refresh();
      expect(tools.every((t) => !t.isInstalled)).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);

      // After installation - all installed
      (exec as jest.Mock).mockResolvedValue("success");
      tools = await toolsManager.refresh();
      expect(tools.every((t) => t.isInstalled)).toBe(true);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("should handle error in tool check gracefully", async () => {
      (exec as jest.Mock).mockRejectedValue(new Error("Command failed"));

      const tools = await toolsManager.refresh();

      // Should not throw, just mark as not installed
      expect(tools).toHaveLength(2);
      expect(tools.every((t) => !t.isInstalled)).toBe(true);
    });
  });

  describe("caching behavior", () => {
    it("should use cache after first refresh", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      // First call
      await toolsManager.getTools();

      jest.clearAllMocks();

      // Second call - should use cache
      await toolsManager.getTools();

      expect(exec).not.toHaveBeenCalled();
    });

    it("should invalidate cache when refresh is called", async () => {
      (exec as jest.Mock).mockResolvedValue("success");

      await toolsManager.getTools();

      jest.clearAllMocks();

      await toolsManager.refresh();

      expect(exec).toHaveBeenCalled();
    });
  });
});
