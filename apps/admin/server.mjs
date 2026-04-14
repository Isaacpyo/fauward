import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 4175);
const host = "0.0.0.0";
const distDir = new URL("./dist/", import.meta.url);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

async function serveFile(response, relativePath) {
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const file = new URL(safePath, distDir);
  const body = await readFile(file);
  const type = contentTypes.get(extname(file.pathname)) ?? "application/octet-stream";
  response.writeHead(200, { "content-type": type });
  response.end(body);
}

createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, service: "@fauward/admin" }));
    return;
  }

  try {
    const pathname = request.url && request.url !== "/" ? request.url.slice(1) : "index.html";
    const target = pathname.includes(".") ? pathname : join(pathname, "index.html");
    await serveFile(response, target === "index.html/index.html" ? "index.html" : target);
  } catch {
    try {
      await serveFile(response, "index.html");
    } catch {
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Admin assets are not available yet" }));
    }
  }
}).listen(port, host, () => {
  console.log(`@fauward/admin listening on http://${host}:${port}`);
});
