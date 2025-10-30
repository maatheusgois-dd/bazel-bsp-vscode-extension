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
