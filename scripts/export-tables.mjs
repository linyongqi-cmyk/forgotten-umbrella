// 导出两张总览表格（CSV，供 Excel / Numbers / Google 表格打开）：
//   导出表格/fieldwork.csv    —— 作者自己拍的（submissionType != "contributed"）
//   导出表格/contributed.csv  —— 投稿的伞（submissionType == "contributed"）
// 数据直接从 filebox/records（正常）和 filebox/hidden（已隐藏，单独标记）读取，随记录内容
// 自动同步：build-umbrellas 每次跑（含编辑器保存自动重建）都会重生成。
//
// 用户要求：**表里所有值都以「详情页的显示效果」为准**。所以这里把 app.js 里的展示格式化逻辑
// （时间/object/地址回退/approx 前缀）原样搬过来，保证两边一致。不载入图片，补充照片只列文件名。
import fs from "node:fs/promises";
import path from "node:path";
import { readRecordFile } from "./record-utils.mjs";

const rootDir = process.cwd();
const recordsRoot = path.join(rootDir, "filebox", "records");
const hiddenRoot = path.join(rootDir, "filebox", "hidden");
const outDir = path.join(rootDir, "导出表格");

// ───────────────── 与 app.js 保持一致的展示格式化（勿单独改，改要两边一起） ─────────────────
const COUNT_WORDS = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };
const COLOR_NEEDS_DETAIL = new Set(["colored", "patterned", "other"]);
const APPROX_PREFIX = "approx. ";

function normalizeLocationLevels(levels) {
  return Array.isArray(levels)
    ? levels
        .map((level) => String(level || "").trim())
        .filter((level) => level && level.toLowerCase() !== "unknown")
        .slice(0, 3)
    : [];
}
function formatLocationLevels(levels) {
  return normalizeLocationLevels(levels).join(", ");
}
// 显示地址：手填 locationText 优先，为空则回退用层级地址（和详情页一致，用户 #2）。
function displayLocation(rec) {
  const lt = String(rec.locationText || "").trim();
  return lt || formatLocationLevels(rec.locationLevels);
}

function applyUnitInheritance(count, units) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1) return [];
  const base = Array.isArray(units) ? units : [];
  const first = base[0] || { color: "", colorDetail: "", kind: "" };
  const result = [];
  for (let i = 0; i < n; i += 1) {
    const unit = base[i] || {};
    const isEmpty = !unit.color && !unit.kind;
    result.push(
      isEmpty && i > 0
        ? { color: first.color || "", colorDetail: first.colorDetail || "", kind: first.kind || "" }
        : { color: unit.color || "", colorDetail: unit.colorDetail || "", kind: unit.kind || "" },
    );
  }
  return result;
}
function describeUnit(unit) {
  let colorWord = "";
  if (COLOR_NEEDS_DETAIL.has(unit.color)) {
    colorWord = String(unit.colorDetail || "").trim() || unit.color;
  } else if (unit.color === "transparent" || unit.color === "translucent") {
    colorWord = unit.color;
  }
  return [colorWord, unit.kind || ""].filter(Boolean).join(" ").trim();
}
function buildObjectGroups(count, units) {
  if (count === "unknown") return [];
  const list = applyUnitInheritance(count, units);
  if (!list.length) return [];
  const words = list.map(describeUnit).filter(Boolean);
  if (!words.length) return [];
  const groups = [];
  words.forEach((word) => {
    const existing = groups.find((g) => g.word === word);
    if (existing) existing.count += 1;
    else groups.push({ word, count: 1 });
  });
  return groups.map((g) => {
    const num = g.count >= 2 ? COUNT_WORDS[g.count] || String(g.count) : "";
    return [num, g.word].filter(Boolean).join(" ");
  });
}
// 详情页 object：count=unknown → "unknown"；否则数量+颜色+种类（count=1 不显示 one）。
function displayObject(rec) {
  const count = rec.umbrellaCount || "";
  if (count === "unknown") return "unknown";
  return buildObjectGroups(count, rec.umbrellaUnits).join(", ");
}

function parseLooseDateParts(value) {
  const m = String(value || "").match(/(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?(?:[^\d]+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, da, hh, mm] = m;
  return { y: Number(y), mo: Number(mo), da: da ? Number(da) : 0, hh: hh != null ? Number(hh) : null, mm: mm != null ? Number(mm) : 0 };
}
// 投稿伞的宽松时间：如 "2026.03.29, 20:05" → "2026/03/29 20:05"；抓不到就原样。
function formatLooseDate(value) {
  const parts = parseLooseDateParts(value);
  if (!parts) return String(value || "").trim();
  const p = (n) => String(n).padStart(2, "0");
  let out = `${parts.y}/${p(parts.mo)}`;
  if (parts.da) out += `/${p(parts.da)}`;
  if (parts.hh != null && !(parts.hh === 0 && parts.mm === 0)) out += ` ${p(parts.hh)}:${p(parts.mm)}`;
  return out;
}
// 自己拍的伞的 ISO 时间 → "2026/07/02 13:08"（ja-JP 格式，和详情页一致）。抓不到就原样。
const jaFmt = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return typeof value === "string" ? value.trim() : "";
  return jaFmt.format(date);
}
// 详情页 time 行：投稿伞用宽松格式、自己拍的用 ISO 格式；approx 时加前缀。
function displayTime(rec) {
  const raw = rec.time || rec.photoTime || "";
  const text = rec.submissionType === "contributed" ? formatLooseDate(raw) : formatDateTime(raw);
  return text ? (rec.timeApprox ? APPROX_PREFIX : "") + text : "";
}
function displayPlace(rec) {
  const loc = displayLocation(rec);
  return loc ? (rec.locationApprox ? APPROX_PREFIX : "") + loc : "";
}

// ───────────────── 表格字段辅助 ─────────────────
const b = (v) => (v && typeof v === "object" ? v : { ja: "", en: "" });
const s = (v) => (v == null ? "" : String(v));

// 补充照片：主图以外的媒体文件名。
function supplementPhotos(rec) {
  return (Array.isArray(rec.media) ? rec.media : [])
    .filter((m) => m && m.role !== "primary" && m.file)
    .map((m) => m.file)
    .join(" ; ");
}
// 段落/对话：text（+dialogue）块某语言拼起来。
function blocksText(rec, lang) {
  return (Array.isArray(rec.blocks) ? rec.blocks : [])
    .filter((bl) => bl.type === "text" || bl.type === "dialogue")
    .map((bl) => b(bl.text)[lang] || "")
    .filter(Boolean)
    .join("\n");
}
// 显示名（用户 #4）：有就打 ★ 标记，方便一眼看出哪些设了显示名。
function displayNameCell(rec) {
  const d = String(rec.displayId || "").trim();
  return d ? "★ " + d : "";
}

async function getRecordFiles(dir) {
  let out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(await getRecordFiles(p));
    else if (e.name === "record.json") out.push(p);
  }
  return out;
}

function csvCell(v) {
  return `"${s(v).replace(/"/g, '""')}"`;
}
function toCsv(header, rows) {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function exportTables() {
  const all = [
    ...(await getRecordFiles(recordsRoot)).map((f) => ({ f, hidden: false })),
    ...(await getRecordFiles(hiddenRoot)).map((f) => ({ f, hidden: true })),
  ];

  const fieldwork = [];
  const contributed = [];

  for (const { f, hidden: isHidden } of all) {
    const rec = await readRecordFile(f).catch(() => null);
    if (!rec) continue;
    const folderName = path.basename(path.dirname(f)); // 文件夹名（用户 #2；修好插图当主图的 ________ bug）
    const category = path.basename(path.dirname(path.dirname(f)));
    const title = b(rec.title);
    const hideMark = isHidden ? "✓ 已隐藏" : "";

    if (rec.submissionType === "contributed") {
      contributed.push([
        hideMark,
        folderName,
        displayNameCell(rec),
        s(rec.submitter),
        title.ja,
        title.en,
        formatLooseDate(rec.submissionTime),
        displayTime(rec),
        displayPlace(rec),
        supplementPhotos(rec),
        blocksText(rec, "ja"),
        blocksText(rec, "en"),
      ]);
    } else {
      fieldwork.push([
        hideMark,
        folderName,
        title.ja,
        title.en,
        displayTime(rec),
        category,
        displayObject(rec),
        displayPlace(rec),
        supplementPhotos(rec),
        blocksText(rec, "ja"),
        blocksText(rec, "en"),
        displayNameCell(rec), // 显示名放最后（用户 #4）
      ]);
    }
  }

  const sortByFolder = (arr, idx) => arr.sort((a, z) => (a[0] + a[idx]).localeCompare(z[0] + z[idx]));
  sortByFolder(fieldwork, 1);
  sortByFolder(contributed, 1);

  const fieldworkHeader = [
    "隐藏", "文件夹名", "标题(日)", "标题(英)", "时间", "类型", "object",
    "显示地址(英)", "补充照片", "段落(日)", "段落(英)", "显示名",
  ];
  const contributedHeader = [
    "隐藏", "文件夹名", "显示名", "投稿人", "标题(日)", "标题(英)", "投稿时间", "拍摄时间",
    "显示地址(英)", "补充照片", "对话/段落(日)", "对话/段落(英)",
  ];

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "fieldwork.csv"), toCsv(fieldworkHeader, fieldwork), "utf8");
  await fs.writeFile(path.join(outDir, "contributed.csv"), toCsv(contributedHeader, contributed), "utf8");

  return { fieldwork: fieldwork.length, contributed: contributed.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportTables()
    .then((r) => console.log("导出表格：", JSON.stringify(r)))
    .catch((e) => { console.error(e); process.exit(1); });
}
