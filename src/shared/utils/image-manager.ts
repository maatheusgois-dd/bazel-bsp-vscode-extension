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

  /**
   * Get the Xcode project icon
   */
  getXcodeprojIcon(): vscode.Uri {
    return vscode.Uri.joinPath(vscode.Uri.file(this.extensionPath), "images", "xcodeproj.png");
  }

  /**
   * Get the Xcode workspace icon
   */
  getXcworkspaceIcon(): vscode.Uri {
    return vscode.Uri.joinPath(vscode.Uri.file(this.extensionPath), "images", "xcworkspace.png");
  }

  /**
   * Get the logo panel image
   */
  getLogoPanelIcon(): vscode.Uri {
    return vscode.Uri.joinPath(vscode.Uri.file(this.extensionPath), "images", "logo-panel.png");
  }

  /**
   * Get the main logo image
   */
  getLogoIcon(): vscode.Uri {
    return vscode.Uri.joinPath(vscode.Uri.file(this.extensionPath), "images", "logo.png");
  }

  /**
   * Get SVG logo
   */
  getLogoSvg(): vscode.Uri {
    return vscode.Uri.joinPath(vscode.Uri.file(this.extensionPath), "images", "logo.svg");
  }
}

/**
 * Create an image manager instance
 */
export function createImageManager(extensionPath: string): ImageManager {
  return new ImageManager(extensionPath);
}
