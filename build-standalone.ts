#!/usr/bin/env bun
/**
 * 构建单文件可执行程序
 * 将dist目录的所有静态资源嵌入到服务器代码中
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join, relative } from "path";

const DIST_DIR = join(import.meta.dir, "dist");
const OUTPUT_FILE = join(import.meta.dir, "server-standalone.ts");

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

async function collectFiles(dir: string, baseDir: string): Promise<{ path: string; content: Buffer }[]> {
  const files: { path: string; content: Buffer }[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, baseDir));
    } else {
      // 跳过.DS_Store等隐藏文件
      if (entry.name.startsWith(".")) continue;
      const content = await readFile(fullPath);
      files.push({
        path: "/" + relative(baseDir, fullPath),
        content,
      });
    }
  }

  return files;
}

async function build() {
  console.log("📦 收集静态文件...");
  const files = await collectFiles(DIST_DIR, DIST_DIR);
  console.log(`   找到 ${files.length} 个文件`);

  console.log("🔧 生成嵌入式服务器代码...");

  // 将文件转换为嵌入式资源对象
  const assetsCode = files.map(f => {
    const base64 = f.content.toString("base64");
    return `  "${f.path}": { mime: "${getMimeType(f.path)}", data: "${base64}" }`;
  }).join(",\n");

  const serverCode = `import { serve } from "bun";

// 嵌入的静态资源 (Base64编码)
const ASSETS: Record<string, { mime: string; data: string }> = {
${assetsCode}
};

function decodeBase64(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

const server = serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // 默认返回index.html
    if (path === "/" || path === "") {
      path = "/index.html";
    }

    // 查找资源
    const asset = ASSETS[path];
    if (asset) {
      const data = decodeBase64(asset.data);
      return new Response(data, {
        headers: {
          "Content-Type": asset.mime,
          "Cache-Control": "public, max-age=31536000",
        },
      });
    }

    // 对于SPA路由，返回index.html
    if (!path.includes(".") || path.startsWith("/data/")) {
      const indexAsset = ASSETS["/index.html"];
      if (indexAsset) {
        const data = decodeBase64(indexAsset.data);
        return new Response(data, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log("🚀 字劫 CHS 服务器已启动!");
console.log("📍 访问地址: http://localhost:" + server.port);
console.log("按 Ctrl+C 停止服务器");
`;

  await writeFile(OUTPUT_FILE, serverCode);
  console.log(`   生成: ${OUTPUT_FILE}`);

  // 解析命令行参数
  const args = process.argv.slice(2);
  const target = args.find(a => a.startsWith("--target="))?.split("=")[1];
  const platform = args.find(a => a.startsWith("--platform="))?.split("=")[1];

  let outfile = "chars-hijack";
  let targetFlag = "";

  if (platform === "windows" || target?.includes("windows")) {
    outfile = "chars-hijack.exe";
    targetFlag = "--target=bun-windows-x64";
  } else if (platform === "linux" || target?.includes("linux")) {
    outfile = "chars-hijack-linux";
    targetFlag = "--target=bun-linux-x64";
  } else if (platform === "macos-x64" || target?.includes("darwin-x64")) {
    outfile = "chars-hijack-macos-x64";
    targetFlag = "--target=bun-darwin-x64";
  }

  console.log("🏗️  编译可执行文件...");
  const buildArgs = ["bun", "build", OUTPUT_FILE, "--compile", "--outfile", outfile];
  if (targetFlag) {
    buildArgs.push(targetFlag);
  }

  const result = Bun.spawnSync(buildArgs, {
    cwd: import.meta.dir,
  });

  if (result.exitCode !== 0) {
    console.error("❌ 编译失败:", result.stderr.toString());
    process.exit(1);
  }

  console.log("✅ 构建完成! 可执行文件:", outfile);
  console.log("   运行方式: ." + (outfile.includes(".exe") ? "\\" : "/") + outfile);
}

build().catch(console.error);
