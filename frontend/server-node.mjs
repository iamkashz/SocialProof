// Cloud Run adapter for the TanStack Start SSR build.
//
// TanStack's build produces a fetch(req) → Response handler (Web
// platform style, meant for edge runtimes). Cloud Run needs a
// classical Node HTTP server listening on process.env.PORT. This
// file bridges the two, and also proxies /api/* to the separate
// FastAPI backend on Cloud Run so the browser only ever talks to
// this one origin.
import { createReadStream, promises as fsPromises } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import handler from "./dist/server/server.js";

const PORT = Number(process.env.PORT ?? 8080);
const ADK_API_URL = process.env.ADK_API_URL ?? "http://127.0.0.1:8080";
const CLIENT_DIR = resolve("./dist/client");

const MIME_TYPES = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

async function serveStatic(req, res, pathname) {
  // Reject path traversal attempts before touching the filesystem.
  const safePath = join(CLIENT_DIR, pathname);
  if (!safePath.startsWith(CLIENT_DIR)) {
    return false;
  }
  try {
    const stat = await fsPromises.stat(safePath);
    if (!stat.isFile()) return false;
    const type = MIME_TYPES[extname(safePath).toLowerCase()] ?? "application/octet-stream";
    // Hashed asset filenames (e.g. index-BcZIWeh8.js) never change — long
    // cache is safe. Non-hashed files stay short-cached.
    const cacheControl = /-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|ttf|svg|png|jpe?g|ico)$/.test(
      safePath,
    )
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300";
    res.writeHead(200, {
      "content-type": type,
      "content-length": stat.size,
      "cache-control": cacheControl,
    });
    createReadStream(safePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function toNodeStream(webStream) {
  return Readable.fromWeb(webStream);
}

async function forwardApiRequest(req, res, url) {
  const target = new URL(url.pathname + url.search, ADK_API_URL);

  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];

  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : Readable.toWeb(req);

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
    duplex: body ? "half" : undefined,
  });

  res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));

  if (upstream.body) {
    toNodeStream(upstream.body).pipe(res);
  } else {
    res.end();
  }
}

async function nodeToWebRequest(req, url) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  }

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req);

  return new Request(url, {
    method: req.method,
    headers,
    body,
    duplex: body ? "half" : undefined,
  });
}

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? `localhost:${PORT}`;
    const url = new URL(req.url ?? "/", `http://${host}`);

    if (url.pathname.startsWith("/api/")) {
      await forwardApiRequest(req, res, url);
      return;
    }

    // Serve the client-side bundle (JS, CSS, fonts, images) before
    // falling through to SSR. TanStack's fetch handler renders HTML
    // pages but doesn't know how to serve /assets/*.js.
    if (await serveStatic(req, res, url.pathname)) return;

    const request = await nodeToWebRequest(req, url);
    const response = await handler.fetch(request);

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

    if (response.body) {
      toNodeStream(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("adapter error:", err);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal server error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SocialProof frontend listening on :${PORT}`);
  console.log(`Proxying /api/* → ${ADK_API_URL}`);
});
