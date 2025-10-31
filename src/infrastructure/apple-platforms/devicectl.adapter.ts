import * as vscode from "vscode";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../../shared/logger/logger.js";
import { exec } from "../../shared/utils/exec.js";
import { readJsonFile, tempFilePath } from "../../shared/utils/files.js";

type DeviceCtlListCommandOutput = {
  result: {
    devices: DeviceCtlDevice[];
  };
};

export type DeviceCtlDevice = {
  capabilities: DeviceCtlDeviceCapability[];
  connectionProperties: DeviceCtlConnectionProperties;
  deviceProperties: DeviceCtlDeviceProperties;
  hardwareProperties: DeviceCtlHardwareProperties;
  identifier: string;
  visibilityClass: "default";
};

type DeviceCtlConnectionProperties = {
  authenticationType: "manualPairing";
  isMobileDeviceOnly: boolean;
  lastConnectionDate: string;
  pairingState: "paired";
  potentialHostnames: string[];
  transportType: "localNetwork" | "wired";
  tunnelState: "disconnected" | "connected" | "unavailable";
  tunnelTransportProtocol: "tcp";
};

type DeviceCtlCpuType = {
  name: "arm64e" | "arm64" | "arm64_32";
  subType: number;
  type: number;
};

type DeviceCtlDeviceProperties = {
  bootedFromSnapshot: boolean;
  bootedSnapshotName: string;
  ddiServicesAvailable: boolean;
  developerModeStatus: "enabled";
  hasInternalOSBuild: boolean;
  name: string;
  osBuildUpdate: string;
  osVersionNumber: string;
  rootFileSystemIsWritable: boolean;
};

export type DeviceCtlDeviceType = "iPhone" | "iPad" | "appleWatch" | "appleTV" | "appleVision";

type DeviceCtlHardwareProperties = {
  cpuType: DeviceCtlCpuType;
  deviceType: DeviceCtlDeviceType;
  ecid: number;
  hardwareModel: string;
  internalStorageCapacity: number;
  isProductionFused: boolean;
  marketingName: string;
  platform: "iOS";
  productType: "iPhone13,4" | "iPhone15,3";
  reality: "physical";
  serialNumber: string;
  supportedCPUTypes: DeviceCtlCpuType[];
  supportedDeviceFamilies: number[];
  thinningProductType: "iPhone15,3";
  udid: string;
};

type DeviceCtlDeviceCapability = {
  name: string;
  featureIdentifier: string;
};

export async function listDevices(context: ExtensionContext): Promise<DeviceCtlListCommandOutput> {
  await using tmpPath = await tempFilePath(context, {
    prefix: "devices",
  });

  const devicesStdout = await exec({
    command: "xcrun",
    args: ["devicectl", "list", "devices", "--json-output", tmpPath.path, "--timeout", "10"],
  });
  commonLogger.debug("Stdout devicectl list devices", { stdout: devicesStdout });

  return await readJsonFile<DeviceCtlListCommandOutput>(tmpPath.path);
}

/**
 * Check if a device is connected and usable
 */
export async function isDeviceConnected(
  context: ExtensionContext,
  deviceId: string,
): Promise<{ connected: boolean; device?: DeviceCtlDevice }> {
  try {
    const devices = await listDevices(context);

    // Search by identifier OR udid (case-insensitive)
    const deviceIdLower = deviceId.toLowerCase();
    const device = devices.result.devices.find(
      (d) => d.identifier.toLowerCase() === deviceIdLower || d.hardwareProperties.udid.toLowerCase() === deviceIdLower,
    );

    if (!device) {
      commonLogger.warn("Device not found in devicectl list", {
        searchId: deviceId,
        availableDevices: devices.result.devices.map((d) => ({
          identifier: d.identifier,
          udid: d.hardwareProperties.udid,
          name: d.deviceProperties.name,
        })),
      });
      return { connected: false };
    }

    // Device is usable if:
    // 1. It's paired (pairingState === "paired")
    // 2. Tunnel is not unavailable (can be "connected" or "disconnected" for USB devices)
    const isPaired = device.connectionProperties.pairingState === "paired";
    const tunnelState = device.connectionProperties.tunnelState;
    const tunnelNotUnavailable = tunnelState !== "unavailable";
    const isConnected = isPaired && tunnelNotUnavailable;

    return { connected: isConnected, device };
  } catch (error) {
    commonLogger.error("Error checking device connection", { error, deviceId });
    return { connected: false };
  }
}

/**
 * Ensure device is connected, show error notification if not
 * @throws Error if device is not connected
 */
export async function ensureDeviceConnected(
  context: ExtensionContext,
  options: {
    deviceId: string;
    deviceName: string;
  },
): Promise<void> {
  const { deviceId, deviceName } = options;

  const { connected, device } = await isDeviceConnected(context, deviceId);

  if (!connected) {
    let title: string;
    let message: string;

    if (device) {
      // Device found but not connected
      const tunnelState = device.connectionProperties.tunnelState;
      const transportType = device.connectionProperties.transportType;

      title = `📱 Device Not Connected: ${deviceName}`;
      message = `Connection Status:\n• Tunnel: ${tunnelState}\n• Transport: ${transportType}\n• Pairing: ${device.connectionProperties.pairingState}\n\nTo reconnect:\n${transportType === "wired" ? "1. Check USB cable connection\n" : "1. Ensure device and computer are on same WiFi\n"}2. Unlock the device\n3. Trust this computer if prompted\n4. Try disconnecting and reconnecting`;
    } else {
      // Device not found at all
      title = `📱 Device Not Found: ${deviceName}`;
      message =
        "The device is not detected by devicectl.\n\n" +
        "To fix:\n" +
        "1. Connect device via USB cable\n" +
        "2. Unlock the device\n" +
        `3. Tap "Trust" on device when prompted\n` +
        "4. Check cable and port are working\n" +
        "5. Try a different USB cable/port\n" +
        "6. Restart Xcode if issues persist";
    }

    const action = await vscode.window.showErrorMessage(`${title}\n\n${message}`, "Refresh Devices", "Open Settings");

    if (action === "Refresh Devices") {
      await vscode.commands.executeCommand("swiftbazel.destinations.refresh");
      // After refresh, retry the connection check
      const retryCheck = await isDeviceConnected(context, deviceId);
      if (!retryCheck.connected) {
        throw new Error(`📱 Device "${deviceName}" still not connected after refresh`);
      }
      return; // Success after refresh
    }

    if (action === "Open Settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "swiftbazel");
    }

    throw new Error(
      `📱 Device "${deviceName}" is not connected (${device?.connectionProperties.tunnelState || "not found"})`,
    );
  }

  commonLogger.log("✅ Device connection verified", {
    deviceId,
    deviceName,
    tunnelState: device?.connectionProperties.tunnelState,
    transportType: device?.connectionProperties.transportType,
  });
}

export type DeviceCtlProcessResult = {
  result: {
    runningProcesses: DeviceCtlProcess[];
  };
};

export type DeviceCtlProcess = {
  executable?: string; // Ex: file:///private/var/containers/Bundle/Application/183E1862-A6F2-4060-AEEF-16F61C88F91E/terminal23.app/terminal23
  processIdentifier: number; // Ex: 1234
};

export async function getRunningProcesses(
  context: ExtensionContext,
  options: {
    deviceId: string;
  },
): Promise<DeviceCtlProcessResult> {
  await using tmpPath = await tempFilePath(context, {
    prefix: "processes",
  });
  // xcrun devicectl device info processes -d 2782A5CE-797F-4EB9-BDF1-14AE4425C406 --json-output <path>
  await exec({
    command: "xcrun",
    args: ["devicectl", "device", "info", "processes", "-d", options.deviceId, "--json-output", tmpPath.path],
  });

  return await readJsonFile<DeviceCtlProcessResult>(tmpPath.path);
}

export async function pairDevice(options: {
  deviceId: string;
}): Promise<void> {
  // xcrun devicectl manage pair --device 00008110-000559182E90401E
  await exec({
    command: "xcrun",
    args: ["devicectl", "manage", "pair", "--device", options.deviceId],
  });
}

/**
 * Check if a device is locked
 */
export async function isDeviceLocked(context: ExtensionContext, deviceId: string): Promise<boolean> {
  try {
    await using tmpPath = await tempFilePath(context, {
      prefix: "device-info",
    });

    // Try to get device info - this will fail or show locked state if device is locked
    await exec({
      command: "xcrun",
      args: ["devicectl", "device", "info", "lockState", "--device", deviceId, "--json-output", tmpPath.path],
    });

    const result = await readJsonFile<{ result?: { lockState?: string } }>(tmpPath.path);

    commonLogger.debug("Device lock state", {
      deviceId,
      lockState: result.result?.lockState,
      fullResult: result,
    });

    // lockState can be: "unlocked", "locked", "passcode-locked"
    // If lockState is missing or undefined, assume unlocked
    if (!result.result?.lockState) {
      return false;
    }

    return result.result.lockState !== "unlocked";
  } catch (error) {
    // If we can't determine lock state, assume unlocked to not block operation
    commonLogger.debug("Could not determine device lock state, assuming unlocked", { error, deviceId });
    return false;
  }
}

/**
 * Wait for device to be unlocked
 */
export async function waitForDeviceUnlock(
  context: ExtensionContext,
  deviceId: string,
  onWaiting?: (elapsed: number) => void,
  timeoutMs = 60000, // 1 minute default
): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 1000; // Check every second

  while (Date.now() - startTime < timeoutMs) {
    const locked = await isDeviceLocked(context, deviceId);

    if (!locked) {
      return true; // Device is unlocked
    }

    // Notify caller of waiting time
    if (onWaiting) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      onWaiting(elapsed);
    }

    // Wait before checking again
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  return false; // Timeout - device still locked
}

/**
 * Ensure device is unlocked before proceeding with operation
 * Waits up to 2 minutes for device to be unlocked
 * @throws Error if device remains locked after timeout
 */
export async function ensureDeviceUnlocked(
  context: ExtensionContext,
  options: {
    deviceId: string;
    deviceName: string;
    onWaiting?: (elapsed: number) => void;
  },
): Promise<void> {
  const { deviceId, deviceName, onWaiting } = options;

  const locked = await isDeviceLocked(context, deviceId);
  if (!locked) {
    return; // Device is already unlocked
  }

  commonLogger.log("⏸️ Device is locked, waiting for unlock", {
    deviceId,
    deviceName,
  });

  const unlocked = await waitForDeviceUnlock(
    context,
    deviceId,
    onWaiting,
    120000, // 2 minutes timeout
  );

  if (!unlocked) {
    throw new Error(
      `Device is locked and could not be unlocked within 2 minutes.\nDevice: ${deviceName}\nUDID: ${deviceId}\n\nPlease:\n1. Unlock your device manually\n2. Keep the device unlocked during the operation\n3. Try again after unlocking`,
    );
  }

  commonLogger.log("✅ Device unlocked successfully", {
    deviceId,
    deviceName,
  });
}
