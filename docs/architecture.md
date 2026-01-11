# Architecture

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

## Key Components

- **ExtensionContext**: Central dependency injection container
- **BuildManager**: Manages Bazel targets, builds, and state
- **DestinationsManager**: Handles simulators and devices
- **BazelCLIAdapter**: Wrapper around Bazel command-line
- **DebugProvider**: Integrates with VSCode debugger API
- **McpServer**: Exposes extension capabilities to AI assistants

## Project Structure

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
