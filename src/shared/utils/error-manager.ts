import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../logger/logger.js";

/**
 * Centralized error manager for handling common error patterns
 * Errors are logged and thrown to be caught by extension-context wrapper
 * which shows dialog with "Open in console" action
 */
export class ErrorManager {
  constructor(private context?: ExtensionContext) {}

  /**
   * Log and throw error
   */
  throw(message: string, errorContext?: { command?: string; details?: any }): never {
    commonLogger.error(message, errorContext);

    // Fire completion event for MCP
    if (this.context) {
      this.context.simpleTaskCompletionEmitter.fire();
    }

    throw new Error(message);
  }

  // Convenience methods for common error patterns

  handleNoTargetSelected(): never {
    return this.throw("No Bazel target selected. Please select a target from the BAZEL TARGETS tree view first.", {
      command: "bazel",
    });
  }

  handleNotTestTarget(targetName: string): never {
    return this.throw(`Target "${targetName}" is not a test target`, {
      command: "bazel.test",
      details: { targetName },
    });
  }

  handleNotRunnableTarget(targetName: string): never {
    return this.throw(`Target "${targetName}" is not a runnable target (must be a binary/app)`, {
      command: "bazel.run",
      details: { targetName },
    });
  }

  handleValidationError(message: string, details?: any): never {
    return this.throw(`Validation error: ${message}`, { details });
  }
}

/**
 * Create an error manager instance
 */
export function createErrorManager(context?: ExtensionContext): ErrorManager {
  return new ErrorManager(context);
}
