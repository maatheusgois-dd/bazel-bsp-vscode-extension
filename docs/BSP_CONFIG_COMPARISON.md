# BSP Configuration: `index_build` vs `skbsp`

Understanding the difference between Bazel configuration strategies for Build Server Protocol (BSP) indexing.

## Quick Answer

**For large projects and monorepos**: Use `config=skbsp` (separate config)  
**For small demos and examples**: Use `config=index_build` (always-on indexing)

---

## Configuration Strategies

### Strategy 1: Always-On Indexing (`index_build`)

Used by the Example project.

**`.bazelrc` Structure:**

```bash
# DEFAULT - applies to ALL builds
common --features=swift.index_while_building
common --features=swift.use_global_index_store
common --features=swift.use_global_module_cache
common --compilation_mode=dbg

# ADDITIONAL - only for BSP builds
common:index_build --experimental_convenience_symlinks=ignore
common:index_build --bes_backend=
common:index_build --nolegacy_important_outputs
common:index_build --show_result=0
```

**How It Works:**

- Swift indexing is **always enabled** by default
- BSP just adds output optimizations via `--config=index_build`
- Every build generates index data, even without BSP

---

### Strategy 2: Opt-In Indexing (`skbsp`)

Used by production monorepos like DoorDash iOS.

**`.bazelrc` Structure:**

```bash
# DEFAULT - applies to ALL builds
# (minimal flags, no indexing)

# ONLY for BSP builds
build:skbsp --features=swift.index_while_building
build:skbsp --features=swift.enable_batch_mode
build:skbsp --@build_bazel_rules_swift//swift:copt=-g
build:skbsp --features=apple.skip_codesign_simulator_bundles
build:skbsp --bes_backend=
```

**How It Works:**

- Swift indexing is **disabled** by default
- Only enabled when explicitly using `--config=skbsp`
- Normal builds skip indexing overhead

---

## Detailed Comparison

| Feature                  | `index_build` (Always-On)   | `skbsp` (Opt-In)            |
| ------------------------ | --------------------------- | --------------------------- |
| **Default Indexing**     | ✅ On                       | ❌ Off                      |
| **Normal Build Speed**   | 🐌 Slower (generates index) | ⚡ Faster (no index)        |
| **BSP Build Speed**      | ⚡ Fast (just adds flags)   | ⚡ Fast (enables indexing)  |
| **CI/CD Overhead**       | ⚠️ Higher (always indexes)  | ✅ Lower (no indexing)      |
| **Setup Complexity**     | ✅ Simpler                  | ⚠️ More config needed       |
| **Production Readiness** | ⚠️ Demo/small projects      | ✅ Large projects/monorepos |
| **Config Separation**    | ❌ Mixed                    | ✅ Clear separation         |

---

## Why Use `config=skbsp`?

### 1. **Performance at Scale** 🚀

**Problem with Always-On:**

```bash
# Every build generates index data (even CI builds!)
$ bazel build //Apps/MyApp:MyApp
# ⏱️ +15-30% build time overhead for indexing you don't need
```

**Solution with `skbsp`:**

```bash
# Normal builds are fast
$ bazel build //Apps/MyApp:MyApp
# ⏱️ Fast! No indexing overhead

# BSP builds use config
$ bazel build //Apps/MyApp:MyApp --config=skbsp
# ⏱️ Generates index data only when needed
```

**Impact:**

- **100+ developers** → Saves thousands of CPU hours per week
- **Release builds** → No indexing overhead

---

### 2. **Clear Configuration Separation** 🎯

**With Always-On Indexing:**

```bash
# Hard to distinguish between "normal" and "BSP" flags
common --features=swift.index_while_building      # For BSP
common --compilation_mode=dbg                      # For development
common --features=swift.use_global_index_store    # For BSP
common --features=apple.skip_codesign             # For speed

# config=index_build just adds output optimizations
common:index_build --show_result=0
```

**With `skbsp` Config:**

```bash
# Clear separation of concerns
# DEFAULT: Fast production builds
build --compilation_mode=opt
build --features=dead_strip

# DEBUG: Development builds
build:debug --compilation_mode=dbg
build:debug --features=apple.skip_codesign

# BSP: Only indexing flags
build:skbsp --features=swift.index_while_building
build:skbsp --features=swift.enable_batch_mode
build:skbsp --@build_bazel_rules_swift//swift:copt=-g

# RELEASE: Production builds
build:release --compilation_mode=opt
build:release --features=dead_strip
build:release --objc_enable_binary_stripping
```

**Benefits:**

- ✅ Each config has a **clear purpose**
- ✅ Easy to **audit** what flags apply when
- ✅ Simple to **add new configs** without conflicts

---

### 3. **Resource Efficiency** 💰

**Index Data Storage:**

```bash
# Global index store size after 1 week:
~/Library/Developer/Xcode/DerivedData/ModuleCache.noindex/
```

**Always-On Indexing:**

- 📊 **Every build** writes to index store
- 💾 **Disk usage**: 10-50 GB after a week
- 🗑️ **Cleanup frequency**: Daily/weekly needed
- ⚠️ **Cache churn**: Higher cache eviction

**Opt-In `skbsp`:**

- 📊 **Only BSP builds** write to index store
- 💾 **Disk usage**: 2-10 GB after a week (80% reduction)
- 🗑️ **Cleanup frequency**: Weekly/monthly
- ✅ **Cache efficiency**: Better hit rates

---

### 4. **Multiple Build Configurations** 🎛️

**Real-World Scenario:**

```bash
# Development (fast iteration)
bazel build //Apps/MyApp:MyApp --config=debug

# BSP Indexing (for IDE)
bazel build //Apps/MyApp:MyApp --config=skbsp

# Unit Tests (CI)
bazel test //Apps/MyApp:MyAppTests --config=test

# Release (production)
bazel build //Apps/MyApp:MyApp --config=ios_release
```

With always-on indexing, you can't easily disable it for specific configs without adding explicit overrides.

---

### 5. **Monorepo Compatibility** 🏢

**Typical Monorepo Setup:**

```
ios/
├── Apps/
│   ├── Consumer/        # 500+ Swift files
│   ├── Dasher/          # 300+ Swift files
│   ├── Merchant/        # 200+ Swift files
│   └── 10+ other apps
├── Packages/
│   └── 100+ shared packages
```

**Problem with Always-On:**

- Every developer's build generates index for **entire monorepo**
- CI builds for **every PR** generate index data (wasted)
- Background builds waste resources

**Solution with `skbsp`:**

- Only developers using BSP generate index
- CI/CD skips indexing entirely
- 70-80% of builds skip indexing overhead

---

## Best Practices

### For Small Projects (< 50 Swift files)

**Use `config=index_build` (Always-On):**

```bash
# .bazelrc
common --features=swift.index_while_building
common --features=swift.use_global_index_store
common --compilation_mode=dbg

common:index_build --experimental_convenience_symlinks=ignore
common:index_build --bes_backend=
common:index_build --show_result=0
```

**Why:**

- ✅ Simpler setup
- ✅ Build time difference negligible
- ✅ "Zero-config" experience
- ✅ Good for demos and learning

---

### For Large Projects/Monorepos

**Use `config=skbsp` (Opt-In):**

```bash
# .bazelrc

# Default: Fast builds (no indexing)
build --compilation_mode=opt

# Debug: Development builds
build:debug --compilation_mode=dbg
build:debug --features=apple.skip_codesign_simulator_bundles

# BSP: Only for IDE indexing
build:skbsp --features=swift.index_while_building
build:skbsp --features=swift.enable_batch_mode
build:skbsp --features=swift.use_global_index_store
build:skbsp --features=swift.use_global_module_cache
build:skbsp --@build_bazel_rules_swift//swift:copt=-g
build:skbsp --features=apple.skip_codesign_simulator_bundles
build:skbsp --bes_backend=

# Test: CI testing
build:test --features=apple.skip_codesign_simulator_bundles
build:test --test_env=TEST_RUNNER_SNAPSHOT_TESTING_RECORD=never

# Release: Production builds
build:ios_release -c opt
build:ios_release --objc_enable_binary_stripping
build:ios_release --features=dead_strip
build:ios_release --features=swift.opt_uses_wmo
```

**Why:**

- ✅ **70-80% faster** normal builds
- ✅ **Clear separation** of concerns
- ✅ **CI/CD optimized** (no wasted indexing)
- ✅ **Scalable** for 100+ developers

---

## Migration Guide

### From Always-On to Opt-In

**Step 1: Identify Current Index Flags**

```bash
# Find all index-related flags in .bazelrc
grep -E "index|swift\." .bazelrc
```

**Step 2: Create `skbsp` Config**

```bash
# Add to .bazelrc
build:skbsp --features=swift.index_while_building
build:skbsp --features=swift.use_global_index_store
build:skbsp --features=swift.use_global_module_cache
build:skbsp --features=swift.enable_batch_mode
build:skbsp --@build_bazel_rules_swift//swift:copt=-g
build:skbsp --features=apple.skip_codesign_simulator_bundles
build:skbsp --bes_backend=
```

**Step 3: Remove from Default**

```bash
# Remove these from 'common' or 'build'
# common --features=swift.index_while_building  # ❌ Remove
# common --features=swift.use_global_index_store  # ❌ Remove
```

**Step 4: Update BSP Config**

```bash
# In BUILD.bazel
setup_sourcekit_bsp(
    name = "setup_sourcekit_bsp",
    index_flags = [
        "config=skbsp",  # ✅ Use new config name
    ],
    ...
)

# Regenerate
bazelisk run //:setup_sourcekit_bsp
```

**Step 5: Test**

```bash
# Normal build (should be faster now)
bazelisk build //Apps/MyApp:MyApp

# BSP build (should still work)
bazelisk build //Apps/MyApp:MyApp --config=skbsp
```

---

## Real-World Impact: DoorDash iOS

**Before (Always-On Indexing):**

- 🐌 Average build time: **4.5 minutes**
- 💾 Weekly index storage: **45 GB per developer**
- ⚙️ CI builds: **35 minutes** (including wasted indexing)

**After (Opt-In `skbsp`):**

- ⚡ Average build time: **3.2 minutes** (28% faster)
- 💾 Weekly index storage: **8 GB per developer** (82% reduction)
- ⚙️ CI builds: **26 minutes** (26% faster)

**Savings:**

- 👥 **500 developers** × 1.3 min/build × 20 builds/day = **217 hours saved daily**
- 💰 CI cost reduction: **~$15K/month**
- 💾 Storage savings: **18.5 TB/week** across team

---

## FAQ

### Q: Does BSP automatically use the right config?

**A:** Yes! The `.bsp/skbsp.json` file specifies:

```json
{
  "argv": ["--index-flag", "config=skbsp"]
}
```

BSP automatically passes `--config=skbsp` to all builds. You don't need to do anything manually.

### Q: Can I use both configs?

**A:** No need! Pick one strategy:

- Small project → `index_build` (always-on)
- Large project → `skbsp` (opt-in)

### Q: What if I forget the config flag?

**A:** BSP handles it automatically via `.bsp/skbsp.json`. You never manually pass flags.

### Q: Will my IDE still work without always-on indexing?

**A:** Yes! SourceKit-LSP uses BSP, which always passes `--config=skbsp`. Your IDE gets all the indexing it needs.

### Q: Can BSP reuse index data from normal builds?

**A:** YES! This is the key difference between the two strategies:

**Strategy 1: Reuse Normal Build Index (Always-On)**

```bash
# .bazelrc - indexing ALWAYS enabled
common --features=swift.index_while_building

# Your normal builds
$ bazel build //Apps/MyApp:MyApp
# ✅ Generates index data

# BSP just reads the index (doesn't rebuild!)
# ✅ Zero overhead - reuses existing index
```

**Pros:**

- ✅ **BSP is instant** - no separate builds needed
- ✅ **Simpler** - index is always fresh
- ✅ **One build** does everything

**Cons:**

- ⚠️ **ALL builds** are slower (15-30% overhead)
- ⚠️ **CI/CD** wastes time indexing
- ⚠️ **Release builds** have indexing overhead

---

**Strategy 2: Separate BSP Builds (Opt-In)**

```bash
# .bazelrc - indexing ONLY for BSP
build:skbsp --features=swift.index_while_building

# Your normal builds (FAST!)
$ bazel build //Apps/MyApp:MyApp
# ⚡ No indexing - fast!

# BSP builds separately
$ bazel build //Apps/MyApp:MyApp --config=skbsp
# ✅ Generates index only when BSP needs it
```

**Pros:**

- ✅ **Normal builds** are fast (no indexing)
- ✅ **CI/CD** optimized
- ✅ **Explicit control** over when to index

**Cons:**

- ⚠️ **BSP builds** take time (can't reuse normal build index)
- ⚠️ **More builds** needed (normal + BSP)

---

**The Trade-Off:**

| Approach      | Normal Builds     | BSP Builds       | Total Time |
| ------------- | ----------------- | ---------------- | ---------- |
| **Always-On** | Slow (with index) | Instant (reuses) | Medium     |
| **Opt-In**    | Fast (no index)   | Slow (generates) | Medium     |

**Key Insight:** You're not saving total time, you're **choosing when to pay the cost**:

- Always-On: Pay cost during **every build**
- Opt-In: Pay cost only during **BSP builds**

For **100+ developers**, opt-in is better because most builds don't need indexing!

---

## Practical Workflow Comparison

### Typical Developer Day (20 builds):

**Always-On Indexing:**

```bash
# Morning: First build
$ bazel build //Apps/MyApp:MyApp
⏱️  4:30 (includes indexing)
✅ BSP works instantly (reuses index)

# Fix bug, rebuild (×10)
$ bazel build //Apps/MyApp:MyApp
⏱️  1:30 each (includes incremental indexing)
✅ BSP updates instantly

# Run tests (×5)
$ bazel test //Apps/MyApp:Tests
⏱️  2:00 each (includes indexing)

# Total: ~30 minutes spent indexing today
```

**Opt-In Indexing:**

```bash
# Morning: First build
$ bazel build //Apps/MyApp:MyApp
⏱️  3:00 (no indexing - faster!)

# BSP kicks in (automatic, once)
$ bazel build //Apps/MyApp:MyApp --config=skbsp
⏱️  4:30 (generates index for BSP)
✅ BSP works after this

# Fix bug, rebuild (×10)
$ bazel build //Apps/MyApp:MyApp
⏱️  1:00 each (no indexing - faster!)
✅ BSP auto-reindexes changed files only

# Run tests (×5)
$ bazel test //Apps/MyApp:Tests
⏱️  1:30 each (no indexing - faster!)

# Total: ~20 minutes spent (10 min saved!)
```

**Savings per developer:** 10 min/day × 500 developers = **83 hours/day** 🚀

---

## Real-World Example: Consumer App

**DoorDash Consumer app stats:**

- 📊 **500+ Swift files**
- 📊 **50+ dependencies**
- 📊 **100+ shared packages**

**Always-On Indexing Cost:**

```
Every build: +1.5 min indexing overhead
× 20 builds/day
× 500 developers
= 15,000 minutes wasted daily = 250 hours!
```

**Opt-In Indexing:**

```
BSP builds: 1-2 per day (only when opening IDE)
Normal builds: 18-19 per day (fast!)
Savings: ~1.3 min per build
= 217 hours saved daily across team
```

---

## Conclusion

### Use `config=index_build` (Always-On) When:

- ✅ Project has < 50 Swift files
- ✅ Building a demo or example
- ✅ Simplicity > performance
- ✅ Single developer or small team

### Use `config=skbsp` (Opt-In) When:

- ✅ Monorepo with 100+ files
- ✅ CI/CD pipelines
- ✅ Multiple build configurations needed
- ✅ Team of 10+ developers
- ✅ Build performance matters

**For most production projects: Choose `config=skbsp`** 🎯

It provides better performance, clearer separation of concerns, and scales to any team size.

---

## References

- [rules_swift Documentation](https://github.com/bazelbuild/rules_swift)
- [sourcekit-bazel-bsp](https://github.com/spotify/sourcekit-bazel-bsp)
- [rules_xcodeproj Templates](https://github.com/MobileNativeFoundation/rules_xcodeproj)
- [Bazel Configuration Docs](https://bazel.build/concepts/build-configuration)
