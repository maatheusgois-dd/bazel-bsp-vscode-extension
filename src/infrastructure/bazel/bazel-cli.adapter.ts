// Main exports for Bazel parser
export { BazelParser, BazelParserUtils } from "./bazel-parser.js";
export type {
  BazelTarget,
  BazelScheme,
  BazelXcodeConfiguration,
  BazelParseResult,
  BazelPackageInfo,
} from "../../domain/entities/bazel/types.js";

// Re-export for convenience
export * from "./bazel-parser.js";
export * from "../../domain/entities/bazel/types.js";
