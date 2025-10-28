import * as vscode from "vscode";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../logger/logger.js";

/**
 * Centralized error manager for handling errors consistently
 */
export class ErrorManager {
  constructor(private context?: ExtensionContext) {}

  /**
   * Handle an error by:
   * 1. Logging the error
   * 2. Firing completion event (for MCP)
   * 3. Throwing the error for proper propagation
   * Note: Error will be shown to user by the command wrapper in extension-context.ts
   */
  handleError(message: string, context?: { command?: string; details?: any }): never {
    // Log error
    commonLogger.error(message, context);

    // Fire completion event for MCP (so it doesn't hang)
    if (this.context) {
      this.context.simpleTaskCompletionEmitter.fire();
    }

    // Throw error for proper error propagation
    // The error will be caught and shown by the command wrapper
    throw new Error(message);
  }

  /**
   * Handle missing target error
   */
  handleNoTargetSelected(): never {
    return this.handleError(
      "No Bazel target selected. Please select a target from the BAZEL TARGETS tree view first.",
      { command: "bazel" }
    );
  }

  /**
   * Handle invalid target type error
   */
  handleInvalidTargetType(targetName: string, expectedType: string, actualType: string): never {
    return this.handleError(
      `Target "${targetName}" is not a ${expectedType} target (type: ${actualType})`,
      { command: "bazel", details: { targetName, expectedType, actualType } }
    );
  }

  /**
   * Handle test target validation error
   */
  handleNotTestTarget(targetName: string): never {
    return this.handleError(
      `Target "${targetName}" is not a test target`,
      { command: "bazel.test", details: { targetName } }
    );
  }

  /**
   * Handle runnable target validation error
   */
  handleNotRunnableTarget(targetName: string): never {
    return this.handleError(
      `Target "${targetName}" is not a runnable target (must be a binary/app)`,
      { command: "bazel.run", details: { targetName } }
    );
  }

  /**
   * Handle generic command error
   */
  handleCommandError(commandName: string, error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return this.handleError(
      `Error executing ${commandName}: ${errorMessage}`,
      { command: commandName, details: error }
    );
  }
}

/**
 * Create an error manager instance
 */
export function createErrorManager(context?: ExtensionContext): ErrorManager {
  return new ErrorManager(context);
}

