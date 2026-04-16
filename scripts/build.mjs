import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "..",
);
const tsconfig = path.join(root, "tsconfig.json");
const tsconfigBuild = path.join(root, "tsconfig.build.json");
const tsconfigBackup = path.join(root, "tsconfig.json.bak");

const nrfDir = path.join(root, "node_modules", "next-rest-framework", "dist");
const nrfFiles = ["index.d.ts", "index.d.mts"];
const nrfBackups = nrfFiles.map((f) => ({
  target: path.join(nrfDir, f),
  backup: path.join(nrfDir, f + ".bak"),
}));

const shim = fs.readFileSync(
  path.join(root, "src", "__shims__", "next-rest-framework.d.ts"),
  "utf8",
);
// 由于我们替换的是真实包自己的 .d.ts，需要写成模块形式而不是 declare module
const shimAsModule = shim
  .replace('declare module "next-rest-framework" {', "")
  .replace(/^}\s*$/m, "");

if (!fs.existsSync(tsconfigBuild)) {
  console.error("tsconfig.build.json 不存在");
  process.exit(1);
}

// 1. 合并 tsconfig（但不包含 next-rest-framework 的 paths 映射）
const original = fs.readFileSync(tsconfig, "utf8");
fs.writeFileSync(tsconfigBackup, original);
const baseCfg = JSON.parse(original);
const buildCfg = JSON.parse(fs.readFileSync(tsconfigBuild, "utf8"));
const mergedCompilerOptions = {
  ...baseCfg.compilerOptions,
  ...buildCfg.compilerOptions,
};
delete mergedCompilerOptions.ignoreDeprecations;
fs.writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      ...baseCfg,
      compilerOptions: mergedCompilerOptions,
      exclude: buildCfg.exclude ?? baseCfg.exclude,
    },
    null,
    2,
  ),
);

// 2. 备份并替换 next-rest-framework 的真实类型声明为 shim
for (const { target, backup } of nrfBackups) {
  if (fs.existsSync(target)) {
    fs.copyFileSync(target, backup);
    fs.writeFileSync(target, shimAsModule);
  }
}

const restore = () => {
  if (fs.existsSync(tsconfigBackup)) {
    fs.copyFileSync(tsconfigBackup, tsconfig);
    fs.unlinkSync(tsconfigBackup);
  }
  for (const { target, backup } of nrfBackups) {
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, target);
      fs.unlinkSync(backup);
    }
  }
};

process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("uncaughtException", (e) => {
  restore();
  throw e;
});

const child = spawn("father", ["build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => {
  restore();
  process.exit(code ?? 0);
});
