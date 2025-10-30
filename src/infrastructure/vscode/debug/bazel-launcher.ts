/**
 * Bazel iOS App Launcher with Debug Support
 *
 * This module provides functionality to launch Bazel-built iOS apps on simulators/devices
 * with debugging support, similar to rules_apple's simulator launcher.
 */

import * as path from "node:path";
import type { DeviceDestination } from "../../../domain/entities/destination/device-types.js";
import type { SimulatorDestination } from "../../../domain/entities/destination/simulator-types.js";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../../../shared/logger/logger.js";
import { exec } from "../../../shared/utils/exec.js";
import { getSimulatorByUdid } from "../../../shared/utils/simulator-utils.js";

export interface BazelLaunchOptions {
  /** Path to the .app bundle */
  appPath: string;
  /** Bundle identifier of the app */
  bundleId: string;
  /** Simulator or device to launch on */
  destination: SimulatorDestination | DeviceDestination;
  /** Whether to wait for debugger to attach before running */
  waitForDebugger: boolean;
  /** Environment variables to pass to the app */
  env?: Record<string, string>;
  /** Arguments to pass to the app */
  args?: string[];
}

export interface BazelLaunchResult {
  /** Process ID of the launched app */
  pid: number;
  /** Bundle identifier */
  bundleId: string;
  /** Device/simulator ID */
  deviceId: string;
  /** Full app path on the device/simulator */
  appPath: string;
}

/**
 * Launch a Bazel-built iOS app on a simulator
 */
export async function launchBazelAppOnSimulator(
  context: ExtensionContext,
  options: BazelLaunchOptions & { destination: SimulatorDestination },
): Promise<BazelLaunchResult> {
  const { appPath, bundleId, destination, waitForDebugger, env = {}, args = [] } = options;
  const simulatorId = destination.udid;

  commonLogger.log("Launching Bazel app on simulator", {
    appPath,
    bundleId,
    simulatorId,
    waitForDebugger,
  });

  context.updateProgressStatus("Preparing simulator");

  // 1. Get simulator with fresh state
  const simulator = await getSimulatorByUdid(context, { udid: simulatorId });

  // 2. Open Simulator.app if not already open
  context.updateProgressStatus("Opening Simulator");
  await exec({
    command: "open",
    args: ["-g", "-a", "Simulator"],
  });

  // 3. Boot simulator if needed
  if (!simulator.isBooted) {
    context.updateProgressStatus("Booting simulator");
    commonLogger.log(`Booting simulator: ${simulator.name}`);
    await exec({
      command: "xcrun",
      args: ["simctl", "boot", simulator.udid],
    });

    // Wait for simulator to be fully booted
    await waitForSimulatorBoot(simulator.udid);
  }

  // 4. Terminate existing instances (before installing)
  context.updateProgressStatus("Terminating existing instances");
  commonLogger.log(`Terminating any existing instances of the app`);
  try {
    await exec({
      command: "xcrun",
      args: ["simctl", "terminate", simulator.udid, bundleId],
    });
  } catch (_error) {
    // App might not be running, ignore error
    commonLogger.debug("No existing instance to terminate");
  }

  // 5. Install app on simulator
  context.updateProgressStatus("Installing app on simulator");
  commonLogger.log(`Installing app on simulator: ${simulator.name}`);
  await exec({
    command: "xcrun",
    args: ["simctl", "install", simulator.udid, appPath],
  });

  // 6. Launch app with or without debugger flag
  context.updateProgressStatus("Launching app on simulator");
  const launchArgs = [
    "simctl",
    "launch",
    ...(waitForDebugger ? ["--wait-for-debugger"] : []),
    "--terminate-running-process", // Extra safety in case another instance started
    simulator.udid,
    bundleId,
    ...args,
  ];

  // Prepare environment variables (simctl requires SIMCTL_CHILD_ prefix)
  const launchEnv = Object.fromEntries(Object.entries(env).map(([key, value]) => [`SIMCTL_CHILD_${key}`, value]));

  commonLogger.log("Launching app", { launchArgs, launchEnv });

  const output = await exec({
    command: "xcrun",
    args: launchArgs,
    env: launchEnv,
  });

  // Parse PID from output
  // Output format: "com.example.MyApp: 12345"
  const pidMatch = output.match(/:\s*(\d+)/);
  if (!pidMatch) {
    throw new Error(`Failed to extract PID from launch output: ${output}`);
  }

  const pid = Number.parseInt(pidMatch[1], 10);

  commonLogger.log("App launched successfully", { pid, bundleId });

  return {
    pid,
    bundleId,
    deviceId: simulator.udid,
    appPath,
  };
}

/**
 * Launch a Bazel-built iOS app on a physical device
 */
export async function launchBazelAppOnDevice(
  context: ExtensionContext,
  options: BazelLaunchOptions & { destination: DeviceDestination },
): Promise<BazelLaunchResult> {
  const { appPath, bundleId, destination, waitForDebugger, env = {}, args = [] } = options;
  const deviceId = destination.udid;

  commonLogger.log("Launching Bazel app on device", {
    appPath,
    bundleId,
    deviceId,
    waitForDebugger,
  });

  // Check if device is locked and wait for unlock
  try {
    const { isDeviceLocked, waitForDeviceUnlock } = await import("../../../infrastructure/apple-platforms/devicectl.adapter.js");
    
    const locked = await isDeviceLocked(context, deviceId);
    if (locked) {
      commonLogger.log("Device is locked, waiting for unlock", { deviceId });
      context.updateProgressStatus("⏸️  Awaiting device unlock");
      
      const unlocked = await waitForDeviceUnlock(
        context,
        deviceId,
        (elapsed) => {
          context.updateProgressStatus(`⏸️  Awaiting device unlock (${elapsed}s)`);
        },
        120000, // 2 minutes timeout
      );

      if (!unlocked) {
        throw new Error(`Device "${destination.name}" is locked. Please unlock your device and try again.`);
      }

      commonLogger.log("Device unlocked, continuing with installation");
    }
  } catch (lockCheckError) {
    // If lock check fails, log but continue - don't block installation
    commonLogger.warn("Lock check failed, continuing with installation", { lockCheckError });
  }

  // 1. Terminate existing instances (before installing)
  context.updateProgressStatus("Terminating existing instances");
  commonLogger.log(`Terminating any existing instances of the app`);
  try {
    await exec({
      command: "xcrun",
      args: ["devicectl", "device", "process", "terminate", "--device", deviceId, bundleId],
    });
    commonLogger.log("Terminated existing instance");
  } catch (_error) {
    // App might not be running, ignore error
    commonLogger.debug("No existing instance to terminate");
  }

  // 2. Install app on device
  context.updateProgressStatus("Installing app on device");
  commonLogger.log(`Installing app on device: ${destination.name}`);
  await exec({
    command: "xcrun",
    args: ["devicectl", "device", "install", "app", "--device", deviceId, appPath],
  });

  // 3. Launch app with devicectl using JSON output
  context.updateProgressStatus("Launching app on device");
  
  // Use a temp file for JSON output
  const { tempFilePath, readJsonFile } = await import("../../../shared/utils/files.js");
  await using tmpPath = await tempFilePath(context, {
    prefix: "device-launch",
  });

  const launchArgs = [
    "devicectl",
    "device",
    "process",
    "launch",
    "--device",
    deviceId,
    ...(waitForDebugger ? ["--start-stopped"] : []),
    "--terminate-existing",
    "--json-output",
    tmpPath.path,
    bundleId,
    ...args,
  ];

  // Prepare environment variables (devicectl requires DEVICECTL_CHILD_ prefix)
  const launchEnv = Object.fromEntries(Object.entries(env).map(([key, value]) => [`DEVICECTL_CHILD_${key}`, value]));

  commonLogger.log("Launching app on device", { launchArgs, launchEnv });

  await exec({
    command: "xcrun",
    args: launchArgs,
    env: launchEnv,
  });

  // Parse JSON output to get PID
  type DeviceLaunchResult = {
    result?: {
      process?: {
        processIdentifier?: number;
      };
    };
  };

  const result = await readJsonFile<DeviceLaunchResult>(tmpPath.path);
  const pid = result.result?.process?.processIdentifier;

  if (!pid) {
    commonLogger.error("Failed to extract PID from devicectl output", { result });
    throw new Error(`Failed to extract PID from launch output. Check logs for details.`);
  }

  commonLogger.log("App launched successfully on device", { pid, bundleId });

  return {
    pid,
    bundleId,
    deviceId,
    appPath,
  };
}

/**
 * Wait for simulator to finish booting
 */
async function waitForSimulatorBoot(udid: string, timeoutMs = 30000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const output = await exec({
      command: "xcrun",
      args: ["simctl", "list", "devices", "-j", udid],
    });

    try {
      const data = JSON.parse(output);
      const devices = Object.values(data.devices).flat() as any[];
      const device = devices.find((d) => d.udid === udid);

      if (device?.state === "Booted") {
        commonLogger.log("Simulator booted successfully");
        return;
      }
    } catch (error) {
      commonLogger.warn("Failed to parse simulator list output", { error });
    }

    // Wait 1 second before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Simulator failed to boot within ${timeoutMs}ms`);
}

/**
 * Extract bundle identifier from .app bundle
 */
export async function getBundleIdentifier(appPath: string): Promise<string> {
  const plistPath = path.join(appPath, "Info.plist");

  // Check if the app bundle exists
  try {
    await exec({
      command: "test",
      args: ["-d", appPath],
    });
  } catch (_error) {
    throw new Error(`App bundle does not exist: ${appPath}`);
  }

  // Check if Info.plist exists
  try {
    await exec({
      command: "test",
      args: ["-f", plistPath],
    });
  } catch (_error) {
    // List contents of app bundle for debugging
    try {
      const contents = await exec({
        command: "ls",
        args: ["-la", appPath],
      });
      commonLogger.warn("Info.plist not found. App bundle contents:", {
        appPath,
        contents,
      });
    } catch {
      // Ignore ls error
    }
    throw new Error(`Info.plist not found at: ${plistPath}`);
  }

  // Read bundle identifier
  try {
    const output = await exec({
      command: "/usr/libexec/PlistBuddy",
      args: ["-c", "Print :CFBundleIdentifier", plistPath],
    });
    return output.trim();
  } catch (error) {
    throw new Error(`Failed to read CFBundleIdentifier from ${plistPath}: ${error}`);
  }
}

/**
 * Start debugserver and attach to a process
 * Returns a promise that resolves when debugserver exits
 */
export async function startDebugServer(options: {
  pid: number;
  port: number;
  deviceId?: string;
}): Promise<void> {
  const { pid, port, deviceId } = options;

  // Kill any existing debugserver processes (comprehensive cleanup)
  commonLogger.log("Cleaning up any existing debugserver processes", { port });
  
  try {
    // Method 1: Kill all debugserver processes globally
    await exec({
      command: "pkill",
      args: ["-9", "debugserver"],
    }).catch(() => {
      commonLogger.debug("No global debugserver processes to kill");
    });

    // Method 2: Find and kill processes on this specific port using lsof
    const existingProcess = await exec({
      command: "lsof",
      args: ["-ti", `:${port}`],
    }).catch(() => "");

    if (existingProcess.trim()) {
      const pids = existingProcess.trim().split("\n");
      for (const existingPid of pids) {
        if (existingPid) {
          commonLogger.log("Killing process on port", { port, pid: existingPid });
          await exec({
            command: "kill",
            args: ["-9", existingPid],
          }).catch(() => {});
        }
      }
    }

    // Method 3: Kill debugservers attached to old PIDs
    await exec({
      command: "pkill",
      args: ["-9", "-f", `debugserver.*--attach`],
    }).catch(() => {
      commonLogger.debug("No debugserver --attach processes found");
    });

    // Wait for processes to fully terminate
    await new Promise((resolve) => setTimeout(resolve, 500));
    commonLogger.log("Debugserver cleanup complete");
  } catch (error) {
    // Ignore errors - might not be any processes to kill
    commonLogger.debug("Error during cleanup (expected if no existing debugserver)", { error });
  }

  // For physical devices, use remote debugging via LLDB
  if (deviceId) {
    commonLogger.log("Device debugging: setting up remote connection", { deviceId, pid, port });
    
    // For device debugging, LLDB connects directly to the device process
    // The app was launched with --start-stopped and is waiting for debugger
    // No local debugserver needed - LLDB will attach remotely
    
    // Wait a moment to ensure the process is ready on device
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    commonLogger.log("Device ready for remote debugging", { port, pid });
    return;
  }

  // Simulator debugging: start local debugserver
  const xcodeDevPath = await exec({
    command: "xcode-select",
    args: ["-p"],
  });

  const debugserverPath = path.join(
    xcodeDevPath.trim(),
    "..",
    "SharedFrameworks",
    "LLDB.framework",
    "Versions",
    "A",
    "Resources",
    "debugserver",
  );

  const debugserverArgs = [`localhost:${port}`, "--attach", pid.toString()];

  // Verify the target process is still running before attaching (simulator only)
  try {
    await exec({
      command: "ps",
      args: ["-p", pid.toString()],
    });
    commonLogger.log("Target process is running", { pid });
  } catch (_error) {
    throw new Error(`Target process ${pid} is not running. App may have crashed or exited.`);
  }

  commonLogger.log("Starting debugserver", {
    debugserverPath,
    args: debugserverArgs,
    pid,
    port,
  });

  // Import spawn to run debugserver in background
  const { spawn } = await import("node:child_process");

  // Launch debugserver in background (don't wait for it to complete)
  return new Promise((resolve, reject) => {
    commonLogger.log("Spawning debugserver process...", {
      command: debugserverPath,
      args: debugserverArgs,
    });

    const debugserverProcess = spawn(debugserverPath, debugserverArgs, {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let started = false;
    let allStdout = "";
    let allStderr = "";

    commonLogger.log("debugserver process spawned", {
      pid: debugserverProcess.pid,
    });

    // Listen for stdout/stderr for debugging
    debugserverProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      allStdout += output;
      commonLogger.log("debugserver stdout", { output, total: allStdout });
    });

    debugserverProcess.stderr?.on("data", (data) => {
      const output = data.toString();
      allStderr += output;
      commonLogger.error("debugserver stderr", { output, total: allStderr });

      // Check for common debugserver errors
      if (output.includes("error") || output.includes("failed") || output.includes("unable")) {
        commonLogger.error("debugserver reported error in stderr", { stderr: output });
      }
    });

    debugserverProcess.on("error", (error) => {
      commonLogger.error("debugserver spawn error", {
        error,
        errorType: typeof error,
        errorMessage: (error as any)?.message,
      });
      if (!started) {
        reject(error);
      }
    });

    debugserverProcess.on("exit", (code, signal) => {
      commonLogger.log("debugserver process exited", {
        code,
        signal,
        stdout: allStdout,
        stderr: allStderr,
        wasStarted: started,
        pid: debugserverProcess.pid,
      });

      // If exited before we confirmed it was listening, that's an error
      if (!started) {
        const errorMsg =
          code !== 0
            ? `debugserver exited with code ${code}. stderr: ${allStderr || "(empty)"}, stdout: ${allStdout || "(empty)"}`
            : `debugserver exited unexpectedly (code 0) before listening. stderr: ${allStderr || "(empty)"}, stdout: ${allStdout || "(empty)"}`;
        reject(new Error(errorMsg));
      }
    });

    // debugserver with --attach doesn't print to stdout and port detection
    // from Node.js is unreliable due to permissions/environment issues.
    // We've verified manually that debugserver DOES start listening,
    // so just wait a reasonable time and proceed.
    const waitTime = 2000; // 2 seconds should be plenty for debugserver to attach

    commonLogger.log("Waiting for debugserver to attach and start listening", {
      port,
      waitTime,
      debugserverPid: debugserverProcess.pid,
    });

    setTimeout(() => {
      // Check if process exited during wait
      if (debugserverProcess.exitCode !== null) {
        const errorMsg = `debugserver exited with code ${debugserverProcess.exitCode} during startup. stderr: ${allStderr || "(empty)"}, stdout: ${allStdout || "(empty)"}`;
        commonLogger.error("debugserver exited before timeout", {
          exitCode: debugserverProcess.exitCode,
          stdout: allStdout,
          stderr: allStderr,
        });
        reject(new Error(errorMsg));
        return;
      }

      commonLogger.log("debugserver wait complete, assuming it's listening", {
        processAlive: !debugserverProcess.killed,
        processPid: debugserverProcess.pid,
        exitCode: debugserverProcess.exitCode,
      });

      started = true;
      resolve();
    }, waitTime);
  });
}
