# Unified Build & Launch Architecture

All Bazel commands (Build, Run, Debug) now use **unified code paths** to ensure consistency.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Entry Points                            │
├─────────────────────────────────────────────────────────────┤
│ • bazelBuildCommand()  → withDebugSymbols: false            │
│ • bazelRunCommand()    → attachDebugger: false              │
│ • bazelDebugCommand()  → attachDebugger: true               │
│ • MCP Server           → calls VSCode commands              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│           Unified Build Logic (NEW)                         │
│           infrastructure/bazel/bazel-build.ts               │
├─────────────────────────────────────────────────────────────┤
│ buildBazelTarget()                                          │
│  ├─ Platform detection (iOS Simulator vs Device)            │
│  ├─ Device unlock check (if needed)                         │
│  ├─ Debug symbols flag (if withDebugSymbols === true)       │
│  └─ Execute: bazel build [target] [platform] [flags]        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│     Unified Launch Workflow (if run/debug)                  │
│     infrastructure/vscode/debug/build-and-launch.ts         │
├─────────────────────────────────────────────────────────────┤
│ buildAndLaunchBazelApp()                                    │
│  ├─ Step 1: Build (calls buildBazelTarget)                  │
│  ├─ Step 2: Locate app bundle                               │
│  ├─ Step 3: Prepare app (permissions, code signing)         │
│  ├─ Step 4: Launch app                                      │
│  │   ├─ Simulator: simctl launch [--wait-for-debugger]      │
│  │   └─ Device: devicectl launch [--start-stopped]          │
│  ├─ Step 5: Store launch context                            │
│  └─ Step 6: Attach debugger (ONLY if attachDebugger)        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓ (only if attachDebugger === true)
┌─────────────────────────────────────────────────────────────┐
│          Debug Provider                                     │
│          infrastructure/vscode/debug/debug-provider.ts      │
├─────────────────────────────────────────────────────────────┤
│ BazelDebugConfigurationProvider                             │
│  ├─ resolveSimulatorDebugConfig()                           │
│  │   └─ lldb-dap + process connect localhost:6667           │
│  └─ resolveDeviceDebugConfig()                              │
│      └─ lldb-dap + device attach --continue --pid           │
└─────────────────────────────────────────────────────────────┘
```

## Command Comparison

| Command | Build Module | Build Mode | Launch App | Attach Debugger |
|---------|--------------|------------|------------|-----------------|
| **Build** | `buildBazelTarget()` | 🔄 User chooses | ❌ | ❌ |
| **Run** | `buildBazelTarget()` | Release | ✅ | ❌ |
| **Debug** | `buildBazelTarget()` | Debug | ✅ | ✅ |

## Build Modes

Three build modes available:

| Mode | Optimization | Debug Symbols | Use Case |
|------|-------------|---------------|----------|
| **Debug** | ❌ Disabled | ✅ Full symbols | Development & debugging |
| **Release** | ✅ Enabled | ❌ Stripped | Production builds (smallest) |
| **Release+Symbols** | ✅ Enabled | ✅ Full symbols | Production with crash reports |
