import * as fs from "node:fs";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as vscode from "vscode";
import { z } from "zod";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../logger/logger.js";

export type BazelCleanToolExtra = {
  extensionContext: ExtensionContext;
};

export const bazelCleanSchema = z.object({
  expunge: z
    .boolean()
    .optional()
    .describe(
      "If true, run 'bazel clean --expunge' to remove all caches. If false or omitted, run regular 'bazel clean' which keeps analysis cache.",
    ),
});

export type BazelCleanArgs = z.infer<typeof bazelCleanSchema>;

export async function bazelCleanImplementation(
  args: BazelCleanArgs,
  extra: BazelCleanToolExtra,
  _frameworkExtra: RequestHandlerExtra<any, any>,
): Promise<CallToolResult> {
  const { extensionContext } = extra;
  const timeoutSeconds = 300; // 5 minutes for clean operations

  let eventListener: vscode.Disposable | undefined;
  const waitForCompletionPromise = new Promise<"completed">((resolve) => {
    eventListener = extensionContext.simpleTaskCompletionEmitter.event(() => {
      commonLogger.log("🎯 MCP: Received completion event for bazel_clean");
      resolve("completed");
    });
  });

  commonLogger.log(`🚀 MCP: Starting bazel_clean with expunge=${args.expunge}`);

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), timeoutSeconds * 1000);
  });

  try {
    vscode.commands.executeCommand("bazelbsp.bazel.clean", args.expunge).then(
      () => {},
      (initError) => commonLogger.error("Error returned from bazel clean command", { initError }),
    );
  } catch (execError: any) {
    commonLogger.error("Error initiating bazel clean", { execError });
    eventListener?.dispose();
    return {
      content: [{ type: "text", text: `Error initiating bazel clean: ${execError.message}` }],
      isError: true,
    };
  }

  const raceResult = await Promise.race([waitForCompletionPromise, timeoutPromise]);
  eventListener?.dispose();

  if (raceResult === "timeout") {
    return {
      content: [
        {
          type: "text",
          text: `TIMEOUT after ${timeoutSeconds}s waiting for bazel clean to complete.`,
        },
      ],
      isError: true,
    };
  }

  // Read the actual command output from the UI log file
  try {
    const logPath = extensionContext.UI_LOG_PATH();
    const logContent = fs.readFileSync(logPath, "utf-8").trim();

    if (logContent.length > 0) {
      const hasSuccess =
        logContent.includes("✅") ||
        logContent.toLowerCase().includes("cleaned successfully") ||
        logContent.includes("🎉");

      const hasError =
        !hasSuccess &&
        (logContent.toLowerCase().includes("error:") ||
          logContent.includes("❌") ||
          logContent.toLowerCase().includes("failed"));

      return {
        content: [
          {
            type: "text",
            text: hasError
              ? `Bazel clean encountered an error:\n\n${logContent}`
              : `Bazel clean completed successfully.\n\nOutput:\n${logContent}`,
          },
        ],
        isError: hasError,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: "Bazel clean completed with no output.",
        },
      ],
      isError: false,
    };
  } catch (readError) {
    commonLogger.error("Error reading UI log file for bazel clean", { readError });
    return {
      content: [
        {
          type: "text",
          text: "Bazel clean completed but could not read output log.",
        },
      ],
      isError: true,
    };
  }
}
