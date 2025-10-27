import * as vscode from "vscode";
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
} from "./build/commands.js";
import { BuildManager } from "./build/manager.js";
import { BazelBuildTaskProvider } from "./build/provider.js";
import { BazelTargetStatusBar } from "./build/status-bar.js";
import { WorkspaceTreeProvider } from "./build/tree.js";
import { ExtensionContext } from "./common/commands.js";
import { Logger, commonLogger } from "./common/logger.js";
import { getAppPathCommand } from "./build/debug/commands.js";
import { registerDebugConfigurationProvider } from "./build/debug/provider.js";
import { removeRecentDestinationCommand, selectDestinationForBuildCommand } from "./destination/commands.js";
import { DestinationsManager } from "./destination/manager.js";
import { DestinationStatusBar } from "./destination/status-bar.js";
import { DestinationsTreeProvider } from "./destination/tree.js";
import { DevicesManager } from "./destination/devices/manager.js";
import { createMcpServer } from "./mcp/mcp_server";
import type { McpServerInstance } from "./mcp/types";
import {
  openSimulatorCommand,
  removeSimulatorCacheCommand,
  startSimulatorCommand,
  stopSimulatorCommand,
  takeSimulatorScreenshotCommand,
} from "./simulators/commands.js";
import { SimulatorsManager } from "./simulators/manager.js";
import { openTerminalPanel, resetswiftbazelCache } from "./system/commands.js";
import { ProgressStatusBar } from "./system/status-bar.js";
import { installToolCommand, openDocumentationCommand } from "./tools/commands.js";
import { ToolsManager } from "./tools/manager.js";
import { ToolTreeProvider } from "./tools/tree.js";

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
    // const buildTreeProvider = new BuildTreeProvider({
    //   context: _context,
    //   buildManager: buildManager,
    // });
    const workspaceTreeProvider = new WorkspaceTreeProvider({
      context: _context,
      buildManager: buildManager,
    });
    const toolsTreeProvider = new ToolTreeProvider({
      manager: toolsManager,
    });
    const destinationsTreeProvider = new DestinationsTreeProvider({
      manager: destinationsManager,
    });

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

    //d(tree("swiftbazel.build.view", workspaceTreeProvider));
    d(tree("swiftbazel.view.workspaces", workspaceTreeProvider));
    d(command("swiftbazel.build.refreshView", async () => buildManager.refresh()));
    d(command("swiftbazel.build.selectBazelWorkspace", selectBazelWorkspaceCommand));
    d(command("swiftbazel.build.diagnoseSetup", diagnoseBuildSetupCommand));
    d(command("swiftbazel.bazel.build", bazelBuildCommand));
    d(command("swiftbazel.bazel.test", bazelTestCommand));
    d(command("swiftbazel.bazel.run", bazelRunCommand));
    d(command("swiftbazel.bazel.debug", bazelDebugCommand));
    d(
      command("swiftbazel.bazel.selectTarget", (context, targetInfo) =>
        selectBazelTargetCommand(context, targetInfo, workspaceTreeProvider),
      ),
    );
    d(
      command("swiftbazel.bazel.buildSelected", () => buildSelectedBazelTargetCommand(_context, workspaceTreeProvider)),
    );
    d(command("swiftbazel.bazel.testSelected", () => testSelectedBazelTargetCommand(_context, workspaceTreeProvider)));
    d(command("swiftbazel.bazel.runSelected", () => runSelectedBazelTargetCommand(_context, workspaceTreeProvider)));

    // Workspace tree commands
    d(
      command("swiftbazel.build.search", async () => {
        const searchTerm = await vscode.window.showInputBox({
          prompt: "Search builds and schemes",
          placeHolder: "Enter search term...",
          value: workspaceTreeProvider.getSearchTerm(),
        });
        if (searchTerm !== undefined) {
          workspaceTreeProvider.setSearchTerm(searchTerm);
        }
      }),
    );
    d(command("swiftbazel.build.clearSearch", async () => workspaceTreeProvider.clearSearch()));
    d(
      command("swiftbazel.build.clearCache", async () => {
        await workspaceTreeProvider.clearPersistentCache();
        const { cacheManager } = await import("./common/cache-manager.js");
        await cacheManager.clearCache();
        await workspaceTreeProvider.loadWorkspacesStreamingly();
        const stats = cacheManager.getCacheStats();
        vscode.window.showInformationMessage(
          `✅ All workspace caches cleared and reloaded!\n📊 Cache was storing ${stats.bazelWorkspaceCount} Bazel workspaces.`,
        );
      }),
    );
    d(command("swiftbazel.build.selectXcodeWorkspace", (context, item) => selectBazelWorkspaceCommand(context, item)));

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
          port: 61337,
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
            } catch (e) {
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
