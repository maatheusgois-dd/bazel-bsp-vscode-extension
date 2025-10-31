# Debugging Guide for SwiftBazel

## Troubleshooting "Unverified Breakpoint" Issues

### Why Breakpoints Lose Reference

When switching between Bazel targets, breakpoints can become "unverified" because:

1. **Different build outputs** - Each Bazel target builds to a different location (`bazel-bin/Apps/TargetA` vs `bazel-bin/Apps/TargetB`)
2. **LSP indexing mismatch** - SourceKit-LSP needs to re-index for the new target's source files
3. **Debug symbol paths** - LLDB can't match source files to the new binary's debug symbols
4. **Stale LLDB state** - Previous debug sessions may have cached old paths

### Quick Fix (Built-in Command)

Run this command when breakpoints become unverified:

**Command Palette (Cmd+Shift+P):**
```
swiftbazel: Troubleshoot Breakpoints
```

This automatically:
- ✅ Stops any active debug sessions
- ✅ Restarts Swift LSP Server
- ✅ Clears debug caches
- ✅ Refreshes workspace

### Manual Solutions

#### Solution 1: Restart Swift LSP (Fastest)

**Command Palette (Cmd+Shift+P):**
```
Swift: Restart LSP Server
```

This forces SourceKit-LSP to re-index the project with the new target context.

#### Solution 2: Enable sourcekit-bazel-bsp (Recommended for Complex Projects)

For better integration with Bazel projects, use [sourcekit-bazel-bsp](https://github.com/spotify/sourcekit-bazel-bsp):

**1. Add to your `MODULE.bazel`:**
```python
bazel_dep(name = "sourcekit_bazel_bsp", version = "0.2.0", repo_name = "sourcekit_bazel_bsp")
```

**2. Create setup rule in root `BUILD.bazel`:**
```python
load("@sourcekit_bazel_bsp//rules:setup_sourcekit_bsp.bzl", "setup_sourcekit_bsp")

setup_sourcekit_bsp(
    name = "setup_sourcekit_bsp",
    targets = [
        "//Apps/Consumer:ConsumerApp",
        "//Apps/Dasher:DasherApp",
        # Add all your app targets here
    ],
)
```

**3. Run setup:**
```bash
bazel run //:setup_sourcekit_bsp
```

**4. Enable background indexing in VSCode settings (workspace level):**
```json
{
  "swift.backgroundIndexing": true
}
```

**5. Reload window:**
```
Cmd+Shift+P -> Reload Window
```

#### Solution 3: Ensure Debug Symbols Are Generated

Make sure your Bazel builds include debug symbols:

```bash
# Your target should be built with these flags (swiftbazel does this automatically)
--compilation_mode=dbg
--copt=-g
--strip=never
```

SwiftBazel automatically uses these flags when you:
- Select "Debug" build mode
- Run debug command (Cmd+Shift+D)

#### Solution 4: Clean Build After Target Switch

When switching targets, do a clean build:

**Command Palette:**
```
swiftbazel: Clean Bazel Cache
```

Then rebuild your target.

### Prevention: Automatic LSP Restart on Target Switch

SwiftBazel now **automatically restarts the LSP** when you switch targets. This should prevent most breakpoint issues.

When you click a target in the **BAZEL TARGETS** tree, it:
1. ✅ Selects the new target
2. ✅ Restarts Swift LSP (automatic)
3. ✅ Shows progress: "Restarting Swift LSP for new target"

### Advanced: Configure LSP for Bazel

**Add to workspace settings** (`.vscode/settings.json`):

```json
{
  "swift.backgroundIndexing": true,
  "swift.buildPath": "${workspaceFolder}/bazel-bin",
  "swift.path": "/usr/bin/swift",
  "swift.sourcekit-lsp.serverArguments": [
    "--log-level",
    "debug"
  ]
}
```

### Debug Console Output

Check the debug console for errors:

**View → Output → Select:**
- `SourceKit Language Server` - LSP issues
- `swiftbazel: Common` - Extension logs
- `Swift` - Swift extension logs

### Known Limitations

1. **sourcekit-bazel-bsp required for complex projects** - Multi-target projects with shared dependencies need proper BSP integration
2. **Xcode still required** - Need Xcode installed for platform toolchains (iOS SDKs, simulators, etc.)
3. **Binary target only** - Can only debug `ios_application` targets, not libraries

### Still Having Issues?

Try this workflow:

1. **Stop all debugging** (Cmd+Shift+F5)
2. **Clean Bazel cache** (`swiftbazel: Clean Bazel Cache`)
3. **Troubleshoot breakpoints** (`swiftbazel: Troubleshoot Breakpoints`)
4. **Select target again** (Click in BAZEL TARGETS tree)
5. **Set breakpoints**
6. **Start debugging** (F5)

### Resources

- [sourcekit-bazel-bsp](https://github.com/spotify/sourcekit-bazel-bsp) - BSP integration for Bazel
- [Swift VSCode Extension](https://marketplace.visualstudio.com/items?itemName=sswg.swift-lang) - Official Swift extension
- [LLDB Documentation](https://lldb.llvm.org/) - LLDB debugger docs

---

**Need more help?** Open an issue with:
- Target name you're debugging
- Output from "SourceKit Language Server" panel
- Steps to reproduce the breakpoint issue

