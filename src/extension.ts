import * as vscode from "vscode";

import { BuildManager } from "./application/services/build-manager.service.js";
import { DestinationsManager } from "./application/services/destination-manager.service.js";
import { DevicesManager } from "./application/services/device-manager.service.js";
import { SimulatorsManager } from "./application/services/simulator-manager.service.js";
import { ToolsManager } from "./application/services/tools-manager.service.js";
// Application Layer
import {
  bazelBuildCommand,
  bazelCleanCommand,
  bazelCleanExpungeCommand,
  bazelDebugCommand,
  bazelRunCommand,
  bazelStopCommand,
  bazelTestCommand,
  buildSelectedBazelTargetCommand,
  diagnoseBuildSetupCommand,
  runSelectedBazelTargetCommand,
  selectBazelBuildModeCommand,
  selectBazelTargetCommand,
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
import {
  setupBSPConfigCommand,
  setupSwiftExtensionCommand,
  showSwiftConfigStatusCommand,
  monitorBSPLogsCommand,
} from "./application/use-cases/system/swift-setup.use-case.js";
import { openTerminalPanel, resetbazelbspCache } from "./application/use-cases/system/system-commands.use-case.js";
import { installToolCommand, openDocumentationCommand } from "./application/use-cases/tools/tools-commands.use-case.js";

import { createMcpServer } from "./infrastructure/mcp/mcp-server.js";
import type { McpServerInstance } from "./infrastructure/mcp/types.js";
import { registerDebugConfigurationProvider } from "./infrastructure/vscode/debug/debug-provider.js";
// Infrastructure Layer
import { ExtensionContext } from "./infrastructure/vscode/extension-context.js";
import { BazelBuildTaskProvider } from "./infrastructure/vscode/task-provider.js";

import { BuildModeStatusBar } from "./presentation/status-bars/build-mode-status-bar.js";
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

    // Build mode status bar
    const buildModeStatusBar = new BuildModeStatusBar({
      context: _context,
    });
    d(buildModeStatusBar);

    // Internal command to update build mode status bar
    d(command("bazelbsp.internal.updateBuildModeStatusBar", async () => buildModeStatusBar.update()));

    d(tree("bazelbsp.view.bazelQuery", bazelQueryTreeProvider));
    d(command("bazelbsp.build.refreshView", async () => buildManager.refresh()));
    d(command("bazelbsp.build.diagnoseSetup", diagnoseBuildSetupCommand));
    d(command("bazelbsp.bazel.build", bazelBuildCommand));
    d(command("bazelbsp.bazel.test", bazelTestCommand));
    d(command("bazelbsp.bazel.run", bazelRunCommand));
    d(command("bazelbsp.bazel.debug", bazelDebugCommand));
    d(command("bazelbsp.bazel.stop", bazelStopCommand));
    d(command("bazelbsp.bazel.clean", bazelCleanCommand));
    d(command("bazelbsp.bazel.cleanExpunge", bazelCleanExpungeCommand));
    d(command("bazelbsp.bazel.selectBuildMode", selectBazelBuildModeCommand));
    d(
      command("bazelbsp.bazel.selectTarget", (context, targetInfo) =>
        selectBazelTargetCommand(context, targetInfo, bazelQueryTreeProvider),
      ),
    );
    d(command("bazelbsp.bazel.buildSelected", () => buildSelectedBazelTargetCommand(_context, bazelQueryTreeProvider)));
    d(command("bazelbsp.bazel.testSelected", () => testSelectedBazelTargetCommand(_context, bazelQueryTreeProvider)));
    d(command("bazelbsp.bazel.runSelected", () => runSelectedBazelTargetCommand(_context, bazelQueryTreeProvider)));

    // Bazel query tree commands
    d(command("bazelbsp.bazelQuery.refresh", async () => bazelQueryTreeProvider.refresh()));
    d(command("bazelbsp.bazelQuery.clearRecents", async () => bazelQueryTreeProvider.clearRecents()));

    // Debugging
    d(registerDebugConfigurationProvider(_context));
    d(command("bazelbsp.debugger.getAppPath", getAppPathCommand));

    // Simulators
    d(
      command("bazelbsp.simulators.refresh", async (context) => {
        context.updateProgressStatus("Refreshing simulators");
        await destinationsManager.refreshSimulators();
        destinationsTreeProvider.refresh();
      }),
    );
    d(command("bazelbsp.simulators.openSimulator", openSimulatorCommand));
    d(command("bazelbsp.simulators.removeCache", removeSimulatorCacheCommand));
    d(command("bazelbsp.simulators.start", startSimulatorCommand));
    d(command("bazelbsp.simulators.stop", stopSimulatorCommand));
    d(command("bazelbsp.simulators.screenshot", takeSimulatorScreenshotCommand));

    // // Devices
    d(
      command("bazelbsp.devices.refresh", async (context) => {
        context.updateProgressStatus("Refreshing devices");
        await destinationsManager.refreshDevices();
        destinationsTreeProvider.refresh();
      }),
    );

    // Desintations
    const destinationBar = new DestinationStatusBar({
      context: _context,
    });
    d(destinationBar);
    d(command("bazelbsp.destinations.select", selectDestinationForBuildCommand));
    d(command("bazelbsp.destinations.removeRecent", removeRecentDestinationCommand));
    d(
      command("bazelbsp.destinations.refresh", async (context) => {
        context.updateProgressStatus("Refreshing destinations");
        await destinationsManager.refresh();
        destinationsTreeProvider.refresh();
      }),
    );
    d(tree("bazelbsp.destinations.view", destinationsTreeProvider));

    // Tools
    d(tree("bazelbsp.tools.view", toolsTreeProvider));
    d(command("bazelbsp.tools.install", installToolCommand));
    d(
      command("bazelbsp.tools.refresh", async (context) => {
        context.updateProgressStatus("Checking tool installations");
        await toolsManager.refresh();
      }),
    );
    d(command("bazelbsp.tools.documentation", openDocumentationCommand));

    // System
    d(command("bazelbsp.system.resetbazelbspCache", resetbazelbspCache));
    d(command("bazelbsp.system.openTerminalPanel", openTerminalPanel));
    d(command("bazelbsp.system.setupSwiftExtension", setupSwiftExtensionCommand));
    d(command("bazelbsp.system.showSwiftConfigStatus", showSwiftConfigStatusCommand));
    d(command("bazelbsp.system.setupBSPConfig", setupBSPConfigCommand));
    d(command("bazelbsp.system.monitorBSPLogs", monitorBSPLogsCommand));
    d(
      command("bazelbsp.system.cancelCurrentOperation", async (_context) => {
        progressStatusBar.cancelCurrentOperation();
      }),
    );

    // --- MCP Server Setup ---
    commonLogger.log("Starting MCP Server setup...");
    try {
      mcpInstance = createMcpServer(
        {
          name: "bazelbspCommandRunner",
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
    vscode.window.showErrorMessage(`bazelbsp activation failed: ${errorMessage}`);
  }
}

export function deactivate() {
  commonLogger.log("bazelbsp deactivating...");
  // Cleanup is handled by the disposable
}
