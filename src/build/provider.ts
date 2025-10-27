import * as vscode from "vscode";
import type { ExtensionContext } from "../common/commands";
import { ExtensionError } from "../common/errors";
import {
  type TaskTerminal,
  TaskTerminalV1,
  TaskTerminalV1Parent,
  TaskTerminalV2,
  getTaskExecutorName,
} from "../common/tasks";

interface TaskDefinition extends vscode.TaskDefinition {
  type: string;
  action: string;
  scheme?: string;
  configuration?: string;
  workspace?: string;
  simulator?: string;
  destinationId?: string;
  destination?: string;
  launchArgs?: string[];
  launchEnv?: { [key: string]: string };
}

class ActionDispatcher {
  context: ExtensionContext;
  constructor(context: ExtensionContext) {
    this.context = context;
  }

  async do(terminal: TaskTerminal, definition: TaskDefinition) {
    const action = definition.action;

    // All Xcode build actions are deprecated - use Bazel commands instead
    const deprecatedActions = [
      "launch",
      "build",
      "run",
      "clean",
      "test",
      "debugging-launch",
      "debugging-build",
      "debugging-run",
      "resolve-dependencies",
      "generate-buildserver",
    ];

    if (deprecatedActions.includes(action)) {
      throw new ExtensionError(
        `Task action "${action}" is not supported in Bazel-only mode. Use Bazel commands instead: swiftbazel.bazel.build, swiftbazel.bazel.run, swiftbazel.bazel.test, or swiftbazel.bazel.debug`,
      );
    }

    // Bazel-specific actions would go here in the future
    if (action === "bazel-build") {
      terminal.write("Use Command Palette: swiftbazel.bazel.build instead\n");
      return;
    }

    throw new ExtensionError(`Unknown task action: ${action}`);
  }
}

export class BazelBuildTaskProvider implements vscode.TaskProvider {
  public type = "swiftbazel";
  context: ExtensionContext;
  dispatcher: ActionDispatcher;

  constructor(context: ExtensionContext) {
    this.context = context;
    this.dispatcher = new ActionDispatcher(context);
  }

  async provideTasks(token: vscode.CancellationToken): Promise<vscode.Task[]> {
    // Return empty array - users should use command palette commands instead
    // This prevents old tasks.json configurations from breaking
    return [];
  }

  async resolveTask(task: vscode.Task, token: vscode.CancellationToken): Promise<vscode.Task | undefined> {
    const definition = task.definition as TaskDefinition;

    // Return the same task with custom execution that shows deprecation message
    return this.getTask({
      name: task.name || definition.action,
      details: "Use Command Palette Bazel commands instead",
      definition: definition,
    });
  }

  private async dispatchTask(terminal: TaskTerminal, definition: TaskDefinition) {
    await this.dispatcher.do(terminal, definition);
  }

  private getTask(options: {
    name: string;
    details?: string;
    definition: TaskDefinition;
    isBackground?: boolean;
  }): vscode.Task {
    const task = new vscode.Task(
      options.definition,
      vscode.TaskScope.Workspace,
      options.name,
      "swiftbazel",
      new vscode.CustomExecution(async (definition: vscode.TaskDefinition) => {
        const _definition = definition as TaskDefinition;
        const executorName = getTaskExecutorName();
        switch (executorName) {
          case "v1": {
            const terminal = new TaskTerminalV1(this.context, {
              name: options.name,
              source: "swiftbazel",
            });
            await this.dispatchTask(terminal, _definition);
            return new TaskTerminalV1Parent();
          }
          case "v2": {
            return new TaskTerminalV2(this.context, {
              callback: async (terminal) => {
                await this.dispatchTask(terminal, _definition);
              },
            });
          }
          default:
            throw new Error(`Task executor ${executorName} is not supported`);
        }
      }),
    );

    if (options.details) {
      task.detail = options.details;
    }

    if (options.isBackground) {
      task.isBackground = true;
    }

    return task;
  }
}
