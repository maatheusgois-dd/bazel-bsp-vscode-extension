import * as vscode from "vscode";

/**
 * Manages extension image and icon paths
 */
export class ImageManager {
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  /**
   * Get the Bazel logo icon
   */
  getBazelIcon(): vscode.Uri {
    return vscode.Uri.joinPath(vscode.Uri.file(this.extensionPath), "images", "bazel.png");
  }
}

/**
 * Create an image manager instance
 */
export function createImageManager(extensionPath: string): ImageManager {
  return new ImageManager(extensionPath);
}
