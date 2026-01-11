# TODO

## High Priority (from feedback)

### Swift Extension Installation
- [x] Fixed: Replaced deprecated `sswg.swift-lang` with official `swiftlang.swift-vscode`
- [x] Extension now only installs the correct/latest Swift extension
- [x] Added comprehensive package validation tests
- [x] PR #7: https://github.com/maatheusgois-dd/bazel-bsp-vscode-extension/pull/7

### BSP Generation
- [ ] Make BSP config generation customizable/configurable
- [ ] Support different project formats and abstractions
- [ ] Don't assume specific BSP config format

### Target Discovery
- [ ] Replace `bazel query` with BSP graph report JSON parsing
- [ ] Use graph report to determine parent-child relationships
- [ ] Map targets to appropriate simulators based on parent info
- [ ] Requires latest BSP release with graph report JSON support

### Build Commands
- [ ] Fix build commands for top-level targets (reference Example project)
- [ ] Make build commands customizable/project-specific
- [ ] Support different build abstractions per project
- [ ] Document correct build patterns

### Project Naming/Scope
- [x] Renamed to bazel-bsp-vscode-extension
- [x] Updated branding/description to reflect broader scope
- [x] Changed all commands/configs from swiftbazel to bazelbsp
- [x] Updated display name to "Bazel BSP"

## Current Issues

- [ ] App logging doesn't work when debugger is attached
- [ ] Improve BSP + Swift indexing performance
- [ ] Index reuse during debug builds not fully working

## Future Improvements

- [ ] Better error messages for configuration issues
- [ ] More comprehensive diagnostics
- [ ] Support for custom Bazel commands/flags per target
- [ ] Better monorepo support
- [ ] Performance optimization for large workspaces
