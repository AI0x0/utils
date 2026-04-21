// Post-build：把 father 产物里的 extensionless 相对 import 补成具体路径，
// 例如 `from "./actions"` → `from "./actions/index.js"`；
// 让 Node 原生 ESM（vitest / ts-node / 任何不带 bundler 的消费方）能直接解析。
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "..",
);

const TARGETS = ["es", "lib"].map((d) => path.join(root, d));
// 这些语法都要命中：
//   from "./x"
//   from './x'
//   import("./x")
//   export * from "./x"
const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+?)\2/g;

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile() && /\.(js|mjs|cjs|d\.ts|d\.mts)$/.test(entry.name))
      out.push(p);
  }
  return out;
};

const exists = (p) => {
  try {
    return fs.statSync(p);
  } catch {
    return undefined;
  }
};

const resolveSpecifier = (fromFile, spec, isDts) => {
  // 已经带扩展名就不动（允许 .js / .mjs / .cjs / .json）
  if (/\.(m?js|cjs|json)$/.test(spec)) return spec;
  const base = path.resolve(path.dirname(fromFile), spec);
  const jsExt = fromFile.endsWith(".mjs") ? ".mjs" : ".js";
  // 1) 文件：spec.js
  const file = exists(base + jsExt);
  if (file && file.isFile()) return spec + jsExt;
  // 2) 目录：spec/index.js
  const idx = exists(path.join(base, "index" + jsExt));
  if (idx && idx.isFile()) return spec + "/index" + jsExt;
  // .d.ts 环境：优先 .d.ts，再 .d.ts/index
  if (isDts) {
    const dts = exists(base + ".d.ts");
    if (dts && dts.isFile()) return spec + ".js"; // 类型声明也补 .js 路径，消费侧 TS 会自动找 .d.ts
    const dtsIdx = exists(path.join(base, "index.d.ts"));
    if (dtsIdx && dtsIdx.isFile()) return spec + "/index.js";
  }
  return spec;
};

let touched = 0;
for (const rootDir of TARGETS) {
  if (!exists(rootDir)) continue;
  for (const file of walk(rootDir)) {
    const isDts = /\.d\.m?ts$/.test(file);
    const src = fs.readFileSync(file, "utf8");
    const next = src.replace(IMPORT_RE, (m, head, q, spec) => {
      const resolved = resolveSpecifier(file, spec, isDts);
      return resolved === spec ? m : `${head}${q}${resolved}${q}`;
    });
    if (next !== src) {
      fs.writeFileSync(file, next);
      touched += 1;
    }
  }
}
console.log(`[fix-ext] rewrote ${touched} files under es/ and lib/`);
