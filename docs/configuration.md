# Configuration

All settings are under `bazelbsp.*` in VSCode settings.

## Build Settings

```json
{
  // Enable xcbeautify for prettier build output
  "bazelbsp.build.xcbeautifyEnabled": true,

  // Enable index reuse in debug builds (faster BSP indexing)
  "bazelbsp.build.enableIndexingInDebug": true,

  // Additional Bazel arguments
  "bazelbsp.build.args": ["--config=my_config"],

  // Build environment variables
  "bazelbsp.build.env": {
    "MY_VAR": "value"
  },

  // App launch arguments
  "bazelbsp.build.launchArgs": ["--enable-feature"],

  // App launch environment variables
  "bazelbsp.build.launchEnv": {
    "API_URL": "https://staging.api.com"
  }
}
```

## BSP Settings

```json
{
  // Auto-prompt to update BSP when target changes
  "bazelbsp.bsp.autoUpdateOnTargetChange": true,

  // Custom command to generate BSP config (supports placeholders: ${target}, ${workspace})
  "bazelbsp.bsp.setupCommand": null,

  // Name of the Bazel rule for BSP setup
  "bazelbsp.bsp.setupRuleName": "setup_sourcekit_bsp",

  // BSP config file name in .bsp/ directory
  "bazelbsp.bsp.configFileName": "skbsp.json",

  // Custom BSP config template (supports placeholders: ${target}, ${targetName}, ${workspace})
  "bazelbsp.bsp.configTemplate": null
}
```

See [BSP Customization Guide](bsp-customization.md) for detailed examples and use cases.

## Bazel Settings

```json
{
  // Default build mode: "debug", "release", "release-with-symbols", or "ask"
  "bazelbsp.bazel.buildMode": "ask",

  // Exclude specific paths from bazel query (useful for large monorepos)
  "bazelbsp.bazel.queryExcludePaths": ["//Apps/App/...", "//Apps/App2/..."]
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
  "bazelbsp.system.taskExecutor": "v2",

  // Log level: "debug", "info", "warn", "error"
  "bazelbsp.system.logLevel": "info",

  // Auto-reveal terminal on command execution
  "bazelbsp.system.autoRevealTerminal": true,

  // Show progress in status bar
  "bazelbsp.system.showProgressStatusBar": true
}
```

## Commands

All commands are available via Command Palette (`Cmd+Shift+P`):

### Bazel Commands

- `Bazel BSP: Select Bazel Target` - Choose active target
- `Bazel BSP: Bazel Build` - Build selected target
- `Bazel BSP: Bazel Test` - Test selected target
- `Bazel BSP: Bazel Run` - Run selected target
- `Bazel BSP: Bazel Debug` - Debug selected target
- `Bazel BSP: Bazel Clean` - Clean build cache
- `Bazel BSP: Bazel Clean (Expunge)` - Complete cache cleanup
- `Bazel BSP: Select Build Mode` - Choose Debug/Release mode
- `Bazel BSP: Stop/Cancel` - Stop current operation

### Destination Commands

- `Bazel BSP: Select destination` - Choose device/simulator
- `Bazel BSP: Refresh simulators list` - Update simulator list
- `Bazel BSP: Refresh devices list` - Update device list
- `Bazel BSP: Start simulator` - Boot a simulator
- `Bazel BSP: Stop simulator` - Shutdown a simulator
- `Bazel BSP: Open simulator` - Launch Simulator.app
- `Bazel BSP: Remove simulator cache` - Clear app data
- `Bazel BSP: Take Simulator Screenshot` - Save screenshot

### BSP Commands

- `Bazel BSP: Setup BSP Config for Selected Target` - Generate BSP config
- `Bazel BSP: Setup Swift Extension for BSP` - Configure Swift extension
- `Bazel BSP: Show Swift Configuration Status` - Check BSP status
- `Bazel BSP: Monitor BSP Logs` - Stream BSP logs

### System Commands

- `Bazel BSP: Diagnose build setup` - Run health check
- `Bazel BSP: Reset Extension Cache` - Clear extension cache
- `Bazel BSP: Open Terminal Panel` - Show terminal
- `Bazel BSP: Refresh Bazel Targets` - Re-query targets
- `Bazel BSP: Clear Recent Targets` - Clear recent list
