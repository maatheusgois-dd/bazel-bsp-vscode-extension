# BSP Configuration Customization

The extension supports customizable BSP (Build Server Protocol) configuration to accommodate different project formats
and build setups.

## Configuration Options

### `bazelbsp.bsp.setupCommand`

Custom command to generate BSP config. Useful for projects with unique BSP generation scripts.

**Placeholders:**

- `${target}`: Selected Bazel target label (e.g., `//Apps/MyApp:MyApp`)
- `${workspace}`: Workspace root path

**Example:**

```json
{
  "bazelbsp.bsp.setupCommand": "python scripts/generate_bsp.py ${target}"
}
```

### `bazelbsp.bsp.setupRuleName`

Name of the Bazel rule to run for BSP setup.

**Default:** `setup_sourcekit_bsp`

**Example:**

```json
{
  "bazelbsp.bsp.setupRuleName": "setup_my_custom_bsp"
}
```

### `bazelbsp.bsp.configFileName`

Name of the BSP config file to generate in `.bsp/` directory.

**Default:** `skbsp.json`

**Example:**

```json
{
  "bazelbsp.bsp.configFileName": "my-bsp-config.json"
}
```

### `bazelbsp.bsp.configTemplate`

Custom BSP config JSON template. Allows full control over the generated configuration.

**Placeholders:**

- `${target}`: Selected Bazel target label
- `${targetName}`: Target name only (without package path)
- `${workspace}`: Workspace root path

**Default:** `null` (uses built-in sourcekit-bazel-bsp template)

**Example:**

```json
{
  "bazelbsp.bsp.configTemplate": {
    "name": "my-bsp-server",
    "version": "1.0.0",
    "bspVersion": "2.2.0",
    "languages": ["swift"],
    "argv": [".bsp/my-bsp-server", "--target", "${target}", "--workspace", "${workspace}"]
  }
}
```

## Usage Examples

### Example 1: Custom Python Script

For projects that generate BSP config via Python script:

**.vscode/settings.json:**

```json
{
  "bazelbsp.bsp.setupCommand": "python tools/setup_bsp.py --target ${target} --output ${workspace}/.bsp"
}
```

**tools/setup_bsp.py:**

```python
import argparse
import json
import os

parser = argparse.ArgumentParser()
parser.add_argument('--target', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()

config = {
    "name": "custom-bsp",
    "version": "1.0.0",
    "bspVersion": "2.2.0",
    "languages": ["swift"],
    "argv": [".bsp/custom-bsp", "--target", args.target]
}

os.makedirs(args.output, exist_ok=True)
with open(os.path.join(args.output, "config.json"), 'w') as f:
    json.dump(config, f, indent=2)
```

### Example 2: Custom Bazel Rule Name

For projects using a different naming convention:

**.vscode/settings.json:**

```json
{
  "bazelbsp.bsp.setupRuleName": "gen_bsp_config",
  "bazelbsp.bsp.configFileName": "bsp.json"
}
```

**BUILD.bazel:**

```python
load("@rules_swift//swift:swift.bzl", "swift_bsp")

swift_bsp(
    name = "gen_bsp_config",
    targets = [":MyTarget"],
)
```

### Example 3: Custom BSP Server

For projects using a BSP server other than sourcekit-bazel-bsp:

**.vscode/settings.json:**

```json
{
  "bazelbsp.bsp.configFileName": "mybsp.json",
  "bazelbsp.bsp.configTemplate": {
    "name": "my-custom-bsp",
    "version": "2.0.0",
    "bspVersion": "2.2.0",
    "languages": ["swift", "objc"],
    "argv": [".bsp/my-bsp-server", "start", "--target=${target}", "--root=${workspace}", "--index-path=.bsp/index"],
    "customSettings": {
      "enableIndexing": true,
      "indexBatchSize": 20
    }
  }
}
```

### Example 4: Shell Script Setup

For projects using shell scripts for BSP setup:

**.vscode/settings.json:**

```json
{
  "bazelbsp.bsp.setupCommand": "bash scripts/setup-bsp.sh ${target} ${workspace}"
}
```

**scripts/setup-bsp.sh:**

```bash
#!/bin/bash
TARGET=$1
WORKSPACE=$2

echo "Setting up BSP for target: $TARGET"
echo "Workspace: $WORKSPACE"

# Generate config
mkdir -p "$WORKSPACE/.bsp"
cat > "$WORKSPACE/.bsp/skbsp.json" <<EOF
{
  "name": "sourcekit-bazel-bsp",
  "version": "0.2.0",
  "bspVersion": "2.2.0",
  "languages": ["swift"],
  "argv": [
    ".bsp/sourcekit-bazel-bsp",
    "serve",
    "--target",
    "$TARGET"
  ]
}
EOF

echo "✅ BSP config generated"
```

## Migration Guide

### From Hardcoded to Customizable

**Before (hardcoded):** The extension assumed:

- Rule name: `setup_sourcekit_bsp`
- Config file: `skbsp.json`
- Fixed config format

**After (customizable):** You can now customize:

- Any rule name via `bsp.setupRuleName`
- Any config file name via `bsp.configFileName`
- Any config format via `bsp.configTemplate`
- Completely custom generation via `bsp.setupCommand`

### Backward Compatibility

All existing projects continue to work without changes. The extension uses sensible defaults:

- Default rule name: `setup_sourcekit_bsp`
- Default config file: `skbsp.json`
- Default template: sourcekit-bazel-bsp format

## Troubleshooting

### Custom command not running

**Check:**

1. Command exists in PATH or use absolute path
2. Placeholders are correctly replaced
3. Command has execute permissions
4. Check extension logs: `Output > Bazel BSP`

### Config not generated

**Check:**

1. Custom command actually creates `.bsp/<configFileName>`
2. Template placeholders are valid
3. `.bsp/` directory is writable

### BSP not working after generation

**Check:**

1. BSP binary exists in `.bsp/`
2. Config file matches BSP server expectations
3. Swift extension is installed
4. Reload VSCode window after config generation

## Advanced: Project-Specific Templates

You can commit a `.vscode/settings.json` with custom BSP settings to your repository:

```json
{
  "bazelbsp.bsp.setupRuleName": "gen_project_bsp",
  "bazelbsp.bsp.configFileName": "project-bsp.json",
  "bazelbsp.bsp.configTemplate": {
    "name": "project-bsp-server",
    "version": "1.0.0",
    "bspVersion": "2.2.0",
    "languages": ["swift"],
    "argv": [".bsp/project-bsp", "--target=${target}", "--project-root=${workspace}"]
  }
}
```

This ensures all team members use the correct BSP configuration automatically.
