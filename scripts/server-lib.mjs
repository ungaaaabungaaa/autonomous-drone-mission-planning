import { createServer } from "node:http";
import { open, realpath, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, extname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const allowed = new Set([
  "index.html",
  "styles.css",
  "app.mjs",
  "draw-model.mjs",
  "src/planner.js",
  "src/validation.js",
  "src/wpl.js",
  "vendor/qeth/mission.js",
  "vendor/qeth/errors.js",
  "fixtures/area-with-hole.geojson",
]);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
};
export function createViewerServer(directory = join(ROOT, "site")) {
  const directoryPath = resolve(directory);
  return createServer(async (req, res) => {
    const headers = {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    };
    const send = (status, text) => {
      res.writeHead(status, {
        ...headers,
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end(req.method === "HEAD" ? "" : text);
    };
    const port = serverPort(res.socket?.localPort);
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(
        req.headers.host ?? "",
      )
    ) {
      send(403, "Loopback host required.");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(405, "Read-only viewer.");
      return;
    }
    let name;
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    } catch {
      send(400, "Invalid URL.");
      return;
    }
    if (!allowed.has(name)) {
      send(404, "Public asset not found.");
      return;
    }
    let handle;
    try {
      const base = await realpath(directoryPath),
        requested = join(base, name);
      if (!(await lstat(requested)).isFile())
        throw new Error("Regular asset required");
      const path = await realpath(requested),
        rel = relative(base, path);
      if (rel.startsWith("..") || isAbsolute(rel))
        throw new Error("Linked path outside public bundle");
      handle = await open(
        requested,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      const info = await handle.stat();
      if (!info.isFile() || info.size > 1048576)
        throw new Error("Asset size/type");
      const chunks = [];
      let total = 0;
      while (true) {
        const bytes = Buffer.alloc(Math.min(65536, 1048577 - total));
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, null);
        if (!bytesRead) break;
        total += bytesRead;
        if (total > 1048576) throw new Error("Asset grew beyond limit");
        chunks.push(bytes.subarray(0, bytesRead));
      }
      const body = Buffer.concat(chunks, total);
      res.writeHead(200, {
        ...headers,
        "Content-Type": mime[extname(name)],
        "Content-Length": body.length,
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      if (!res.headersSent) send(404, "Public asset unavailable.");
      else res.destroy();
    } finally {
      await handle?.close();
    }
  });
}
const serverPort = (value) => String(value ?? "");
