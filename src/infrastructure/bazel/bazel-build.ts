/**
 * Unified Bazel Build Logic
 * 
 * This module provides a single source of truth for building Bazel targets
 * across different commands (build, run, debug).
 */

import type { DeviceDestination } from "../../domain/entities/destination/device-types.js";
import type { SimulatorDestination } from "../../domain/entities/destination/simulator-types.js";
import type { ExtensionContext } from "../vscode/extension-context.js";
import type { BazelTreeItem } from "../../presentation/tree-providers/export.provider.js";
import { commonLogger } from "../../shared/logger/logger.js";
import type { TaskTerminal } from "../../shared/utils/tasks.js";

export type BuildMode = "debug" | "release" | "release-with-symbols";

export interface BazelBuildOptions {
  /** Bazel target to build */
  bazelItem: BazelTreeItem;
  /** Destination platform */
  destination: SimulatorDestination | DeviceDestination;
  /** Build mode */
  buildMode?: BuildMode;
  /** Terminal for output */
  terminal: TaskTerminal;
  /** Extension context */
  context: ExtensionContext;
}

/**
 * Build a Bazel target with appropriate platform flags
 * Used by: bazelBuildCommand, bazelRunCommand, bazelDebugCommand
 */
export async function buildBazelTarget(options: BazelBuildOptions): Promise<void> {
  const { bazelItem, destination, buildMode = "release", terminal, context } = options;

  // Determine platform flags
  let platformFlag: string;
  let additionalFlags: string[] = [];

  if (destination.type === "iOSSimulator") {
    platformFlag = "--platforms=@build_bazel_apple_support//platforms:ios_sim_arm64";
    terminal.write(`   Platform: iOS Simulator\n`);
  } else if (destination.type === "iOSDevice") {
    platformFlag = "--ios_multi_cpus=arm64";
    terminal.write(`   Platform: iOS Device (${destination.name})\n`);

    // Check if device is locked before starting build
    try {
      const { ensureDeviceUnlocked } = await import("../apple-platforms/devicectl.adapter.js");
      
      terminal.write("   Checking device lock state...\n");
      await ensureDeviceUnlocked(context, {
        deviceId: destination.udid,
        deviceName: destination.name,
        onWaiting: (elapsed) => {
          terminal.write(`\r   ⏸️  Waiting for device unlock... ${elapsed}s`);
        },
      });
      terminal.write("\n   ✅ Device ready\n");
    } catch (lockCheckError) {
      // If lock check fails, log but continue - don't block the build
      commonLogger.warn("Lock check failed, continuing anyway", { lockCheckError });
    }
  } else {
    throw new Error(
      `Unsupported destination type for build.\n` +
      `Type: ${destination.type}\n\n` +
      `Currently supported:\n` +
      `- iOSSimulator\n` +
      `- iOSDevice\n\n` +
      `Please select an iOS simulator or device from the DESTINATIONS view.`
    );
  }

  // Set build flags based on mode
  if (buildMode === "debug") {
    additionalFlags = ["--compilation_mode=dbg", "--copt=-g", "--strip=never"];
    terminal.write("   Build mode: Debug (unoptimized with symbols)\n");
  } else if (buildMode === "release-with-symbols") {
    additionalFlags = ["--compilation_mode=opt", "--copt=-g", "--strip=never"];
    terminal.write("   Build mode: Release with Debug Symbols (optimized with symbols)\n");
  } else {
    // release mode - no additional flags
    terminal.write("   Build mode: Release (optimized, no symbols)\n");
  }

  // Build command
  const buildCommand = `cd "${bazelItem.package.path}" && bazel build ${bazelItem.target.buildLabel} ${platformFlag} ${additionalFlags.join(" ")}`;

  commonLogger.log("Building Bazel target", {
    target: bazelItem.target.buildLabel,
    platform: destination.type,
    buildMode,
    platformFlag,
    additionalFlags,
  });

  await terminal.execute({
    command: "sh",
    args: ["-c", buildCommand],
  });

  terminal.write("   ✅ Build completed\n");
}

