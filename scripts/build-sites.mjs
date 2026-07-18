import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const server = path.join(dist, "server");

const textFiles = [
  ["index.html", "text/html; charset=utf-8"],
  ["yongcheng.html", "text/html; charset=utf-8"],
  ["zhajinhua.html", "text/html; charset=utf-8"],
  ["src/app.js", "text/javascript; charset=utf-8"],
  ["src/game.js", "text/javascript; charset=utf-8"],
  ["src/styles.css", "text/css; charset=utf-8"],
  ["src/home.css", "text/css; charset=utf-8"],
  ["src/zhajinhua/app.js", "text/javascript; charset=utf-8"],
  ["src/zhajinhua/game.js", "text/javascript; charset=utf-8"],
  ["src/zhajinhua/styles.css", "text/css; charset=utf-8"]
];

const assets = Object.fromEntries(
  await Promise.all(
    textFiles.map(async ([file, contentType]) => {
      const body = await readFile(path.join(root, file), "utf8");
      return [`/${file}`, { body, contentType }];
    })
  )
);

assets["/"] = assets["/index.html"];

await rm(dist, { force: true, recursive: true });
await mkdir(server, { recursive: true });

const worker = `const assets = ${JSON.stringify(assets)};\n\nexport default {\n  async fetch(request) {\n    const url = new URL(request.url);\n    const pathname = url.pathname.endsWith(\"/\") && url.pathname !== \"/\" ? url.pathname.slice(0, -1) : url.pathname;\n    const asset = assets[pathname] ?? assets[\`\${pathname}/index.html\`];\n\n    if (!asset) {\n      return new Response(\"Not found\", { status: 404 });\n    }\n\n    return new Response(asset.body, {\n      headers: {\n        \"content-type\": asset.contentType,\n        \"cache-control\": \"public, max-age=60\"\n      }\n    });\n  }\n};\n`;

await writeFile(path.join(server, "index.js"), worker);
