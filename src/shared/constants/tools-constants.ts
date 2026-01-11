export type Tool = {
  id: string;
  label: string;
  check: {
    command: string;
    args: string[];
  };
  install: {
    command: string;
    args: string[];
  };
  documentation: string;
};

export const TOOLS: Tool[] = [
  {
    id: "brew",
    label: "Homebrew",
    check: {
      command: "brew",
      args: ["--version"],
    },
    install: {
      command: "/bin/bash",
      args: ["-c", "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"],
    },
    documentation: "https://brew.sh/",
  },
  {
    id: "bazel",
    label: "Bazel",
    check: {
      command: "bazel",
      args: ["--version"],
    },
    install: {
      command: "brew",
      args: ["install", "bazel"],
    },
    documentation: "https://bazel.build/",
  },
  {
    id: "xcbeautify",
    label: "xcbeautify",
    check: {
      command: "xcbeautify",
      args: ["--version"],
    },
    install: {
      command: "brew",
      args: ["install", "xcbeautify"],
    },
    documentation: "https://github.com/cpisciotta/xcbeautify",
  },
  {
    id: "xcode-build-server",
    label: "xcode-build-server",
    check: {
      command: "xcode-build-server",
      args: ["--help"],
    },
    install: {
      command: "brew",
      args: ["install", "xcode-build-server"],
    },
    documentation: "https://github.com/SolaWing/xcode-build-server",
  },
  {
    id: "swiftlint",
    label: "SwiftLint",
    check: {
      command: "swiftlint",
      args: ["--version"],
    },
    install: {
      command: "brew",
      args: ["install", "swiftlint"],
    },
    documentation: "https://github.com/realm/SwiftLint",
  },
];

export const EXTENSION_DISPLAY_NAME = "Bazel BSP";
