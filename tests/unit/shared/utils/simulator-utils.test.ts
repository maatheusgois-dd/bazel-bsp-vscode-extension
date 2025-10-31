import { parseDeviceTypeIdentifier, parseSimulatorRuntime } from "../../../../src/shared/utils/simulator-utils";

describe("Simulator Utils - Parsing Functions", () => {
  describe("parseDeviceTypeIdentifier", () => {
    describe("iOS devices", () => {
      it("should parse iPhone device types", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPhone-15")).toBe("iPhone");
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPhone-8-Plus")).toBe("iPhone");
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation")).toBe(
          "iPhone",
        );
      });

      it("should parse iPad device types", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-3rd-generation")).toBe(
          "iPad",
        );
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPad-Air-5th-generation")).toBe("iPad");
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPad-mini-6th-generation")).toBe(
          "iPad",
        );
      });

      it("should parse iPod device types", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPod-touch--7th-generation-")).toBe(
          "iPod",
        );
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPod-touch")).toBe("iPod");
      });
    });

    describe("other Apple devices", () => {
      it("should parse Apple TV device types", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-4")).toBe(
          "AppleTV",
        );
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-2nd-generation")).toBe(
          "AppleTV",
        );
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.Apple-TV")).toBe("AppleTV");
      });

      it("should parse Apple Watch device types", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-5-40mm")).toBe(
          "AppleWatch",
        );
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Ultra-49mm")).toBe(
          "AppleWatch",
        );
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.Apple-Watch-SE")).toBe("AppleWatch");
      });

      it("should parse Apple Vision device types", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.Apple-Vision-Pro")).toBe("AppleVision");
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.Apple-Vision")).toBe("AppleVision");
      });
    });

    describe("invalid inputs", () => {
      it("should return null for invalid prefix", () => {
        expect(parseDeviceTypeIdentifier("invalid.prefix.iPhone-15")).toBeNull();
        expect(parseDeviceTypeIdentifier("com.apple.Wrong.SimDeviceType.iPhone-15")).toBeNull();
      });

      it("should return null for missing device type", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.")).toBeNull();
      });

      it("should return null for unknown device type", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.Unknown-Device")).toBeNull();
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.SomeNewDevice")).toBeNull();
      });

      it("should return null for empty string", () => {
        expect(parseDeviceTypeIdentifier("")).toBeNull();
      });

      it("should return null for undefined input", () => {
        expect(parseDeviceTypeIdentifier(undefined as any)).toBeNull();
      });

      it("should return null for null input", () => {
        expect(parseDeviceTypeIdentifier(null as any)).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should handle device types with special characters", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max")).toBe("iPhone");
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.iPad-Pro-12.9-inch")).toBe("iPad");
      });

      it("should be case-sensitive for prefix", () => {
        expect(parseDeviceTypeIdentifier("COM.APPLE.CoreSimulator.SimDeviceType.iPhone-15")).toBeNull();
      });

      it("should match prefix-starting devices only", () => {
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.MyiPhone")).toBeNull();
        expect(parseDeviceTypeIdentifier("com.apple.CoreSimulator.SimDeviceType.CustomiPad")).toBeNull();
      });
    });
  });

  describe("parseSimulatorRuntime", () => {
    describe("valid runtimes", () => {
      it("should parse iOS runtimes", () => {
        const result = parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-15-2");
        expect(result).toEqual({ os: "iOS", version: "15.2" });
      });

      it("should parse iOS runtimes with different versions", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-17-0")).toEqual({
          os: "iOS",
          version: "17.0",
        });
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-16-4")).toEqual({
          os: "iOS",
          version: "16.4",
        });
      });

      it("should parse tvOS runtimes", () => {
        const result = parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.tvOS-18-0");
        expect(result).toEqual({ os: "tvOS", version: "18.0" });
      });

      it("should parse tvOS runtimes with different versions", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.tvOS-17-2")).toEqual({
          os: "tvOS",
          version: "17.2",
        });
      });

      it("should parse watchOS runtimes", () => {
        const result = parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.watchOS-8-5");
        expect(result).toEqual({ os: "watchOS", version: "8.5" });
      });

      it("should parse watchOS runtimes with different versions", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.watchOS-10-0")).toEqual({
          os: "watchOS",
          version: "10.0",
        });
      });

      it("should parse xrOS/visionOS runtimes", () => {
        const result = parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.xrOS-2-0");
        expect(result).toEqual({ os: "xrOS", version: "2.0" });
      });

      it("should parse xrOS runtimes with different versions", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.xrOS-1-0")).toEqual({
          os: "xrOS",
          version: "1.0",
        });
      });
    });

    describe("invalid inputs", () => {
      it("should return null for invalid prefix", () => {
        expect(parseSimulatorRuntime("invalid.prefix.iOS-15-2")).toBeNull();
        expect(parseSimulatorRuntime("com.apple.Wrong.SimRuntime.iOS-15-2")).toBeNull();
      });

      it("should return null for missing runtime", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.")).toBeNull();
      });

      it("should return null for invalid version format", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-15")).toBeNull();
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-15-2-1")).toBeNull();
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-fifteen-two")).toBeNull();
      });

      it("should return null for unknown OS types", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.macOS-13-0")).toBeNull();
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iPadOS-17-0")).toBeNull();
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.Unknown-1-0")).toBeNull();
      });

      it("should return null for empty string", () => {
        expect(parseSimulatorRuntime("")).toBeNull();
      });

      it("should return null for undefined input", () => {
        expect(parseSimulatorRuntime(undefined as any)).toBeNull();
      });

      it("should return null for null input", () => {
        expect(parseSimulatorRuntime(null as any)).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should handle zero versions", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-0-0")).toEqual({
          os: "iOS",
          version: "0.0",
        });
      });

      it("should handle large version numbers", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-99-99")).toEqual({
          os: "iOS",
          version: "99.99",
        });
      });

      it("should be case-sensitive for OS type", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.ios-15-2")).toBeNull();
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.IOS-15-2")).toBeNull();
      });

      it("should not accept extra segments", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-15-2-extra")).toBeNull();
      });

      it("should handle version with leading zeros", () => {
        expect(parseSimulatorRuntime("com.apple.CoreSimulator.SimRuntime.iOS-01-02")).toEqual({
          os: "iOS",
          version: "01.02",
        });
      });
    });

    describe("real-world examples", () => {
      it("should parse common simulator runtimes from Xcode", () => {
        const examples = [
          { input: "com.apple.CoreSimulator.SimRuntime.iOS-17-2", expected: { os: "iOS", version: "17.2" } },
          { input: "com.apple.CoreSimulator.SimRuntime.iOS-16-4", expected: { os: "iOS", version: "16.4" } },
          { input: "com.apple.CoreSimulator.SimRuntime.tvOS-17-2", expected: { os: "tvOS", version: "17.2" } },
          {
            input: "com.apple.CoreSimulator.SimRuntime.watchOS-10-2",
            expected: { os: "watchOS", version: "10.2" },
          },
          { input: "com.apple.CoreSimulator.SimRuntime.xrOS-1-0", expected: { os: "xrOS", version: "1.0" } },
        ];

        for (const example of examples) {
          expect(parseSimulatorRuntime(example.input)).toEqual(example.expected);
        }
      });
    });
  });

  describe("integration scenarios", () => {
    it("should parse complete simulator configuration", () => {
      const deviceType = "com.apple.CoreSimulator.SimDeviceType.iPhone-15";
      const runtime = "com.apple.CoreSimulator.SimRuntime.iOS-17-2";

      const parsedType = parseDeviceTypeIdentifier(deviceType);
      const parsedRuntime = parseSimulatorRuntime(runtime);

      expect(parsedType).toBe("iPhone");
      expect(parsedRuntime).toEqual({ os: "iOS", version: "17.2" });
    });

    it("should handle various device and runtime combinations", () => {
      const combinations = [
        {
          device: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch",
          runtime: "com.apple.CoreSimulator.SimRuntime.iOS-17-0",
          expectedType: "iPad",
          expectedRuntime: { os: "iOS", version: "17.0" },
        },
        {
          device: "com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K",
          runtime: "com.apple.CoreSimulator.SimRuntime.tvOS-17-2",
          expectedType: "AppleTV",
          expectedRuntime: { os: "tvOS", version: "17.2" },
        },
        {
          device: "com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-9",
          runtime: "com.apple.CoreSimulator.SimRuntime.watchOS-10-2",
          expectedType: "AppleWatch",
          expectedRuntime: { os: "watchOS", version: "10.2" },
        },
        {
          device: "com.apple.CoreSimulator.SimDeviceType.Apple-Vision-Pro",
          runtime: "com.apple.CoreSimulator.SimRuntime.xrOS-2-0",
          expectedType: "AppleVision",
          expectedRuntime: { os: "xrOS", version: "2.0" },
        },
      ];

      for (const combo of combinations) {
        expect(parseDeviceTypeIdentifier(combo.device)).toBe(combo.expectedType);
        expect(parseSimulatorRuntime(combo.runtime)).toEqual(combo.expectedRuntime);
      }
    });
  });
});
