import type {
  SimulatorDestination,
  SimulatorOS,
  SimulatorType,
} from "../../domain/entities/destination/simulator-types.js";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { ExtensionError } from "../errors/errors.js";
import { exec } from "./exec.js";

export async function getSimulatorByUdid(
  context: ExtensionContext,
  options: {
    udid: string;
  },
): Promise<SimulatorDestination> {
  const simulators = await context.destinationsManager.refreshSimulators();

  for (const simulator of simulators) {
    if (simulator.udid === options.udid) {
      return simulator;
    }
  }
  throw new ExtensionError("Simulator not found", { context: { udid: options.udid } });
}

/**
 * Parse the device type identifier to get the device type. Examples:
 *  - com.apple.CoreSimulator.SimDeviceType.Apple-Vision-Pro
 *  - com.apple.CoreSimulator.SimDeviceType.iPhone-8-Plus
 *  - com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation
 *  - com.apple.CoreSimulator.SimDeviceType.iPod-touch--7th-generation-
 *  - com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-3rd-generation
 *  - com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-4
 *  - com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-5-40mm
 */
export function parseDeviceTypeIdentifier(deviceTypeIdentifier: string): SimulatorType | null {
  const prefix = "com.apple.CoreSimulator.SimDeviceType.";
  if (!deviceTypeIdentifier?.startsWith(prefix)) {
    return null;
  }

  const deviceType = deviceTypeIdentifier.slice(prefix.length);
  if (!deviceType) {
    return null;
  }
  if (deviceType.startsWith("iPhone")) {
    return "iPhone";
  }
  if (deviceType.startsWith("iPad")) {
    return "iPad";
  }
  if (deviceType.startsWith("iPod")) {
    return "iPod";
  }
  if (deviceType.startsWith("Apple-TV")) {
    return "AppleTV";
  }
  if (deviceType.startsWith("Apple-Watch")) {
    return "AppleWatch";
  }
  if (deviceType.startsWith("Apple-Vision")) {
    return "AppleVision";
  }
  return null;
}

/**
 * Parse the simulator runtime to get the OS version. Examples:
 *  - com.apple.CoreSimulator.SimRuntime.xrOS-2-0
 *  - com.apple.CoreSimulator.SimRuntime.iOS-15-2
 *  - com.apple.CoreSimulator.SimRuntime.tvOS-18-0
 *  - com.apple.CoreSimulator.SimRuntime.watchOS-8-5
 */
export function parseSimulatorRuntime(runtime: string): {
  os: SimulatorOS;
  version: string;
} | null {
  const prefix = "com.apple.CoreSimulator.SimRuntime.";
  if (!runtime?.startsWith(prefix)) {
    return null;
  }

  // // com.apple.CoreSimulator.SimRuntime.iOS-15-2 -> 15.2
  // const rawOSVersion = runtime.split(".").slice(-1)[0];
  // const osVersion = rawOSVersion.replace(/^(\w+)-(\d+)-(\d+)$/, "$2.$3");

  // examples:
  // - xrOS-2-0 -> { os: "xrOS", version: "2.0" }
  // - iOS-15-2 -> { os: "iOS", version: "15.2" }
  // - tvOS-18-0 -> { os: "tvOS", version: "18.0" }
  // - watchOS-8-5 -> { os: "watchOS", version: "8.5" }
  const simRuntime = runtime.slice(prefix.length);
  if (!simRuntime) {
    return null;
  }

  const regex = /^(\w+)-(\d+)-(\d+)$/;
  const matches = simRuntime.match(regex);
  if (!matches) {
    return null;
  }

  const rawOs = matches[1] as string;
  const version = `${matches[2]}.${matches[3]}`;

  if (rawOs === "xrOS") {
    return { os: "xrOS", version };
  }
  if (rawOs === "iOS") {
    return { os: "iOS", version };
  }
  if (rawOs === "tvOS") {
    return { os: "tvOS", version };
  }
  if (rawOs === "watchOS") {
    return { os: "watchOS", version };
  }
  return null;
}

/**
 * Wait for simulator to finish booting
 */
export async function waitForSimulatorBoot(udid: string, timeoutMs = 60000): Promise<void> {
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
        return;
      }
    } catch (_error) {
      // Ignore parse errors, will retry
    }

    // Wait 1 second before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Simulator failed to boot within ${Math.round(timeoutMs / 1000)} seconds.\nSimulator UDID: ${udid}\n\nThe simulator may be unresponsive. Try:\n1. Quit Simulator.app and try again\n2. Run: xcrun simctl shutdown all\n3. Restart your Mac if simulators are consistently stuck\n4. Check Console.app for CoreSimulator errors`,
  );
}

// Ensures only the specified simulator device is open
export async function ensureSingleSimulator(context: ExtensionContext, deviceNameOrUdid: string) {
  context.updateProgressStatus(`Ensuring single Simulator: ${deviceNameOrUdid}`);

  try {
    // 1) Get devices list as JSON
    const output = await exec({
      command: "xcrun",
      args: ["simctl", "list", "devices", "--json"],
    });

    const devices = JSON.parse(output).devices; // map keyed by runtime
    let target = null;
    const bootedUDIDs = [];

    // 2) Find target device and collect booted UDIDs
    // Support both UDID and name for backwards compatibility
    for (const runtime of Object.keys(devices)) {
      for (const d of devices[runtime]) {
        if (d.state === "Booted") bootedUDIDs.push(d.udid);
        // Try matching by UDID first (exact match), then by name
        if (d.udid === deviceNameOrUdid || d.name === deviceNameOrUdid) {
          target = d;
        }
      }
    }

    if (!target) {
      throw new Error(
        `Simulator not found in available devices.\nSearched for: ${deviceNameOrUdid}\n\nThe simulator may have been deleted or is unavailable. Try:\n1. Refresh the DESTINATIONS view\n2. Select a different simulator\n3. Check Xcode > Window > Devices and Simulators\n4. Create the simulator if it doesn't exist`,
      );
    }

    // 3) Shutdown other booted devices (except the target if it's already booted)
    const othersToShutdown = bootedUDIDs.filter((u) => u !== target.udid);
    for (const udid of othersToShutdown) {
      context.updateProgressStatus(`Shutting down extra simulator ${udid}`);
      // ignore errors if already shutting down
      await exec({
        command: "xcrun",
        args: ["simctl", "shutdown", udid],
      }).catch(() => {});
    }

    // 4) Boot the target if not booted
    if (target.state !== "Booted") {
      context.updateProgressStatus(`Booting ${target.name}`);
      await exec({
        command: "xcrun",
        args: ["simctl", "boot", target.udid],
      });
    } else {
      context.updateProgressStatus(`${target.name} already booted`);
    }

    // 5) Open Simulator.app (won't open a second app instance; windows = devices)
    context.updateProgressStatus("Opening Simulator");
    await exec({
      command: "open",
      args: ["-g", "-a", "Simulator"],
    });

    context.updateProgressStatus("Simulator ready — single device ensured");
  } catch (err) {
    context.updateProgressStatus("Failed to ensure single Simulator");
    throw err;
  }
}
