import { ExecBaseError, ExecError, ExtensionError, TaskError } from "../../../../src/shared/errors/errors";

describe("Error Classes", () => {
  describe("ExtensionError", () => {
    it("should create error with message only", () => {
      const error = new ExtensionError("Something went wrong");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ExtensionError);
      expect(error.message).toBe("Something went wrong");
      expect(error.name).toBe("Error"); // Default Error name
    });

    it("should create error with context", () => {
      const error = new ExtensionError("Failed to process", {
        context: { fileId: "123", userId: "456" },
      });

      expect(error.message).toBe("Failed to process");
      expect(error.options?.context).toEqual({ fileId: "123", userId: "456" });
    });

    it("should create error with actions", () => {
      const mockCallback = jest.fn();
      const actions = [
        { label: "Retry", callback: mockCallback },
        { label: "Cancel", callback: jest.fn() },
      ];

      const error = new ExtensionError("Operation failed", { actions });

      expect(error.options?.actions).toEqual(actions);
      expect(error.options?.actions?.[0].label).toBe("Retry");
    });

    it("should create error with both context and actions", () => {
      const error = new ExtensionError("Complex error", {
        context: { step: "build", target: "MyApp" },
        actions: [{ label: "Open Logs", callback: jest.fn() }],
      });

      expect(error.message).toBe("Complex error");
      expect(error.options?.context).toEqual({ step: "build", target: "MyApp" });
      expect(error.options?.actions).toHaveLength(1);
    });

    it("should preserve error stack trace", () => {
      const error = new ExtensionError("Error with stack");

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("Error"); // Stack trace contains error info
    });

    it("should be catchable as Error", () => {
      try {
        throw new ExtensionError("Test error");
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(ExtensionError);
        if (e instanceof ExtensionError) {
          expect(e.message).toBe("Test error");
        }
      }
    });
  });

  describe("TaskError", () => {
    it("should create task error with basic info", () => {
      const error = new TaskError("Task failed", {
        name: "Build Task",
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ExtensionError);
      expect(error).toBeInstanceOf(TaskError);
      expect(error.message).toBe("Task failed");
      expect(error.options?.context?.name).toBe("Build Task");
    });

    it("should include source in context", () => {
      const error = new TaskError("Task error", {
        name: "Test Task",
        soruce: "bazelbsp",
      });

      expect(error.options?.context?.soruce).toBe("bazelbsp");
    });

    it("should include command details", () => {
      const error = new TaskError("Command failed", {
        name: "Build",
        command: "bazel",
        args: ["build", "//App:MyApp"],
      });

      expect(error.options?.context?.command).toBe("bazel");
      expect(error.options?.context?.args).toEqual(["build", "//App:MyApp"]);
    });

    it("should include error code", () => {
      const error = new TaskError("Non-zero exit", {
        name: "Build",
        errorCode: 1,
      });

      expect(error.options?.context?.errorCode).toBe(1);
    });

    it("should create task error with all optional fields", () => {
      const error = new TaskError("Complete task error", {
        name: "Full Task",
        soruce: "bazelbsp",
        command: "xcrun",
        args: ["simctl", "list"],
        errorCode: 127,
      });

      expect(error.options?.context).toEqual({
        name: "Full Task",
        soruce: "bazelbsp",
        command: "xcrun",
        args: ["simctl", "list"],
        errorCode: 127,
      });
    });
  });

  describe("ExecBaseError", () => {
    it("should create exec base error with required context", () => {
      const error = new ExecBaseError("Command execution failed", {
        errorMessage: "Failed",
        command: "test",
        args: [],
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ExtensionError);
      expect(error).toBeInstanceOf(ExecBaseError);
      expect(error.message).toBe("Command execution failed");
    });

    it("should include error message in context", () => {
      const error = new ExecBaseError("Exec failed", {
        errorMessage: "Permission denied",
        command: "chmod",
        args: ["+x", "file"],
      });

      expect(error.options?.context?.errorMessage).toBe("Permission denied");
    });

    it("should include command execution details", () => {
      const error = new ExecBaseError("Failed to run", {
        errorMessage: "Build failed",
        command: "bazel",
        args: ["build"],
        cwd: "/workspace",
        stderr: "Error output",
      });

      expect(error.options?.context?.command).toBe("bazel");
      expect(error.options?.context?.args).toEqual(["build"]);
      expect(error.options?.context?.cwd).toBe("/workspace");
      expect(error.options?.context?.stderr).toBe("Error output");
      expect(error.options?.context?.errorMessage).toBe("Build failed");
    });
  });

  describe("ExecError", () => {
    it("should create exec error with full context", () => {
      const error = new ExecError("Command failed", {
        stderr: "Error: command not found",
        command: "unknown-command",
        args: ["arg1"],
        cwd: "/path",
        errorMessage: "Command not found",
      });

      expect(error).toBeInstanceOf(ExecBaseError);
      expect(error.options?.context).toEqual({
        stderr: "Error: command not found",
        command: "unknown-command",
        args: ["arg1"],
        cwd: "/path",
        errorMessage: "Command not found",
      });
    });

    it("should extend ExecBaseError", () => {
      const error = new ExecError("Error", {
        errorMessage: "Error msg",
        command: "test",
        args: [],
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ExtensionError);
      expect(error).toBeInstanceOf(ExecBaseError);
      expect(error).toBeInstanceOf(ExecError);
    });
  });

  describe("Error hierarchy", () => {
    it("should maintain proper instanceof relationships", () => {
      const extensionError = new ExtensionError("ext");
      const taskError = new TaskError("task", { name: "t" });
      const execBaseError = new ExecBaseError("exec", {
        errorMessage: "error",
        command: "test",
        args: [],
      });
      const execError = new ExecError("cmd", {
        errorMessage: "error",
        command: "test",
        args: [],
      });

      // All extend ExtensionError
      expect(extensionError).toBeInstanceOf(ExtensionError);
      expect(taskError).toBeInstanceOf(ExtensionError);
      expect(execBaseError).toBeInstanceOf(ExtensionError);
      expect(execError).toBeInstanceOf(ExtensionError);

      // TaskError doesn't extend ExecBaseError
      expect(taskError).not.toBeInstanceOf(ExecBaseError);

      // ExecError extends ExecBaseError
      expect(execError).toBeInstanceOf(ExecBaseError);

      // ExecBaseError doesn't extend TaskError
      expect(execBaseError).not.toBeInstanceOf(TaskError);
    });
  });

  describe("Error usage scenarios", () => {
    it("should be usable in try-catch blocks", () => {
      const errors = [
        new ExtensionError("ext error"),
        new TaskError("task error", { name: "task" }),
        new ExecBaseError("exec error", {
          errorMessage: "error",
          command: "test",
          args: [],
        }),
        new ExecError("cmd error", {
          errorMessage: "error",
          command: "test",
          args: [],
        }),
      ];

      for (const errorToThrow of errors) {
        try {
          throw errorToThrow;
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
          expect(e).toBeInstanceOf(ExtensionError);
        }
      }
    });

    it("should allow actions to be executed", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const error = new ExtensionError("Error with actions", {
        actions: [
          { label: "Action 1", callback: callback1 },
          { label: "Action 2", callback: callback2 },
        ],
      });

      // Simulate action execution
      error.options?.actions?.[0].callback();
      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();

      error.options?.actions?.[1].callback();
      expect(callback2).toHaveBeenCalled();
    });

    it("should support undefined options", () => {
      const error = new ExtensionError("Simple error");

      expect(error.options).toBeUndefined();
    });
  });
});
