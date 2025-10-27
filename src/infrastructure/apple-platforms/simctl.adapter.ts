import { exec } from "../../shared/utils/exec.js";

/**
 * Simulator types used for device management
 */
export type SimulatorOutput = {
  dataPath: string;
  dataPathSize: number;
  logPath: string;
  udid: string;
  isAvailable: boolean;
  deviceTypeIdentifier: string;
  state: string;
  name: string;
};

type SimulatorsOutput = {
  devices: { [key: string]: SimulatorOutput[] };
};

/**
 * Get list of available iOS simulators
 */
export async function getSimulators(): Promise<SimulatorsOutput> {
  try {
    // Try JSON format first (more reliable)
    const simulatorsRaw = await exec({
      command: "xcrun",
      args: ["simctl", "list", "--json", "devices"],
    });

    const parsed = JSON.parse(simulatorsRaw) as SimulatorsOutput;

    // Check if devices is empty or undefined
    if (!parsed.devices || Object.keys(parsed.devices).length === 0) {
      // Fallback to text parsing
      return await getSimulatorsFromTextFormat();
    }

    return parsed;
  } catch (_error) {
    // If JSON parsing fails, try text format
    return await getSimulatorsFromTextFormat();
  }
}

/**
 * Fallback parser for text format output from `xcrun simctl list devices`
 */
async function getSimulatorsFromTextFormat(): Promise<SimulatorsOutput> {
  const simulatorsRaw = await exec({
    command: "xcrun",
    args: ["simctl", "list", "devices"],
  });

  const devices: { [key: string]: SimulatorOutput[] } = {};
  const lines = simulatorsRaw.split("\n");
  let currentRuntime = "";

  for (const line of lines) {
    // Match runtime header like "-- iOS 17.5 --"
    const runtimeMatch = line.match(/^--\s+(.+?)\s+--$/);
    if (runtimeMatch) {
      currentRuntime = runtimeMatch[1];
      if (!devices[currentRuntime]) {
        devices[currentRuntime] = [];
      }
      continue;
    }

    // Match device line like "    iPhone 15 (A1B2C3D4-...) (Shutdown)"
    const deviceMatch = line.match(/^\s+(.+?)\s+\(([A-F0-9-]+)\)\s+\((.+?)\)/);
    if (deviceMatch && currentRuntime) {
      const [, name, udid, state] = deviceMatch;

      // Determine if available based on state
      const isAvailable = state !== "Unavailable" && !state.includes("unavailable");

      devices[currentRuntime].push({
        name: name.trim(),
        udid: udid,
        state: state,
        isAvailable: isAvailable,
        // These fields might not be available in text format, use defaults
        dataPath: "",
        dataPathSize: 0,
        logPath: "",
        deviceTypeIdentifier: "",
      });
    }
  }

  return { devices };
}
