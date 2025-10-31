import { BazelParser } from "../../../../src/infrastructure/bazel/bazel-parser";
import { commonLogger } from "../../../../src/shared/logger/logger";
import { exec } from "../../../../src/shared/utils/exec";

// Mock dependencies
jest.mock("../../../../src/shared/utils/exec");
jest.mock("../../../../src/shared/logger/logger", () => ({
  commonLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("BazelParser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("queryAllTargets", () => {
    it("should query and parse bazel targets successfully", async () => {
      const mockOutput = `
ios_application rule //Apps/MyApp:DoorDash
swift_library rule //Apps/MyApp/Core:Core
ios_unit_test rule //Apps/MyApp/Tests:Tests
`.trim();

      (exec as jest.Mock).mockResolvedValue(mockOutput);

      const result = await BazelParser.queryAllTargets();

      expect(exec).toHaveBeenCalledWith({
        command: "bazel",
        args: ["query", "//...", "--output=label_kind"],
        cwd: undefined,
        cancellable: true,
        progressTitle: "Discovering Bazel targets",
      });

      expect(result).toHaveProperty("generated");
      expect(result).toHaveProperty("statistics");
      expect(result).toHaveProperty("tree");
      expect(result.statistics.runnable).toBe(1);
      expect(result.statistics.test).toBe(1);
      expect(result.statistics.buildable).toBe(1);
      expect(result.statistics.total).toBe(3);
    });

    it("should query with custom cwd", async () => {
      (exec as jest.Mock).mockResolvedValue("");

      await BazelParser.queryAllTargets("/custom/path");

      expect(exec).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: "/custom/path",
        }),
      );
    });

    it("should handle empty query results", async () => {
      (exec as jest.Mock).mockResolvedValue("");

      const result = await BazelParser.queryAllTargets();

      expect(result.statistics.runnable).toBe(0);
      expect(result.statistics.test).toBe(0);
      expect(result.statistics.buildable).toBe(0);
      expect(result.statistics.total).toBe(0);
    });

    it("should throw error when bazel query fails", async () => {
      (exec as jest.Mock).mockRejectedValue(new Error("bazel not found"));

      await expect(BazelParser.queryAllTargets()).rejects.toThrow("Failed to run bazel query");
    });

    it("should log error when query fails", async () => {
      const error = new Error("Command failed");
      (exec as jest.Mock).mockRejectedValue(error);

      try {
        await BazelParser.queryAllTargets();
      } catch (_e) {
        // Expected
      }

      expect(commonLogger.error).toHaveBeenCalledWith("Error running bazel query", { error });
    });
  });

  describe("parseTargets", () => {
    it("should categorize runnable targets", () => {
      const lines = [
        "ios_application rule //Apps/MyApp:App",
        "macos_application rule //Apps/MacApp:MacApp",
        "ios_extension rule //Apps/Extension:Extension",
        "ios_app_clip rule //Apps/Clip:Clip",
      ];

      const result = (BazelParser as any).parseTargets(lines);

      expect(result.runnable).toHaveLength(4);
      expect(result.test).toHaveLength(0);
      expect(result.buildable).toHaveLength(0);
    });

    it("should categorize test targets", () => {
      const lines = ["ios_unit_test rule //Tests:UnitTests", "swift_test rule //Tests:SwiftTests"];

      const result = (BazelParser as any).parseTargets(lines);

      expect(result.runnable).toHaveLength(0);
      expect(result.test).toHaveLength(2);
      expect(result.buildable).toHaveLength(0);
    });

    it("should categorize buildable targets", () => {
      const lines = [
        "swift_library rule //Libs/Core:Core",
        "objc_library rule //Libs/ObjC:ObjC",
        "swift_library_group rule //Libs/Group:Group",
      ];

      const result = (BazelParser as any).parseTargets(lines);

      expect(result.runnable).toHaveLength(0);
      expect(result.test).toHaveLength(0);
      expect(result.buildable).toHaveLength(3);
    });

    it("should ignore specified target types", () => {
      const lines = [
        "ios_framework rule //Libs:Framework",
        "xcodeproj rule //Apps:XcodeProj",
        "xcodeproj_runner rule //Apps:Runner",
        "_ios_internal_unit_test_bundle rule //Tests:Internal",
      ];

      const result = (BazelParser as any).parseTargets(lines);

      expect(result.runnable).toHaveLength(0);
      expect(result.test).toHaveLength(0);
      expect(result.buildable).toHaveLength(0);
    });

    it("should skip lines without proper format", () => {
      const lines = ["invalid line", "another bad line", "ios_application rule //Good:Target"];

      const result = (BazelParser as any).parseTargets(lines);

      expect(result.runnable).toHaveLength(1);
    });

    it("should skip empty lines", () => {
      const lines = ["", "   ", "ios_application rule //App:App", ""];

      const result = (BazelParser as any).parseTargets(lines);

      expect(result.runnable).toHaveLength(1);
    });
  });

  describe("buildTree", () => {
    it("should build tree structure from targets", () => {
      const targets = {
        runnable: [{ type: "ios_application", target: "//Apps/MyApp:App" }],
        test: [{ type: "ios_unit_test", target: "//Apps/MyApp/Tests:Tests" }],
        buildable: [{ type: "swift_library", target: "//Libs/Core:Core" }],
      };

      const tree = (BazelParser as any).buildTree(targets);

      expect(tree).toHaveProperty("Apps");
      expect(tree.Apps).toHaveProperty("MyApp");
      expect(tree).toHaveProperty("Libs");
    });

    it("should organize targets by category at each path", () => {
      const targets = {
        runnable: [{ type: "ios_application", target: "//Apps/MyApp:App" }],
        test: [{ type: "ios_unit_test", target: "//Apps/MyApp:Tests" }],
        buildable: [{ type: "swift_library", target: "//Apps/MyApp:Library" }],
      };

      const tree = (BazelParser as any).buildTree(targets);

      expect(tree.Apps.MyApp.runnable).toContain("App");
      expect(tree.Apps.MyApp.test).toContain("Tests");
      expect(tree.Apps.MyApp.buildable).toContain("Library");
    });

    it("should handle deeply nested paths", () => {
      const targets = {
        runnable: [{ type: "ios_application", target: "//Apps/Feature/SubFeature/DeepFeature:Target" }],
        test: [],
        buildable: [],
      };

      const tree = (BazelParser as any).buildTree(targets);

      expect(tree.Apps.Feature.SubFeature.DeepFeature.runnable).toContain("Target");
    });

    it("should handle multiple targets in same package", () => {
      const targets = {
        runnable: [
          { type: "ios_application", target: "//Apps/MyApp:App1" },
          { type: "ios_application", target: "//Apps/MyApp:App2" },
        ],
        test: [],
        buildable: [],
      };

      const tree = (BazelParser as any).buildTree(targets);

      expect(tree.Apps.MyApp.runnable).toContain("App1");
      expect(tree.Apps.MyApp.runnable).toContain("App2");
      expect(tree.Apps.MyApp.runnable).toHaveLength(2);
    });

    it("should prevent duplicate targets in same category", () => {
      const targets = {
        runnable: [
          { type: "ios_application", target: "//Apps/MyApp:App" },
          { type: "ios_application", target: "//Apps/MyApp:App" }, // Duplicate
        ],
        test: [],
        buildable: [],
      };

      const tree = (BazelParser as any).buildTree(targets);

      expect(tree.Apps.MyApp.runnable).toHaveLength(1);
    });

    it("should warn on invalid target format", () => {
      const targets = {
        runnable: [{ type: "ios_application", target: "invalid-format" }],
        test: [],
        buildable: [],
      };

      (BazelParser as any).buildTree(targets);

      expect(commonLogger.warn).toHaveBeenCalledWith("Failed to parse target", { target: "invalid-format" });
    });
  });

  describe("getTargetsAtPath", () => {
    const tree = {
      Apps: {
        MyApp: {
          runnable: ["App"],
          test: ["Tests"],
          buildable: ["Library"],
        },
      },
    };

    it("should retrieve targets at valid path", () => {
      const result = BazelParser.getTargetsAtPath(tree, ["Apps", "MyApp"]);

      expect(result).toEqual({
        runnable: ["App"],
        test: ["Tests"],
        buildable: ["Library"],
      });
    });

    it("should return null for non-existent path", () => {
      const result = BazelParser.getTargetsAtPath(tree, ["Apps", "NonExistent"]);

      expect(result).toBeNull();
    });

    it("should return null for partial path without targets", () => {
      const result = BazelParser.getTargetsAtPath(tree, ["Apps"]);

      expect(result).toBeNull();
    });

    it("should handle empty path", () => {
      const result = BazelParser.getTargetsAtPath(tree, []);

      expect(result).toBeNull();
    });

    it("should handle path with only some categories", () => {
      const partialTree = {
        Libs: {
          Core: {
            runnable: [],
            test: [],
            buildable: ["CoreLib"],
          },
        },
      };

      const result = BazelParser.getTargetsAtPath(partialTree, ["Libs", "Core"]);

      expect(result).toEqual({
        runnable: [],
        test: [],
        buildable: ["CoreLib"],
      });
    });
  });

  describe("getChildrenAtPath", () => {
    const tree = {
      Apps: {
        MyApp: {
          runnable: ["App"],
          test: ["Tests"],
          SubModule: {
            runnable: ["SubApp"],
          },
        },
        OtherApp: {
          runnable: ["Other"],
        },
      },
      Libs: {
        Core: {
          buildable: ["CoreLib"],
        },
      },
    };

    it("should get children at root level", () => {
      const children = BazelParser.getChildrenAtPath(tree, []);

      expect(children).toEqual(["Apps", "Libs"]);
    });

    it("should get children at nested level", () => {
      const children = BazelParser.getChildrenAtPath(tree, ["Apps"]);

      expect(children).toContain("MyApp");
      expect(children).toContain("OtherApp");
      expect(children).toHaveLength(2);
    });

    it("should exclude target category keys", () => {
      const children = BazelParser.getChildrenAtPath(tree, ["Apps", "MyApp"]);

      expect(children).not.toContain("runnable");
      expect(children).not.toContain("test");
      expect(children).not.toContain("buildable");
      expect(children).toContain("SubModule");
    });

    it("should return empty array for non-existent path", () => {
      const children = BazelParser.getChildrenAtPath(tree, ["NonExistent"]);

      expect(children).toEqual([]);
    });

    it("should log when path part not found", () => {
      BazelParser.getChildrenAtPath(tree, ["Apps", "Missing"]);

      expect(commonLogger.log).toHaveBeenCalledWith("Path part not found in tree", {
        pathParts: ["Apps", "Missing"],
        missingPart: "Missing",
      });
    });

    it("should return only directory children, not target categories", () => {
      const children = BazelParser.getChildrenAtPath(tree, ["Libs"]);

      expect(children).toEqual(["Core"]);
    });
  });

  describe("hasTargetsAtPath", () => {
    const tree = {
      Apps: {
        MyApp: {
          runnable: ["App"],
          test: [],
          buildable: [],
        },
        Empty: {},
      },
    };

    it("should return true when path has targets", () => {
      const result = BazelParser.hasTargetsAtPath(tree, ["Apps", "MyApp"]);

      expect(result).toBe(true);
    });

    it("should return false when path has no targets", () => {
      const result = BazelParser.hasTargetsAtPath(tree, ["Apps", "Empty"]);

      expect(result).toBe(false);
    });

    it("should return false for non-existent path", () => {
      const result = BazelParser.hasTargetsAtPath(tree, ["NonExistent"]);

      expect(result).toBe(false);
    });

    it("should return false for partial path", () => {
      const result = BazelParser.hasTargetsAtPath(tree, ["Apps"]);

      expect(result).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete bazel query workflow", async () => {
      const mockOutput = `
ios_application rule //Apps/Consumer:App
swift_library rule //Apps/Consumer:Core
ios_unit_test rule //Apps/Consumer:Tests
ios_application rule //Apps/Dasher:DasherApp
swift_library rule //Libs/Networking:Network
swift_library rule //Libs/UI:Components
`.trim();

      (exec as jest.Mock).mockResolvedValue(mockOutput);

      const result = await BazelParser.queryAllTargets();

      // Check statistics
      expect(result.statistics.runnable).toBe(2);
      expect(result.statistics.test).toBe(1);
      expect(result.statistics.buildable).toBe(3);
      expect(result.statistics.total).toBe(6);

      // Check tree structure
      expect(result.tree.Apps).toBeDefined();
      expect((result.tree.Apps as any).Consumer).toBeDefined();
      expect((result.tree.Apps as any).Dasher).toBeDefined();
      expect(result.tree.Libs).toBeDefined();
      expect((result.tree.Libs as any).Networking).toBeDefined();
      expect((result.tree.Libs as any).UI).toBeDefined();

      // Verify targets at paths
      expect(BazelParser.hasTargetsAtPath(result.tree, ["Apps", "Consumer"])).toBe(true);
      expect(BazelParser.hasTargetsAtPath(result.tree, ["Libs", "Networking"])).toBe(true);

      // Get targets - all at same level now
      const consumerTargets = BazelParser.getTargetsAtPath(result.tree, ["Apps", "Consumer"]);
      expect(consumerTargets?.runnable).toContain("App");
      expect(consumerTargets?.test).toContain("Tests");
      expect(consumerTargets?.buildable).toContain("Core");
    });

    it("should handle complex nested structure", async () => {
      const mockOutput = `
ios_application rule //Apps/Consumer/iOS/Main:ConsumerApp
swift_library rule //Apps/Consumer/iOS/Features/Home:Home
swift_library rule //Apps/Consumer/iOS/Features/Profile:Profile
ios_unit_test rule //Apps/Consumer/iOS/Features/Home/Tests:HomeTests
`.trim();

      (exec as jest.Mock).mockResolvedValue(mockOutput);

      const result = await BazelParser.queryAllTargets();

      // Navigate deep paths
      const children1 = BazelParser.getChildrenAtPath(result.tree, []);
      expect(children1).toContain("Apps");

      const children2 = BazelParser.getChildrenAtPath(result.tree, ["Apps"]);
      expect(children2).toContain("Consumer");

      const children3 = BazelParser.getChildrenAtPath(result.tree, ["Apps", "Consumer"]);
      expect(children3).toContain("iOS");

      const children4 = BazelParser.getChildrenAtPath(result.tree, ["Apps", "Consumer", "iOS"]);
      expect(children4).toContain("Main");
      expect(children4).toContain("Features");

      // Check leaf targets
      const homeTargets = BazelParser.getTargetsAtPath(result.tree, ["Apps", "Consumer", "iOS", "Features", "Home"]);
      expect(homeTargets?.buildable).toContain("Home");
    });

    it("should ignore unwanted target types in real workflow", async () => {
      const mockOutput = `
ios_application rule //Apps:App
ios_framework rule //Apps:Framework
xcodeproj rule //Apps:XcodeProj
_ios_internal_unit_test_bundle rule //Tests:Internal
ios_unit_test rule //Tests:Tests
`.trim();

      (exec as jest.Mock).mockResolvedValue(mockOutput);

      const result = await BazelParser.queryAllTargets();

      // Only ios_application and ios_unit_test should be counted
      expect(result.statistics.runnable).toBe(1);
      expect(result.statistics.test).toBe(1);
      expect(result.statistics.total).toBe(2);
    });
  });

  describe("edge cases", () => {
    it("should handle targets with special characters", async () => {
      const mockOutput = `
ios_application rule //Apps/My-App:My-App
swift_library rule //Libs/UI_Components:UI_Components
`.trim();

      (exec as jest.Mock).mockResolvedValue(mockOutput);

      const result = await BazelParser.queryAllTargets();

      expect((result.tree.Apps as any)["My-App"].runnable).toContain("My-App");
      expect((result.tree.Libs as any).UI_Components.buildable).toContain("UI_Components");
    });

    it("should handle single package with multiple target types", async () => {
      const mockOutput = `
ios_application rule //Apps/All:App
ios_unit_test rule //Apps/All:Tests
swift_library rule //Apps/All:Lib
`.trim();

      (exec as jest.Mock).mockResolvedValue(mockOutput);

      const result = await BazelParser.queryAllTargets();

      const targets = BazelParser.getTargetsAtPath(result.tree, ["Apps", "All"]);
      expect(targets?.runnable).toContain("App");
      expect(targets?.test).toContain("Tests");
      expect(targets?.buildable).toContain("Lib");
    });

    it("should handle root level targets", async () => {
      const mockOutput = `
ios_application rule //:RootApp
swift_library rule //:RootLib
`.trim();

      (exec as jest.Mock).mockResolvedValue(mockOutput);

      const result = await BazelParser.queryAllTargets();

      // Root targets should be at empty path
      const targets = BazelParser.getTargetsAtPath(result.tree, [""]);
      expect(targets).toBeDefined();
    });
  });

  describe("performance considerations", () => {
    it("should handle large number of targets efficiently", async () => {
      // Generate 100 targets
      const lines: string[] = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`swift_library rule //Libs/Lib${i}:Lib${i}`);
      }

      (exec as jest.Mock).mockResolvedValue(lines.join("\n"));

      const startTime = Date.now();
      const result = await BazelParser.queryAllTargets();
      const duration = Date.now() - startTime;

      expect(result.statistics.buildable).toBe(100);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    it("should handle deeply nested tree structure", async () => {
      const mockOutput = `
swift_library rule //A/B/C/D/E/F/G/H/I/J:Target
`.trim();

      (exec as jest.Mock).mockResolvedValue(mockOutput);

      const result = await BazelParser.queryAllTargets();

      const targets = BazelParser.getTargetsAtPath(result.tree, ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]);
      expect(targets?.buildable).toContain("Target");
    });
  });
});
