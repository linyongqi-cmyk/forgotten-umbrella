const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 4173);
const root = __dirname;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

// Only requests coming from this machine may use the editing API.
function isLocalRequest(request) {
  const remote = request.socket.remoteAddress || "";
  return (
    remote === "127.0.0.1" ||
    remote === "::1" ||
    remote === "::ffff:127.0.0.1"
  );
}

async function handleEditorRequest(request, response, url) {
  if (!isLocalRequest(request)) {
    response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Editing is only available on the local machine." }));
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Use POST for editor requests." }));
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 40_000_000) {
      request.destroy();
    }
  });
  request.on("end", async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const { handleEditorApi } = await import("./scripts/editor-api.mjs");
      const result = await handleEditorApi(url.pathname, payload);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: String(error?.message || error) }));
    }
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    handleEditorRequest(request, response, url);
    return;
  }

  const route = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, route));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.setHeader("Content-Type", types[path.extname(filePath)] || "application/octet-stream");
    if ([".html", ".css", ".js", ".json"].includes(path.extname(filePath)) || path.basename(filePath) === "sw.js") {
      response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      response.setHeader("Pragma", "no-cache");
      response.setHeader("Expires", "0");
    }
    response.end(body);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Forgotten Umbrella is running at http://127.0.0.1:${port}`);
});
