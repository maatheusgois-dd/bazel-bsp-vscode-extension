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
import { waitForProcessToLaunch } from "./debug-utils";

const ATTACH_CONFIG: vscode.DebugConfiguration = {
  type: "swiftbazel-lldb",
  request: "attach",
  name: "swiftbazel: Build and Run (Wait for debugger)",
  preLaunchTask: "swiftbazel: debuging-launch",
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

    // Remove the "file://" prefix and remove everything after the app name
    // Result should be something like:
    //  - "/private/var/containers/Bundle/Application/5045C7CE-DFB9-4C17-BBA9-94D8BCD8F565/Mastodon.app"
    const deviceAppPath = deviceExecutableURL.match(/^file:\/\/(.*\.app)/)?.[1];
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
    config.postRunCommands = [...(config.postRunCommands || []), `script print("swiftbazel: Happy debugging!")`];

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

    // Remove the "file://" prefix and remove everything after the app name
    // Result should be something like:
    //  - "/private/var/containers/Bundle/Application/5045C7CE-DFB9-4C17-BBA9-94D8BCD8F565/MyBazelApp.app"
    const deviceAppPath = deviceExecutableURL.match(/^file:\/\/(.*\.app)/)?.[1];
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
      `script print("swiftbazel: Happy debugging Bazel target '${targetName}'!")`,
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
        `No app has been launched yet.\n\n` +
        `Before debugging, you must first launch the app using one of:\n` +
        `1. Click the ▶ (Run) button on a Bazel target\n` +
        `2. Run command: swiftbazel: Build & Run\n` +
        `3. Use Cmd+R on a selected target\n\n` +
        `Then attach the debugger by pressing F5`
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
      commonLogger.error("No launch context found - cannot debug", {
        workspaceState: this.context.getWorkspaceState("build.lastLaunchedApp"),
      });
      throw new Error(
        `No Bazel app has been launched yet.\n\n` +
        `To debug a Bazel target:\n` +
        `1. Select a binary target in BAZEL TARGETS tree\n` +
        `2. Click the 🐛 (Debug) button\n` +
        `   OR\n` +
        `1. Run command: swiftbazel: Bazel Debug\n` +
        `2. Select your target when prompted\n\n` +
        `This will build, launch, and attach the debugger automatically.`
      );
    }

    if (launchContext.type === "bazel-simulator") {
      const debugPort = config.debugPort || 6667;

      commonLogger.log("Resolving Bazel simulator debug configuration", {
        launchContext,
        debugPort,
      });

      // For simulators, the app is already launched with --wait-for-debugger
      // and debugserver is already attached to the correct PID.
      // We just need to connect LLDB to debugserver.
      const resolvedConfig = {
        type: "lldb-dap",
        request: "attach",
        name: config.name || "swiftbazel: Bazel Debug",
        debuggerRoot: folder?.uri.fsPath || "${workspaceFolder}",
        attachCommands: [`process connect connect://localhost:${debugPort}`],
        internalConsoleOptions: "openOnSessionStart",
        timeout: 100000,
      };

      commonLogger.log("Resolved Bazel simulator debug config", {
        resolvedConfig,
        debugPort,
      });

      return resolvedConfig;
    }

    if (launchContext.type === "bazel-device") {
      const deviceUDID = launchContext.destinationId;
      const appPath = launchContext.appPath;
      const pid = launchContext.pid;
      const targetName = launchContext.targetName;

      commonLogger.log("Resolving Bazel device debug configuration", {
        launchContext,
        deviceUDID,
        appPath,
        pid,
        targetName,
      });

      if (!pid) {
        commonLogger.error("No PID in launch context for device debugging", {
          launchContext,
          deviceUDID,
          targetName,
        });
        throw new Error(
          `Process ID not found in launch context.\n` +
          `Target: ${targetName}\n` +
          `Device: ${deviceUDID}\n\n` +
          `The app launch may have failed. Try:\n` +
          `1. Re-run the debug command (it will rebuild and relaunch)\n` +
          `2. Check device console for app launch errors\n` +
          `3. Verify the app installs successfully without debugging first`
        );
      }

      // For device debugging with devicectl's --start-stopped:
      // 1. App is already running but paused on device
      // 2. We need to find the device app path for proper symbol resolution
      // 3. Use the same approach as regular device debugging

      // Wait for process to be available and get its device path
      const process = await waitForProcessToLaunch(this.context, {
        deviceId: deviceUDID,
        appName: `${targetName}.app`,
        timeoutMs: 15000,
      });

      const deviceExecutableURL = process.executable;
      if (!deviceExecutableURL) {
        throw new Error("No device app path found");
      }

      // Remove the "file://" prefix and extract .app path
      const deviceAppPath = deviceExecutableURL.match(/^file:\/\/(.*\.app)/)?.[1];
      const continueOnAttach = config.continueOnAttach ?? true;

      // Use the same unified debug configuration as regular device debugging
      const resolvedConfig = {
        type: "lldb-dap",
        request: "attach",
        name: config.name || "swiftbazel: Bazel Debug (Device)",
        debuggerRoot: folder?.uri.fsPath || "${workspaceFolder}",
        program: appPath,
        pid: pid.toString(),

        // LLDB commands executed upon debugger startup
        initCommands: [
          ...(config.initCommands || []),
          "platform select remote-ios",
          ...(continueOnAttach ? ["process handle SIGSTOP -p true -s false -n false"] : []),
        ],

        // Set the platform file spec for symbol resolution
        preRunCommands: [
          ...(config.preRunCommands || []),
          `script lldb.target.module[0].SetPlatformFileSpec(lldb.SBFileSpec('${deviceAppPath}'))`,
        ],

        // Attach to the process on the device
        processCreateCommands: [
          ...(config.processCreateCommands || []),
          `script lldb.debugger.HandleCommand("device select ${deviceUDID}")`,
          `script lldb.debugger.HandleCommand("device process attach --continue --pid ${pid}")`,
        ],

        postRunCommands: [
          ...(config.postRunCommands || []),
          `script print("swiftbazel: Debugger attached to device process ${pid}")`,
        ],

        internalConsoleOptions: "openOnSessionStart",
        timeout: 100000,
      };

      commonLogger.log("Resolved Bazel device debug config", {
        resolvedConfig,
        deviceAppPath,
      });

      return resolvedConfig;
    }

    const contextType = (launchContext as any).type || "unknown";
    commonLogger.error("Unsupported launch context type", {
      type: contextType,
      launchContext,
    });

    throw new Error(
      `Unsupported app launch type for Bazel debugging.\n` +
      `Launch type: ${contextType}\n\n` +
      `Currently supported:\n` +
      `- bazel-simulator: Bazel app on iOS Simulator\n` +
      `- bazel-device: Bazel app on physical iOS device\n\n` +
      `This is likely a bug. Please report this issue.`
    );
  }
}

export function registerDebugConfigurationProvider(context: ExtensionContext) {
  const dynamicProvider = new DynamicDebugConfigurationProvider({ context });
  const initialProvider = new InitialDebugConfigurationProvider();
  const bazelProvider = new BazelDebugConfigurationProvider({ context });

  // Register standard Xcode debug provider
  const disposable1 = vscode.debug.registerDebugConfigurationProvider(
    "swiftbazel-lldb",
    initialProvider,
    vscode.DebugConfigurationProviderTriggerKind.Initial,
  );
  const disposable2 = vscode.debug.registerDebugConfigurationProvider(
    "swiftbazel-lldb",
    dynamicProvider,
    vscode.DebugConfigurationProviderTriggerKind.Dynamic,
  );

  // Register Bazel-specific debug provider
  const disposable3 = vscode.debug.registerDebugConfigurationProvider(
    "swiftbazel-bazel-lldb",
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
