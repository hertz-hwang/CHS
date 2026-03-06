import { serve } from "bun";
import { join } from "path";

// 静态资源目录
const DIST_DIR = join(import.meta.dir, "dist");

// MIME类型映射
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function getMimeType(path: string): string {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

const server = serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // 默认返回index.html
    if (path === "/" || path === "") {
      path = "/index.html";
    }

    // 安全检查：防止目录遍历
    const filePath = join(DIST_DIR, path);
    if (!filePath.startsWith(DIST_DIR)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();

      if (!exists) {
        // 对于SPA，返回index.html
        if (!path.includes(".")) {
          const indexFile = Bun.file(join(DIST_DIR, "index.html"));
          return new Response(await indexFile.arrayBuffer(), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        return new Response("Not Found", { status: 404 });
      }

      return new Response(await file.arrayBuffer(), {
        headers: { "Content-Type": getMimeType(path) },
      });
    } catch (error) {
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});

console.log(`🚀 字劫 CHS 服务器已启动!`);
console.log(`📍 访问地址: http://localhost:${server.port}`);
console.log(`按 Ctrl+C 停止服务器`);