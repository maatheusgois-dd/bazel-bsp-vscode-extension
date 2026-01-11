import vscode from "vscode";
import type {
  ExtensionContext,
  LastLaunchedAppBazelDeviceContext,
  LastLaunchedAppBazelSimulatorContext,
  LastLaunchedAppDeviceContext,
  LastLaunchedAppMacOSContext,
  LastLaunchedAppSimulatorContext,
} from "../../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../../../shared/logger/logger.js";
import { checkUnreachable } from "../../../shared/types/common.types.js";
import { extractDeviceAppPath, waitForProcessToLaunch } from "./debug-utils";

const ATTACH_CONFIG: vscode.DebugConfiguration = {
  type: "bazelbsp-lldb",
  request: "attach",
  name: "Bazel BSP: Build and Run (Wait for debugger)",
  preLaunchTask: "bazelbsp: debuging-launch",
};

class InitialDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  async provideDebugConfigurations(
    _folder: vscode.WorkspaceFolder | undefined,
    _token?: vscode.CancellationToken | undefined,
  ): Promise<vscode.DebugConfiguration[]> {
    return [ATTACH_CONFIG];
  }

  async resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken | undefined,
  ): Promise<vscode.DebugConfiguration | undefined> {
    if (Object.keys(config).length === 0) {
      return ATTACH_CONFIG;
    }
    return config;
  }
}

class DynamicDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  context: ExtensionContext;
  constructor(options: { context: ExtensionContext }) {
    this.context = options.context;
  }

  async provideDebugConfigurations(
    _folder: vscode.WorkspaceFolder | undefined,
    _token?: vscode.CancellationToken | undefined,
  ): Promise<vscode.DebugConfiguration[]> {
    return [ATTACH_CONFIG];
  }

  async resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken | undefined,
  ): Promise<vscode.DebugConfiguration | undefined> {
    if (Object.keys(config).length === 0) {
      return ATTACH_CONFIG;
    }
    return config;
  }

  private async resolveMacOSDebugConfiguration(
    config: vscode.DebugConfiguration,
    launchContext: LastLaunchedAppMacOSContext,
  ): Promise<vscode.DebugConfiguration> {
    config.type = "lldb";
    config.waitFor = true;
    config.request = "attach";
    config.program = launchContext.appPath;
    commonLogger.log("Resolved debug configuration", { config: config });
    return config;
  }

  private async resolveSimulatorDebugConfiguration(
    config: vscode.DebugConfiguration,
    launchContext: LastLaunchedAppSimulatorContext,
  ): Promise<vscode.DebugConfiguration> {
    config.type = "lldb";
    config.waitFor = true;
    config.request = "attach";
    config.program = launchContext.appPath;
    commonLogger.log("Resolved debug configuration", { config: config });
    return config;
  }

  private async resolveDeviceDebugConfiguration(
    config: vscode.DebugConfiguration,
    launchContext: LastLaunchedAppDeviceContext,
  ): Promise<vscode.DebugConfiguration> {
    const deviceUDID = launchContext.destinationId;
    const hostAppPath = launchContext.appPath;
    const appName = launchContext.appName; // Example: "MyApp.app"

    // We need to find the device app path and the process id
    const process = await waitForProcessToLaunch(this.context, {
      deviceId: deviceUDID,
      appName: appName,
      timeoutMs: 15000, // wait for 15 seconds before giving up
    });

    const deviceExecutableURL = process.executable;
    if (!deviceExecutableURL) {
      throw new Error("No device app path found");
    }

    const deviceAppPath = extractDeviceAppPath(deviceExecutableURL);
    const processId = process.processIdentifier;

    const continueOnAttach = config.continueOnAttach ?? true;

    // LLDB commands executed upon debugger startup.
    config.initCommands = [
      ...(config.initCommands || []),
      // By default, LLDB runs against the local host platform. This command switches LLDB to a remote
      // iOS environment, necessary for debugging iOS apps on a device.
      "platform select remote-ios",
      // Don't stop after attaching to the process:
      // -n false — Should LLDB print a “stopped with SIGSTOP” message in the UI? Be silent—no notification to you
      // -p true — Should LLDB forward the signal on to your app? Deliver SIGSTOP to the process
      // -s false — Should LLDB pause (break into the debugger) when this signal arrives?  Don’t break; just run LLDB’s signal handler logic
      ...(continueOnAttach ? ["process handle SIGSTOP -p true -s false -n false"] : []),
    ];

    // LLDB commands executed just before launching of attaching to the debuggee.
    config.preRunCommands = [
      ...(config.preRunCommands || []),
      // Adjusts the loaded module’s file specification to point to the actual location of the binary on the remote device.
      // This ensures symbol resolution and breakpoints align correctly with the actual remote binary.
      `script lldb.target.module[0].SetPlatformFileSpec(lldb.SBFileSpec('${deviceAppPath}'))`,
    ];

    // LLDB commands executed to create/attach the debuggee process.
    config.processCreateCommands = [
      ...(config.processCreateCommands || []),
      // Tells LLDB which physical iOS device (by UDID) you want to attach to.
      `script lldb.debugger.HandleCommand("device select ${deviceUDID}")`,
      // Attaches LLDB to the already-launched process on that device.
      `script lldb.debugger.HandleCommand("device process attach --continue --pid ${processId}")`,
    ];

    // LLDB commands executed after the debuggee process has been created/attached.
    config.postRunCommands = [...(config.postRunCommands || []), `script print("bazelbsp: Happy debugging!")`];

    config.type = "lldb";
    config.request = "attach";
    config.program = hostAppPath;
    config.pid = processId.toString();

    commonLogger.log("Resolved debug configuration", { config: config });
    return config;
  }

  private async resolveBazelSimulatorDebugConfiguration(
    config: vscode.DebugConfiguration,
    launchContext: LastLaunchedAppBazelSimulatorContext,
  ): Promise<vscode.DebugConfiguration> {
    config.type = "lldb";
    config.waitFor = true;
    config.request = "attach";
    config.program = launchContext.appPath;

    commonLogger.log("Resolved Bazel simulator debug configuration", {
      config: config,
      targetName: launchContext.targetName,
      buildLabel: launchContext.buildLabel,
    });
    return config;
  }

  private async resolveBazelDeviceDebugConfiguration(
    config: vscode.DebugConfiguration,
    launchContext: LastLaunchedAppBazelDeviceContext,
  ): Promise<vscode.DebugConfiguration> {
    const deviceUDID = launchContext.destinationId;
    const hostAppPath = launchContext.appPath;
    const targetName = launchContext.targetName; // Use target name as app name for Bazel

    // We need to find the device app path and the process id
    const process = await waitForProcessToLaunch(this.context, {
      deviceId: deviceUDID,
      appName: `${targetName}.app`, // Bazel apps typically use target name
      timeoutMs: 15000, // wait for 15 seconds before giving up
    });

    const deviceExecutableURL = process.executable;
    if (!deviceExecutableURL) {
      throw new Error("No device app path found");
    }

    const deviceAppPath = extractDeviceAppPath(deviceExecutableURL);
    const processId = process.processIdentifier;

    const continueOnAttach = config.continueOnAttach ?? true;

    // LLDB commands executed upon debugger startup.
    config.initCommands = [
      ...(config.initCommands || []),
      // By default, LLDB runs against the local host platform. This command switches LLDB to a remote
      // iOS environment, necessary for debugging iOS apps on a device.
      "platform select remote-ios",
      // Don't stop after attaching to the process:
      // -n false — Should LLDB print a "stopped with SIGSTOP" message in the UI? Be silent—no notification to you
      // -p true — Should LLDB forward the signal on to your app? Deliver SIGSTOP to the process
      // -s false — Should LLDB pause (break into the debugger) when this signal arrives?  Don't break; just run LLDB's signal handler logic
      ...(continueOnAttach ? ["process handle SIGSTOP -p true -s false -n false"] : []),
    ];

    // LLDB commands executed just before launching of attaching to the debuggee.
    config.preRunCommands = [
      ...(config.preRunCommands || []),
      // Adjusts the loaded module's file specification to point to the actual location of the binary on the remote device.
      // This ensures symbol resolution and breakpoints align correctly with the actual remote binary.
      `script lldb.target.module[0].SetPlatformFileSpec(lldb.SBFileSpec('${deviceAppPath}'))`,
    ];

    // LLDB commands executed to create/attach the debuggee process.
    config.processCreateCommands = [
      ...(config.processCreateCommands || []),
      // Tells LLDB which physical iOS device (by UDID) you want to attach to.
      `script lldb.debugger.HandleCommand("device select ${deviceUDID}")`,
      // Attaches LLDB to the already-launched process on that device.
      `script lldb.debugger.HandleCommand("device process attach --continue --pid ${processId}")`,
    ];

    // LLDB commands executed after the debuggee process has been created/attached.
    config.postRunCommands = [
      ...(config.postRunCommands || []),
      `script print("bazelbsp: Happy debugging Bazel target '${targetName}'!")`,
    ];

    config.type = "lldb";
    config.request = "attach";
    config.program = hostAppPath;
    config.pid = processId.toString();

    commonLogger.log("Resolved Bazel device debug configuration", {
      config: config,
      targetName: launchContext.targetName,
      buildLabel: launchContext.buildLabel,
    });
    return config;
  }

  /*
   * We use this method because it runs after "preLaunchTask" is completed, "resolveDebugConfiguration"
   * runs before "preLaunchTask" so it's not suitable for our use case without some hacks.
   */
  async resolveDebugConfigurationWithSubstitutedVariables(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken | undefined,
  ): Promise<vscode.DebugConfiguration> {
    const launchContext = this.context.getWorkspaceState("build.lastLaunchedApp");
    if (!launchContext) {
      throw new Error(
        "No app has been launched yet.\n\n" +
          "Before debugging, you must first launch the app using one of:\n" +
          "1. Click the ▶ (Run) button on a Bazel target\n" +
          "2. Run command: bazelbsp: Build & Run\n" +
          "3. Use Cmd+R on a selected target\n\n" +
          "Then attach the debugger by pressing F5",
      );
    }

    // Pass the "codelldbAttributes" to the lldb debugger
    const codelldbAttributes = config.codelldbAttributes || {};
    for (const [key, value] of Object.entries(codelldbAttributes)) {
      config[key] = value;
    }
    config.codelldbAttributes = undefined;

    if (launchContext.type === "macos") {
      return await this.resolveMacOSDebugConfiguration(config, launchContext);
    }

    if (launchContext.type === "simulator") {
      return await this.resolveSimulatorDebugConfiguration(config, launchContext);
    }

    if (launchContext.type === "device") {
      return await this.resolveDeviceDebugConfiguration(config, launchContext);
    }

    if (launchContext.type === "bazel-simulator") {
      return await this.resolveBazelSimulatorDebugConfiguration(config, launchContext);
    }

    if (launchContext.type === "bazel-device") {
      return await this.resolveBazelDeviceDebugConfiguration(config, launchContext);
    }

    checkUnreachable(launchContext);
    return config;
  }
}

/**
 * Bazel-specific debug configuration provider
 * Handles debug configurations for Bazel-built apps with custom debugserver workflow
 */
class BazelDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  context: ExtensionContext;
  constructor(options: { context: ExtensionContext }) {
    this.context = options.context;
  }

  async resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    token?: vscode.CancellationToken | undefined,
  ): Promise<vscode.DebugConfiguration | undefined> {
    commonLogger.log("BazelDebugConfigurationProvider.resolveDebugConfiguration called", {
      folder: folder?.uri.fsPath,
      config,
      token: !!token,
    });

    const launchContext = this.context.getWorkspaceState("build.lastLaunchedApp");

    commonLogger.log("Launch context retrieved", {
      launchContext,
      hasContext: !!launchContext,
    });

    if (!launchContext) {
      commonLogger.error("No launch context found - cannot debug");
      throw new Error("No Bazel app launched. Please build and run a Bazel target first.");
    }

    if (launchContext.type === "bazel-simulator") {
      return this.resolveSimulatorDebugConfig(folder, config, launchContext);
    }

    if (launchContext.type === "bazel-device") {
      return this.resolveDeviceDebugConfig(folder, config, launchContext);
    }

    commonLogger.error("Unsupported launch context type", {
      type: (launchContext as any).type,
    });

    throw new Error(`Unsupported launch context type for Bazel debugging: ${(launchContext as any).type}`);
  }

  private resolveSimulatorDebugConfig(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    launchContext: LastLaunchedAppBazelSimulatorContext,
  ): vscode.DebugConfiguration {
    const debugPort = config.debugPort || 6667;

    const resolvedConfig = {
      type: "lldb-dap",
      request: "attach",
      name: config.name || "Bazel BSP: Bazel Debug (Simulator)",
      debuggerRoot: folder?.uri.fsPath || "${workspaceFolder}",
      attachCommands: [`process connect connect://localhost:${debugPort}`],
      internalConsoleOptions: "openOnSessionStart",
      timeout: 100000,
    };

    commonLogger.log("Resolved Bazel simulator debug config", {
      resolvedConfig,
      debugPort,
      targetName: launchContext.targetName,
      buildLabel: launchContext.buildLabel,
      appPath: launchContext.appPath,
    });

    return resolvedConfig;
  }

  private async resolveDeviceDebugConfig(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    launchContext: LastLaunchedAppBazelDeviceContext,
  ): Promise<vscode.DebugConfiguration> {
    const deviceUDID = launchContext.destinationId;
    const appPath = launchContext.appPath;
    const pid = launchContext.pid;

    commonLogger.log("Resolving Bazel device debug configuration", {
      launchContext,
      deviceUDID,
      appPath,
      pid,
      targetName: launchContext.targetName,
      buildLabel: launchContext.buildLabel,
    });

    if (!pid) {
      throw new Error("No PID found in launch context. Please run the app again.");
    }

    // For device debugging with devicectl's --start-stopped:
    // 1. App is already running but paused on device
    // 2. We select the device by UDID
    // 3. Attach to the process by PID with --continue flag
    // 4. No platform connect needed - device commands work directly via USB

    const resolvedConfig = {
      type: "lldb-dap",
      request: "attach",
      name: config.name || "Bazel BSP: Bazel Debug (Device)",
      debuggerRoot: folder?.uri.fsPath || "${workspaceFolder}",
      program: appPath,
      preRunCommands: ["platform select remote-ios"],
      attachCommands: [
        `script lldb.debugger.HandleCommand("device select ${deviceUDID}")`,
        `script lldb.debugger.HandleCommand("device process attach --continue --pid ${pid}")`,
      ],
      postRunCommands: [
        `script print("bazelbsp: Debugger attached to device process ${pid} (${launchContext.targetName})")`,
      ],
      internalConsoleOptions: "openOnSessionStart",
      timeout: 100000,
    };

    commonLogger.log("Resolved Bazel device debug config", {
      resolvedConfig,
    });

    return resolvedConfig;
  }
}

export function registerDebugConfigurationProvider(context: ExtensionContext) {
  const dynamicProvider = new DynamicDebugConfigurationProvider({ context });
  const initialProvider = new InitialDebugConfigurationProvider();
  const bazelProvider = new BazelDebugConfigurationProvider({ context });

  // Register standard Xcode debug provider
  const disposable1 = vscode.debug.registerDebugConfigurationProvider(
    "bazelbsp-lldb",
    initialProvider,
    vscode.DebugConfigurationProviderTriggerKind.Initial,
  );
  const disposable2 = vscode.debug.registerDebugConfigurationProvider(
    "bazelbsp-lldb",
    dynamicProvider,
    vscode.DebugConfigurationProviderTriggerKind.Dynamic,
  );

  // Register Bazel-specific debug provider
  const disposable3 = vscode.debug.registerDebugConfigurationProvider(
    "bazelbsp-bazel-lldb",
    bazelProvider,
    vscode.DebugConfigurationProviderTriggerKind.Dynamic,
  );

  return {
    dispose() {
      disposable1.dispose();
      disposable2.dispose();
      disposable3.dispose();
    },
  };
}
