// Types for Bazel query-based parser output
export interface BazelQueryTarget {
  type: string; // Rule type (ios_application, swift_library, etc.)
  target: string; // Full target label (//Apps/Consumer:DoorDash)
}

export interface BazelTargetCategory {
  runnable: string[]; // Target names that can be built and run
  test: string[]; // Test target names
  buildable: string[]; // Library target names
}

export interface BazelTreeNode {
  [key: string]: BazelTreeNode | BazelTargetCategory | string[];
}

export interface BazelQueryResult {
  generated: string; // ISO timestamp
  statistics: {
    runnable: number;
    test: number;
    buildable: number;
    total: number;
  };
  tree: BazelTreeNode;
}

// Legacy types for backward compatibility
export interface BazelTarget {
  name: string;
  type: "library" | "test" | "binary";
  deps: string[];
  path?: string;
  resources?: string[];
  buildLabel: string;
  testLabel?: string;
}

export interface BazelScheme {
  name: string;
  type: "doordash_scheme" | "doordash_appclip_scheme" | "xcschemes_scheme" | "custom";
  buildTargets: string[];
  launchTarget?: string;
  testTargets?: string[];
  env?: Record<string, string>;
  xcode_configuration?: string;
}

export interface BazelXcodeConfiguration {
  name: string;
  buildSettings?: Record<string, any>;
}

export interface BazelParseResult {
  xcschemes: BazelScheme[];
  xcode_configurations: BazelXcodeConfiguration[];
  targets: BazelTarget[];
  targetsTest: BazelTarget[];
}

export interface BazelPackageInfo {
  name: string;
  path: string;
  parseResult: BazelParseResult;
}
