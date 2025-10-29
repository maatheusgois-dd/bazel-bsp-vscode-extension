import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../logger/logger.js";

export interface ProgressStep {
  name: string;
  weight?: number; // Relative weight for progress calculation (default: 1)
}

export interface ProgressOptions {
  steps: readonly ProgressStep[];
  context: ExtensionContext;
  taskName?: string;
  cancellable?: boolean; // Whether the operation can be cancelled
}

/**
 * Error thrown when an operation is cancelled
 */
export class OperationCancelledError extends Error {
  constructor(message = "Operation cancelled by user") {
    super(message);
    this.name = "OperationCancelledError";
  }
}

/**
 * Progress Manager for tracking multi-step operations
 * Provides granular progress updates with step-by-step status
 */
export class ProgressManager {
  private steps: readonly ProgressStep[];
  private currentStepIndex: number = -1;
  private context: ExtensionContext;
  private taskName: string;
  private startTime: number;
  private stepStartTime: number = 0;
  private _cancelled: boolean = false;
  private cancellable: boolean;

  constructor(options: ProgressOptions) {
    this.steps = options.steps;
    this.context = options.context;
    this.taskName = options.taskName || "Operation";
    this.cancellable = options.cancellable ?? true; // Default to cancellable
    this.startTime = Date.now();
    
    // Register cancel callback with status bar
    if (this.cancellable) {
      this.context.progressStatusBar.registerCancelCallback(() => {
        this.cancel();
      });
    }
    
    commonLogger.log("Progress Manager initialized", {
      taskName: this.taskName,
      totalSteps: this.steps.length,
      steps: this.steps.map(s => s.name),
      cancellable: this.cancellable,
    });
  }

  /**
   * Start the next step in the process
   * @throws {OperationCancelledError} if the operation has been cancelled
   */
  nextStep(stepName?: string): void {
    // Check if operation was cancelled
    this.throwIfCancelled();

    // Log completion of previous step
    if (this.currentStepIndex >= 0) {
      const previousStep = this.steps[this.currentStepIndex];
      const stepDuration = Date.now() - this.stepStartTime;
      commonLogger.log("Step completed", {
        step: previousStep.name,
        duration: `${(stepDuration / 1000).toFixed(2)}s`,
      });
    }

    this.currentStepIndex++;
    this.stepStartTime = Date.now();

    const step = this.steps[this.currentStepIndex];
    if (!step) {
      commonLogger.warn("Attempted to advance beyond available steps");
      return;
    }

    // Verify step name matches if provided
    if (stepName && step.name !== stepName) {
      commonLogger.warn("Step name mismatch", {
        expected: stepName,
        actual: step.name,
      });
    }

    const progress = this.calculateProgress();
    const progressText = this.formatProgressText(step.name, progress);
    
    this.context.updateProgressStatus(progressText, this.cancellable);
    
    commonLogger.log("Step started", {
      step: step.name,
      stepNumber: this.currentStepIndex + 1,
      totalSteps: this.steps.length,
      progress: `${progress.toFixed(0)}%`,
    });
  }

  /**
   * Update current step with additional info
   * @throws {OperationCancelledError} if the operation has been cancelled
   */
  updateStep(detail: string): void {
    this.throwIfCancelled();

    if (this.currentStepIndex < 0) {
      return;
    }

    const step = this.steps[this.currentStepIndex];
    const progress = this.calculateProgress();
    const progressText = this.formatProgressText(`${step.name}: ${detail}`, progress);
    
    this.context.updateProgressStatus(progressText, this.cancellable);
  }

  /**
   * Mark current step as complete and update status
   */
  completeStep(): void {
    if (this.currentStepIndex < 0) {
      return;
    }

    const step = this.steps[this.currentStepIndex];
    const stepDuration = Date.now() - this.stepStartTime;
    
    commonLogger.log("Step marked complete", {
      step: step.name,
      duration: `${(stepDuration / 1000).toFixed(2)}s`,
    });
  }

  /**
   * Mark entire operation as complete
   */
  complete(): void {
    const totalDuration = Date.now() - this.startTime;
    
    commonLogger.log("Progress Manager completed", {
      taskName: this.taskName,
      totalDuration: `${(totalDuration / 1000).toFixed(2)}s`,
      stepsCompleted: this.currentStepIndex + 1,
      totalSteps: this.steps.length,
    });
  }

  /**
   * Calculate overall progress percentage
   */
  private calculateProgress(): number {
    if (this.steps.length === 0) return 0;
    
    // Calculate total weight
    const totalWeight = this.steps.reduce((sum, step) => sum + (step.weight || 1), 0);
    
    // Calculate completed weight (all previous steps + partial current step)
    let completedWeight = 0;
    for (let i = 0; i < this.currentStepIndex; i++) {
      completedWeight += this.steps[i].weight || 1;
    }
    
    // Add 50% of current step weight (assuming we're midway through it)
    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      completedWeight += (this.steps[this.currentStepIndex].weight || 1) * 0.5;
    }
    
    return Math.min(100, (completedWeight / totalWeight) * 100);
  }

  /**
   * Format progress text for status bar
   */
  private formatProgressText(stepName: string, progress: number): string {
    const stepNum = this.currentStepIndex + 1;
    const totalSteps = this.steps.length;
    
    return `[${progress.toFixed(0)}%] ${stepName} (${stepNum}/${totalSteps})`;
  }

  /**
   * Get current step information
   */
  getCurrentStep(): { name: string; index: number; total: number } | null {
    if (this.currentStepIndex < 0 || this.currentStepIndex >= this.steps.length) {
      return null;
    }

    return {
      name: this.steps[this.currentStepIndex].name,
      index: this.currentStepIndex,
      total: this.steps.length,
    };
  }

  /**
   * Get elapsed time for current step
   */
  getStepElapsedTime(): number {
    if (this.currentStepIndex < 0) return 0;
    return Date.now() - this.stepStartTime;
  }

  /**
   * Get total elapsed time
   */
  getTotalElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Cancel the current operation
   */
  cancel(): void {
    if (!this.cancellable) {
      commonLogger.warn("Attempted to cancel non-cancellable operation", {
        taskName: this.taskName,
      });
      return;
    }

    this._cancelled = true;
    commonLogger.log("Operation cancelled", {
      taskName: this.taskName,
      currentStep: this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex].name : "none",
    });
  }

  /**
   * Check if the operation has been cancelled
   */
  isCancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Throw an error if the operation has been cancelled
   * @throws {OperationCancelledError} if cancelled
   */
  throwIfCancelled(): void {
    if (this._cancelled) {
      throw new OperationCancelledError(`${this.taskName} was cancelled`);
    }
  }
}

/**
 * Predefined progress steps for common operations
 */
export const ProgressSteps = {
  BUILD: [
    { name: "Resolving dependencies", weight: 1 },
    { name: "Compiling sources", weight: 3 },
    { name: "Linking binaries", weight: 2 },
    { name: "Code signing", weight: 1 },
    { name: "Finalizing build", weight: 1 },
  ],
  
  DEBUG: [
    { name: "Building with debug symbols", weight: 3 },
    { name: "Locating app bundle", weight: 1 },
    { name: "Preparing app", weight: 1 },
    { name: "Launching app", weight: 2 },
    { name: "Starting debugserver", weight: 1 },
    { name: "Attaching debugger", weight: 2 },
  ],
  
  RUN: [
    { name: "Building target", weight: 3 },
    { name: "Preparing destination", weight: 1 },
    { name: "Installing app", weight: 2 },
    { name: "Launching app", weight: 1 },
  ],
  
  TEST: [
    { name: "Building test target", weight: 2 },
    { name: "Preparing test environment", weight: 1 },
    { name: "Running tests", weight: 4 },
    { name: "Collecting results", weight: 1 },
  ],
  
  INSTALL: [
    { name: "Locating app bundle", weight: 1 },
    { name: "Validating bundle", weight: 1 },
    { name: "Connecting to device", weight: 1 },
    { name: "Installing app", weight: 3 },
    { name: "Verifying installation", weight: 1 },
  ],
} as const;

