import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import esbuild from "esbuild";

dotenv.config();

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const isMinify = args.includes("--minify");
const isSourcemap = args.includes("--sourcemap");
const _isProduction = args.includes("--production");

// Read package.json using fs.readFileSync directly to avoid import assertions
const packageJsonPath = path.resolve(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const _version = pkg.version;

const config = {
  entryPoints: ["./src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "es6",
  sourcemap: isSourcemap,
  minify: isMinify,
  define: {},
  plugins: [
    {
      // for VSCode $esbuild-watch problem matcher
      name: "esbuild-problem-matcher",
      setup(build) {
        build.onStart(() => {
          console.log("[watch] build started");
        });
        build.onEnd((result) => {
          for (const { text, location } of result.errors) {
            console.error(`✘ [ERROR] ${text}`);
            console.error(`    ${location.file}:${location.line}:${location.column}:`);
          }
          console.log("[watch] build finished");
        });
      },
    },
  ],
};

if (isWatch) {
  console.log("[watch] build started");
  esbuild
    .context(config)
    .then((ctx) => {
      ctx.watch();
      console.log("Watching for changes...");
    })
    .catch(() => process.exit(1));
} else {
  esbuild
    .build(config)
    .then(() => {
      console.log("Build completed.");
    })
    .catch(() => process.exit(1));
}
