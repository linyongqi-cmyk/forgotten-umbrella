// 一次性批量抓取「所有主图」的天气（用户 2.1）。
//
// 走遍 filebox/records/**/record.json，对每条记录的主图：
//   1) 迁移旧的记录级 record.weather → 主图 media.weather（然后把记录级清成 null）；
//   2) 若主图有坐标(locationCoordinates→photoCoordinates)+时间(主图 photoTime→记录 time/photoTime)，
//      重新抓「拍摄前 24 小时」逐时天气写进主图 media.weather；
//   3) 主图 showWeather 默认 true。
// 抓不到（没坐标/没时间/日期太新查不到）的记录会跳过并在最后汇总，不影响其它记录。
//
// 用法：node scripts/fetch-all-weather.mjs        （抓所有缺天气的主图 + 迁移）
//       node scripts/fetch-all-weather.mjs --force （已有天气的主图也重抓）
//
// 抓完自动重建 data/umbrellas.json。

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mergeRecordMediaWithFolder,
  readRecordFile,
  stringifyRecordWithComments,
} from "./record-utils.mjs";
import { fetchWeatherData } from "./weather.mjs";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const recordsRoot = path.join(rootDir, "filebox", "records");
const buildScript = path.join(rootDir, "scripts", "build-umbrellas.mjs");
const force = process.argv.includes("--force");

async function getRecordFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return getRecordFiles(full);
      }
      return entry.name === "record.json" ? [full] : [];
    }),
  );
  return files.flat();
}

function coord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const files = await getRecordFiles(recordsRoot);
files.sort();

let fetched = 0;
let migrated = 0;
let changed = 0;
const skipped = [];

for (const recordPath of files) {
  const id = path.basename(path.dirname(recordPath));
  let record;
  try {
    record = await readRecordFile(recordPath);
  } catch (err) {
    skipped.push(`${id}（读不了：${err.message}）`);
    continue;
  }
  const media = Array.isArray(record.media) ? record.media : [];
  const primary = media.find((m) => m?.role === "primary") || media[0];
  if (!primary) {
    skipped.push(`${id}（没有主图）`);
    continue;
  }

  let touched = false;

  // 1) 迁移旧的记录级天气到主图。
  if (record.weather && typeof record.weather === "object" && !primary.weather) {
    primary.weather = record.weather;
    migrated += 1;
    touched = true;
  }
  if (record.weather) {
    record.weather = null; // 记录级天气已废弃（改成按图存）。
    touched = true;
  }

  // 2) 抓主图 24h 天气。
  const c = coord(record.locationCoordinates) || coord(record.photoCoordinates);
  const refTime = String(primary.photoTime || record.time || record.photoTime || "").trim();
  const needFetch = force || !primary.weather;
  if (needFetch && c && refTime) {
    try {
      primary.weather = await fetchWeatherData(c.lat, c.lng, refTime, { hoursBefore: 24 });
      fetched += 1;
      touched = true;
      await sleep(350); // 温柔一点，别把免费接口打太快。
    } catch (err) {
      skipped.push(`${id}（抓不到：${err.message}）`);
    }
  } else if (needFetch && (!c || !refTime)) {
    skipped.push(`${id}（${!c ? "没坐标" : ""}${!c && !refTime ? "+" : ""}${!refTime ? "没时间" : ""}）`);
  }

  // 3) 主图默认显示天气。
  if (primary.weather && typeof primary.showWeather !== "boolean") {
    primary.showWeather = true;
    touched = true;
  }

  if (touched) {
    const merged = await mergeRecordMediaWithFolder(recordPath, record);
    await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
    changed += 1;
    process.stdout.write(`✓ ${id}\n`);
  }
}

console.log(`\n完成：抓取 ${fetched} 条、迁移旧天气 ${migrated} 条、改写 ${changed} 个 record.json。`);
if (skipped.length) {
  console.log(`跳过 ${skipped.length} 条：`);
  skipped.forEach((s) => console.log(`  - ${s}`));
}

console.log("\n重建 data/umbrellas.json …");
await execFileAsync(process.execPath, [buildScript], { cwd: rootDir });
console.log("done.");
