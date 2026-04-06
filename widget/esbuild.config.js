import { build } from "esbuild";

await build({
  entryPoints: ["src/embed.js"],
  outfile: "dist/embed.js",
  bundle: true,
  format: "iife",
  globalName: "FauwardTrackingWidget",
  minify: true,
  sourcemap: false,
  target: ["es2019"],
  loader: {
    ".css": "text"
  }
});

