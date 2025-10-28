import * as vscode from "vscode";

import { BuildManager } from "./application/services/build-manager.service.js";
import { DestinationsManager } from "./application/services/destination-manager.service.js";
import { DevicesManager } from "./application/services/device-manager.service.js";
import { SimulatorsManager } from "./application/services/simulator-manager.service.js";
import { ToolsManager } from "./application/services/tools-manager.service.js";
// Application Layer
import {
  bazelBuildCommand,
  bazelDebugCommand,
  bazelRunCommand,
  bazelTestCommand,
  buildSelectedBazelTargetCommand,
  diagnoseBuildSetupCommand,
  runSelectedBazelTargetCommand,
  selectBazelTargetCommand,
  selectBazelWorkspaceCommand,
  testSelectedBazelTargetCommand,
} from "./application/use-cases/bazel/bazel-commands.use-case.js";
import { getAppPathCommand } from "./application/use-cases/bazel/debug-commands.use-case.js";
import {
  removeRecentDestinationCommand,
  selectDestinationForBuildCommand,
} from "./application/use-cases/destination/destination-commands.use-case.js";
import {
  openSimulatorCommand,
  removeSimulatorCacheCommand,
  startSimulatorCommand,
  stopSimulatorCommand,
  takeSimulatorScreenshotCommand,
} from "./application/use-cases/destination/simulator-commands.use-case.js";
import { openTerminalPanel, resetswiftbazelCache } from "./application/use-cases/system/system-commands.use-case.js";
import { installToolCommand, openDocumentationCommand } from "./application/use-cases/tools/tools-commands.use-case.js";

import { createMcpServer } from "./infrastructure/mcp/mcp-server.js";
import type { McpServerInstance } from "./infrastructure/mcp/types.js";
import { registerDebugConfigurationProvider } from "./infrastructure/vscode/debug/debug-provider.js";
// Infrastructure Layer
import { ExtensionContext } from "./infrastructure/vscode/extension-context.js";
import { BazelBuildTaskProvider } from "./infrastructure/vscode/task-provider.js";

// Presentation Layer
import { BazelTargetStatusBar } from "./presentation/status-bars/build-status-bar.js";
import { DestinationStatusBar } from "./presentation/status-bars/destination-status-bar.js";
import { ProgressStatusBar } from "./presentation/status-bars/progress-status-bar.js";
import { BazelTreeProvider } from "./presentation/tree-providers/bazel-tree.provider.js";
import { DestinationsTreeProvider } from "./presentation/tree-providers/destination-tree.provider.js";
import { ToolTreeProvider } from "./presentation/tree-providers/tools-tree.provider.js";

// Shared Layer
import { Logger, commonLogger } from "./shared/logger/logger.js";

// Keep track of the server instance
let mcpInstance: McpServerInstance | null = null;

export async function activate(context: vscode.ExtensionContext) {
  // 🪵🪓
  Logger.setup();

  try {
    // Check if we have a workspace open
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      // No workspace open, just register minimal commands and exit
      commonLogger.warn("No workspace folder found. Limited functionality available.");
      return;
    }

    const buildManager = new BuildManager();
    const devicesManager = new DevicesManager();
    const simulatorsManager = new SimulatorsManager();
    const destinationsManager = new DestinationsManager({
      simulatorsManager: simulatorsManager,
      devicesManager: devicesManager,
    });
    const toolsManager = new ToolsManager();
    const progressStatusBar = new ProgressStatusBar();

    // Main context object 🌍
    const _context = new ExtensionContext({
      context: context,
      destinationsManager: destinationsManager,
      buildManager: buildManager,
      toolsManager: toolsManager,
      progressStatusBar: progressStatusBar,
    });

    // Here is circular dependency, but I don't care
    // Initialize buildManager with proper cache loading
    await buildManager.initializeWithContext(_context);
    devicesManager.context = _context;
    destinationsManager.context = _context;
    progressStatusBar.context = _context;

    // Trees 🎄
    const toolsTreeProvider = new ToolTreeProvider({
      manager: toolsManager,
    });
    const destinationsTreeProvider = new DestinationsTreeProvider({
      manager: destinationsManager,
    });
    const bazelQueryTreeProvider = new BazelTreeProvider(buildManager);

    // Shortcut to push disposable to context.subscriptions
    const d = _context.disposable.bind(_context);
    const command = _context.registerCommand.bind(_context);
    const tree = _context.registerTreeDataProvider.bind(_context);

    const buildTaskProvider = new BazelBuildTaskProvider(_context);

    // Tasks
    d(vscode.tasks.registerTaskProvider(buildTaskProvider.type, buildTaskProvider));

    // Build

    const bazelTargetStatusBar = new BazelTargetStatusBar({
      context: _context,
    });
    d(bazelTargetStatusBar);

    // Connect status bar to build manager for updates
    buildManager.on("selectedBazelTargetUpdated", () => {
      bazelTargetStatusBar.update();
    });

    d(tree("swiftbazel.view.bazelQuery", bazelQueryTreeProvider));
    d(command("swiftbazel.build.refreshView", async () => buildManager.refresh()));
    d(command("swiftbazel.build.selectBazelWorkspace", selectBazelWorkspaceCommand));
    d(command("swiftbazel.build.diagnoseSetup", diagnoseBuildSetupCommand));
    d(command("swiftbazel.bazel.build", bazelBuildCommand));
    d(command("swiftbazel.bazel.test", bazelTestCommand));
    d(command("swiftbazel.bazel.run", bazelRunCommand));
    d(command("swiftbazel.bazel.debug", bazelDebugCommand));
    d(
      command("swiftbazel.bazel.selectTarget", (context, targetInfo) =>
        selectBazelTargetCommand(context, targetInfo, bazelQueryTreeProvider),
      ),
    );
    d(
      command("swiftbazel.bazel.buildSelected", () =>
        buildSelectedBazelTargetCommand(_context, bazelQueryTreeProvider),
      ),
    );
    d(command("swiftbazel.bazel.testSelected", () => testSelectedBazelTargetCommand(_context, bazelQueryTreeProvider)));
    d(command("swiftbazel.bazel.runSelected", () => runSelectedBazelTargetCommand(_context, bazelQueryTreeProvider)));

    // Bazel query tree commands
    d(command("swiftbazel.bazelQuery.refresh", async () => bazelQueryTreeProvider.refresh()));
    d(command("swiftbazel.bazelQuery.clearRecents", async () => bazelQueryTreeProvider.clearRecents()));

    // Debugging
    d(registerDebugConfigurationProvider(_context));
    d(command("swiftbazel.debugger.getAppPath", getAppPathCommand));

    // Simulators
    d(command("swiftbazel.simulators.refresh", async () => await destinationsManager.refreshSimulators()));
    d(command("swiftbazel.simulators.openSimulator", openSimulatorCommand));
    d(command("swiftbazel.simulators.removeCache", removeSimulatorCacheCommand));
    d(command("swiftbazel.simulators.start", startSimulatorCommand));
    d(command("swiftbazel.simulators.stop", stopSimulatorCommand));
    d(command("swiftbazel.simulators.screenshot", takeSimulatorScreenshotCommand));

    // // Devices
    d(command("swiftbazel.devices.refresh", async () => await destinationsManager.refreshDevices()));

    // Desintations
    const destinationBar = new DestinationStatusBar({
      context: _context,
    });
    d(destinationBar);
    d(command("swiftbazel.destinations.select", selectDestinationForBuildCommand));
    d(command("swiftbazel.destinations.removeRecent", removeRecentDestinationCommand));
    d(tree("swiftbazel.destinations.view", destinationsTreeProvider));

    // Tools
    d(tree("swiftbazel.tools.view", toolsTreeProvider));
    d(command("swiftbazel.tools.install", installToolCommand));
    d(command("swiftbazel.tools.refresh", async () => toolsManager.refresh()));
    d(command("swiftbazel.tools.documentation", openDocumentationCommand));

    // System
    d(command("swiftbazel.system.resetswiftbazelCache", resetswiftbazelCache));
    d(command("swiftbazel.system.openTerminalPanel", openTerminalPanel));

    // --- MCP Server Setup ---
    commonLogger.log("Starting MCP Server setup...");
    try {
      mcpInstance = createMcpServer(
        {
          name: "swiftbazelCommandRunner",
          version: context.extension.packageJSON.version,
          port: 61333,
        },
        _context,
      );

      // Start the server
      await mcpInstance.start();
      commonLogger.log("MCP Server setup complete and started.");

      // Disposal
      context.subscriptions.push({
        dispose: () => {
          commonLogger.log("Disposing MCP Server subscription...");
          if (mcpInstance?.server) {
            try {
              mcpInstance.server.close();
            } catch (_e) {
              /* log error */
            }
          }
          mcpInstance = null;
        },
      });
    } catch (error: unknown) {
      commonLogger.error("Failed during MCP Server setup", { error });
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to initialize MCP Server: ${errorMessage}`);
    }
  } catch (error: unknown) {
    commonLogger.error("Failed to activate extension", { error });
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`swiftbazel activation failed: ${errorMessage}`);
  }
}

export function deactivate() {
  commonLogger.log("swiftbazel deactivating...");
  // Cleanup is handled by the disposable
}
