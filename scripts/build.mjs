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
const backup = path.join(root, "tsconfig.json.bak");

if (!fs.existsSync(tsconfigBuild)) {
  console.error("tsconfig.build.json 不存在");
  process.exit(1);
}

const original = fs.readFileSync(tsconfig, "utf8");
fs.writeFileSync(backup, original);

const baseCfg = JSON.parse(original);
const buildCfg = JSON.parse(fs.readFileSync(tsconfigBuild, "utf8"));
fs.writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      ...baseCfg,
      compilerOptions: {
        ...baseCfg.compilerOptions,
        ...buildCfg.compilerOptions,
      },
      exclude: buildCfg.exclude ?? baseCfg.exclude,
    },
    null,
    2,
  ),
);

const restore = () => {
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, tsconfig);
    fs.unlinkSync(backup);
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
