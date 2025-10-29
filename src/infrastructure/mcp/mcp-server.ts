import * as fs from "node:fs";
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import express, { type Express, type Request, type Response } from "express";
import * as vscode from "vscode";
import { type ZodRawShape, z } from "zod";
import type { ExtensionContext } from "../../infrastructure/vscode/extension-context.js";
import { commonLogger } from "../../shared/logger/logger.js";
// executeCommand import removed - now using individual command tools
import {
  type TakeScreenshotArgs,
  takeScreenshotImplementation,
  takeScreenshotSchema,
} from "../../shared/utils/screenshot-tool.js";
import { setupMetrics } from "./metrics";
import type { McpServerInstance, McpServerOptions, McpToolDefinition } from "./types.js";

const SSE_ENDPOINT = "/sse";
const MESSAGES_ENDPOINT = "/messages";
const METRICS_ENDPOINT = "/metrics";

// Helper function to create simple command tools
const createCommandTool = (
  commandId: string,
  toolName: string,
  description: string,
  extensionContext: ExtensionContext,
) => {
  const schema = z.object({}).describe(`${description}`);

  const implementation = async (
    _args: any,
    _frameworkExtra: RequestHandlerExtra<any, any>,
  ): Promise<CallToolResult> => {
    const timeoutSeconds = 600;

    let eventListener: vscode.Disposable | undefined;
    const waitForCompletionPromise = new Promise<"completed">((resolve) => {
      eventListener = extensionContext.simpleTaskCompletionEmitter.event(() => {
        commonLogger.log("🎯 MCP: Received completion event");
        resolve("completed");
      });
    });
    
    commonLogger.log(`🚀 MCP: Starting command ${commandId}, waiting for completion...`);

    const timeoutPromise = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), timeoutSeconds * 1000);
    });

    try {
      vscode.commands.executeCommand(commandId).then(
        () => {},
        (initError) => commonLogger.error(`Error returned from executeCommand ${commandId}`, { initError }),
      );
    } catch (execError: any) {
      commonLogger.error(`Error initiating command ${commandId}`, { execError });
      eventListener?.dispose();
      return {
        content: [{ type: "text", text: `Error initiating ${commandId}: ${execError.message}` }],
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
            text: `TIMEOUT after ${timeoutSeconds}s waiting for command ${commandId} to signal completion.`,
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
        // Check the final status - look for success markers
        const hasSuccess = logContent.includes('✅') || 
                          logContent.toLowerCase().includes('completed successfully') ||
                          logContent.toLowerCase().includes('launched successfully') ||
                          logContent.includes('🎉');
        
        // Only flag as error if no success markers found AND has error indicators
        const hasError = !hasSuccess && (
          logContent.toLowerCase().includes('error:') || 
          logContent.includes('❌') ||
          logContent.toLowerCase().includes('failed')
        );
        
        return {
          content: [
            {
              type: "text",
              text: hasError 
                ? `Command ${commandId} encountered an error:\n\n${logContent}`
                : `Command ${commandId} completed successfully.\n\nOutput:\n${logContent}`,
            },
          ],
          isError: hasError,
        };
      }
      
      // No log content - command completed with no output
      return {
        content: [
          {
            type: "text",
            text: `Command ${commandId} completed with no output.`,
          },
        ],
        isError: false,
      };
    } catch (readError) {
      commonLogger.error(`Error reading UI log file for ${commandId}`, { readError });
      return {
        content: [
          {
            type: "text",
            text: `Command ${commandId} completed but could not read output log.`,
          },
        ],
        isError: true,
      };
    }
  };

  return { toolName, schema: schema.shape, implementation };
};

export function createMcpServer(options: McpServerOptions, extensionContext: ExtensionContext): McpServerInstance {
  const app = express();
  const server = new McpServer({
    name: options.name,
    version: options.version,
  });

  const transports: { [sessionId: string]: SSEServerTransport } = {};
  const metricsRegistry = setupMetrics();

  // --- Setup Routes ---
  app.get(SSE_ENDPOINT, async (_: Request, res: Response) => {
    commonLogger.log(`Received GET ${SSE_ENDPOINT}`);
    try {
      // Set up keep-alive to prevent connection timeouts
      const keepAliveIntervalMs = 20000;
      const keepAliveTimer = setInterval(() => {
        try {
          res.write(": keep-alive\n\n");
        } catch (error) {
          commonLogger.error("Error writing keep-alive message", { error });
          clearInterval(keepAliveTimer);
        }
      }, keepAliveIntervalMs);

      const transport = new SSEServerTransport(MESSAGES_ENDPOINT, res);
      transports[transport.sessionId] = transport;
      commonLogger.log(`SSE Connection: sessionId=${transport.sessionId}`);

      res.on("close", () => {
        clearInterval(keepAliveTimer);
        delete transports[transport.sessionId];
      });

      await server.connect(transport);
    } catch (err) {
      commonLogger.error("Error handling SSE connection", { err });
      if (!res.headersSent) res.status(500).send("SSE Connection Error");
    }
  });

  app.post(MESSAGES_ENDPOINT, express.json(), async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;

    const transport = transports[sessionId];
    if (transport) {
      try {
        await transport.handlePostMessage(req, res, req.body);
      } catch (err) {
        commonLogger.error(`Error handling message for ${sessionId}`, { err });
        if (!res.headersSent) res.status(500).send("Error handling message");
      }
    } else {
      commonLogger.warn(`No transport found for sessionId ${sessionId}`);
      res.status(400).send("No transport found for sessionId");
    }
  });

  app.get(METRICS_ENDPOINT, async (_: Request, res: Response) => {
    try {
      res.set("Content-Type", metricsRegistry.contentType);
      const metrics = await metricsRegistry.metrics();
      res.end(metrics);
    } catch (err) {
      commonLogger.error("Error serving metrics", { err });
      res.status(500).send("Error serving metrics");
    }
  });

  // === BAZEL COMMANDS ===

  const bazelTest = createCommandTool(
    "swiftbazel.bazel.testSelected",
    "bazel_test",
    "Run tests for the currently selected Bazel target",
    extensionContext,
  );
  server.tool(
    bazelTest.toolName, 
    "Runs unit tests for the currently selected Bazel test target. Target must be a test type (ios_unit_test or swift_test).",
    bazelTest.schema, 
    bazelTest.implementation
  );
  
  const bazelRun = createCommandTool(
    "swiftbazel.bazel.debug",
    "bazel_run",
    "Build, launch, and attach debugger to the selected Bazel app target",
    extensionContext,
  );
  server.tool(
    bazelRun.toolName, 
    "Builds, launches, and attaches LLDB debugger to the currently selected Bazel target on iOS simulator or device. Allows setting breakpoints and inspecting app state. This is the primary run command.",
    bazelRun.schema, 
    bazelRun.implementation
  );
  
  const bazelBuild = createCommandTool(
    "swiftbazel.bazel.buildSelected",
    "bazel_build",
    "Build the currently selected Bazel target without running",
    extensionContext,
  );
  server.tool(
    bazelBuild.toolName, 
    "Builds the currently selected Bazel target. Compiles code without running the app.",
    bazelBuild.schema, 
    bazelBuild.implementation
  );

  // === SCREENSHOT COMMANDS ===
  server.tool(
    "take_simulator_screenshot",
    "Takes a screenshot of running iOS simulator and returns as image context.",
    takeScreenshotSchema.shape,
    async (args: TakeScreenshotArgs, _frameworkExtra: RequestHandlerExtra<any, any>): Promise<CallToolResult> => {
      return takeScreenshotImplementation(args, { extensionContext: extensionContext });
    },
  );

  const registerTool = <T extends ZodRawShape>(tool: McpToolDefinition<T>): void => {
    server.tool(tool.name, tool.description, tool.schema, tool.implementation);
  };

  return {
    app,
    server,
    registerTool,
    start: async () => {
      const port = options.port || 8000;
      return new Promise<Express>((resolve, reject) => {
        const httpServer = http.createServer(app);
        httpServer.on("error", (err) => {
          commonLogger.error("HTTP server listen error", { err });
          reject(err);
        });
        httpServer.listen(port, () => {
          commonLogger.log(`MCP server listening on port ${port}`);
          resolve(app);
        });
      });
    },
  };
}
