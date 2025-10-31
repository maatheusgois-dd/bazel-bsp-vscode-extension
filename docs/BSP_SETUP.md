# Build Server Protocol (BSP) Setup Guide

Complete guide to setting up sourcekit-bazel-bsp for Swift/iOS development in VSCode/Cursor.

## What is BSP?

Build Server Protocol integration provides:

- ✅ Code completion for Swift/Objective-C
- ✅ Jump to definition
- ✅ Error annotations in real-time
- ✅ Symbol search
- ✅ Automatic indexing on file changes

## Prerequisites

- ✅ Xcode 16.4+ (Swift 6.1+ toolchain)
- ✅ Bazel project with iOS targets
- ✅ Swift extension for VSCode (`sswg.swift-lang`)
- ✅ LLDB DAP extension (`llvm-vs-code-extensions.lldb-dap`)

## Option 1: Bzlmod Integration (Recommended) ⚙️

This method integrates BSP configuration directly with Bazel for automatic updates.

### Step 1: Add Dependency to MODULE.bazel

Add this to your `MODULE.bazel` file in the workspace root:

```python
bazel_dep(
    name = "sourcekit_bazel_bsp",
    version = "0.2.0",
    repo_name = "sourcekit_bazel_bsp"
)
```

### Step 2: Create BSP Test Targets

For **each library** you want BSP support for, add a `*_build_test` target in its `BUILD.bazel`:

```python
load("@build_bazel_rules_apple//apple:ios.bzl", "ios_build_test")

# Your existing library
swift_library(
    name = "MyLibrary",
    srcs = glob(["Sources/**/*.swift"]),
    # ... other configs
)

# BSP test target - required for indexing
ios_build_test(
    name = "MyLibrary_ios_skbsp",
    targets = [":MyLibrary"],
    minimum_os_version = "17.0",
)
```

**Naming convention:** `(library_name)_(platform)_skbsp`

- iOS: `MyLibrary_ios_skbsp`
- macOS: `MyLibrary_macos_skbsp`
- tvOS: `MyLibrary_tvos_skbsp`
- watchOS: `MyLibrary_watchos_skbsp`

### Step 3: Define Setup Rule

Create or edit `BUILD.bazel` in your **workspace root**:

```python
load("@sourcekit_bazel_bsp//rules:setup_sourcekit_bsp.bzl", "setup_sourcekit_bsp")

setup_sourcekit_bsp(
    name = "setup_sourcekit_bsp",
    # Main target to index (usually your app)
    targets = [
        "//Apps/MyApp:MyApp_ios_skbsp",
    ],
    # Additional settings
    build_test_suffix = "_(PLAT)_skbsp",
    build_test_platform_placeholder = "(PLAT)",
)
```

### Step 4: Generate BSP Configuration

Run from workspace root:

```bash
bazel run //:setup_sourcekit_bsp
```

This generates:

- `.bsp/skbsp.json` - BSP configuration
- `.bsp/sourcekit-bazel-bsp` - Binary (downloaded if needed)
- `.bsp/bazel-wrapper.sh` - Bazel wrapper script

### Step 5: Enable Background Indexing

**Option A: Using SwiftBazel Extension**

```
1. Cmd+Shift+P
2. Type: SwiftBazel: Setup Swift Extension for BSP
3. Click "Reload Window"
```

**Option B: Manual**

1. Open workspace settings: `Cmd+,` → Workspace tab
2. Search: `swift.sourcekit-lsp.backgroundIndexing`
3. Set to: `on`

### Step 6: Reload VSCode

```
Cmd+Shift+P → Developer: Reload Window
```

### Step 7: Verify BSP is Working

After reload, open any Swift file and check:

1. **Output Panel** (`Cmd+Shift+U`):

   - Select "SourceKit Language Server"
   - Should show initialization messages

2. **Status Bar** (bottom):

   - Should show "SourceKit-LSP: Indexing" (may take a few minutes)

3. **Test Code Completion**:
   - Type in a Swift file
   - Should see autocomplete suggestions

## Option 2: Manual Integration (Alternative)

Use SwiftBazel commands instead of Bazel rules.

### Step 1: Create BSP Test Targets

Same as Bzlmod - add `*_ios_skbsp` targets to your BUILD.bazel files.

### Step 2: Generate Config with SwiftBazel

```
1. Select a Bazel target in BAZEL TARGETS view
2. Cmd+Shift+P → SwiftBazel: Setup BSP Config for Selected Target
3. Downloads binary if needed
4. Generates .bsp/skbsp.json and wrapper script
```

### Step 3: Enable Background Indexing

```
Cmd+Shift+P → SwiftBazel: Setup Swift Extension for BSP
```

### Step 4: Reload Window

```
Cmd+Shift+P → Developer: Reload Window
```

## Troubleshooting

### BSP Not Indexing?

**Check Status:**

```
Cmd+Shift+P → SwiftBazel: Show Swift Configuration Status
```

**View Logs:**

```bash
# Terminal
log stream --process sourcekit-bazel-bsp --debug
```

**Common Issues:**

1. **Background indexing disabled**

   - Run: `SwiftBazel: Setup Swift Extension for BSP`
   - Ensure setting is at **Workspace level**, not User

2. **Missing BSP test targets**

   - Add `*_ios_skbsp` targets to BUILD.bazel
   - Re-run setup command

3. **Wrong target in config**

   - Edit `.bsp/skbsp.json`
   - Update `--target` to point to correct `*_skbsp` target

4. **Binary not found**
   - Download from: https://github.com/spotify/sourcekit-bazel-bsp/releases
   - Place at: `.bsp/sourcekit-bazel-bsp`
   - Make executable: `chmod +x .bsp/sourcekit-bazel-bsp`

### Verify Files Exist

```bash
ls -la .bsp/
# Should show:
# - skbsp.json
# - sourcekit-bazel-bsp (executable)
# - bazel-wrapper.sh (executable)

cat .vscode/settings.json
# Should show:
# {
#   "swift.sourcekit-lsp.backgroundIndexing": "on"
# }
```

### Indexing Performance

BSP indexing can be **slow on first run** (10-30 minutes for large projects):

- ✅ Normal - SourceKit-LSP is building index
- ✅ Check bottom status bar for progress
- ✅ Wait for "SourceKit-LSP: Indexing" to complete

## Updating Configuration

### When You Add New Libraries:

**Bzlmod:**

```bash
# Add new *_skbsp target to BUILD.bazel
# Then re-generate:
bazel run //:setup_sourcekit_bsp
```

**Manual:**

```
1. Select the new target
2. SwiftBazel: Setup BSP Config for Selected Target
3. Reload window
```

### When You Switch Main Target:

**Bzlmod:** Update `targets` in `setup_sourcekit_bsp` rule, re-run

**Manual:** Just run setup command with new target selected

## Complete Example

### Directory Structure:

```
ios/
├── .bsp/
│   ├── skbsp.json                 # BSP configuration
│   ├── sourcekit-bazel-bsp        # Binary
│   └── bazel-wrapper.sh           # Wrapper script
├── .vscode/
│   └── settings.json              # Swift settings
├── Apps/
│   └── MyApp/
│       └── BUILD.bazel            # Contains MyApp_ios_skbsp
├── Packages/
│   └── MyLib/
│       └── BUILD.bazel            # Contains MyLib_ios_skbsp
├── MODULE.bazel                   # With sourcekit_bazel_bsp dep
└── BUILD.bazel                    # Root with setup_sourcekit_bsp
```

### BUILD.bazel Example:

```python
# Apps/MyApp/BUILD.bazel

load("@build_bazel_rules_apple//apple:ios.bzl", "ios_application", "ios_build_test")

ios_application(
    name = "MyApp",
    bundle_id = "com.example.MyApp",
    families = ["iphone", "ipad"],
    infoplists = ["Info.plist"],
    minimum_os_version = "17.0",
    deps = [
        "//Packages/MyLib",
    ],
)

# BSP test target for indexing
ios_build_test(
    name = "MyApp_ios_skbsp",
    targets = [":MyApp"],
    minimum_os_version = "17.0",
)
```

## References

- [sourcekit-bazel-bsp GitHub](https://github.com/spotify/sourcekit-bazel-bsp)
- [BSP Specification](https://build-server-protocol.github.io/)
- [SourceKit-LSP Documentation](https://github.com/apple/sourcekit-lsp)

## Need Help?

- Open an issue: https://github.com/spotify/sourcekit-bazel-bsp/issues
- Swift forums: https://forums.swift.org/c/related-projects/vscode-swift-extension/

---

**Quick Start with SwiftBazel:**

```
1. Cmd+Shift+P → SwiftBazel: Setup Swift Extension for BSP
2. Cmd+Shift+P → SwiftBazel: Show Swift Configuration Status (verify)
3. Open a Swift file and wait for indexing
4. Enjoy code completion! 🎉
```
