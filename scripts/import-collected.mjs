// One-off importer for the "collected from others" contributed umbrellas.
//
// Reads a JSON export of filebox/collected/collected_from_others_data.xlsx
// (produced separately, path passed as --data) plus the photo folder, and
// creates contributed records under filebox/records/submission(pending)/<id>/.
//
//   node scripts/import-collected.mjs --data <collected.json> --dry   # preview
//   node scripts/import-collected.mjs --data <collected.json>          # write
//
// Coordinates here are rough city/station approximations (locationApprox=true);
// the author fine-tunes each on the map afterwards. Markers show green because
// submissionType is "contributed". TIFF/BMP are converted to JPG via `sips`.

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readRecordFile,
  stringifyRecordWithComments,
  mergeRecordMediaWithFolder,
  isImageFile,
  isVideoFile,
} from "./record-utils.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordsRoot = path.join(rootDir, "filebox", "records");
const targetCategory = "submission(pending)";
const SOURCE_DIR =
  "/Users/eiki/Library/Mobile Documents/com~apple~CloudDocs/iGHONE Works/2025.3.15-忘れられた傘/010-Photos/other people";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const dataPath = (() => {
  const i = args.indexOf("--data");
  return i >= 0 ? args[i + 1] : path.join(rootDir, "scratchpad-collected.json");
})();

// Per-submission metadata keyed by the spreadsheet "Pic" value: a clean ASCII
// id (= folder name) + rough coordinates + whether the time is only approximate.
// Rows not listed here are skipped (Sliden_1 / ygrons_1 have no photo files).
const META = {
  "LYUCHEN_1": { id: "LYUCHEN_1", lat: 35.6073, lng: 140.1153, timeApprox: false },
  "WQD_1": { id: "WQD_1", lat: 35.4656, lng: 136.737, timeApprox: true },
  "ZHANG ZHONGPU_1": { id: "ZHANG_ZHONGPU_1", lat: 34.7025, lng: 135.4959, timeApprox: true },
  "@rednote/102652598_1": { id: "rednote_102652598_1", lat: 35.71, lng: 139.8132, timeApprox: false },
  "LIU SIJIA_1": { id: "LIU_SIJIA_1", lat: 35.6256, lng: 140.1037, timeApprox: false },
  "@rednote/1164552325_1": { id: "rednote_1164552325_1", lat: 35.6967, lng: 139.8146, timeApprox: false },
  "ZHANG ZHONGPU_2": { id: "ZHANG_ZHONGPU_2", lat: 34.6937, lng: 135.4948, timeApprox: true },
  "@rednote/186833939_1": { id: "rednote_186833939_1", lat: 35.8077, lng: 139.724, timeApprox: false },
  "@rednote/uka98art_1": { id: "rednote_uka98art_1", lat: 35.609, lng: 139.552, timeApprox: false },
  "@rednote/2352131487_1": { id: "rednote_2352131487_1", lat: 35.4478, lng: 139.6425, timeApprox: true },
  "@rednote/621639248_1": { id: "rednote_621639248_1", lat: 31.2304, lng: 121.4737, timeApprox: false },
  "@rednote/9732476585_1": { id: "rednote_9732476585_1", lat: 35.7289, lng: 139.717, timeApprox: false },
  "あああ_1": { id: "aaa_1", lat: 34.9858, lng: 135.7588, timeApprox: false },
  "@rednote/kankan_1": { id: "rednote_kankan_1", lat: 35.0045, lng: 135.8686, timeApprox: false },
  "@rednote/5648778497_1": { id: "rednote_5648778497_1", lat: 35.658, lng: 139.7016, timeApprox: false },
  "LYUCHEN_2": { id: "LYUCHEN_2", lat: 35.6256, lng: 140.102, timeApprox: false },
  "あああ_2": { id: "aaa_2", lat: 34.9858, lng: 135.7588, timeApprox: false },
  "@rednote/kankan_2": { id: "rednote_kankan_2", lat: 35.0036, lng: 135.7681, timeApprox: false },
  "@rednote/129096578_1": { id: "rednote_129096578_1", lat: 35.6997, lng: 139.7647, timeApprox: false },
  "@rednote/26215291992_1": { id: "rednote_26215291992_1", lat: 35.7126, lng: 139.7038, timeApprox: false },
  "@rednote/sanponimabi_1": { id: "rednote_sanponimabi_1", lat: 35.6852, lng: 139.6983, timeApprox: false },
};

const CONVERT_EXTS = new Set([".tiff", ".tif", ".bmp"]); // → jpg for browser display

async function listSourceTopFiles() {
  const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => e.name);
}

function matchFiles(allFiles, srcPrefix) {
  // A file belongs to this submission when its stem equals the prefix or starts
  // with "<prefix>_" (so prefix "LYUCHEN_1" grabs LYUCHEN_1_1..7 but not LYUCHEN_2).
  return allFiles
    .filter((name) => {
      const stem = name.slice(0, name.length - path.extname(name).length);
      return stem === srcPrefix || stem.startsWith(srcPrefix + "_");
    })
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

function cleanTime(dateText) {
  return String(dateText || "")
    .replace(/\s*\(updates[^)]*\)/gi, "")
    .replace(/\n+/g, " ")
    .trim();
}

function cleanLocation(text) {
  return String(text || "").replace(/\n+/g, " / ").trim();
}

async function nextSourceIndexBase() {
  let max = -1;
  const walk = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name === "record.json") {
        const rec = await readRecordFile(full);
        if (Number.isInteger(rec.sourceIndex) && rec.sourceIndex > max) max = rec.sourceIndex;
      }
    }
  };
  await walk(recordsRoot);
  return max + 1;
}

async function main() {
  const rows = JSON.parse(await fs.readFile(dataPath, "utf8"));
  const allFiles = await listSourceTopFiles();
  const referenced = new Set();
  let sourceIndex = await nextSourceIndexBase();
  const plan = [];
  const skipped = [];

  for (const row of rows) {
    const meta = META[row.pic];
    if (!meta) {
      skipped.push({ pic: row.pic, reason: "no photo files / skipped" });
      continue;
    }
    const srcPrefix = row.pic.replaceAll("/", ":");
    const files = matchFiles(allFiles, srcPrefix);
    if (!files.length) {
      skipped.push({ pic: row.pic, reason: "no matching files on disk" });
      continue;
    }
    files.forEach((f) => referenced.add(f));
    plan.push({ row, meta, files, sourceIndex: sourceIndex++ });
  }

  // Report files on disk that no row claimed (e.g. orphan IMG_8583.jpg).
  const orphans = allFiles.filter((f) => !referenced.has(f));

  console.log(`\n=== 导入对照清单（${plan.length} 条，${DRY ? "试运行 DRY" : "正式写入"}）===\n`);
  for (const p of plan) {
    const imgs = p.files.filter(isImageFile).length;
    const vids = p.files.filter(isVideoFile).length;
    console.log(
      `• ${p.meta.id}\n` +
        `   投稿者: ${p.row.photoBy} | 地点: ${cleanLocation(p.row.foundAt)}\n` +
        `   时间: ${cleanTime(p.row.date) || "(无)"}${p.meta.timeApprox ? " [大概]" : ""} | 坐标(大概): ${p.meta.lat}, ${p.meta.lng}\n` +
        `   媒体: ${imgs}图 ${vids}视频  [${p.files.join(", ")}]\n` +
        `   原话: ${p.row.text ? p.row.text.length + " 字" : "无"}`,
    );
  }
  if (skipped.length) {
    console.log(`\n--- 跳过 ${skipped.length} 行 ---`);
    skipped.forEach((s) => console.log(`  ✗ ${s.pic}: ${s.reason}`));
  }
  if (orphans.length) {
    console.log(`\n--- 无对应表格行的照片（已忽略）---`);
    orphans.forEach((o) => console.log(`  ? ${o}`));
  }

  if (DRY) {
    console.log("\n（试运行：未写入任何文件。确认无误后去掉 --dry 再跑一次。）\n");
    return;
  }

  for (const p of plan) {
    const recordDir = path.join(recordsRoot, targetCategory, p.meta.id);
    if (await pathExists(recordDir)) {
      console.log(`  跳过已存在: ${p.meta.id}`);
      continue;
    }
    await fs.mkdir(recordDir, { recursive: true });

    const media = [];
    let n = 0;
    let primaryAssigned = false;
    for (const srcName of p.files) {
      n += 1;
      const ext = path.extname(srcName).toLowerCase();
      const convert = CONVERT_EXTS.has(ext);
      const destExt = convert ? ".jpg" : ext;
      const destName = `${p.meta.id}_${n}${destExt}`;
      const srcPath = path.join(SOURCE_DIR, srcName);
      const destPath = path.join(recordDir, destName);
      if (convert) {
        execFileSync("sips", ["-s", "format", "jpeg", srcPath, "--out", destPath]);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
      const isPrimary = !primaryAssigned && isImageFile(destName);
      if (isPrimary) primaryAssigned = true;
      media.push({
        id: path.parse(destName).name,
        file: destName,
        role: isPrimary ? "primary" : "detail",
        title: "",
        photoTime: "",
        story: "",
        legacyThumb: "",
      });
    }

    const record = {
      schemaVersion: 1,
      sourceIndex: p.sourceIndex,
      locationText: cleanLocation(p.row.foundAt),
      locationLevels: [],
      photoCoordinates: null,
      locationCoordinates: { lat: p.meta.lat, lng: p.meta.lng },
      photoTime: "",
      time: cleanTime(p.row.date),
      title: { ja: "", en: "" },
      umbrellaType: "",
      umbrellaColor: "",
      umbrellaCount: "",
      umbrellaUnits: [],
      editFlag: "",
      linkedId: "",
      submissionType: "contributed",
      submitter: String(p.row.photoBy || "").trim(),
      submissionChannel: "",
      submitterNote: String(p.row.text || "").trim(),
      locationApprox: true,
      timeApprox: Boolean(p.meta.timeApprox),
      story: "",
      blocks: [],
      media,
    };
    const recordPath = path.join(recordDir, "record.json");
    const merged = await mergeRecordMediaWithFolder(recordPath, record);
    await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
    console.log(`  ✓ 写入 ${p.meta.id}（${media.length} 媒体）`);
  }
  console.log(`\n完成 ${plan.length} 条。记得跑 npm run records:build。\n`);
}

async function pathExists(t) {
  try {
    await fs.access(t);
    return true;
  } catch {
    return false;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
