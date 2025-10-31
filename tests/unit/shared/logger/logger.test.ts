import * as vscode from "vscode";
import { ExtensionError } from "../../../../src/shared/errors/errors";
import { Logger } from "../../../../src/shared/logger/logger";

// Mock vscode
jest.mock("vscode");

describe("Logger", () => {
  let logger: Logger;
  let mockOutputChannel: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOutputChannel = {
      appendLine: jest.fn(),
      show: jest.fn(),
    };

    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue("info"),
    });

    logger = new Logger({ name: "Test" });
  });

  describe("constructor", () => {
    it("should create output channel with name", () => {
      expect(vscode.window.createOutputChannel).toHaveBeenCalledWith("swiftbazel: Test");
    });

    it("should initialize with empty messages", () => {
      expect(logger.last(10)).toEqual([]);
    });
  });

  describe("log level management", () => {
    it("should set log level from string", () => {
      Logger.setLevel("debug");
      expect(Logger.level).toBe(0); // debug = 0

      Logger.setLevel("info");
      expect(Logger.level).toBe(1); // info = 1

      Logger.setLevel("warning");
      expect(Logger.level).toBe(2); // warning = 2

      Logger.setLevel("error");
      expect(Logger.level).toBe(3); // error = 3
    });

    it("should handle unknown log level strings", () => {
      Logger.setLevel("unknown");
      expect(Logger.level).toBe(1); // defaults to info
    });

    it("should set log level from enum", () => {
      Logger.setLevel(0); // debug
      expect(Logger.level).toBe(0);

      Logger.setLevel(2); // warning
      expect(Logger.level).toBe(2);
    });

    it("should setup log level from workspace config", () => {
      const mockConfig = {
        get: jest.fn().mockReturnValue("debug"),
      };
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

      Logger.setup();

      expect(mockConfig.get).toHaveBeenCalledWith("system.logLevel");
    });
  });

  describe("logging methods", () => {
    beforeEach(() => {
      Logger.setLevel("debug"); // Enable all levels for testing
    });

    it("should log debug messages", () => {
      logger.debug("Debug message");

      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain("level: DEBUG");
      expect(call).toContain('message: "Debug message"');
    });

    it("should log info messages", () => {
      logger.log("Info message");

      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain("level: INFO");
      expect(call).toContain('message: "Info message"');
    });

    it("should log warning messages", () => {
      logger.warn("Warning message");

      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain("level: WARNING");
      expect(call).toContain('message: "Warning message"');
    });

    it("should log error messages", () => {
      logger.error("Error message");

      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain("level: ERROR");
      expect(call).toContain('message: "Error message"');
    });

    it("should include context in log messages", () => {
      logger.log("Message with context", { key: "value", count: 42 });

      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain("context:");
      expect(call).toContain("key:");
      expect(call).toContain("count:");
    });

    it("should include error stack traces", () => {
      const error = new Error("Test error");
      logger.error("Error occurred", { error });

      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain("stackTrace:");
    });

    it("should include ExtensionError context", () => {
      const error = new ExtensionError("Extension error", {
        context: { step: "build" },
      });
      logger.error("Extension error occurred", { error });

      const call = mockOutputChannel.appendLine.mock.calls[0][0];
      expect(call).toContain("errorContext:");
    });
  });

  describe("log level filtering", () => {
    it("should filter messages below current level", () => {
      Logger.setLevel("error");

      logger.debug("Debug");
      logger.log("Info");
      logger.warn("Warning");
      logger.error("Error");

      // Only error should be logged
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    });

    it("should log all messages when level is debug", () => {
      Logger.setLevel("debug");

      logger.debug("Debug");
      logger.log("Info");
      logger.warn("Warning");
      logger.error("Error");

      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(4);
    });

    it("should log info and above when level is info", () => {
      Logger.setLevel("info");

      logger.debug("Debug");
      logger.log("Info");
      logger.warn("Warning");
      logger.error("Error");

      // debug filtered out
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(3);
    });
  });

  describe("show", () => {
    it("should show output channel", () => {
      logger.show();

      expect(mockOutputChannel.show).toHaveBeenCalled();
    });
  });

  describe("last", () => {
    beforeEach(() => {
      Logger.setLevel("debug");
    });

    it("should return last N messages", () => {
      logger.log("Message 1");
      logger.log("Message 2");
      logger.log("Message 3");

      const last2 = logger.last(2);

      expect(last2).toHaveLength(2);
      expect(last2[0].message).toBe("Message 2");
      expect(last2[1].message).toBe("Message 3");
    });

    it("should return all messages when N is larger than buffer", () => {
      logger.log("Message 1");
      logger.log("Message 2");

      const last10 = logger.last(10);

      expect(last10).toHaveLength(2);
    });

    it("should return empty array when no messages", () => {
      const last = logger.last(5);

      expect(last).toEqual([]);
    });
  });

  describe("lastFormatted", () => {
    beforeEach(() => {
      Logger.setLevel("debug");
    });

    it("should return formatted last N messages", () => {
      logger.log("Message 1");
      logger.log("Message 2");

      const formatted = logger.lastFormatted(2);

      expect(formatted).toContain("Message 1");
      expect(formatted).toContain("Message 2");
      expect(formatted).toContain("---");
    });

    it("should join multiple messages with newlines", () => {
      logger.log("First");
      logger.log("Second");

      const formatted = logger.lastFormatted(2);

      const parts = formatted.split("\n");
      expect(parts.length).toBeGreaterThan(2);
    });
  });

  describe("message buffer management", () => {
    beforeEach(() => {
      Logger.setLevel("debug");
    });

    it("should maintain buffer with max size", () => {
      // Log more than max (1000) messages
      for (let i = 0; i < 1100; i++) {
        logger.log(`Message ${i}`);
      }

      const all = logger.last(2000);

      // Should only keep last 1000
      expect(all.length).toBeLessThanOrEqual(1000);
    });

    it("should keep most recent messages when buffer is full", () => {
      // Fill buffer beyond max
      for (let i = 0; i < 1100; i++) {
        logger.log(`Message ${i}`);
      }

      const last = logger.last(1);

      // Should have the latest message
      expect(last[0].message).toBe("Message 1099");
    });
  });

  describe("format output", () => {
    beforeEach(() => {
      Logger.setLevel("debug");
    });

    it("should format messages as YAML-like structure", () => {
      logger.log("Test");

      const call = mockOutputChannel.appendLine.mock.calls[0][0];

      expect(call).toContain("---");
      expect(call).toContain("time:");
      expect(call).toContain("level:");
      expect(call).toContain("message:");
    });

    it("should include timestamp in ISO format", () => {
      logger.log("Test");

      const call = mockOutputChannel.appendLine.mock.calls[0][0];

      // Check for ISO timestamp pattern
      expect(call).toMatch(/time: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should handle null and undefined in context", () => {
      logger.log("Test", { nullValue: null, undefinedValue: undefined });

      const call = mockOutputChannel.appendLine.mock.calls[0][0];

      expect(call).toContain("nullValue: null");
      expect(call).toContain("undefinedValue: null");
    });

    it("should handle objects in context", () => {
      logger.log("Test", { config: { enabled: true, count: 5 } });

      const call = mockOutputChannel.appendLine.mock.calls[0][0];

      expect(call).toContain("config:");
    });

    it("should handle strings in context", () => {
      logger.log("Test", { description: "context description" });

      const call = mockOutputChannel.appendLine.mock.calls[0][0];

      expect(call).toContain("description:");
    });
  });

  describe("integration scenarios", () => {
    beforeEach(() => {
      Logger.setLevel("info");
    });

    it("should handle real-world logging scenario", () => {
      logger.log("Starting operation", { operation: "build" });
      logger.warn("Warning detected", { code: 123 });
      logger.error("Operation failed", {
        error: new Error("Build error"),
      });

      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(3);
    });

    it("should maintain separate loggers independently", () => {
      const logger2 = new Logger({ name: "Second" });

      logger.log("Logger 1");
      logger2.log("Logger 2");

      expect(logger.last(10)).toHaveLength(1);
      expect(logger2.last(10)).toHaveLength(1);
      expect(logger.last(1)[0].message).toBe("Logger 1");
      expect(logger2.last(1)[0].message).toBe("Logger 2");
    });
  });
});
