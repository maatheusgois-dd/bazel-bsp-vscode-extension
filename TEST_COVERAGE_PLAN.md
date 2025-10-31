# Test Coverage Plan for SwiftBazel Extension

This document lists all functions that need to be tested, organized by architectural layer following Clean Code principles.

## Table of Contents
- [Application Layer](#application-layer)
  - [Services](#services)
  - [Use Cases](#use-cases)
- [Infrastructure Layer](#infrastructure-layer)
  - [Bazel Adapters](#bazel-adapters)
  - [Apple Platform Adapters](#apple-platform-adapters)
  - [VSCode Integration](#vscode-integration)
- [Domain Layer](#domain-layer)
- [Presentation Layer](#presentation-layer)
- [Shared Layer](#shared-layer)

---

## Application Layer

### Services

#### BuildManager (`src/application/services/build-manager.service.ts`)

- [ ] `on()` - Test event listener registration
- [ ] `initializeWithContext()` - Test initialization with cached target restoration
- [ ] `refresh()` - Test event emission on refresh
- [ ] `setCurrentWorkspacePath()` - Test workspace path update and caching
- [ ] `setSelectedBazelTarget()` - Test target selection and serialization
- [ ] `getSelectedBazelTarget()` - Test retrieval of selected target
- [ ] `getSelectedBazelTargetData()` - Test serialized data retrieval with fallback

**Test Scenarios:**
- Restore target from cache on init
- Handle missing context gracefully
- Event emission on state changes
- Serialization/deserialization of target data

---

#### DestinationsManager (`src/application/services/destination-manager.service.ts`)

- [ ] `on()` - Test event forwarding from sub-managers
- [ ] `refreshSimulators()` - Test simulator refresh
- [ ] `refreshDevices()` - Test device refresh  
- [ ] `refresh()` - Test full refresh (simulators + devices)
- [ ] `getSimulators()` - Test simulator retrieval with sorting
- [ ] `getiOSSimulators()` - Test iOS simulator filtering
- [ ] `getwatchOSSimulators()` - Test watchOS simulator filtering
- [ ] `gettvOSSimulators()` - Test tvOS simulator filtering
- [ ] `getvisionOSSimulators()` - Test visionOS simulator filtering
- [ ] `getiOSDevices()` - Test iOS device filtering
- [ ] `getWatchOSDevices()` - Test watchOS device filtering
- [ ] `gettvOSDevices()` - Test tvOS device filtering
- [ ] `getVisionOSDevices()` - Test visionOS device filtering
- [ ] `getmacOSDevices()` - Test macOS device generation
- [ ] `sortCompareFn()` - Test destination sorting logic
- [ ] `getDestinations()` - Test all destinations retrieval with usage sorting
- [ ] `findDestination()` - Test destination lookup by ID/type
- [ ] `trackSelectedDestination()` - Test usage tracking
- [ ] `trackDestinationUsage()` - Test usage statistics increment
- [ ] `trackRecentDestination()` - Test recent destinations tracking
- [ ] `removeRecentDestination()` - Test recent destination removal
- [ ] `setWorkspaceDestinationForBuild()` - Test build destination setting
- [ ] `setWorkspaceDestinationForTesting()` - Test test destination setting
- [ ] `getSelectedXcodeDestinationForBuild()` - Test build destination retrieval
- [ ] `getSelectedXcodeDestinationForTesting()` - Test test destination retrieval
- [ ] `isRecentExists()` - Test recent destinations existence check
- [ ] `getRecentDestinations()` - Test recent destinations retrieval

**Test Scenarios:**
- Empty device/simulator lists
- Multiple platform filtering
- Usage statistics calculation
- Platform priority sorting
- Recent destinations management

---

#### DevicesManager (`src/application/services/device-manager.service.ts`)

- [ ] `refresh()` - Test device refresh with error handling
- [ ] `getDevices()` - Test device retrieval with refresh option
- [ ] `fetchDevices()` - Test device fetching and parsing

**Test Scenarios:**
- No devicectl available
- Multiple device types parsing
- Empty device list
- devicectl errors

---

#### SimulatorsManager (`src/application/services/simulator-manager.service.ts`)

- [ ] `refresh()` - Test simulator refresh
- [ ] `getSimulators()` - Test simulator retrieval with caching
- [ ] `prepareSimulator()` - Test simulator data parsing
- [ ] `fetchSimulators()` - Test simctl output parsing

**Test Scenarios:**
- Multiple OS versions
- Unavailable simulators filtering
- Invalid device type identifiers
- Invalid runtime identifiers

---

#### ToolsManager (`src/application/services/tools-manager.service.ts`)

- [ ] `refresh()` - Test tool installation check
- [ ] `getTools()` - Test tool list retrieval

**Test Scenarios:**
- All tools installed
- Some tools missing
- Command execution failures

---

### Use Cases

#### Bazel Commands (`src/application/use-cases/bazel/bazel-commands.use-case.ts`)

- [ ] `bazelBuildCommand()` - Test Bazel build workflow
- [ ] `bazelCleanCommand()` - Test Bazel clean operation
- [ ] `bazelCleanExpungeCommand()` - Test expunge clean
- [ ] `bazelStopCommand()` - Test operation cancellation
- [ ] `selectBazelBuildModeCommand()` - Test build mode selection
- [ ] `bazelTestCommand()` - Test Bazel test execution
- [ ] `bazelRunCommand()` - Test app launch without debug
- [ ] `bazelDebugCommand()` - Test app launch with debug
- [ ] `selectBazelTargetCommand()` - Test target selection
- [ ] `buildSelectedBazelTargetCommand()` - Test building selected target
- [ ] `testSelectedBazelTargetCommand()` - Test testing selected target
- [ ] `runSelectedBazelTargetCommand()` - Test running selected target
- [ ] `diagnoseBuildSetupCommand()` - Test build diagnostics
- [ ] `reconstructBazelItemFromCache()` - Test target reconstruction
- [ ] `resolveTargetItem()` - Test target resolution from multiple sources
- [ ] `getBuildMode()` - Test build mode retrieval and selection
- [ ] `writeTimingResults()` - Test timing output formatting

**Test Scenarios:**
- No target selected
- Invalid target type for operation
- Build mode caching and restoration
- User cancellation at each step
- Missing Bazel installation

---

#### Debug Commands (`src/application/use-cases/bazel/debug-commands.use-case.ts`)

- [ ] `getAppPathCommand()` - Test deprecated app path retrieval

**Test Scenarios:**
- No last launched app
- Valid app path retrieval

---

#### Destination Commands (`src/application/use-cases/destination/destination-commands.use-case.ts`)

- [ ] `selectDestinationForBuildCommand()` - Test destination selection
- [ ] `removeRecentDestinationCommand()` - Test recent destination removal

**Test Scenarios:**
- Direct item selection
- Interactive selection from list
- Empty destinations list

---

#### Simulator Commands (`src/application/use-cases/destination/simulator-commands.use-case.ts`)

- [ ] `startSimulatorCommand()` - Test simulator boot
- [ ] `stopSimulatorCommand()` - Test simulator shutdown
- [ ] `openSimulatorCommand()` - Test Simulator.app opening
- [ ] `removeSimulatorCacheCommand()` - Test cache cleanup
- [ ] `takeSimulatorScreenshotCommand()` - Test screenshot capture

**Test Scenarios:**
- Simulator already booted
- Multiple simulators running
- Invalid UDID
- Screenshot file creation
- Empty screenshot (0 bytes)

---

#### System Commands (`src/application/use-cases/system/system-commands.use-case.ts`)

- [ ] `resetswiftbazelCache()` - Test cache reset
- [ ] `openTerminalPanel()` - Test terminal panel display

---

#### Tools Commands (`src/application/use-cases/tools/tools-commands.use-case.ts`)

- [ ] `installToolCommand()` - Test tool installation via brew
- [ ] `openDocumentationCommand()` - Test documentation opening

**Test Scenarios:**
- Tool already installed
- Homebrew not available
- Installation failures

---

## Infrastructure Layer

### Bazel Adapters

#### Bazel Build (`src/infrastructure/bazel/bazel-build.ts`)

- [ ] `buildBazelTarget()` - Test unified Bazel build logic

**Test Scenarios:**
- iOS Simulator build
- iOS Device build  
- Device connection check
- Device lock check
- Unsupported destination type
- Build mode variations (debug, release, release-with-symbols)

---

#### Bazel Parser (`src/infrastructure/bazel/bazel-parser.ts`)

- [x] `BazelParser.queryAllTargets()` - Test bazel query execution (100% coverage) ✅
- [x] `BazelParser.parseTargets()` - Test target categorization (100% coverage) ✅
- [x] `BazelParser.buildTree()` - Test tree structure building (100% coverage) ✅
- [x] `BazelParser.getTargetsAtPath()` - Test target retrieval at path (100% coverage) ✅
- [x] `BazelParser.getChildrenAtPath()` - Test child directory retrieval (100% coverage) ✅
- [x] `BazelParser.hasTargetsAtPath()` - Test target existence check (100% coverage) ✅

**Test Scenarios:**
- ✅ Empty query results
- ✅ Multiple target types
- ✅ Deeply nested packages
- ✅ Invalid target formats
- ✅ Ignored target types
- ✅ Performance with large datasets

---

#### Bazel CLI Adapter (`src/infrastructure/bazel/bazel-cli.adapter.ts`)

Functions are re-exported from bazel-parser.ts - test via parser tests.

---

### Apple Platform Adapters

#### Devicectl Adapter (`src/infrastructure/apple-platforms/devicectl.adapter.ts`)

- [ ] `listDevices()` - Test device listing via devicectl
- [ ] `isDeviceConnected()` - Test device connection check
- [ ] `ensureDeviceConnected()` - Test device connection enforcement
- [ ] `getRunningProcesses()` - Test process listing on device
- [ ] `pairDevice()` - Test device pairing
- [ ] `isDeviceLocked()` - Test device lock state check
- [ ] `waitForDeviceUnlock()` - Test unlock waiting with timeout
- [ ] `ensureDeviceUnlocked()` - Test device unlock enforcement

**Test Scenarios:**
- No devices connected
- Device connected but not paired
- Device locked
- Device unlock timeout
- Network vs wired devices
- Invalid device UDID
- Devicectl not available

---

#### Simctl Adapter (`src/infrastructure/apple-platforms/simctl.adapter.ts`)

- [ ] `getSimulators()` - Test simulator listing
- [ ] `getSimulatorsFromTextFormat()` - Test text format parsing fallback

**Test Scenarios:**
- JSON format parsing
- Text format parsing fallback
- Empty simulator list
- Multiple OS versions
- Unavailable simulators

---

### VSCode Integration

#### Extension Context (`src/infrastructure/vscode/extension-context.ts`)

- [ ] `ExtensionContext.startExecutionScope()` - Test scope management
- [ ] `ExtensionContext.registerCommand()` - Test command registration with error handling
- [ ] `ExtensionContext.showCommandErrorMessage()` - Test error display
- [ ] `ExtensionContext.registerTreeDataProvider()` - Test tree provider registration
- [ ] `ExtensionContext.updateWorkspaceState()` - Test state persistence
- [ ] `ExtensionContext.getWorkspaceState()` - Test state retrieval
- [ ] `ExtensionContext.resetWorkspaceState()` - Test state reset
- [ ] `ExtensionContext.updateProgressStatus()` - Test progress updates

**Test Scenarios:**
- Nested execution scopes
- QuickPickCancelledError handling
- ExtensionError handling
- Unknown error handling
- State persistence across reloads

---

#### Task Provider (`src/infrastructure/vscode/task-provider.ts`)

- [ ] `BazelBuildTaskProvider.provideTasks()` - Test empty task list return
- [ ] `BazelBuildTaskProvider.resolveTask()` - Test deprecation handling
- [ ] `ActionDispatcher.do()` - Test deprecated action errors

**Test Scenarios:**
- Deprecated action handling
- Custom task execution

---

#### Debug Provider (`src/infrastructure/vscode/debug/debug-provider.ts`)

- [ ] `registerDebugConfigurationProvider()` - Test provider registration
- [ ] `DynamicDebugConfigurationProvider.resolveDebugConfiguration()` - Test config resolution
- [ ] `DynamicDebugConfigurationProvider.resolveDebugConfigurationWithSubstitutedVariables()` - Test variable substitution
- [ ] `DynamicDebugConfigurationProvider.resolveMacOSDebugConfiguration()` - Test macOS debug config
- [ ] `DynamicDebugConfigurationProvider.resolveSimulatorDebugConfiguration()` - Test simulator debug config
- [ ] `DynamicDebugConfigurationProvider.resolveDeviceDebugConfiguration()` - Test device debug config
- [ ] `DynamicDebugConfigurationProvider.resolveBazelSimulatorDebugConfiguration()` - Test Bazel simulator config
- [ ] `DynamicDebugConfigurationProvider.resolveBazelDeviceDebugConfiguration()` - Test Bazel device config
- [ ] `BazelDebugConfigurationProvider.resolveDebugConfiguration()` - Test Bazel-specific config
- [ ] `BazelDebugConfigurationProvider.resolveSimulatorDebugConfig()` - Test Bazel simulator debugging
- [ ] `BazelDebugConfigurationProvider.resolveDeviceDebugConfig()` - Test Bazel device debugging

**Test Scenarios:**
- No launch context
- Each launch context type (macos, simulator, device, bazel-simulator, bazel-device)
- Missing process information
- LLDB command generation

---

#### Debug Utils (`src/infrastructure/vscode/debug/debug-utils.ts`)

- [ ] `extractDeviceAppPath()` - Test file URL parsing
- [ ] `waitForProcessToLaunch()` - Test process waiting with timeout

**Test Scenarios:**
- Valid file URL
- Invalid URL format
- Process found immediately
- Process not found (timeout)
- No running processes

---

#### Bazel Debug (`src/infrastructure/vscode/debug/bazel-debug.ts`)

- [ ] `debugBazelAppOnSimulator()` - Test simulator debug workflow
- [ ] `debugBazelAppOnDevice()` - Test device debug workflow
- [ ] `enhancedBazelDebugCommand()` - Test enhanced debug command

---

#### Bazel Launcher (`src/infrastructure/vscode/debug/bazel-launcher.ts`)

- [ ] `launchBazelAppOnSimulator()` - Test app launch on simulator
- [ ] `launchBazelAppOnDevice()` - Test app launch on device
- [ ] `getBundleIdentifier()` - Test bundle ID extraction
- [ ] `startDebugServer()` - Test debugserver startup

**Test Scenarios:**
- Simulator already booted
- Simulator not booted
- App installation timeout
- App installation retry with simulator restart
- Invalid app bundle
- Missing Info.plist
- Invalid bundle identifier
- Device connection required
- Device locked during install
- Debugserver port conflicts
- Existing debugserver cleanup
- Device vs simulator debugserver modes

---

#### Build and Launch (`src/infrastructure/vscode/debug/build-and-launch.ts`)

- [ ] `buildAndLaunchBazelApp()` - Test unified workflow
- [ ] `buildStep()` - Test build step execution
- [ ] `locateAppBundle()` - Test app bundle location
- [ ] `prepareApp()` - Test app preparation (signing, permissions)
- [ ] `launchApp()` - Test app launch step
- [ ] `attachDebuggerToApp()` - Test debugger attachment

**Test Scenarios:**
- Full debug workflow (6 steps)
- Full run workflow (4 steps)
- Build failures
- App bundle not found
- Code signing failures
- Launch failures
- Debugger attachment failures
- Active debug session cleanup

---

## Domain Layer

### Entities

Domain entities are mostly type definitions and don't require unit tests, but validation logic should be tested:

#### Destination Types (`src/domain/entities/destination/*.ts`)

- [ ] Device type instantiation
- [ ] Simulator type instantiation
- [ ] Platform-specific properties
- [ ] Type guards and validators

---

#### Bazel Types (`src/domain/entities/bazel/types.ts`)

- [ ] BuildMode enum values
- [ ] Type definitions validation

---

## Presentation Layer

### Status Bars

#### Build Status Bar (`src/presentation/status-bars/build-status-bar.ts`)

- [ ] `update()` - Test status bar text updates
- [ ] `dispose()` - Test cleanup

**Test Scenarios:**
- Target selected
- No target selected
- Target type indicators

---

#### Build Mode Status Bar (`src/presentation/status-bars/build-mode-status-bar.ts`)

- [ ] `update()` - Test build mode display
- [ ] `dispose()` - Test cleanup

**Test Scenarios:**
- Each build mode (debug, release, release-with-symbols)
- No build mode set

---

#### Destination Status Bar (`src/presentation/status-bars/destination-status-bar.ts`)

- [ ] `update()` - Test destination display
- [ ] `dispose()` - Test cleanup

**Test Scenarios:**
- Destination selected
- No destination selected
- Different destination types

---

#### Progress Status Bar (`src/presentation/status-bars/progress-status-bar.ts`)

- [ ] `updateText()` - Test text updates
- [ ] `registerCancelCallback()` - Test cancel callback registration
- [ ] `cancelCurrentOperation()` - Test operation cancellation
- [ ] `dispose()` - Test cleanup

**Test Scenarios:**
- Cancellable vs non-cancellable operations
- Cancel callback execution

---

### Tree Providers

#### Bazel Tree Provider (`src/presentation/tree-providers/bazel-tree.provider.ts`)

- [ ] `getTreeItem()` - Test tree item creation
- [ ] `getChildren()` - Test hierarchical children retrieval
- [ ] `refresh()` - Test tree refresh
- [ ] `clearRecents()` - Test recent targets clearing

**Test Scenarios:**
- Root level (recents + workspace)
- Package level
- Target categories (runnable, test, buildable)
- Empty query results
- Query errors

---

#### Destination Tree Provider (`src/presentation/tree-providers/destination-tree.provider.ts`)

- [ ] `getTreeItem()` - Test destination item creation
- [ ] `getChildren()` - Test destination hierarchy
- [ ] `refresh()` - Test tree refresh

**Test Scenarios:**
- Grouped by type (Recent, Simulators, Devices, macOS)
- Empty groups
- Booted vs shutdown simulators
- Device connection states

---

#### Tools Tree Provider (`src/presentation/tree-providers/tools-tree.provider.ts`)

- [ ] `getTreeItem()` - Test tool item creation
- [ ] `getChildren()` - Test tool list
- [ ] `refresh()` - Test tree refresh

**Test Scenarios:**
- Installed vs not installed tools
- Tool categories

---

#### Bazel Query Tree Item (`src/presentation/tree-providers/items/bazel-query-tree-item.ts`)

- [ ] Tree item creation for packages
- [ ] Tree item creation for targets
- [ ] Icon assignment
- [ ] Context value assignment

---

#### Bazel Tree Item (`src/presentation/tree-providers/items/bazel-tree-item.ts`)

- [ ] Tree item creation for different target types
- [ ] Command assignment
- [ ] Tooltip generation

---

#### Recent Targets Manager (`src/presentation/tree-providers/helpers/recent-targets-manager.ts`)

- [ ] `addTarget()` - Test target addition
- [ ] `getTargets()` - Test target retrieval
- [ ] `clear()` - Test clearing recents

**Test Scenarios:**
- Max limit enforcement
- Duplicate prevention
- Order preservation

---

## Shared Layer

### Utils

#### Bazel Utils (`src/shared/utils/bazel-utils.ts`)

- [ ] `askSimulator()` - Test simulator selection
- [ ] `askDestinationToRunOn()` - Test destination selection
- [ ] `selectDestinationForBuild()` - Test destination selection UI
- [ ] `getDestinationById()` - Test destination lookup
- [ ] `getWorkspacePath()` - Test workspace path retrieval
- [ ] `prepareStoragePath()` - Test storage path creation
- [ ] `prepareBundleDir()` - Test bundle directory preparation
- [ ] `prepareDerivedDataPath()` - Test derived data path resolution
- [ ] `getCurrentBazelWorkspacePath()` - Test workspace path resolution
- [ ] `detectBazelWorkspacesPaths()` - Test workspace detection
- [ ] `restartSwiftLSP()` - Test LSP restart

**Test Scenarios:**
- No workspace open
- Multiple workspaces
- Invalid paths
- Empty simulator/device lists
- User cancellation

---

#### Simulator Utils (`src/shared/utils/simulator-utils.ts`)

- [ ] `getSimulatorByUdid()` - Test simulator lookup
- [x] `parseDeviceTypeIdentifier()` - Test device type parsing (100% coverage) ✅
- [x] `parseSimulatorRuntime()` - Test runtime parsing (100% coverage) ✅
- [ ] `waitForSimulatorBoot()` - Test boot waiting
- [ ] `ensureSingleSimulator()` - Test single simulator enforcement

**Test Scenarios:**
- ✅ Valid/invalid device identifiers
- ✅ Valid/invalid runtime strings
- Boot timeout (pending)
- Multiple simulators booted (pending)
- Simulator not found (pending)

---

#### Exec (`src/shared/utils/exec.ts`)

- [ ] `exec()` - Test command execution

**Test Scenarios:**
- Successful execution
- Non-zero exit code
- Cancellable execution with user cancellation
- Progress notification
- Stderr with success
- devicectl passcode errors

---

#### Tasks (`src/shared/utils/tasks.ts`)

- [ ] `TaskTerminalV2.execute()` - Test command execution
- [ ] `TaskTerminalV2.write()` - Test output writing
- [ ] `TaskTerminalV2.handleInput()` - Test input handling (Ctrl+C)
- [ ] `TaskTerminalV1.execute()` - Test V1 task execution
- [ ] `runTask()` - Test task runner selection
- [ ] `setTaskPresentationOptions()` - Test terminal reveal settings
- [ ] `cleanCommandArgs()` - Test argument cleaning

**Test Scenarios:**
- V1 vs V2 executor
- Command with pipes
- User cancellation (Ctrl+C)
- Command failures
- Task locking and termination
- UI log file writing

---

#### Error Manager (`src/shared/utils/error-manager.ts`)

- [x] `throw()` - Test error throwing with logging (100% coverage) ✅
- [x] `handleNoTargetSelected()` - Test specific error (100% coverage) ✅
- [x] `handleNotTestTarget()` - Test specific error (100% coverage) ✅
- [x] `handleNotRunnableTarget()` - Test specific error (100% coverage) ✅
- [x] `handleValidationError()` - Test specific error (100% coverage) ✅
- [x] `createErrorManager()` - Test factory function (100% coverage) ✅

**Test Scenarios:**
- ✅ With/without context
- ✅ MCP event firing
- ✅ Multiple error scenarios

---

#### Cache Manager (`src/shared/utils/cache-manager.ts`)

- [ ] `setContext()` - Test initialization and loading
- [ ] `cacheBazelWorkspace()` - Test workspace caching
- [ ] `getBazelWorkspace()` - Test workspace retrieval
- [ ] `cacheDiscoveredBazelPaths()` - Test path caching
- [ ] `getDiscoveredBazelPaths()` - Test path retrieval
- [ ] `clearCache()` - Test cache clearing
- [ ] `getCacheStats()` - Test statistics retrieval
- [ ] `getAllBazelWorkspaces()` - Test all workspaces retrieval
- [ ] `cacheBazelWorkspacePackages()` - Test package caching helper

**Test Scenarios:**
- First load (no cache)
- Cache hit
- Version mismatch
- Cache persistence
- Corrupted cache data

---

#### Progress Manager (`src/shared/utils/progress-manager.ts`)

- [ ] `nextStep()` - Test step progression
- [ ] `updateStep()` - Test step update
- [ ] `completeStep()` - Test step completion
- [ ] `complete()` - Test operation completion
- [ ] `calculateProgress()` - Test progress calculation
- [ ] `formatProgressText()` - Test text formatting
- [ ] `getCurrentStep()` - Test current step retrieval
- [ ] `getStepElapsedTime()` - Test step timing
- [ ] `getTotalElapsedTime()` - Test total timing
- [ ] `cancel()` - Test cancellation
- [ ] `isCancelled()` - Test cancellation check
- [ ] `throwIfCancelled()` - Test cancellation throw

**Test Scenarios:**
- Weighted steps
- Cancellable vs non-cancellable
- Cancel during execution
- Progress percentage calculation
- Step name mismatch

---

#### Files (`src/shared/utils/files.ts`)

- [x] `findFiles()` - Test file finding (84% coverage) ✅
- [x] `findFilesRecursive()` - Test recursive file finding (84% coverage) ✅
- [x] `isFileExists()` - Test existence check (84% coverage) ✅
- [x] `readFile()` - Test file reading (84% coverage) ✅
- [x] `statFile()` - Test file stats (84% coverage) ✅
- [x] `readTextFile()` - Test text file reading (84% coverage) ✅
- [x] `readJsonFile()` - Test JSON parsing (84% coverage) ✅
- [ ] `getWorkspaceRelativePath()` - Test relative path calculation (needs workspace mock)
- [ ] `tempFilePath()` - Test temp file creation with auto-cleanup (needs context mock)
- [x] `createDirectory()` - Test directory creation (84% coverage) ✅
- [x] `removeDirectory()` - Test directory removal (84% coverage) ✅
- [x] `removeFile()` - Test file removal (84% coverage) ✅
- [x] `isDirectory()` - Test directory check (84% coverage) ✅
- [x] `getFileSize()` - Test file size retrieval (84% coverage) ✅
- [x] `copyFile()` - Test file copying (84% coverage) ✅

**Test Scenarios:**
- ✅ Non-existent files
- ✅ Permission errors
- ✅ Invalid JSON
- ✅ Max results limiting
- ✅ Parallel recursive search
- Symbol.asyncDispose cleanup (requires context mock)
- ✅ Overwrite control

---

#### Config (`src/shared/utils/config.ts`)

- [x] `getWorkspaceConfig()` - Test config retrieval (100% coverage) ✅
- [x] `isWorkspaceConfigIsDefined()` - Test config existence (100% coverage) ✅
- [x] `updateWorkspaceConfig()` - Test config update (100% coverage) ✅

**Test Scenarios:**
- ✅ Undefined config keys
- ✅ Type safety
- ✅ Workspace vs global config

---

#### Destination Utils (`src/shared/utils/destination-utils.ts`)

- [x] `getMacOSArchitecture()` - Test architecture detection (100% coverage) ✅
- [x] `splitSupportedDestinatinos()` - Test platform filtering (100% coverage) ✅

**Test Scenarios:**
- ✅ arm64 vs x86_64
- ✅ Undefined supported platforms (all supported)
- ✅ Mixed supported/unsupported

---

#### Quick Pick (`src/shared/utils/quick-pick.ts`)

Testing done via integration tests - mock vscode.window.showQuickPick

---

#### Timer (`src/shared/utils/timer.ts`)

- [x] `elapsed` - Test elapsed time calculation (100% coverage) ✅
- [x] `constructor` - Test timer initialization (100% coverage) ✅

---

#### Helpers (`src/shared/utils/helpers.ts`)

- [x] `uniqueFilter()` - Test array deduplication (100% coverage) ✅
- [x] `prepareEnvVars()` - Test environment variable preparation (100% coverage) ✅

**Test Scenarios:**
- ✅ Null value filtering
- ✅ Environment variable transformation

---

### Logger

#### Logger (`src/shared/logger/logger.ts`)

- [x] `debug()` - Test debug logging (98% coverage) ✅
- [x] `log()` - Test info logging (98% coverage) ✅
- [x] `warn()` - Test warning logging (98% coverage) ✅
- [x] `error()` - Test error logging with stack traces (98% coverage) ✅
- [x] `show()` - Test output channel display (98% coverage) ✅
- [x] `last()` - Test last N messages retrieval (98% coverage) ✅
- [x] `lastFormatted()` - Test formatted message retrieval (98% coverage) ✅
- [x] `format()` - Test YAML-like formatting (98% coverage) ✅
- [x] `formatValue()` - Test value formatting (98% coverage) ✅
- [x] `setLevel()` - Test log level configuration (98% coverage) ✅
- [x] `setup()` - Test workspace config integration (98% coverage) ✅

**Test Scenarios:**
- ✅ Log level filtering
- ✅ Message buffer limit
- ✅ Stack trace formatting
- ✅ Context object formatting
- ✅ ExtensionError context extraction

---

### Errors

#### Errors (`src/shared/errors/errors.ts`)

- [x] `ExtensionError` - Test custom error with actions (100% coverage) ✅
- [x] `TaskError` - Test task-specific errors (100% coverage) ✅
- [x] `ExecBaseError` - Test exec errors (100% coverage) ✅
- [x] `ExecError` - Test command execution errors (100% coverage) ✅

**Test Scenarios:**
- ✅ Error with actions
- ✅ Error without actions
- ✅ Error context preservation
- ✅ Error hierarchy validation

---

## Integration Tests

In addition to unit tests, consider these integration test scenarios:

### End-to-End Workflows

- [ ] Complete build workflow (select target → build → success)
- [ ] Complete run workflow (select target → build → launch → app running)
- [ ] Complete debug workflow (select target → build → launch → debugger attached)
- [ ] Complete test workflow (select target → build → test → results)

### Multi-Component Interactions

- [ ] Cache → BuildManager → Tree Provider
- [ ] DestinationsManager → DevicesManager + SimulatorsManager
- [ ] ExtensionContext → Command Registration → Error Handling
- [ ] Progress Manager → Status Bar → User Cancellation

### Error Recovery

- [ ] Network interruption during device install
- [ ] Simulator crash during launch
- [ ] Bazel build failure handling
- [ ] User cancellation at each step

---

## Test Implementation Guidelines

### Clean Code Principles

1. **Single Responsibility**: Each test should verify one behavior
2. **Arrange-Act-Assert**: Clear test structure
3. **Test Naming**: Use descriptive names that explain the scenario
4. **No Logic in Tests**: Tests should be declarative, not procedural
5. **Independent Tests**: Each test should run independently
6. **Fast Tests**: Mock external dependencies (filesystem, network, vscode API)

### Test Organization

```
tests/
├── unit/
│   ├── application/
│   │   ├── services/
│   │   └── use-cases/
│   ├── infrastructure/
│   ├── domain/
│   ├── presentation/
│   └── shared/
├── integration/
│   ├── workflows/
│   └── components/
└── fixtures/
    ├── bazel-query-output.json
    ├── simctl-output.json
    └── devicectl-output.json
```

### Mock Strategy

- **VSCode API**: Mock all vscode.* imports
- **Child Processes**: Mock exec, spawn
- **Filesystem**: Mock fs promises
- **Time**: Mock Date.now(), setTimeout for deterministic tests

### Coverage Goals

- **Unit Tests**: 80%+ code coverage
- **Integration Tests**: Cover all critical user workflows
- **Edge Cases**: Cover error scenarios and edge cases

---

## Priority Order

### Phase 1: Critical Path (High Priority)

1. Bazel build and launch workflows
2. Destination management (simulators, devices)
3. Debug provider and launcher
4. Error handling and recovery

### Phase 2: Core Functionality (Medium Priority)

5. Tree providers and UI components
6. Cache management
7. Progress tracking
8. File utilities

### Phase 3: Supporting Features (Lower Priority)

9. Tools management
10. Screenshot utilities
11. Configuration management
12. Logging

---

## Notes

- ✅ Jest configured as the test framework
- ✅ VSCode API mocked with manual mocks
- ✅ Property-based testing implemented for parsers (bazel-parser, simulator-utils)
- ✅ CI/CD integration via GitHub Actions
- ✅ Pre-commit hooks enforce test passing
- ✅ Coverage tracking with Istanbul (lcov, html reports)

## Current Test Coverage Status

**Overall: 65.22% statements, 60.39% functions, 65.84% lines, 54.83% branches**

### Completed Tests (100% coverage)
- ✅ timer.ts
- ✅ config.ts
- ✅ destination-utils.ts
- ✅ helpers.ts
- ✅ errors.ts
- ✅ error-manager.ts
- ✅ bazel-parser.ts (93.1% branches)
- ✅ logger.ts (98%)
- ✅ files.ts (84%)

### Tests Added
- 10 test suites
- 266 tests passing
- 0 failing

### Next Priority
- exec.ts (15.55%) - High impact
- bazel-utils.ts (17.43%) - High impact
- Application services (BuildManager, DestinationsManager, etc.)

---

*Generated: 2025-10-31*
*Last Updated: 2025-10-31*
*Status: 65.22% coverage achieved, target 60%+ met for statements/functions/lines*

