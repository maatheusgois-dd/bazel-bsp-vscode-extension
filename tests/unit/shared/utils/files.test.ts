import { promises as fs, constants as fsConstants } from "node:fs";
import {
  copyFile,
  createDirectory,
  findFiles,
  findFilesRecursive,
  getFileSize,
  isDirectory,
  isFileExists,
  readFile,
  readJsonFile,
  readTextFile,
  removeDirectory,
  removeFile,
  statFile,
} from "../../../../src/shared/utils/files";

// Mock fs/promises
jest.mock("node:fs", () => ({
  promises: {
    readdir: jest.fn(),
    access: jest.fn(),
    readFile: jest.fn(),
    stat: jest.fn(),
    mkdir: jest.fn(),
    rm: jest.fn(),
    copyFile: jest.fn(),
  },
  constants: {
    F_OK: 0,
    COPYFILE_EXCL: 1,
  },
}));

describe("Files Utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("findFiles", () => {
    it("should find matching files", async () => {
      const mockFiles = [
        { name: "file1.ts", isDirectory: () => false },
        { name: "file2.js", isDirectory: () => false },
        { name: "file3.ts", isDirectory: () => false },
      ] as any;

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);

      const result = await findFiles({
        directory: "/test",
        matcher: (file) => file.name.endsWith(".ts"),
      });

      expect(result).toEqual(["/test/file1.ts", "/test/file3.ts"]);
    });

    it("should respect maxResults limit", async () => {
      const mockFiles = [
        { name: "file1.ts", isDirectory: () => false },
        { name: "file2.ts", isDirectory: () => false },
        { name: "file3.ts", isDirectory: () => false },
      ] as any;

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);

      const result = await findFiles({
        directory: "/test",
        matcher: () => true,
        maxResults: 2,
      });

      expect(result).toHaveLength(2);
    });

    it("should return empty array on error", async () => {
      (fs.readdir as jest.Mock).mockRejectedValue(new Error("Directory not found"));

      const result = await findFiles({
        directory: "/nonexistent",
        matcher: () => true,
      });

      expect(result).toEqual([]);
    });

    it("should return empty array when no files match", async () => {
      const mockFiles = [{ name: "file.js", isDirectory: () => false }] as any;

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);

      const result = await findFiles({
        directory: "/test",
        matcher: (file) => file.name.endsWith(".ts"),
      });

      expect(result).toEqual([]);
    });
  });

  describe("findFilesRecursive", () => {
    it("should find files recursively", async () => {
      const rootFiles = [
        { name: "file1.ts", isDirectory: () => false },
        { name: "subdir", isDirectory: () => true },
      ] as any;

      const subdirFiles = [{ name: "file2.ts", isDirectory: () => false }] as any;

      (fs.readdir as jest.Mock).mockResolvedValueOnce(rootFiles).mockResolvedValueOnce(subdirFiles);

      const result = await findFilesRecursive({
        directory: "/test",
        matcher: (file) => file.name.endsWith(".ts"),
        depth: 1,
      });

      expect(result).toContain("/test/file1.ts");
      expect(result).toContain("/test/subdir/file2.ts");
    });

    it("should respect ignore list for recursion", async () => {
      const mockFiles = [
        { name: "file.ts", isDirectory: () => false },
        { name: "node_modules", isDirectory: () => true },
      ] as any;

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);

      const result = await findFilesRecursive({
        directory: "/test",
        matcher: (file) => file.name.endsWith(".ts"),
        ignore: ["node_modules"],
        depth: 1,
      });

      expect(result).toContain("/test/file.ts");
      expect(fs.readdir).toHaveBeenCalledTimes(1); // node_modules not recursed
    });

    it("should respect depth limit and not recurse when depth is 0", async () => {
      const mockFiles = [
        { name: "file.ts", isDirectory: () => false },
        { name: "subdir", isDirectory: () => true },
      ] as any;

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);

      const result = await findFilesRecursive({
        directory: "/test",
        matcher: (file) => !file.isDirectory(),
        depth: 0,
      });

      expect(result).toContain("/test/file.ts");
      expect(fs.readdir).toHaveBeenCalledTimes(1); // Only root, no recursion into subdirs
    });

    it("should handle maxResults in recursive search", async () => {
      const mockFiles = [
        { name: "file1.ts", isDirectory: () => false },
        { name: "file2.ts", isDirectory: () => false },
        { name: "file3.ts", isDirectory: () => false },
      ] as any;

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);

      const result = await findFilesRecursive({
        directory: "/test",
        matcher: () => true,
        maxResults: 2,
      });

      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe("isFileExists", () => {
    it("should return true when file exists", async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const result = await isFileExists("/test/file.txt");

      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith("/test/file.txt", fsConstants.F_OK);
    });

    it("should return false when file does not exist", async () => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      (fs.access as jest.Mock).mockRejectedValue(error);

      const result = await isFileExists("/test/nonexistent.txt");

      expect(result).toBe(false);
    });

    it("should return false for permission errors", async () => {
      const error: any = new Error("EACCES");
      error.code = "EACCES";
      (fs.access as jest.Mock).mockRejectedValue(error);

      const result = await isFileExists("/test/nopermission.txt");

      expect(result).toBe(false);
    });
  });

  describe("readFile", () => {
    it("should read file as buffer", async () => {
      const mockBuffer = Buffer.from("test content");
      (fs.readFile as jest.Mock).mockResolvedValue(mockBuffer);

      const result = await readFile("/test/file.txt");

      expect(result).toEqual(mockBuffer);
      expect(fs.readFile).toHaveBeenCalledWith("/test/file.txt");
    });

    it("should throw error with context", async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error("Read failed"));

      await expect(readFile("/test/bad.txt")).rejects.toThrow("Failed to read file '/test/bad.txt'");
    });
  });

  describe("statFile", () => {
    it("should return file stats", async () => {
      const mockStats = { size: 1024, isDirectory: () => false } as any;
      (fs.stat as jest.Mock).mockResolvedValue(mockStats);

      const result = await statFile("/test/file.txt");

      expect(result).toEqual(mockStats);
      expect(fs.stat).toHaveBeenCalledWith("/test/file.txt");
    });

    it("should throw error with context", async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error("Stat failed"));

      await expect(statFile("/test/bad.txt")).rejects.toThrow("Failed to stat file '/test/bad.txt'");
    });
  });

  describe("readTextFile", () => {
    it("should read file as text with default encoding", async () => {
      (fs.readFile as jest.Mock).mockResolvedValue("text content");

      const result = await readTextFile("/test/file.txt");

      expect(result).toBe("text content");
      expect(fs.readFile).toHaveBeenCalledWith("/test/file.txt", "utf8");
    });

    it("should read file with custom encoding", async () => {
      (fs.readFile as jest.Mock).mockResolvedValue("ascii content");

      const result = await readTextFile("/test/file.txt", "ascii");

      expect(result).toBe("ascii content");
      expect(fs.readFile).toHaveBeenCalledWith("/test/file.txt", "ascii");
    });

    it("should throw error with context", async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error("Read failed"));

      await expect(readTextFile("/test/bad.txt")).rejects.toThrow("Failed to read text file '/test/bad.txt'");
    });
  });

  describe("readJsonFile", () => {
    it("should read and parse JSON file", async () => {
      const jsonData = { key: "value", count: 42 };
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(jsonData));

      const result = await readJsonFile("/test/data.json");

      expect(result).toEqual(jsonData);
      expect(fs.readFile).toHaveBeenCalledWith("/test/data.json", "utf8");
    });

    it("should throw error for invalid JSON", async () => {
      (fs.readFile as jest.Mock).mockResolvedValue("invalid json {");

      await expect(readJsonFile("/test/bad.json")).rejects.toThrow("Invalid JSON in file '/test/bad.json'");
    });

    it("should throw error with context for read errors", async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error("File not found"));

      await expect(readJsonFile("/test/missing.json")).rejects.toThrow("Failed to read JSON file '/test/missing.json'");
    });

    it("should handle custom encoding", async () => {
      (fs.readFile as jest.Mock).mockResolvedValue('{"test": true}');

      await readJsonFile("/test/data.json", "ascii");

      expect(fs.readFile).toHaveBeenCalledWith("/test/data.json", "ascii");
    });
  });

  describe("createDirectory", () => {
    it("should create directory recursively", async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue("/test/new/dir");

      const result = await createDirectory("/test/new/dir");

      expect(result).toBe("/test/new/dir");
      expect(fs.mkdir).toHaveBeenCalledWith("/test/new/dir", { recursive: true });
    });

    it("should return undefined when directory already exists", async () => {
      const error: any = new Error("EEXIST");
      error.code = "EEXIST";
      (fs.mkdir as jest.Mock).mockRejectedValue(error);

      const result = await createDirectory("/test/existing");

      expect(result).toBeUndefined();
    });

    it("should throw error for other errors", async () => {
      const error: any = new Error("Permission denied");
      error.code = "EACCES";
      (fs.mkdir as jest.Mock).mockRejectedValue(error);

      await expect(createDirectory("/test/noperm")).rejects.toThrow("Failed to create directory '/test/noperm'");
    });
  });

  describe("removeDirectory", () => {
    it("should remove directory recursively", async () => {
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      await removeDirectory("/test/dir");

      expect(fs.rm).toHaveBeenCalledWith("/test/dir", {
        recursive: true,
        force: true,
      });
    });

    it("should not throw when directory does not exist", async () => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      (fs.rm as jest.Mock).mockRejectedValue(error);

      await expect(removeDirectory("/test/missing")).resolves.not.toThrow();
    });

    it("should throw for other errors", async () => {
      const error: any = new Error("Permission denied");
      error.code = "EACCES";
      (fs.rm as jest.Mock).mockRejectedValue(error);

      await expect(removeDirectory("/test/noperm")).rejects.toThrow("Failed to remove directory '/test/noperm'");
    });
  });

  describe("removeFile", () => {
    it("should remove file", async () => {
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      await removeFile("/test/file.txt");

      expect(fs.rm).toHaveBeenCalledWith("/test/file.txt");
    });

    it("should not throw when file does not exist", async () => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      (fs.rm as jest.Mock).mockRejectedValue(error);

      await expect(removeFile("/test/missing.txt")).resolves.not.toThrow();
    });

    it("should throw for other errors", async () => {
      const error: any = new Error("Permission denied");
      error.code = "EACCES";
      (fs.rm as jest.Mock).mockRejectedValue(error);

      await expect(removeFile("/test/noperm.txt")).rejects.toThrow("Failed to remove file '/test/noperm.txt'");
    });
  });

  describe("isDirectory", () => {
    it("should return true for directories", async () => {
      const mockStats = { isDirectory: () => true } as any;
      (fs.stat as jest.Mock).mockResolvedValue(mockStats);

      const result = await isDirectory("/test/dir");

      expect(result).toBe(true);
    });

    it("should return false for files", async () => {
      const mockStats = { isDirectory: () => false } as any;
      (fs.stat as jest.Mock).mockResolvedValue(mockStats);

      const result = await isDirectory("/test/file.txt");

      expect(result).toBe(false);
    });

    it("should return false when path does not exist", async () => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      (fs.stat as jest.Mock).mockRejectedValue(error);

      const result = await isDirectory("/test/missing");

      expect(result).toBe(false);
    });

    it("should throw for non-ENOENT errors", async () => {
      const error: any = new Error("Permission denied");
      error.code = "EACCES";
      (fs.stat as jest.Mock).mockRejectedValue(error);

      await expect(isDirectory("/test/noperm")).rejects.toThrow();
    });
  });

  describe("getFileSize", () => {
    it("should return file size in bytes", async () => {
      const mockStats = { size: 2048 } as any;
      (fs.stat as jest.Mock).mockResolvedValue(mockStats);

      const result = await getFileSize("/test/file.txt");

      expect(result).toBe(2048);
    });

    it("should throw error with context", async () => {
      (fs.stat as jest.Mock).mockRejectedValue(new Error("Stat failed"));

      await expect(getFileSize("/test/bad.txt")).rejects.toThrow("Failed to get size of file '/test/bad.txt'");
    });
  });

  describe("copyFile", () => {
    it("should copy file with overwrite by default", async () => {
      (fs.copyFile as jest.Mock).mockResolvedValue(undefined);

      await copyFile("/source.txt", "/dest.txt");

      expect(fs.copyFile).toHaveBeenCalledWith("/source.txt", "/dest.txt", 0);
    });

    it("should copy file without overwrite when specified", async () => {
      (fs.copyFile as jest.Mock).mockResolvedValue(undefined);

      await copyFile("/source.txt", "/dest.txt", false);

      expect(fs.copyFile).toHaveBeenCalledWith("/source.txt", "/dest.txt", fsConstants.COPYFILE_EXCL);
    });

    it("should throw when destination exists and overwrite is false", async () => {
      const error: any = new Error("EEXIST");
      error.code = "EEXIST";
      (fs.copyFile as jest.Mock).mockRejectedValue(error);

      await expect(copyFile("/source.txt", "/dest.txt", false)).rejects.toThrow(
        "Destination file '/dest.txt' already exists and overwrite is disabled",
      );
    });

    it("should throw error with context for other errors", async () => {
      (fs.copyFile as jest.Mock).mockRejectedValue(new Error("Copy failed"));

      await expect(copyFile("/source.txt", "/dest.txt")).rejects.toThrow(
        "Failed to copy file from '/source.txt' to '/dest.txt'",
      );
    });
  });

  describe("integration scenarios", () => {
    it("should handle file workflow: check exists, read, stat, copy", async () => {
      // File exists
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      expect(await isFileExists("/test/file.txt")).toBe(true);

      // Read file
      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from("content"));
      const content = await readFile("/test/file.txt");
      expect(content.toString()).toBe("content");

      // Stat file
      const mockStats = { size: 7, isDirectory: () => false } as any;
      (fs.stat as jest.Mock).mockResolvedValue(mockStats);
      const size = await getFileSize("/test/file.txt");
      expect(size).toBe(7);

      // Copy file
      (fs.copyFile as jest.Mock).mockResolvedValue(undefined);
      await copyFile("/test/file.txt", "/test/copy.txt");
      expect(fs.copyFile).toHaveBeenCalled();
    });

    it("should handle directory workflow: create, check, remove", async () => {
      // Create directory
      (fs.mkdir as jest.Mock).mockResolvedValue("/test/newdir");
      await createDirectory("/test/newdir");
      expect(fs.mkdir).toHaveBeenCalled();

      // Check if directory
      (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => true } as any);
      expect(await isDirectory("/test/newdir")).toBe(true);

      // Remove directory
      (fs.rm as jest.Mock).mockResolvedValue(undefined);
      await removeDirectory("/test/newdir");
      expect(fs.rm).toHaveBeenCalled();
    });

    it("should handle JSON workflow: read, parse, validate", async () => {
      const jsonData = { version: "1.0.0", config: { enabled: true } };
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(jsonData));

      const data = await readJsonFile<typeof jsonData>("/test/config.json");

      expect(data.version).toBe("1.0.0");
      expect(data.config.enabled).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should provide context in all error messages", async () => {
      const testCases = [
        {
          fn: () => readFile("/test"),
          mock: fs.readFile,
          expectedMessage: "Failed to read file '/test'",
        },
        {
          fn: () => statFile("/test"),
          mock: fs.stat,
          expectedMessage: "Failed to stat file '/test'",
        },
        {
          fn: () => readTextFile("/test"),
          mock: fs.readFile,
          expectedMessage: "Failed to read text file '/test'",
        },
        {
          fn: () => getFileSize("/test"),
          mock: fs.stat,
          expectedMessage: "Failed to get size of file '/test'",
        },
      ];

      for (const testCase of testCases) {
        (testCase.mock as jest.Mock).mockRejectedValue(new Error("Mock error"));

        await expect(testCase.fn()).rejects.toThrow(testCase.expectedMessage);

        jest.clearAllMocks();
      }
    });
  });
});
