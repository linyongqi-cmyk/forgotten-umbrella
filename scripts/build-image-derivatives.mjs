// 批量给 filebox/records 下所有原图生成缩略图 + 网页版 webp（存量补齐用）。
// 只新增文件、绝不改动/删除原图。默认跳过已生成的；加 --force 强制重生全部。
//   node scripts/build-image-derivatives.mjs
//   node scripts/build-image-derivatives.mjs --force
import fs from "node:fs/promises";
import path from "node:path";
import {
  generateDerivatives,
  isDerivableImage,
  isDerivativeFile,
} from "./image-derivatives.mjs";

const rootDir = process.cwd();
const recordsRoot = path.join(rootDir, "filebox", "records");
const force = process.argv.includes("--force");

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (isDerivableImage(entry.name) && !isDerivativeFile(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = await walk(recordsRoot);
let done = 0;
let failed = 0;
console.log(`发现 ${files.length} 张原图，开始生成缩略图 + 网页版（force=${force}）…`);
for (const file of files) {
  try {
    await generateDerivatives(file, { force });
    done += 1;
    if (done % 20 === 0) {
      console.log(`  …已处理 ${done}/${files.length}`);
    }
  } catch (err) {
    failed += 1;
    console.error(`  ✗ 失败：${path.relative(rootDir, file)} — ${err.message}`);
  }
}
console.log(`完成：成功 ${done}，失败 ${failed}。`);
