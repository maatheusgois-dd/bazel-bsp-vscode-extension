# Configuration

All settings are under `swiftbazel.*` in VSCode settings.

## Build Settings

```json
{
  // Enable xcbeautify for prettier build output
  "swiftbazel.build.xcbeautifyEnabled": true,

  // Enable index reuse in debug builds (faster BSP indexing)
  "swiftbazel.build.enableIndexingInDebug": true,

  // Additional Bazel arguments
  "swiftbazel.build.args": ["--config=my_config"],

  // Build environment variables
  "swiftbazel.build.env": {
    "MY_VAR": "value"
  },

  // App launch arguments
  "swiftbazel.build.launchArgs": ["--enable-feature"],

  // App launch environment variables
  "swiftbazel.build.launchEnv": {
    "API_URL": "https://staging.api.com"
  }
}
```

## BSP Settings

```json
{
  // Auto-prompt to update BSP when target changes
  "swiftbazel.bsp.autoUpdateOnTargetChange": true
}
```

## Bazel Settings

```json
{
  // Default build mode: "debug", "release", "release-with-symbols", or "ask"
  "swiftbazel.bazel.buildMode": "ask",

  // Exclude specific paths from bazel query (useful for large monorepos)
  "swiftbazel.bazel.queryExcludePaths": ["//Apps/App/...", "//Apps/App2/..."]
}
```

### Query Exclusions

Use `queryExcludePaths` to exclude large or irrelevant parts of your workspace from target discovery. This is useful in
monorepos where:

- Some apps are not actively developed
- Certain paths cause query performance issues
- You want to focus on specific areas of the codebase

The extension transforms this into: `bazel query '//... except (//Apps/App/... + //Apps/App2/...)' --output=label_kind`

## System Settings

```json
{
  // Task executor version ("v1" or "v2")
  "swiftbazel.system.taskExecutor": "v2",

  // Log level: "debug", "info", "warn", "error"
  "swiftbazel.system.logLevel": "info",

  // Auto-reveal terminal on command execution
  "swiftbazel.system.autoRevealTerminal": true,

  // Show progress in status bar
  "swiftbazel.system.showProgressStatusBar": true
}
```

## Commands

All commands are available via Command Palette (`Cmd+Shift+P`):

### Bazel Commands

- `SwiftBazel: Select Bazel Target` - Choose active target
- `SwiftBazel: Bazel Build` - Build selected target
- `SwiftBazel: Bazel Test` - Test selected target
- `SwiftBazel: Bazel Run` - Run selected target
- `SwiftBazel: Bazel Debug` - Debug selected target
- `SwiftBazel: Bazel Clean` - Clean build cache
- `SwiftBazel: Bazel Clean (Expunge)` - Complete cache cleanup
- `SwiftBazel: Select Build Mode` - Choose Debug/Release mode
- `SwiftBazel: Stop/Cancel` - Stop current operation

### Destination Commands

- `SwiftBazel: Select destination` - Choose device/simulator
- `SwiftBazel: Refresh simulators list` - Update simulator list
- `SwiftBazel: Refresh devices list` - Update device list
- `SwiftBazel: Start simulator` - Boot a simulator
- `SwiftBazel: Stop simulator` - Shutdown a simulator
- `SwiftBazel: Open simulator` - Launch Simulator.app
- `SwiftBazel: Remove simulator cache` - Clear app data
- `SwiftBazel: Take Simulator Screenshot` - Save screenshot

### BSP Commands

- `SwiftBazel: Setup BSP Config for Selected Target` - Generate BSP config
- `SwiftBazel: Setup Swift Extension for BSP` - Configure Swift extension
- `SwiftBazel: Show Swift Configuration Status` - Check BSP status
- `SwiftBazel: Monitor BSP Logs` - Stream BSP logs

### System Commands

- `SwiftBazel: Diagnose build setup` - Run health check
- `SwiftBazel: Reset Extension Cache` - Clear extension cache
- `SwiftBazel: Open Terminal Panel` - Show terminal
- `SwiftBazel: Refresh Bazel Targets` - Re-query targets
- `SwiftBazel: Clear Recent Targets` - Clear recent list
