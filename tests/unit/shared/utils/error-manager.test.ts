import { ErrorManager, createErrorManager } from "../../../../src/shared/utils/error-manager";
import type { ExtensionContext } from "../../../../src/infrastructure/vscode/extension-context";
import { commonLogger } from "../../../../src/shared/logger/logger";

// Mock commonLogger
jest.mock("../../../../src/shared/logger/logger", () => ({
  commonLogger: {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("ErrorManager", () => {
  let mockContext: ExtensionContext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ExtensionContext
    mockContext = {
      simpleTaskCompletionEmitter: {
        fire: jest.fn(),
      },
    } as any;
  });

  describe("throw", () => {
    it("should throw error with message", () => {
      const manager = new ErrorManager();

      expect(() => {
        manager.throw("Test error");
      }).toThrow("Test error");
    });

    it("should log error before throwing", () => {
      const manager = new ErrorManager();

      try {
        manager.throw("Error message");
      } catch (e) {
        // Expected
      }

      expect(commonLogger.error).toHaveBeenCalledWith("Error message", undefined);
    });

    it("should log error with context before throwing", () => {
      const manager = new ErrorManager();
      const errorContext = { command: "bazel", details: { target: "MyApp" } };

      try {
        manager.throw("Build failed", errorContext);
      } catch (e) {
        // Expected
      }

      expect(commonLogger.error).toHaveBeenCalledWith("Build failed", errorContext);
    });

    it("should fire MCP completion event when context is provided", () => {
      const manager = new ErrorManager(mockContext);

      try {
        manager.throw("Error with context");
      } catch (e) {
        // Expected
      }

      expect(mockContext.simpleTaskCompletionEmitter.fire).toHaveBeenCalled();
    });

    it("should not fire MCP completion event when context is not provided", () => {
      const manager = new ErrorManager();

      try {
        manager.throw("Error without context");
      } catch (e) {
        // Expected
      }

      // Should not throw when no context
      expect(() => manager.throw("test")).toThrow();
    });
  });

  describe("handleNoTargetSelected", () => {
    it("should throw with specific message", () => {
      const manager = new ErrorManager();

      expect(() => {
        manager.handleNoTargetSelected();
      }).toThrow("No Bazel target selected. Please select a target from the BAZEL TARGETS tree view first.");
    });

    it("should log with command context", () => {
      const manager = new ErrorManager();

      try {
        manager.handleNoTargetSelected();
      } catch (e) {
        // Expected
      }

      expect(commonLogger.error).toHaveBeenCalledWith(
        "No Bazel target selected. Please select a target from the BAZEL TARGETS tree view first.",
        { command: "bazel" },
      );
    });

    it("should fire MCP event when context provided", () => {
      const manager = new ErrorManager(mockContext);

      try {
        manager.handleNoTargetSelected();
      } catch (e) {
        // Expected
      }

      expect(mockContext.simpleTaskCompletionEmitter.fire).toHaveBeenCalled();
    });
  });

  describe("handleNotTestTarget", () => {
    it("should throw with target name in message", () => {
      const manager = new ErrorManager();

      expect(() => {
        manager.handleNotTestTarget("MyLibrary");
      }).toThrow('Target "MyLibrary" is not a test target');
    });

    it("should log with command and details context", () => {
      const manager = new ErrorManager();

      try {
        manager.handleNotTestTarget("MyLibrary");
      } catch (e) {
        // Expected
      }

      expect(commonLogger.error).toHaveBeenCalledWith('Target "MyLibrary" is not a test target', {
        command: "bazel.test",
        details: { targetName: "MyLibrary" },
      });
    });
  });

  describe("handleNotRunnableTarget", () => {
    it("should throw with target name in message", () => {
      const manager = new ErrorManager();

      expect(() => {
        manager.handleNotRunnableTarget("TestTarget");
      }).toThrow('Target "TestTarget" is not a runnable target (must be a binary/app)');
    });

    it("should log with command and details context", () => {
      const manager = new ErrorManager();

      try {
        manager.handleNotRunnableTarget("TestTarget");
      } catch (e) {
        // Expected
      }

      expect(commonLogger.error).toHaveBeenCalledWith(
        'Target "TestTarget" is not a runnable target (must be a binary/app)',
        {
          command: "bazel.run",
          details: { targetName: "TestTarget" },
        },
      );
    });
  });

  describe("handleValidationError", () => {
    it("should throw validation error with message", () => {
      const manager = new ErrorManager();

      expect(() => {
        manager.handleValidationError("Invalid configuration");
      }).toThrow("Validation error: Invalid configuration");
    });

    it("should include details in context", () => {
      const manager = new ErrorManager();
      const details = { field: "buildMode", value: "invalid" };

      try {
        manager.handleValidationError("Invalid value", details);
      } catch (e) {
        // Expected
      }

      expect(commonLogger.error).toHaveBeenCalledWith("Validation error: Invalid value", { details });
    });

    it("should work without details", () => {
      const manager = new ErrorManager();

      try {
        manager.handleValidationError("Simple validation error");
      } catch (e) {
        // Expected
      }

      expect(commonLogger.error).toHaveBeenCalledWith("Validation error: Simple validation error", {
        details: undefined,
      });
    });
  });

  describe("createErrorManager", () => {
    it("should create error manager without context", () => {
      const manager = createErrorManager();

      expect(manager).toBeInstanceOf(ErrorManager);
    });

    it("should create error manager with context", () => {
      const manager = createErrorManager(mockContext);

      expect(manager).toBeInstanceOf(ErrorManager);
    });

    it("should create functional error manager", () => {
      const manager = createErrorManager();

      expect(() => {
        manager.throw("Test from factory");
      }).toThrow("Test from factory");
    });
  });

  describe("integration scenarios", () => {
    it("should handle multiple errors in sequence with context", () => {
      const manager = new ErrorManager(mockContext);

      const errors = [
        () => manager.handleNoTargetSelected(),
        () => manager.handleNotTestTarget("LibA"),
        () => manager.handleNotRunnableTarget("LibB"),
        () => manager.handleValidationError("Invalid input"),
      ];

      for (const throwError of errors) {
        try {
          throwError();
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
        }
      }

      // Should fire MCP event for each error
      expect(mockContext.simpleTaskCompletionEmitter.fire).toHaveBeenCalledTimes(4);
    });

    it("should handle multiple errors without context", () => {
      const manager = new ErrorManager();

      const errors = [() => manager.handleNoTargetSelected(), () => manager.handleNotTestTarget("Target1")];

      for (const throwError of errors) {
        try {
          throwError();
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
        }
      }

      // Should log each error
      expect(commonLogger.error).toHaveBeenCalledTimes(2);
    });
  });

  describe("error manager with various contexts", () => {
    it("should work with undefined context", () => {
      const manager = new ErrorManager(undefined);

      expect(() => {
        manager.throw("Error");
      }).toThrow("Error");
    });

    it("should use same context across multiple calls", () => {
      const manager = new ErrorManager(mockContext);

      try {
        manager.handleNoTargetSelected();
      } catch (e) {
        // Expected
      }

      try {
        manager.handleNotTestTarget("Test");
      } catch (e) {
        // Expected
      }

      expect(mockContext.simpleTaskCompletionEmitter.fire).toHaveBeenCalledTimes(2);
    });
  });
});
