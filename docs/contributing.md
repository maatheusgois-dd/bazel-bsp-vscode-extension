# Contributing

## Reporting Issues

Open an issue on GitHub with:

- VSCode version (`Code > About Visual Studio Code`)
- Extension version (from Extensions panel)
- Xcode version: `xcodebuild -version`
- Bazel version: `bazel version`
- Steps to reproduce
- Extension logs (`Output > Bazel BSP`)

## Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm run test:unit`
5. Run linters: `npm run check:all`
6. Commit: `git commit -m 'Add amazing feature'`
7. Push: `git push origin feature/amazing-feature`
8. Open a Pull Request

## Development Guidelines

- Follow existing code structure (Clean Architecture layers)
- Add tests for new features
- Update documentation
- Use TypeScript strict mode
- Keep commits atomic and well-described

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
git clone https://github.com/maatheusgois-dd/bazelbsp.git
cd bazelbsp
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
   - The Bazel BSP icon appears in the Activity Bar
   - Set breakpoints in your TypeScript code (original VSCode window)
   - Interact with the extension (Development Host window) - breakpoints will hit
   - View logs: `Output > Bazel BSP` in the Development Host
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
