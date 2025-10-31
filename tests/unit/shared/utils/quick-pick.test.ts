import * as vscode from "vscode";
import { showQuickPick, showInputBox, QuickPickCancelledError } from "../../../../src/shared/utils/quick-pick";

// Mock vscode
jest.mock("vscode");

describe("Quick Pick Utils", () => {
  let mockQuickPick: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock QuickPick instance
    mockQuickPick = {
      items: [],
      title: "",
      placeholder: "",
      selectedItems: [],
      show: jest.fn(),
      dispose: jest.fn(),
      onDidAccept: jest.fn(),
      onDidHide: jest.fn(),
    };

    (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);
  });

  describe("showQuickPick", () => {
    it("should create and show quick pick with title and items", async () => {
      const items = [
        { label: "Item 1", context: { id: 1 } },
        { label: "Item 2", context: { id: 2 } },
      ];

      // Simulate user selection
      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        mockQuickPick.selectedItems = [items[0]];
        callback();
      });

      const promise = showQuickPick({
        title: "Select Item",
        items,
      });

      await promise;

      expect(vscode.window.createQuickPick).toHaveBeenCalled();
      expect(mockQuickPick.title).toBe("Select Item");
      expect(mockQuickPick.placeholder).toBe("Select Item");
      expect(mockQuickPick.items).toEqual(items);
      expect(mockQuickPick.show).toHaveBeenCalled();
    });

    it("should resolve with selected item", async () => {
      const items = [
        { label: "Option A", context: { value: "a" } },
        { label: "Option B", context: { value: "b" } },
      ];

      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        mockQuickPick.selectedItems = [items[1]];
        callback();
      });

      const result = await showQuickPick({
        title: "Choose",
        items,
      });

      expect(result).toEqual(items[1]);
      expect((result.context as any).value).toBe("b");
    });

    it("should dispose quick pick after selection", async () => {
      const items = [{ label: "Item", context: { id: 1 } }];

      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        mockQuickPick.selectedItems = [items[0]];
        callback();
      });

      await showQuickPick({
        title: "Select",
        items,
      });

      expect(mockQuickPick.dispose).toHaveBeenCalled();
    });

    it("should reject when separator is selected", async () => {
      const items = [{ label: "Header", kind: vscode.QuickPickItemKind.Separator }] as any;

      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        mockQuickPick.selectedItems = [items[0]];
        callback();
      });

      await expect(
        showQuickPick({
          title: "Select",
          items,
        }),
      ).rejects.toThrow("No item selected");

      expect(mockQuickPick.dispose).toHaveBeenCalled();
    });

    it("should reject when no item selected", async () => {
      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        mockQuickPick.selectedItems = [];
        callback();
      });

      await expect(
        showQuickPick({
          title: "Select",
          items: [{ label: "Item", context: { id: 1 } }],
        }),
      ).rejects.toThrow("No item selected");
    });

    it("should throw QuickPickCancelledError when user cancels", async () => {
      const items = [{ label: "Item", context: { id: 1 } }];

      mockQuickPick.onDidHide.mockImplementation((callback: any) => {
        // User cancelled (pressed Escape)
        callback();
      });

      const promise = showQuickPick({
        title: "Select",
        items,
      });

      await expect(promise).rejects.toThrow(QuickPickCancelledError);
      expect(mockQuickPick.dispose).toHaveBeenCalled();
    });

    it("should not throw QuickPickCancelledError if already accepted", async () => {
      const items = [{ label: "Item", context: { id: 1 } }];
      let acceptCallback: any;
      let hideCallback: any;

      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        acceptCallback = callback;
      });

      mockQuickPick.onDidHide.mockImplementation((callback: any) => {
        hideCallback = callback;
      });

      const promise = showQuickPick({
        title: "Select",
        items,
      });

      // Simulate user accepting first
      mockQuickPick.selectedItems = [items[0]];
      acceptCallback();

      // Then hiding (should not reject)
      hideCallback();

      await expect(promise).resolves.toEqual(items[0]);
    });

    it("should handle items with different context types", async () => {
      const stringItem = { label: "String", context: "string-value" };
      const objectItem = { label: "Object", context: { key: "value" } };
      const numberItem = { label: "Number", context: 42 };

      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        mockQuickPick.selectedItems = [objectItem];
        callback();
      });

      const result = await showQuickPick({
        title: "Mixed Types",
        items: [stringItem, objectItem, numberItem] as any,
      });

      expect(result.context as any).toEqual({ key: "value" });
    });

    it("should handle items with separators mixed in", async () => {
      const items = [
        { label: "Section 1", kind: vscode.QuickPickItemKind.Separator },
        { label: "Item 1", context: { id: 1 } },
        { label: "Section 2", kind: vscode.QuickPickItemKind.Separator },
        { label: "Item 2", context: { id: 2 } },
      ] as any;

      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        mockQuickPick.selectedItems = [items[1]]; // Select Item 1
        callback();
      });

      const result = await showQuickPick({
        title: "Grouped Items",
        items,
      });

      expect((result.context as any).id).toBe(1);
    });
  });

  describe("showInputBox", () => {
    it("should show input box with title", async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue("user input");

      const result = await showInputBox({
        title: "Enter Value",
      });

      expect(vscode.window.showInputBox).toHaveBeenCalledWith({
        title: "Enter Value",
        value: undefined,
      });
      expect(result).toBe("user input");
    });

    it("should show input box with initial value", async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue("modified value");

      const result = await showInputBox({
        title: "Edit Value",
        value: "initial value",
      });

      expect(vscode.window.showInputBox).toHaveBeenCalledWith({
        title: "Edit Value",
        value: "initial value",
      });
      expect(result).toBe("modified value");
    });

    it("should return undefined when user cancels", async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      const result = await showInputBox({
        title: "Optional Input",
      });

      expect(result).toBeUndefined();
    });

    it("should handle empty string input", async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue("");

      const result = await showInputBox({
        title: "Enter Text",
      });

      expect(result).toBe("");
    });
  });

  describe("QuickPickCancelledError", () => {
    it("should be instanceof Error", () => {
      const error = new QuickPickCancelledError();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(QuickPickCancelledError);
    });

    it("should be catchable as Error", () => {
      try {
        throw new QuickPickCancelledError();
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(QuickPickCancelledError);
      }
    });

    it("should differentiate from regular errors", () => {
      const quickPickError = new QuickPickCancelledError();
      const regularError = new Error("Regular");

      expect(quickPickError).toBeInstanceOf(QuickPickCancelledError);
      expect(regularError).not.toBeInstanceOf(QuickPickCancelledError);
    });
  });

  describe("integration scenarios", () => {
    it("should handle destination selection workflow", async () => {
      const destinations = [
        { label: "iPhone 15 Pro", iconPath: new vscode.ThemeIcon("device-mobile"), context: { id: "sim1" } },
        { label: "iPad Pro", iconPath: new vscode.ThemeIcon("device-tablet"), context: { id: "sim2" } },
      ];

      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        mockQuickPick.selectedItems = [destinations[0]];
        callback();
      });

      const result = await showQuickPick({
        title: "Select Destination",
        items: destinations as any,
      });

      expect((result.context as any).id).toBe("sim1");
    });

    it("should handle build mode selection with separators", async () => {
      const items = [
        { label: "Recommended", kind: vscode.QuickPickItemKind.Separator },
        { label: "Release", context: { mode: "release" } },
        { label: "Other Options", kind: vscode.QuickPickItemKind.Separator },
        { label: "Debug", context: { mode: "debug" } },
      ] as any;

      mockQuickPick.onDidAccept.mockImplementation((callback: any) => {
        mockQuickPick.selectedItems = [items[3]]; // Select Debug
        callback();
      });

      const result = await showQuickPick({
        title: "Build Mode",
        items,
      });

      expect((result.context as any).mode).toBe("debug");
    });

    it("should handle user cancellation gracefully", async () => {
      mockQuickPick.onDidHide.mockImplementation((callback: any) => {
        callback();
      });

      const promise = showQuickPick({
        title: "Select",
        items: [{ label: "Item", context: {} }],
      });

      try {
        await promise;
        fail("Should have thrown QuickPickCancelledError");
      } catch (e) {
        expect(e).toBeInstanceOf(QuickPickCancelledError);
      }
    });
  });
});
