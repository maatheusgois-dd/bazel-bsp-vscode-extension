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
];
