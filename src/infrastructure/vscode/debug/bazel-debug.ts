/**
 * Bazel debugging workflow implementation
 *
 * Uses the unified build-and-launch workflow with debugger attachment enabled.
 * The debug workflow is identical to the run workflow except it attaches
 * a debugger after launching the app.
 */

import type { DeviceDestination } from "../../../domain/entities/destination/device-types.js";
import type { SimulatorDestination } from "../../../domain/entities/destination/simulator-types.js";
import type { ExtensionContext } from "../../../infrastructure/vscode/extension-context.js";
import type { BazelTreeItem } from "../../../presentation/tree-providers/export.provider.js";
import { commonLogger } from "../../../shared/logger/logger.js";
import type { TaskTerminal } from "../../../shared/utils/tasks.js";
import { buildAndLaunchBazelApp } from "./build-and-launch.js";

const DEFAULT_DEBUG_PORT = 6667;

export interface BazelDebugOptions {
  /** Bazel target to debug */
  bazelItem: BazelTreeItem;
  /** Destination to debug on */
  destination: SimulatorDestination | DeviceDestination;
  /** Debug port for LLDB connection */
  debugPort?: number;
  /** Launch arguments */
  launchArgs?: string[];
  /** Environment variables */
  launchEnv?: Record<string, string>;
}

/**
 * Debug workflow for Bazel iOS apps on simulator
 * Uses unified build-and-launch with debugger attached
 */
export async function debugBazelAppOnSimulator(
  context: ExtensionContext,
  terminal: TaskTerminal,
  options: BazelDebugOptions & { destination: SimulatorDestination },
): Promise<void> {
  await buildAndLaunchBazelApp(context, terminal, {
    ...options,
    attachDebugger: true,
  });
}

/**
 * Debug workflow for Bazel iOS apps on device
 * Uses unified build-and-launch with debugger attached
 */
export async function debugBazelAppOnDevice(
  context: ExtensionContext,
  terminal: TaskTerminal,
  options: BazelDebugOptions & { destination: DeviceDestination },
): Promise<void> {
  await buildAndLaunchBazelApp(context, terminal, {
    ...options,
    attachDebugger: true,
  });
}

/**
 * Enhanced debug command that uses the unified workflow
 */
export async function enhancedBazelDebugCommand(
  context: ExtensionContext,
  terminal: TaskTerminal,
  options: BazelDebugOptions,
): Promise<void> {
  const { destination } = options;

  commonLogger.log("Starting enhanced Bazel debug command", {
    targetName: options.bazelItem.target.name,
    destinationType: destination.type,
  });

  // Use unified build and launch with debugger attached
  await buildAndLaunchBazelApp(context, terminal, {
    ...options,
    attachDebugger: true,
    debugPort: options.debugPort || DEFAULT_DEBUG_PORT,
  });
}
