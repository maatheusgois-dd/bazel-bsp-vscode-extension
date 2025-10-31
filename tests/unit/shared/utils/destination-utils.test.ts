import os from "node:os";
import type { Destination } from "../../../../src/domain/entities/destination/types";
import { getMacOSArchitecture, splitSupportedDestinatinos } from "../../../../src/shared/utils/destination-utils";

// Mock os module
jest.mock("node:os");

describe("Destination Utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getMacOSArchitecture", () => {
    it("should return arm64 for Apple Silicon Macs", () => {
      (os.arch as jest.Mock).mockReturnValue("arm64");

      const result = getMacOSArchitecture();

      expect(result).toBe("arm64");
      expect(os.arch).toHaveBeenCalled();
    });

    it("should return x86_64 for Intel Macs", () => {
      (os.arch as jest.Mock).mockReturnValue("x64");

      const result = getMacOSArchitecture();

      expect(result).toBe("x86_64");
    });

    it("should return null for unsupported architectures", () => {
      (os.arch as jest.Mock).mockReturnValue("ia32");

      const result = getMacOSArchitecture();

      expect(result).toBeNull();
    });

    it("should return null for unknown architectures", () => {
      (os.arch as jest.Mock).mockReturnValue("mips");

      const result = getMacOSArchitecture();

      expect(result).toBeNull();
    });

    it("should handle empty string architecture", () => {
      (os.arch as jest.Mock).mockReturnValue("");

      const result = getMacOSArchitecture();

      expect(result).toBeNull();
    });
  });

  describe("splitSupportedDestinatinos", () => {
    // Mock destinations for testing
    const createMockDestination = (type: string, platform: string): Destination =>
      ({
        type,
        platform,
        id: `mock-${type}`,
        name: `Mock ${type}`,
      }) as Destination;

    describe("when supportedPlatforms is undefined", () => {
      it("should return all destinations as supported", () => {
        const destinations = [
          createMockDestination("iOSSimulator", "iphonesimulator"),
          createMockDestination("iOSDevice", "iphoneos"),
          createMockDestination("macOS", "macosx"),
        ];

        const result = splitSupportedDestinatinos({
          destinations,
          supportedPlatforms: undefined,
        });

        expect(result.supported).toEqual(destinations);
        expect(result.unsupported).toEqual([]);
      });

      it("should handle empty destinations array", () => {
        const result = splitSupportedDestinatinos({
          destinations: [],
          supportedPlatforms: undefined,
        });

        expect(result.supported).toEqual([]);
        expect(result.unsupported).toEqual([]);
      });
    });

    describe("when supportedPlatforms is defined", () => {
      it("should split destinations by platform support", () => {
        const iOSSimulator = createMockDestination("iOSSimulator", "iphonesimulator");
        const iOSDevice = createMockDestination("iOSDevice", "iphoneos");
        const macOS = createMockDestination("macOS", "macosx");
        const tvOS = createMockDestination("tvOSSimulator", "appletvsimulator");

        const result = splitSupportedDestinatinos({
          destinations: [iOSSimulator, iOSDevice, macOS, tvOS],
          supportedPlatforms: ["iphonesimulator", "iphoneos"],
        });

        expect(result.supported).toEqual([iOSSimulator, iOSDevice]);
        expect(result.unsupported).toEqual([macOS, tvOS]);
      });

      it("should handle all destinations being supported", () => {
        const destinations = [
          createMockDestination("iOSSimulator", "iphonesimulator"),
          createMockDestination("iOSDevice", "iphoneos"),
        ];

        const result = splitSupportedDestinatinos({
          destinations,
          supportedPlatforms: ["iphonesimulator", "iphoneos", "macosx"],
        });

        expect(result.supported).toEqual(destinations);
        expect(result.unsupported).toEqual([]);
      });

      it("should handle no destinations being supported", () => {
        const destinations = [
          createMockDestination("tvOSSimulator", "appletvsimulator"),
          createMockDestination("watchOSSimulator", "watchsimulator"),
        ];

        const result = splitSupportedDestinatinos({
          destinations,
          supportedPlatforms: ["iphonesimulator", "iphoneos"],
        });

        expect(result.supported).toEqual([]);
        expect(result.unsupported).toEqual(destinations);
      });

      it("should handle empty supportedPlatforms array", () => {
        const destinations = [createMockDestination("iOSSimulator", "iphonesimulator")];

        const result = splitSupportedDestinatinos({
          destinations,
          supportedPlatforms: [],
        });

        expect(result.supported).toEqual([]);
        expect(result.unsupported).toEqual(destinations);
      });

      it("should handle empty destinations array with platforms", () => {
        const result = splitSupportedDestinatinos({
          destinations: [],
          supportedPlatforms: ["iphonesimulator"],
        });

        expect(result.supported).toEqual([]);
        expect(result.unsupported).toEqual([]);
      });
    });

    describe("edge cases", () => {
      it("should handle mixed platform types correctly", () => {
        const destinations = [
          createMockDestination("iOSSimulator", "iphonesimulator"),
          createMockDestination("tvOSDevice", "appletvos"),
          createMockDestination("watchOSSimulator", "watchsimulator"),
          createMockDestination("visionOSSimulator", "xrsimulator"),
          createMockDestination("macOS", "macosx"),
        ];

        const result = splitSupportedDestinatinos({
          destinations,
          supportedPlatforms: ["iphonesimulator", "xrsimulator", "macosx"],
        });

        expect(result.supported.length).toBe(3);
        expect(result.unsupported.length).toBe(2);
        expect(result.supported.map((d) => d.type)).toEqual(["iOSSimulator", "visionOSSimulator", "macOS"]);
      });

      it("should preserve destination order in split", () => {
        const dest1 = createMockDestination("iOSSimulator", "iphonesimulator");
        const dest2 = createMockDestination("macOS", "macosx");
        const dest3 = createMockDestination("iOSDevice", "iphoneos");
        const dest4 = createMockDestination("tvOSSimulator", "appletvsimulator");

        const result = splitSupportedDestinatinos({
          destinations: [dest1, dest2, dest3, dest4],
          supportedPlatforms: ["iphonesimulator", "iphoneos"],
        });

        expect(result.supported).toEqual([dest1, dest3]);
        expect(result.unsupported).toEqual([dest2, dest4]);
      });

      it("should handle duplicate platform types", () => {
        const dest1 = createMockDestination("iOSSimulator1", "iphonesimulator");
        const dest2 = createMockDestination("iOSSimulator2", "iphonesimulator");

        const result = splitSupportedDestinatinos({
          destinations: [dest1, dest2],
          supportedPlatforms: ["iphonesimulator"],
        });

        expect(result.supported).toEqual([dest1, dest2]);
        expect(result.unsupported).toEqual([]);
      });
    });
  });

  describe("integration scenarios", () => {
    it("should work with getMacOSArchitecture and platform filtering", () => {
      (os.arch as jest.Mock).mockReturnValue("arm64");
      const arch = getMacOSArchitecture();

      const macOSDestination = {
        type: "macOS",
        platform: "macosx",
        id: "macos-1",
        name: `My Mac (${arch})`,
      } as Destination;

      const result = splitSupportedDestinatinos({
        destinations: [macOSDestination],
        supportedPlatforms: ["macosx"],
      });

      expect(result.supported).toHaveLength(1);
      expect(result.supported[0].name).toContain("arm64");
    });

    it("should handle real-world multi-platform scenario", () => {
      const destinations = [
        { type: "iOSSimulator", platform: "iphonesimulator", id: "1", name: "iPhone 15" },
        { type: "iOSSimulator", platform: "iphonesimulator", id: "2", name: "iPhone 14" },
        { type: "iOSDevice", platform: "iphoneos", id: "3", name: "My iPhone" },
        { type: "macOS", platform: "macosx", id: "4", name: "My Mac" },
        { type: "tvOSSimulator", platform: "appletvsimulator", id: "5", name: "Apple TV" },
      ] as Destination[];

      // iOS-only build
      const iOSOnly = splitSupportedDestinatinos({
        destinations,
        supportedPlatforms: ["iphonesimulator", "iphoneos"],
      });

      expect(iOSOnly.supported).toHaveLength(3);
      expect(iOSOnly.unsupported).toHaveLength(2);

      // All platforms
      const allPlatforms = splitSupportedDestinatinos({
        destinations,
        supportedPlatforms: undefined,
      });

      expect(allPlatforms.supported).toHaveLength(5);
      expect(allPlatforms.unsupported).toHaveLength(0);
    });
  });
});
