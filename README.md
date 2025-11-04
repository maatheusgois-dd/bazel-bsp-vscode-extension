# SwiftBazel

> **Develop Swift/iOS projects in VSCode** with full Bazel integration, debugging support, and intelligent code completion.

<p align="center">
  <img src="images/logo.png" width="128" alt="SwiftBazel Logo">
</p>

## Description

SwiftBazel is a comprehensive VSCode extension that brings first-class Swift and iOS development to VSCode using Bazel as the build system. It provides a seamless development experience comparable to Xcode, with powerful features like intelligent target management, integrated debugging, simulator control, and [Build Server Protocol (BSP)](https://github.com/spotify/sourcekit-bazel-bsp) support for real-time code intelligence.

Built for DoorDash's iOS development workflow, this extension eliminates the need to switch between VSCode and Xcode while maintaining full compatibility with Bazel's powerful build system.

### Click to watch the full demo
[![Demo](https://github.com/user-attachments/assets/053dccc5-c7af-4235-9184-64f1f1204502)](https://vimeo.com/1133527373)


---

## Features Summary

### 🎯 **Bazel Target Management**
- Query and visualize all Bazel targets in your workspace
- Select targets with a single click
- Build, test, run, and debug any target
- Recent targets tracking
- Multiple build modes: Debug, Release, Release with Symbols

### 🐛 **Integrated Debugging**
- Full LLDB integration powered by CodeLLDB
- Attach debugger to iOS simulators and physical devices
- Breakpoints, step debugging, and variable inspection
- Wait-for-debugger launch mode
- Custom LLDB commands support

### 📱 **Device & Simulator Management**
- List all available simulators and connected devices
- Start/stop simulators directly from VSCode
- Quick simulator selection for builds
- Device cache management
- Take simulator screenshots
- Support for iPhone, iPad, Apple Watch, and Apple TV

### 🔧 **Build Server Protocol (BSP)**
- Real-time Swift code intelligence
- Automatic BSP configuration generation
- Live BSP log monitoring
- Auto-prompt to update BSP on target changes

### 🛠️ **Developer Tools Integration**
- Required tools detection (Bazel, Xcode, devicectl, simctl)
- One-click tool installation
- Tool documentation links
- Health check diagnostics

### ⚡ **Productivity Features**
- Keyboard shortcuts (Cmd+R run, Cmd+B build, Cmd+U test, Cmd+K clean)
- Status bar indicators for selected target, destination, and build mode
- Progress tracking with cancellation support
- Terminal output with xcbeautify formatting
- Build cache management
- MCP Server for AI assistant integration

---

## Development Setup

### Prerequisites

1. **macOS** (required for iOS development)
2. **VSCode** 1.85.0 or later
3. **Node.js** 22.x
4. **Bazel** (extension will prompt if not installed)
5. **Xcode** (for iOS SDK and simulators)

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/maatheusgois-dd/swiftbazel.git
cd swiftbazel
```

2. **Install dependencies**
```bash
npm install
```

3. **Open in VSCode**
```bash
code .
```

4. **Press F5 to start development**
   - VSCode compiles the extension with source maps
   - Launches a new **Extension Development Host** window
   - The extension runs in this isolated environment

5. **Test the extension in the Development Host**
   - Open a Bazel workspace in the Extension Development Host (e.g., the `Example/` folder)
   - The SwiftBazel icon appears in the Activity Bar
   - Set breakpoints in your TypeScript code (original VSCode window)
   - Interact with the extension (Development Host window) - breakpoints will hit
   - View logs: `Output > SwiftBazel` in the Development Host
   - Reload after changes: Press `Cmd+R` in the Development Host or restart debugging

### Development Commands

```bash
# Build extension
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Run unit tests
npm run test:unit

# Run all tests with coverage
npm run jest:coverage

# Lint and format
npm run check:all

# Type checking
npm run check:types
```

### Project Structure

```
swiftbazel/
├── src/
│   ├── application/       # Use cases and business logic
│   │   ├── services/      # Core services (BuildManager, etc.)
│   │   └── use-cases/     # Command handlers
│   ├── domain/            # Entities and domain models
│   ├── infrastructure/    # External integrations (Bazel, Apple platforms, MCP)
│   ├── presentation/      # UI components (status bars, tree views)
│   └── shared/            # Utilities, logger, constants
├── tests/                 # Unit and integration tests
├── docs/                  # Documentation
└── Example/               # Example Bazel workspace for testing
```

---

## Features Deep Dive

### 🎯 Bazel Target Management

<img width="600" alt="image" src="https://github.com/user-attachments/assets/98125c8a-db3c-455e-a5a4-923a523e0df7" />

**Query and Build Any Target**

The extension automatically discovers all Bazel targets in your workspace using `bazel query`. Targets are organized by type:
- **Binaries** (ios_application, macos_application) - Can build, run, and debug
- **Libraries** (swift_library, objc_library) - Can build and test
- **Tests** (ios_unit_test, swift_test) - Can build and test

**Select a Target**

Click the pin icon next to any target to make it the active target. The selected target appears in:
- Status bar (bottom of VSCode)
- Bazel Targets tree view (highlighted)
- All build/run commands use this target

<img height="108" alt="image" src="https://github.com/user-attachments/assets/5c62ef39-45a6-443d-ba5f-56d99f3f862e" />

**Build Modes**

Choose from three build modes via the status bar or command palette:
- **Debug**: Unoptimized with full symbols (`--compilation_mode=dbg`)
- **Release**: Optimized without symbols (default Bazel)
- **Release with Symbols**: Optimized with symbols for crash reports (`--compilation_mode=opt --copt=-g`)

<img height="157" alt="image" src="https://github.com/user-attachments/assets/091ff834-0c3d-4dda-a3fe-2a8deaa9ae47" />

**Recent Targets**

Frequently used targets appear at the top for quick access. Clear recents with the trash icon.

<img width="530" height="41" alt="image" src="https://github.com/user-attachments/assets/19b571bf-28c5-483d-98e3-3e92bd22fe3e" />

---

### 🐛 Integrated Debugging

<img src="images/placeholder-debugging.png" alt="Debugging Session" width="600">

**One-Click Debug**

1. Select a binary target (e.g., `//HelloWorld:HelloWorldApp`)
2. Choose a destination (simulator or device)
3. Click the debug icon (🐞) or press `Cmd+Shift+D`
4. The extension will:
   - Build the target with debug symbols
   - Install on the selected destination
   - Launch with debugger attached
   - Open the Debug view

**Wait-for-Debugger Mode**

For apps that crash on startup, use the wait-for-debugger mode:
```json
{
  "type": "swiftbazel-lldb",
  "request": "attach",
  "name": "Debug App",
  "preLaunchTask": "swiftbazel: debugging-launch"
}
```

**Custom LLDB Commands**

Add custom LLDB initialization commands via `codelldbAttributes`:
```json
{
  "type": "swiftbazel-lldb",
  "request": "attach",
  "codelldbAttributes": {
    "initCommands": [
      "settings set target.x86-disassembly-flavor intel",
      "command script import ~/lldb_scripts/my_script.py"
    ]
  }
}
```

**Supported Debugging Features**
- ✅ Breakpoints (line, conditional, logpoints)
- ✅ Step over/into/out
- ✅ Variable inspection and modification
- ✅ Watch expressions
- ✅ Call stack navigation
- ✅ LLDB console (REPL)
- ✅ Memory inspection
- ✅ Thread inspection

---

### 📱 Device & Simulator Management

<img width="600" alt="image" src="https://github.com/user-attachments/assets/8b2b727d-6ac0-4a96-90c9-9f72b5cf6719" />

**Destinations View**

The Destinations panel shows all available places to run your app:

**Simulators**
- 🟢 Green dot = Booted (running)
- ⚪ Gray = Shutdown
- Actions: Start, Stop, Open Simulator.app, Remove Cache, Screenshot

**Physical Devices**
- Connected via USB or Wi-Fi
- Requires Xcode Command Line Tools
- Managed via `devicectl` (Xcode 15+)

**Select a Destination**

Click the pin icon next to any device/simulator. The selected destination:
- Shows in the status bar
- Persists across VSCode restarts
- Used for all run/debug operations

**Simulator Control**

Right-click simulators for actions:
- **Start**: Boot the simulator
- **Stop**: Shutdown the simulator
- **Open**: Launch Simulator.app
- **Remove Cache**: Clear app data
- **Screenshot**: Save screenshot to workspace

**Recent Destinations**

Recently used destinations appear at the top. Remove with the trash icon.

---

### 🔧 [Build Server Protocol (BSP)](https://github.com/spotify/sourcekit-bazel-bsp)

**What is BSP?**

BSP enables the Swift extension to understand your code structure, providing:
- Intelligent code completion
- Jump to definition
- Find all references
- Real-time error checking
- Symbol search

**Setup BSP**

1. Select a Bazel target
2. Run command: `SwiftBazel: Setup BSP Config for Selected Target`
3. Extension generates `.bsp/skbsp.json`:
```json
{
  "target": "//HelloWorld:HelloWorldApp"
}
```
4. Reload VSCode
5. Swift extension will start indexing

<img width="400" alt="image" src="https://github.com/user-attachments/assets/15da2514-b1f2-48c8-ad4c-59d6e45f1b3e" />


**Index Reuse (Fast Indexing)** (This isn't woking yet :/)

Enable `swiftbazel.build.enableIndexingInDebug` (default: true) to:
- Generate index files during build
- BSP reuses this index instantly
- Trade-off: ~30s longer debug builds vs 5-10min initial BSP indexing

**Monitor BSP Logs**

Debug BSP issues with live log streaming:
```bash
Command: SwiftBazel: Monitor BSP Logs
```

<img width="600" alt="image" src="https://github.com/user-attachments/assets/ce76b6d3-b2e9-4d60-917a-38c37dfecd4b" />


This streams `sourcekit-bazel-bsp` logs in real-time to the terminal.

**Auto-Update Prompt**

When you select a new target, the extension asks:
```
BSP is configured for a different target. Update?
[Yes] [No] [Don't ask again]
```

<img width="600" alt="image" src="https://github.com/user-attachments/assets/75c6da3f-e9a5-4a14-911b-b265bb74c40b" />

<img width="600" alt="image" src="https://github.com/user-attachments/assets/15f5b0a0-f4d0-4655-88d7-57dd7d1eb0af" />

<img width="600" alt="image" src="https://github.com/user-attachments/assets/98a46701-e886-45bc-9eea-7171a89c8e18" />


Disable via `swiftbazel.bsp.autoUpdateOnTargetChange: false`

---

### 🛠️ Developer Tools Integration

<img width="600" alt="image" src="https://github.com/user-attachments/assets/0560c027-38f8-408e-a782-f7c85bfcc8fd" />


**Tools View**

The Tools panel shows the status of required development tools:

| Tool | Purpose | Auto-Install |
|------|---------|--------------|
| **Bazel** | Build system | ✅ (via Homebrew) |
| **Xcode** | iOS SDK | ❌ (manual) |
| **devicectl** | Physical device management | ℹ️ (included with Xcode 15+) |
| **simctl** | Simulator management | ℹ️ (included with Xcode) |
| **xcbeautify** | Format build logs | ✅ (via Homebrew) |
| **sourcekit-bazel-bsp** | BSP server | ✅ (via script) |

**Install Tools**

Click the install icon (🔨) next to any missing tool. The extension will:
- Run the appropriate install command
- Show progress in terminal
- Refresh status after installation

**Documentation Links**

Click the book icon (📖) to open official documentation for each tool.

**Diagnose Setup**

Run `SwiftBazel: Diagnose build setup` to check:
- Bazel installation and version
- Xcode installation and version
- Available simulators
- Connected devices
- Workspace structure
- Common configuration issues

---

### ⚡ Productivity Features

**Keyboard Shortcuts**

| Shortcut | Command |
|----------|---------|
| `Cmd+R` | Run selected target |
| `Cmd+B` | Build selected target |
| `Cmd+U` | Test selected target |
| `Cmd+K` | Clean Bazel cache |
| `Cmd+Shift+K` | Clean Bazel cache (expunge) |

**Status Bars**

Three status bar items provide quick access:

1. **Target** (🎯): Shows selected target, click to change
2. **Destination** (📱): Shows selected device/simulator, click to change
3. **Build Mode** (⚙️): Shows current build mode (Debug/Release), click to change

**Progress Tracking**

Long-running operations show:
- Progress percentage in status bar
- Spinner animation
- Cancel button (⏹️)
- Detailed output in terminal

**Terminal Output**

Build/test output is formatted with `xcbeautify` (if installed) for:
- Color-coded errors and warnings
- Clickable file paths
- Clean, readable format
- Progress indicators

**Problem Matchers**

Errors and warnings from builds appear in:
- Problems panel (`Cmd+Shift+M`)
- File editor (red/yellow squiggles)
- Clickable to jump to source

---

### 🤖 MCP Server (AI Integration)

**What is MCP?**

Model Context Protocol (MCP) is a standardized way for AI assistants to interact with tools. SwiftBazel includes an MCP server that exposes extension capabilities to AI assistants like Claude.

**MCP Tools Available**

- `execute_bazel_command`: Run Bazel commands (build, test, run)
- `get_bazel_targets`: Query available targets
- `get_build_status`: Check current build status
- `get_diagnostics`: Run diagnostics
- `control_simulator`: Start/stop/list simulators

**Server Details**

- Port: `61333`
- URL: `http://localhost:61333`
- Metrics: `http://localhost:61333/metrics` (Prometheus format)
- Health: `http://localhost:61333/health`

**Connect AI Assistant**

Example for Claude Desktop (`~/Library/Application Support/Claude/config.json`):
```json
{
  "mcpServers": {
    "swiftbazel": {
      "command": "curl",
      "args": ["http://localhost:61333"]
    }
  }
}
```

Then ask Claude: *"Build the HelloWorld target"* and it will use the MCP server to execute the command.

---

## Configuration

### Extension Settings

All settings are under `swiftbazel.*` in VSCode settings:

#### Build Settings

```json
{
  // Enable xcbeautify for prettier build output
  "swiftbazel.build.xcbeautifyEnabled": true,
  
  // Enable index reuse in debug builds (faster BSP indexing)
  "swiftbazel.build.enableIndexingInDebug": true,
  
  // Additional Bazel arguments
  "swiftbazel.build.args": [
    "--config=my_config"
  ],
  
  // Build environment variables
  "swiftbazel.build.env": {
    "MY_VAR": "value"
  },
  
  // App launch arguments
  "swiftbazel.build.launchArgs": [
    "--enable-feature"
  ],
  
  // App launch environment variables
  "swiftbazel.build.launchEnv": {
    "API_URL": "https://staging.api.com"
  }
}
```

#### BSP Settings

```json
{
  // Auto-prompt to update BSP when target changes
  "swiftbazel.bsp.autoUpdateOnTargetChange": true
}
```

#### Bazel Settings

```json
{
  // Default build mode: "debug", "release", "release-with-symbols", or "ask"
  "swiftbazel.bazel.buildMode": "ask"
}
```

#### System Settings

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

---

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

---

## Troubleshooting

### Extension Not Activating

**Symptoms**: SwiftBazel icon doesn't appear in Activity Bar

**Solutions**:
1. Check workspace contains Bazel files (`BUILD`, `WORKSPACE`, `MODULE.bazel`)
2. Run `SwiftBazel: Diagnose build setup`
3. Check Output panel (`View > Output`, select "SwiftBazel")
4. Reload VSCode

### No Targets Found

**Symptoms**: Bazel Targets view is empty

**Solutions**:
1. Verify Bazel is installed: `bazel version`
2. Run `bazel query //...` in terminal to check targets manually
3. Check `.bazelignore` isn't excluding your targets
4. Click refresh icon in Bazel Targets view

### Debugging Not Working

**Symptoms**: Debugger doesn't attach or app crashes

**Solutions**:
1. Install CodeLLDB extension (auto-prompted)
2. Verify app builds: Run `SwiftBazel: Bazel Build` first
3. Check destination is available (simulator booted or device connected)
4. Try wait-for-debugger launch configuration
5. Check LLDB logs in Debug Console

### Code Completion Not Working

**Symptoms**: No autocomplete, "missing" imports, red squiggles

**Solutions**:
1. Run `SwiftBazel: Setup BSP Config for Selected Target`
2. Reload VSCode
3. Wait for indexing (check Swift extension output)
4. Run `SwiftBazel: Monitor BSP Logs` to debug
5. Verify `sourcekit-bazel-bsp` is installed (Tools view)
6. Enable `swiftbazel.build.enableIndexingInDebug` and do a debug build

### Slow Build Times

**Solutions**:
1. Use `bazel clean` instead of `bazel clean --expunge`
2. Add `build --disk_cache=~/.bazel-cache` to `.bazelrc`
3. Disable `swiftbazel.build.enableIndexingInDebug` if you don't use BSP
4. Use Remote Build Execution (RBE) if available
5. Check for unnecessary dependencies in BUILD files

### Simulator Issues

**Symptoms**: Simulator won't start or app won't install

**Solutions**:
1. Verify simulator exists: `xcrun simctl list devices`
2. Delete and recreate simulator in Xcode
3. Run `SwiftBazel: Remove simulator cache`
4. Boot simulator manually first: `xcrun simctl boot <UDID>`
5. Check Xcode Command Line Tools: `xcode-select --print-path`

---

## Architecture

SwiftBazel follows **Clean Architecture** principles with clear layer separation:

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  (Tree Views, Status Bars, Commands)    │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│         Application Layer               │
│  (Use Cases, Services, Business Logic)  │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│         Domain Layer                    │
│     (Entities, Domain Models)           │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│       Infrastructure Layer              │
│  (Bazel CLI, Apple Tools, VSCode API)   │
└─────────────────────────────────────────┘
```

### Key Components

- **ExtensionContext**: Central dependency injection container
- **BuildManager**: Manages Bazel targets, builds, and state
- **DestinationsManager**: Handles simulators and devices
- **BazelCLIAdapter**: Wrapper around Bazel command-line
- **DebugProvider**: Integrates with VSCode debugger API
- **McpServer**: Exposes extension capabilities to AI assistants

---

## Contributing

### Reporting Issues

Open an issue on GitHub with:
- VSCode version (`Code > About Visual Studio Code`)
- Extension version (from Extensions panel)
- Xcode version: `xcodebuild -version`
- Bazel version: `bazel version`
- Steps to reproduce
- Extension logs (`Output > SwiftBazel`)

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm run test:unit`
5. Run linters: `npm run check:all`
6. Commit: `git commit -m 'Add amazing feature'`
7. Push: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Development Guidelines

- Follow existing code structure (Clean Architecture layers)
- Add tests for new features
- Update documentation
- Use TypeScript strict mode
- Keep commits atomic and well-described

---

## License

MIT License - see [LICENSE.md](LICENSE.md) for details

---

## Credits

Built with:
- [VSCode Extension API](https://code.visualstudio.com/api)
- [Bazel](https://bazel.build/)
- [CodeLLDB](https://github.com/vadimcn/codelldb)
- [Swift Extension](https://github.com/swift-server/vscode-swift)
- [sourcekit-bazel-bsp](https://github.com/swiftlang/sourcekit-lsp)
- [Sweetpad](https://github.com/sweetpad-dev/sweetpad)

---

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/maatheusgois-dd/swiftbazel/issues)
- 💬 Internal DoorDash Slack: `#ios-tooling`

---

**Happy Swift Development in VSCode!** 🚀

