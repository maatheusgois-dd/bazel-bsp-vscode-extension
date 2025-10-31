import type { DeviceCtlDevice } from "../../../infrastructure/apple-platforms/devicectl.adapter.js";
import type { IDestination } from "./types.js";

export class iOSDeviceDestination implements IDestination {
  type = "iOSDevice" as const;
  typeLabel = "iOS Device";
  platform = "iphoneos" as const;

  constructor(public device: DeviceCtlDevice) {
    this.device = device;
  }

  get id(): string {
    return `iosdevice-${this.udid}`;
  }

  get label(): string {
    // iPhone 12 Pro Max (14.5)
    return `${this.name} (${this.osVersion})`;
  }

  get quickPickDetails(): string {
    return `Type: ${this.typeLabel}, Version: ${this.osVersion}, ID: ${this.udid.toLocaleLowerCase()}`;
  }

  get isConnected(): boolean {
    // Device is usable if it's paired, even if tunnel is not "connected"
    // tunnelState can be "disconnected" for USB devices that are paired and ready
    const isPaired = this.device.connectionProperties.pairingState === "paired";
    const tunnelNotUnavailable = this.state !== "unavailable";
    return isPaired && tunnelNotUnavailable;
  }

  get icon(): string {
    if (this.deviceType === "iPad") {
      if (this.isConnected) {
        return "swiftbazel-device-ipad";
      }
      return "swiftbazel-device-ipad-x";
    }
    if (this.deviceType === "iPhone") {
      if (this.isConnected) {
        return "swiftbazel-device-mobile";
      }
      return "swiftbazel-device-mobile-x";
    }
    return "swiftbazel-device-mobile";
  }

  get udid() {
    return this.device.hardwareProperties.udid;
  }

  get name() {
    return this.device.deviceProperties.name;
  }

  get osVersion() {
    return this.device.deviceProperties.osVersionNumber;
  }

  get state(): "connected" | "disconnected" | "unavailable" {
    return this.device.connectionProperties.tunnelState;
  }

  get deviceType() {
    return this.device.hardwareProperties.deviceType;
  }
}

export class watchOSDeviceDestination implements IDestination {
  type = "watchOSDevice" as const;
  typeLabel = "watchOS Device";
  platform = "watchos" as const;

  constructor(public device: DeviceCtlDevice) {
    this.device = device;
  }

  get id(): string {
    return `watchosdevice-${this.udid}`;
  }

  get icon(): string {
    if (this.isConnected) {
      return "swiftbazel-device-watch";
    }
    return "swiftbazel-device-watch-pause";
  }

  get udid() {
    return this.device.hardwareProperties.udid;
  }

  get name() {
    return this.device.deviceProperties.name;
  }

  get label(): string {
    return `${this.name} (${this.osVersion})`;
  }

  get osVersion() {
    return this.device.deviceProperties.osVersionNumber;
  }

  get quickPickDetails(): string {
    return `Type: ${this.typeLabel}, Version: ${this.osVersion}, ID: ${this.udid.toLocaleLowerCase()}`;
  }

  get state(): "connected" | "disconnected" | "unavailable" {
    return this.device.connectionProperties.tunnelState;
  }

  get isConnected(): boolean {
    // Device is usable if it's paired, even if tunnel is not "connected"
    const isPaired = this.device.connectionProperties.pairingState === "paired";
    const tunnelNotUnavailable = this.state !== "unavailable";
    return isPaired && tunnelNotUnavailable;
  }
}

export class tvOSDeviceDestination implements IDestination {
  type = "tvOSDevice" as const;
  typeLabel = "tvOS Device";
  platform = "appletvos" as const;

  constructor(public device: DeviceCtlDevice) {
    this.device = device;
  }

  get id(): string {
    return `tvosdevice-${this.udid}`;
  }

  get icon(): string {
    return "swiftbazel-device-tv-old";
  }

  get udid() {
    return this.device.hardwareProperties.udid;
  }

  get name() {
    return this.device.deviceProperties.name;
  }

  get label(): string {
    return `${this.name} (${this.osVersion})`;
  }

  get osVersion() {
    return this.device.deviceProperties.osVersionNumber;
  }

  get quickPickDetails(): string {
    return `Type: ${this.typeLabel}, Version: ${this.osVersion}, ID: ${this.udid.toLocaleLowerCase()}`;
  }

  get state(): "connected" | "disconnected" | "unavailable" {
    return this.device.connectionProperties.tunnelState;
  }

  get isConnected(): boolean {
    // Device is usable if it's paired, even if tunnel is not "connected"
    const isPaired = this.device.connectionProperties.pairingState === "paired";
    const tunnelNotUnavailable = this.state !== "unavailable";
    return isPaired && tunnelNotUnavailable;
  }
}

export class visionOSDeviceDestination implements IDestination {
  type = "visionOSDevice" as const;
  typeLabel = "visionOS Device";
  platform = "xros" as const;

  constructor(public device: DeviceCtlDevice) {
    this.device = device;
  }

  get id(): string {
    return `visionosdevice-${this.udid}`;
  }

  get icon(): string {
    return "swiftbazel-cardboards";
  }

  get udid() {
    return this.device.hardwareProperties.udid;
  }

  get name() {
    return this.device.deviceProperties.name;
  }

  get label(): string {
    return `${this.name} (${this.osVersion})`;
  }

  get osVersion() {
    return this.device.deviceProperties.osVersionNumber;
  }

  get quickPickDetails(): string {
    return `Type: ${this.typeLabel}, Version: ${this.osVersion}, ID: ${this.udid.toLocaleLowerCase()}`;
  }

  get state(): "connected" | "disconnected" | "unavailable" {
    return this.device.connectionProperties.tunnelState;
  }

  get isConnected(): boolean {
    // Device is usable if it's paired, even if tunnel is not "connected"
    const isPaired = this.device.connectionProperties.pairingState === "paired";
    const tunnelNotUnavailable = this.state !== "unavailable";
    return isPaired && tunnelNotUnavailable;
  }
}

export type DeviceDestination =
  | iOSDeviceDestination
  | watchOSDeviceDestination
  | tvOSDeviceDestination
  | visionOSDeviceDestination;
