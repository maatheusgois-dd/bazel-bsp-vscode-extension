# TODO

## High Priority (from feedback)

### Swift Extension Installation
- [ ] Fix installing both deprecated and new Swift extension simultaneously
- [ ] Only install the correct/latest Swift extension

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
- [ ] Consider renaming (extension handles more than just Swift)
- [ ] Update branding/description to reflect broader scope

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
