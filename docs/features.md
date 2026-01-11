# Features

## 🎯 Bazel Target Management

<img width="600" alt="image" src="https://github.com/user-attachments/assets/98125c8a-db3c-455e-a5a4-923a523e0df7" />

The extension discovers Bazel targets using `bazel query`. Targets are organized by type:

- **Binaries** (ios_application, macos_application) - Can build, run, and debug
- **Libraries** (swift_library, objc_library) - Can build and test
- **Tests** (ios_unit_test, swift_test) - Can build and test

Click the pin icon next to any target to make it active. The selected target appears in the status bar and is used for
all build/run commands.

<img height="108" alt="image" src="https://github.com/user-attachments/assets/5c62ef39-45a6-443d-ba5f-56d99f3f862e" />

### Build Modes

Choose from three build modes via the status bar:

- **Debug**: Unoptimized with full symbols (`--compilation_mode=dbg`)
- **Release**: Optimized without symbols (default Bazel)
- **Release with Symbols**: Optimized with symbols for crash reports (`--compilation_mode=opt --copt=-g`)

<img height="157" alt="image" src="https://github.com/user-attachments/assets/091ff834-0c3d-4dda-a3fe-2a8deaa9ae47" />

---

## 🐛 Integrated Debugging

1. Select a binary target
2. Choose a destination (simulator or device)
3. Click the debug icon (🐞) or press `Cmd+Shift+D`
4. The extension builds, installs, and launches with debugger attached

### Wait-for-Debugger Mode

For apps that crash on startup:

```json
{
  "type": "swiftbazel-lldb",
  "request": "attach",
  "name": "Debug App",
  "preLaunchTask": "swiftbazel: debugging-launch"
}
```

### Custom LLDB Commands

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

### Supported Features

- ✅ Breakpoints (line, conditional, logpoints)
- ✅ Step over/into/out
- ✅ Variable inspection and modification
- ✅ Watch expressions
- ✅ Call stack navigation
- ✅ LLDB console (REPL)
- ✅ Memory inspection
- ✅ Thread inspection

---

## 📱 Device & Simulator Management

<img width="600" alt="image" src="https://github.com/user-attachments/assets/8b2b727d-6ac0-4a96-90c9-9f72b5cf6719" />

### Destinations View

Shows all available places to run your app:

**Simulators**

- 🟢 Green dot = Booted (running)
- ⚪ Gray = Shutdown
- Actions: Start, Stop, Open Simulator.app, Remove Cache, Screenshot

**Physical Devices**

- Connected via USB or Wi-Fi
- Requires Xcode Command Line Tools
- Managed via `devicectl` (Xcode 15+)

Click the pin icon to select a destination. It persists across VSCode restarts and is used for all run/debug operations.

---

## 🔧 Build Server Protocol (BSP)

**Powered by [sourcekit-bazel-bsp](https://github.com/spotify/sourcekit-bazel-bsp)**

BSP enables the Swift extension to provide:

- Intelligent code completion
- Jump to definition
- Find all references
- Real-time error checking
- Symbol search

### Setup

1. Select a Bazel target
2. Run: `SwiftBazel: Setup BSP Config for Selected Target`
3. Extension generates `.bsp/skbsp.json`:

```json
{
  "target": "//HelloWorld:HelloWorldApp"
}
```

4. Reload VSCode
5. Swift extension will start indexing

<img width="400" alt="image" src="https://github.com/user-attachments/assets/15da2514-b1f2-48c8-ad4c-59d6e45f1b3e" />

### Monitor BSP Logs

Debug BSP issues with live log streaming:

```bash
Command: SwiftBazel: Monitor BSP Logs
```

<img width="600" alt="image" src="https://github.com/user-attachments/assets/ce76b6d3-b2e9-4d60-917a-38c37dfecd4b" />

---

## 🛠️ Developer Tools Integration

<img width="600" alt="image" src="https://github.com/user-attachments/assets/0560c027-38f8-408e-a782-f7c85bfcc8fd" />

| Tool                    | Purpose                    | Auto-Install                 |
| ----------------------- | -------------------------- | ---------------------------- |
| **Bazel**               | Build system               | ✅ (via Homebrew)            |
| **Xcode**               | iOS SDK                    | ❌ (manual)                  |
| **devicectl**           | Physical device management | ℹ️ (included with Xcode 15+) |
| **simctl**              | Simulator management       | ℹ️ (included with Xcode)     |
| **xcbeautify**          | Format build logs          | ✅ (via Homebrew)            |
| **sourcekit-bazel-bsp** | BSP server                 | ✅ (via script)              |

Click the install icon (🔨) next to any missing tool. The extension will run the appropriate install command and show
progress in terminal.

---

## ⚡ Productivity Features

### Keyboard Shortcuts

| Shortcut      | Command                     |
| ------------- | --------------------------- |
| `Cmd+R`       | Run selected target         |
| `Cmd+B`       | Build selected target       |
| `Cmd+U`       | Test selected target        |
| `Cmd+K`       | Clean Bazel cache           |
| `Cmd+Shift+K` | Clean Bazel cache (expunge) |

### Status Bars

Three status bar items provide quick access:

1. **Target** (🎯): Shows selected target, click to change
2. **Destination** (📱): Shows selected device/simulator, click to change
3. **Build Mode** (⚙️): Shows current build mode (Debug/Release), click to change

### Terminal Output

Build/test output is formatted with `xcbeautify` (if installed) for color-coded errors and warnings with clickable file
paths.

---

## 🤖 MCP Server (AI Integration)

<img width="1200" alt="image" src="https://github.com/user-attachments/assets/86f2ddd4-1225-4cfe-b24c-ebd622ac85ab" />

Model Context Protocol (MCP) exposes extension capabilities to AI assistants.

### MCP Tools Available

- `execute_bazel_command`: Run Bazel commands (build, test, run)
- `get_bazel_targets`: Query available targets
- `get_build_status`: Check current build status
- `get_diagnostics`: Run diagnostics
- `control_simulator`: Start/stop/list simulators

### Server Details

- Port: `61333`
- URL: `http://localhost:61333`
- Metrics: `http://localhost:61333/metrics` (Prometheus format)
- Health: `http://localhost:61333/health`

### Connect AI Assistant

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
