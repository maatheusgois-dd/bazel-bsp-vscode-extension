#!/bin/bash

# SwiftBazel Quick Installer
# Downloads and installs the latest release from GitHub

set -e

echo "🔍 Fetching latest SwiftBazel release..."

# Get the latest release download URL
DOWNLOAD_URL=$(curl -s https://api.github.com/repos/maatheusgois-dd/swiftbazel/releases/latest | grep "browser_download_url.*vsix" | cut -d '"' -f 4)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "❌ Failed to find latest release"
    exit 1
fi

echo "📦 Downloading SwiftBazel..."
curl -L -o /tmp/swiftbazel.vsix "$DOWNLOAD_URL"

echo "🔧 Installing extension..."
code --install-extension /tmp/swiftbazel.vsix

echo "🧹 Cleaning up..."
rm /tmp/swiftbazel.vsix

echo "✅ SwiftBazel installed successfully!"
echo "💡 Restart VS Code and open a Bazel workspace to get started"

