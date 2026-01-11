# Troubleshooting

## Extension Not Activating

**Symptoms**: Bazel BSP icon doesn't appear in Activity Bar

**Solutions**:

1. Check workspace contains Bazel files (`BUILD`, `WORKSPACE`, `MODULE.bazel`)
2. Run `Bazel BSP: Diagnose build setup`
3. Check Output panel (`View > Output`, select "Bazel BSP")
4. Reload VSCode

## No Targets Found

**Symptoms**: Bazel Targets view is empty

**Solutions**:

1. Verify Bazel is installed: `bazel version`
2. Run `bazel query //...` in terminal to check targets manually
3. Check `.bazelignore` isn't excluding your targets
4. Click refresh icon in Bazel Targets view

## Slow Target Discovery / Query Timeout

**Symptoms**: "Discovering Bazel targets" takes too long or times out in large monorepos

**Solutions**:

1. Exclude irrelevant paths using `bazelbsp.bazel.queryExcludePaths`:

```json
{
  "bazelbsp.bazel.queryExcludePaths": ["//Apps/ThirdPartyApp/...", "//Legacy/OldCode/...", "//Tools/Scripts/..."]
}
```

2. Use `.bazelignore` file to permanently exclude directories
3. Run query manually to test: `bazel query '//... except (//Apps/ThirdParty/...)' --output=label_kind`
4. Check Bazel cache is working properly

## Debugging Not Working

**Symptoms**: Debugger doesn't attach or app crashes

**Solutions**:

1. Install CodeLLDB extension (auto-prompted)
2. Verify app builds: Run `Bazel BSP: Bazel Build` first
3. Check destination is available (simulator booted or device connected)
4. Try wait-for-debugger launch configuration
5. Check LLDB logs in Debug Console

## Code Completion Not Working

**Symptoms**: No autocomplete, "missing" imports, red squiggles

**Solutions**:

1. Run `Bazel BSP: Setup BSP Config for Selected Target`
2. Reload VSCode
3. Wait for indexing (check Swift extension output)
4. Run `Bazel BSP: Monitor BSP Logs` to debug
5. Verify `sourcekit-bazel-bsp` is installed (Tools view)
6. Enable `bazelbsp.build.enableIndexingInDebug` and do a debug build

## Slow Build Times

**Solutions**:

1. Use `bazel clean` instead of `bazel clean --expunge`
2. Add `build --disk_cache=~/.bazel-cache` to `.bazelrc`
3. Disable `bazelbsp.build.enableIndexingInDebug` if you don't use BSP
4. Use Remote Build Execution (RBE) if available
5. Check for unnecessary dependencies in BUILD files

## Simulator Issues

**Symptoms**: Simulator won't start or app won't install

**Solutions**:

1. Verify simulator exists: `xcrun simctl list devices`
2. Delete and recreate simulator in Xcode
3. Run `Bazel BSP: Remove simulator cache`
4. Boot simulator manually first: `xcrun simctl boot <UDID>`
5. Check Xcode Command Line Tools: `xcode-select --print-path`
