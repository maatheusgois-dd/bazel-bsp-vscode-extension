import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import { type DeviceCtlProcess, getRunningProcesses } from "../../apple-platforms/devicectl.adapter.js";
import { exec } from "../../../shared/utils/exec.js";

/**
 * Wait while the process is launched on the device and return the process information.
 */
export async function waitForProcessToLaunch(
  context: ExtensionContext,
  options: {
    deviceId: string;
    appName: string;
    timeoutMs: number;
  },
): Promise<DeviceCtlProcess> {
  const { appName, deviceId, timeoutMs } = options;

  const startTime = Date.now(); // in milliseconds

  // await pairDevice({ deviceId });

  while (true) {
    // Sometimes launching can go wrong, so we need to stop the waiting process
    // after some time and throw an error.
    const elapsedTime = Date.now() - startTime; // in milliseconds
    if (elapsedTime > timeoutMs) {
      throw new Error(`Timeout waiting for the process to launch: ${appName}`);
    }

    // Query the running processes on the device using the devicectl command
    const result = await getRunningProcesses(context, { deviceId: deviceId });
    const runningProcesses = result?.result?.runningProcesses ?? [];
    if (runningProcesses.length === 0) {
      throw new Error("No running processes found on the device");
    }

    // Example of a running process:
    // {
    //   "executable" : "file:///private/var/containers/Bundle/Application/5045C7CE-DFB9-4C17-BBA9-94D8BCD8F565/Mastodon.app/Mastodon",
    //   "processIdentifier" : 19350
    // },
    // Example of appName: "Mastodon.app"
    const process = runningProcesses.find((p) => p.executable?.includes(appName));
    if (process) {
      return process;
    }

    // Wait for 1 second before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/**
 * Wait for a process to be launched on a simulator
 */
export async function waitForSimulatorProcessToLaunch(
  options: {
    simulatorId: string;
    bundleId: string;
    timeoutMs: number;
  },
): Promise<number> {
  const { simulatorId, bundleId, timeoutMs } = options;

  const startTime = Date.now();

  while (true) {
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > timeoutMs) {
      throw new Error(`Timeout waiting for simulator process to launch: ${bundleId}`);
    }

    try {
      // Query the simulator for running processes using simctl
      const output = await exec({
        command: "xcrun",
        args: ["simctl", "spawn", simulatorId, "launchctl", "list"],
      });

      // Look for our bundle ID in the running processes
      if (output.includes(bundleId)) {
        // Get the actual PID using ps
        const psOutput = await exec({
          command: "pgrep",
          args: ["-f", bundleId],
        });

        const pidMatch = psOutput.trim().split("\n")[0];
        if (pidMatch) {
          const pid = Number.parseInt(pidMatch, 10);
          if (!Number.isNaN(pid)) {
            return pid;
          }
        }
      }
    } catch (error) {
      // Process not found yet, continue waiting
    }

    // Wait for 500ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
