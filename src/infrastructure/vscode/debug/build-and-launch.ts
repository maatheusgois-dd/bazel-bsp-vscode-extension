/**
 * Unified Build and Launch Workflow
 * 
 * This module provides common build and launch functionality used by both
 * regular run commands and debug commands. The only difference is whether
 * the debugger is attached after launch.
 */

import * as path from "node:path";
import * as vscode from "vscode";
import type { DeviceDestination } from "../../../domain/entities/destination/device-types.js";
import type { SimulatorDestination } from "../../../domain/entities/destination/simulator-types.js";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import type { BazelTreeItem } from "../../../presentation/tree-providers/export.provider.js";
import { commonLogger } from "../../../shared/logger/logger.js";
import { exec } from "../../../shared/utils/exec.js";
import type { TaskTerminal } from "../../../shared/utils/tasks.js";
import { ProgressManager } from "../../../shared/utils/progress-manager.js";
import {
  getBundleIdentifier,
  launchBazelAppOnDevice,
  launchBazelAppOnSimulator,
  startDebugServer,
  type BazelLaunchResult,
} from "./bazel-launcher.js";

const DEFAULT_DEBUG_PORT = 6667;

export interface BuildAndLaunchOptions {
  /** Bazel target to build and launch */
  bazelItem: BazelTreeItem;
  /** Destination to launch on */
  destination: SimulatorDestination | DeviceDestination;
  /** Whether to attach debugger after launch */
  attachDebugger: boolean;
  /** Debug port for LLDB connection (only used if attachDebugger is true) */
  debugPort?: number;
  /** Launch arguments */
  launchArgs?: string[];
  /** Environment variables */
  launchEnv?: Record<string, string>;
}

export interface BuildAndLaunchResult {
  /** App bundle path */
  appPath: string;
  /** Bundle identifier */
  bundleId: string;
  /** Launch result */
  launchResult: BazelLaunchResult;
}

/**
 * Progress steps for unified build and launch workflow
 */
const BUILD_AND_LAUNCH_STEPS = [
  { name: "Building with debug symbols", weight: 3 },
  { name: "Locating app bundle", weight: 1 },
  { name: "Preparing app", weight: 1 },
  { name: "Launching app", weight: 2 },
] as const;

const BUILD_AND_LAUNCH_DEBUG_STEPS = [
  ...BUILD_AND_LAUNCH_STEPS,
  { name: "Starting debugserver", weight: 1 },
  { name: "Attaching debugger", weight: 2 },
] as const;

/**
 * Build a Bazel target with appropriate compilation flags
 */
async function buildBazelTarget(
  context: ExtensionContext,
  terminal: TaskTerminal,
  progress: ProgressManager,
  options: {
    bazelItem: BazelTreeItem;
    destination: SimulatorDestination | DeviceDestination;
    attachDebugger: boolean;
  }
): Promise<void> {
  const { bazelItem, destination, attachDebugger } = options;

  progress.nextStep("Building with debug symbols");
  
  if (attachDebugger) {
    terminal.write(`🔨 Step 1/6: Building ${bazelItem.target.name} with debug symbols...\n`);
  } else {
    terminal.write(`🔨 Step 1/4: Building ${bazelItem.target.name}...\n`);
  }

  // Build flags based on destination type
  let platformFlag: string;
  let additionalFlags: string[] = [];

  if (destination.type === "iOSSimulator") {
    platformFlag = "--platforms=@build_bazel_apple_support//platforms:ios_sim_arm64";
  } else if (destination.type === "iOSDevice") {
    platformFlag = "--ios_multi_cpus=arm64";
    
    // Check if device is locked before starting build
    try {
      const { isDeviceLocked, waitForDeviceUnlock } = await import("../../apple-platforms/devicectl.adapter.js");
      const locked = await isDeviceLocked(context, destination.udid);
      
      if (locked) {
        terminal.write(`\n⚠️  Device "${destination.name}" is locked\n`);
        terminal.write("   Waiting for device to be unlocked...\n");
        progress.updateStep("Awaiting device unlock");
        
        const unlocked = await waitForDeviceUnlock(
          context,
          destination.udid,
          (elapsed) => {
            progress.updateStep(`Awaiting device unlock (${elapsed}s)`);
          },
          120000, // 2 minutes timeout
        );

        if (!unlocked) {
          throw new Error(`Device "${destination.name}" is locked. Please unlock your device and try again.`);
        }

        terminal.write("   ✅ Device unlocked\n");
      }
    } catch (lockCheckError) {
      // If lock check fails, log but continue - don't block the build
      commonLogger.warn("Lock check failed, continuing anyway", { lockCheckError });
    }
  } else {
    throw new Error(`Unsupported destination type: ${destination.type}`);
  }

  // Add debug symbols if debugging
  if (attachDebugger) {
    additionalFlags = ["--compilation_mode=dbg", "--copt=-g", "--strip=never"];
  }

  const buildCommand = `cd "${bazelItem.package.path}" && bazel build ${bazelItem.target.buildLabel} ${platformFlag} ${additionalFlags.join(" ")}`;

  await terminal.execute({
    command: "sh",
    args: ["-c", buildCommand],
  });

  terminal.write("   ✅ Build completed\n");
}

/**
 * Locate the built app bundle
 */
async function locateAppBundle(
  terminal: TaskTerminal,
  progress: ProgressManager,
  options: {
    bazelItem: BazelTreeItem;
    destination: SimulatorDestination | DeviceDestination;
    attachDebugger: boolean;
  }
): Promise<string> {
  const { bazelItem, destination, attachDebugger } = options;

  progress.nextStep("Locating app bundle");
  
  if (attachDebugger) {
    terminal.write("\n📦 Step 2/6: Locating app bundle...\n");
  } else {
    terminal.write("\n📦 Step 2/4: Locating app bundle...\n");
  }

  // Convert build label to path: "//Apps/Foo:Bar" → "Apps/Foo/Bar"
  const packagePath = bazelItem.target.buildLabel.replace("//", "").replace(":", "/");

  // Find Bazel workspace root
  let workspaceRoot = bazelItem.package.path;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    try {
      const hasWorkspace = await exec({
        command: "test",
        args: ["-f", path.join(workspaceRoot, "WORKSPACE")],
      })
        .then(() => true)
        .catch(() => false);

      const hasModule = await exec({
        command: "test",
        args: ["-f", path.join(workspaceRoot, "MODULE.bazel")],
      })
        .then(() => true)
        .catch(() => false);

      if (hasWorkspace || hasModule) {
        break;
      }
    } catch {}

    const parent = path.dirname(workspaceRoot);
    if (parent === workspaceRoot) break;
    workspaceRoot = parent;
    attempts++;
  }

  terminal.write(`   Workspace root: ${workspaceRoot}\n`);

  // Look for app bundle or IPA
  const basePaths = [
    path.join(workspaceRoot, `bazel-bin/${packagePath}`),
    path.resolve(bazelItem.package.path, `bazel-bin/${packagePath}`),
  ];

  let appPath: string | undefined;

  if (destination.type === "iOSDevice") {
    // Try IPA first for device builds
    for (const basePath of basePaths) {
      const ipaPath = `${basePath}.ipa`;
      try {
        await exec({ command: "test", args: ["-e", ipaPath] });
        appPath = ipaPath;
        terminal.write(`   Found IPA: ${appPath}\n`);
        break;
      } catch {
        // Try .app
        const appBundlePath = `${basePath}.app`;
        try {
          await exec({ command: "test", args: ["-e", appBundlePath] });
          appPath = appBundlePath;
          terminal.write(`   Found APP: ${appPath}\n`);
          break;
        } catch {}
      }
    }
  } else {
    // For simulator, look for .app
    for (const tryPath of basePaths.map(p => `${p}.app`)) {
      try {
        await terminal.execute({
          command: "test",
          args: ["-d", tryPath],
        });
        appPath = tryPath;
        terminal.write(`   Found app bundle: ${appPath}\n`);
        break;
      } catch {}
    }
  }

  if (!appPath) {
    terminal.write("   ❌ App bundle not found. Tried:\n");
    for (const basePath of basePaths) {
      terminal.write(`      - ${basePath}.ipa\n`);
      terminal.write(`      - ${basePath}.app\n`);
    }
    throw new Error(`App bundle not found. Expected: bazel-bin/${packagePath}.{ipa,app}`);
  }

  return appPath;
}

/**
 * Prepare app for launch (fix permissions, code signing, etc.)
 */
async function prepareApp(
  terminal: TaskTerminal,
  progress: ProgressManager,
  options: {
    appPath: string;
    destination: SimulatorDestination | DeviceDestination;
    attachDebugger: boolean;
  }
): Promise<void> {
  const { appPath, destination, attachDebugger } = options;

  progress.nextStep("Preparing app");
  
  if (attachDebugger) {
    terminal.write("\n🔏 Step 3/6: Preparing app...\n");
  } else {
    terminal.write("\n🔏 Step 3/4: Preparing app...\n");
  }

  if (destination.type === "iOSSimulator") {
    // Fix permissions for simulator
    try {
      await terminal.execute({
        command: "chmod",
        args: ["-R", "755", appPath],
      });
      terminal.write("   ✅ File permissions fixed\n");
    } catch (error) {
      terminal.write(`   ⚠️  Permission fix failed: ${error}\n`);
    }

    // Ad-hoc code sign for simulator
    try {
      await terminal.execute({
        command: "codesign",
        args: [
          "--force",
          "--sign",
          "-",
          "--timestamp=none",
          "--preserve-metadata=identifier,entitlements,flags",
          appPath,
        ],
      });
      terminal.write("   ✅ Code signing successful\n");
    } catch (error) {
      terminal.write(`   ⚠️  Code signing failed, continuing anyway: ${error}\n`);
    }
  } else {
    // Verify code signing for device
    try {
      await terminal.execute({
        command: "codesign",
        args: ["--verify", "--verbose", appPath],
      });
      terminal.write("   ✅ Code signature valid\n");
    } catch (error) {
      terminal.write(`   ⚠️  Code signature verification failed: ${error}\n`);
      terminal.write("   Note: Device apps must be properly signed\n");
    }
  }
}

/**
 * Launch the app on the destination
 */
async function launchApp(
  context: ExtensionContext,
  terminal: TaskTerminal,
  progress: ProgressManager,
  options: {
    appPath: string;
    bundleId: string;
    destination: SimulatorDestination | DeviceDestination;
    attachDebugger: boolean;
    launchArgs: string[];
    launchEnv: Record<string, string>;
  }
): Promise<BazelLaunchResult> {
  const { appPath, bundleId, destination, attachDebugger, launchArgs, launchEnv } = options;

  // Stop any existing debug sessions before launching (if debugging)
  if (attachDebugger) {
    terminal.write("\n🛑 Cleaning up existing debug sessions and processes...\n");
    
    // 1. Stop VS Code debug sessions
    const activeSession = vscode.debug.activeDebugSession;
    if (activeSession) {
      commonLogger.log("Stopping existing debug session before launch", { 
        sessionId: activeSession.id,
        sessionType: activeSession.type,
        sessionName: activeSession.name || "unnamed"
      });
      
      terminal.write(`   Stopping debug session: ${activeSession.name || activeSession.type}...\n`);
      
      try {
        await vscode.debug.stopDebugging(activeSession);
        commonLogger.log("Stopped debug session", { sessionId: activeSession.id });
        terminal.write("   ✅ Stopped VS Code debug session\n");
        
        // Wait for session to clean up (VS Code stops debugserver automatically)
        await new Promise(resolve => setTimeout(resolve, 800));
        terminal.write("   ✅ Debug session cleaned up\n");
      } catch (error) {
        commonLogger.warn("Failed to stop debug session", { error });
        terminal.write("   ⚠️  Could not stop session cleanly\n");
      }
    } else {
      commonLogger.debug("No active debug session to stop");
    }
  }

  progress.nextStep("Launching app");
  
  if (attachDebugger) {
    terminal.write("\n🚀 Step 4/6: Launching app");
  } else {
    terminal.write("\n🚀 Step 4/4: Launching app");
  }

  if (destination.type === "iOSSimulator") {
    terminal.write(" on simulator...\n");
    terminal.write(`   Simulator: ${destination.name} (${destination.udid})\n`);

    const launchResult = await launchBazelAppOnSimulator(context, {
      appPath,
      bundleId,
      destination,
      waitForDebugger: attachDebugger,
      env: launchEnv,
      args: launchArgs,
    });

    terminal.write(`   ✅ App launched, PID: ${launchResult.pid}\n`);
    if (attachDebugger) {
      terminal.write("   ⏸️  App is paused, waiting for debugger to attach...\n");
    }

    // Bring Simulator.app to foreground after launch
    try {
      await exec({
        command: "open",
        args: ["-a", "Simulator"],
      });
    } catch (error) {
      commonLogger.debug("Failed to bring Simulator to foreground", { error });
    }

    return launchResult;
  } else {
    terminal.write(" on device...\n");
    terminal.write(`   Device: ${destination.name} (${destination.udid})\n`);

    const launchResult = await launchBazelAppOnDevice(context, {
      appPath,
      bundleId,
      destination: destination as DeviceDestination,
      waitForDebugger: attachDebugger,
      env: launchEnv,
      args: launchArgs,
    });

    terminal.write(`   ✅ App launched, PID: ${launchResult.pid}\n`);
    if (attachDebugger) {
      terminal.write("   ⏸️  App is paused, waiting for debugger to attach...\n");
    }

    return launchResult;
  }
}

/**
 * Attach debugger to the launched app
 */
async function attachDebuggerToApp(
  context: ExtensionContext,
  terminal: TaskTerminal,
  progress: ProgressManager,
  options: {
    launchResult: BazelLaunchResult;
    debugPort: number;
    destination: SimulatorDestination | DeviceDestination;
  }
): Promise<void> {
  const { launchResult, debugPort, destination } = options;

  // Step 5: Start debugserver
  progress.nextStep("Starting debugserver");
  terminal.write("\n🔌 Step 5/6: Starting debugserver...\n");
  terminal.write(`   Starting debugserver on port ${debugPort}...\n`);

  try {
    await startDebugServer({
      pid: launchResult.pid,
      port: debugPort,
      deviceId: destination.type === "iOSDevice" ? destination.udid : undefined,
    });
    terminal.write(`   ✅ Debugserver listening on port ${debugPort}\n`);
  } catch (error) {
    terminal.write(`   ⚠️  Failed to start debugserver: ${error}\n`);
    throw error;
  }

  // Step 6: Start VSCode debugging
  progress.nextStep("Attaching debugger");
  terminal.write("\n🐛 Step 6/6: Attaching VSCode debugger...\n");

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    terminal.write(`   Workspace: ${workspaceFolder?.name || "undefined"}\n`);

    const isDevice = destination.type === "iOSDevice";

    // The debug provider will handle the actual LLDB commands based on launch context
    const debugConfig: vscode.DebugConfiguration = {
      type: "swiftbazel-bazel-lldb",
      request: "attach",
      name: isDevice ? "swiftbazel: Bazel Debug (Device)" : "swiftbazel: Bazel Debug",
      debuggerRoot: workspaceFolder?.uri.fsPath || "${workspaceFolder}",
      debugPort: debugPort,
      internalConsoleOptions: "openOnSessionStart",
      timeout: 100000,
    };

    terminal.write("   Debug config:\n");
    terminal.write(`     - type: ${debugConfig.type}\n`);
    terminal.write(`     - debugPort: ${debugConfig.debugPort}\n`);
    terminal.write(`     - target: ${isDevice ? "Device" : "Simulator"}\n`);
    terminal.write("   Calling vscode.debug.startDebugging()...\n");
    const started = await vscode.debug.startDebugging(workspaceFolder, debugConfig);

    if (started) {
      terminal.write("\n   ✅ Debugger attached successfully!\n\n");
      terminal.write("🎉 Happy debugging! Set breakpoints and inspect variables.\n");
    } else {
      terminal.write("\n   ⚠️  Failed to start debugger automatically.\n");
      terminal.write("   Please start debugging manually by pressing F5.\n\n");
    }
  } catch (error) {
    terminal.write(`\n   ❌ Error starting debugger: ${error}\n`);
    terminal.write("\n   Please start debugging manually by pressing F5.\n\n");
    commonLogger.error("Error starting debugger", { error });
  }
}

/**
 * Unified build and launch workflow
 * Used by both regular run and debug commands
 */
export async function buildAndLaunchBazelApp(
  context: ExtensionContext,
  terminal: TaskTerminal,
  options: BuildAndLaunchOptions,
): Promise<BuildAndLaunchResult> {
  const {
    bazelItem,
    destination,
    attachDebugger,
    debugPort = DEFAULT_DEBUG_PORT,
    launchArgs = [],
    launchEnv = {},
  } = options;

  // Create progress manager with appropriate steps
  const progress = new ProgressManager({
    steps: attachDebugger ? BUILD_AND_LAUNCH_DEBUG_STEPS : BUILD_AND_LAUNCH_STEPS,
    context,
    taskName: attachDebugger ? `Debug: ${bazelItem.target.name}` : `Run: ${bazelItem.target.name}`,
  });

  terminal.write(
    attachDebugger
      ? `🐛 Starting debug workflow for ${bazelItem.target.name}\n\n`
      : `🚀 Starting launch workflow for ${bazelItem.target.name}\n\n`
  );

  // Step 1: Build
  await buildBazelTarget(context, terminal, progress, { bazelItem, destination, attachDebugger });

  // Step 2: Locate app bundle
  const appPath = await locateAppBundle(terminal, progress, { bazelItem, destination, attachDebugger });

  // Get bundle ID
  const bundleId = await getBundleIdentifier(appPath);
  terminal.write(`   Bundle ID: ${bundleId}\n`);

  // Step 3: Prepare app
  await prepareApp(terminal, progress, { appPath, destination, attachDebugger });

  // Step 4: Launch app
  const launchResult = await launchApp(context, terminal, progress, {
    appPath,
    bundleId,
    destination,
    attachDebugger,
    launchArgs,
    launchEnv,
  });

  // Store launch context
  if (destination.type === "iOSSimulator") {
    context.updateWorkspaceState("build.lastLaunchedApp", {
      type: "bazel-simulator" as const,
      appPath,
      targetName: bazelItem.target.name,
      buildLabel: bazelItem.target.buildLabel,
      simulatorId: destination.udid,
      simulatorName: destination.name,
    });
  } else {
    context.updateWorkspaceState("build.lastLaunchedApp", {
      type: "bazel-device" as const,
      appPath,
      targetName: bazelItem.target.name,
      buildLabel: bazelItem.target.buildLabel,
      destinationId: destination.udid,
      destinationType: destination.type,
      pid: launchResult.pid,
    });
  }

  // Steps 5-6: Attach debugger (only if debugging)
  if (attachDebugger) {
    await attachDebuggerToApp(context, terminal, progress, {
      launchResult,
      debugPort,
      destination,
    });
  }

  progress.complete();
  
  terminal.write(
    attachDebugger
      ? "\n✅ Debug workflow completed. Debugger is attached and running.\n"
      : "\n✅ Launch completed successfully.\n"
  );

  return {
    appPath,
    bundleId,
    launchResult,
  };
}

