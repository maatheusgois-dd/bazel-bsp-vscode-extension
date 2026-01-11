import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Package.json Validation", () => {
  let packageJson: any;

  beforeAll(() => {
    const packagePath = join(__dirname, "../../package.json");
    packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  });

  describe("Extension Dependencies", () => {
    it("should not include deprecated Swift extension (sswg.swift-lang)", () => {
      const deprecatedExtension = "sswg.swift-lang";
      expect(packageJson.extensionDependencies).not.toContain(deprecatedExtension);
    });

    it("should include the official Swift extension (swiftlang.swift-vscode)", () => {
      const officialExtension = "swiftlang.swift-vscode";
      expect(packageJson.extensionDependencies).toContain(officialExtension);
    });

    it("should include required debugger extensions", () => {
      expect(packageJson.extensionDependencies).toContain("vadimcn.vscode-lldb");
      expect(packageJson.extensionDependencies).toContain("llvm-vs-code-extensions.lldb-dap");
    });

    it("should have exactly 3 extension dependencies", () => {
      // vadimcn.vscode-lldb, swiftlang.swift-vscode, llvm-vs-code-extensions.lldb-dap
      expect(packageJson.extensionDependencies).toHaveLength(3);
    });

    it("should not have duplicate extension dependencies", () => {
      const unique = new Set(packageJson.extensionDependencies);
      expect(unique.size).toBe(packageJson.extensionDependencies.length);
    });
  });

  describe("Package Metadata", () => {
    it("should have correct package name", () => {
      expect(packageJson.name).toBe("bazel-bsp-vscode-extension");
    });

    it("should have correct display name", () => {
      expect(packageJson.displayName).toBe("Bazel BSP");
    });

    it("should have correct publisher", () => {
      expect(packageJson.publisher).toBe("maatheusgois-dd");
    });

    it("should have correct repository URL", () => {
      expect(packageJson.repository.url).toBe("https://github.com/maatheusgois-dd/bazel-bsp-vscode-extension.git");
    });
  });
});
