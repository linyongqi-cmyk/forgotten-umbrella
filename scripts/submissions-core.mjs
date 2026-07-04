// 投稿核心逻辑（CLI 命令行导入 和 编辑器收件箱 共用同一份，避免两处逻辑跑偏）。
//
// 负责：连 Google（读表格 + 读 Drive 照片）、把表单回答解析成投稿对象、下载照片、
// 把某条投稿生成成 submission(pending) 里的 record。去重靠「主图 Drive 文件 id」，
// 记在 scripts/.submissions-state.json。

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { google } from "googleapis";
import { getAuthorizedClient } from "./google-auth.mjs";
import { stringifyRecordWithComments, mergeRecordMediaWithFolder, readRecordFile } from "./record-utils.mjs";
import { generateDerivatives, isDerivableImage } from "./image-derivatives.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..");
const recordsRoot = path.join(rootDir, "filebox", "records");
export const PENDING_CATEGORY = "submission(pending)"; // 投稿伞的正式分类
const CONFIG_PATH = path.join(here, "submissions.config.json");
const STATE_PATH = path.join(here, ".submissions-state.json");

// 表单问题 → record 字段：靠关键词认列（表头就是表单的问题文字，中英日都认）。
export const COLUMN_KEYWORDS = {
  timestamp: ["タイムスタンプ", "timestamp", "时间戳", "时间戳记"],
  mainPhoto: ["傘の写真", "photo of the umbrella"],
  dateFound: ["発見日時", "date found"],
  location: ["発見場所", "location"],
  observation: ["観察メモ", "observation notes"],
  contributor: ["署名", "contributor name"],
  additionalPhoto: ["追加写真", "additional photos"],
  weather: ["数日前の天気", "weather on the day"],
  surroundings: ["周囲の環境", "surroundings"],
  additionalNotes: ["追加メモ", "additional notes"],
};

export function findColumn(headers, keywords) {
  const lower = headers.map((h) => String(h || "").toLowerCase());
  for (let i = 0; i < lower.length; i += 1) {
    if (keywords.some((kw) => lower[i].includes(kw.toLowerCase()))) {
      return i;
    }
  }
  return -1;
}

// 从上传题单元格抽出 Drive 文件 id（可能多张，逗号/换行分隔）。
export function extractDriveIds(cell) {
  const text = String(cell || "");
  const ids = [];
  const re = /[?&]id=([A-Za-z0-9_-]+)|\/d\/([A-Za-z0-9_-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    ids.push(m[1] || m[2]);
  }
  return ids;
}

// 把投稿者写的文字答案拼成「内容段落」blocks（每条非空一段，方便在编辑器里挪/删）。
export function buildBlocks({ observation, surroundings, additionalNotes, weather }) {
  const blocks = [];
  const push = (text) => {
    const t = String(text || "").trim();
    if (t) blocks.push({ type: "text", text: t });
  };
  push(observation);
  push(surroundings);
  push(additionalNotes);
  const w = String(weather || "").trim();
  if (w && !/覚えていない|don'?t remember/i.test(w)) {
    blocks.push({ type: "text", text: `（投稿者记忆的天气 / Weather as recalled: ${w}）` });
  }
  return blocks;
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(sheetArg) {
  if (sheetArg) {
    return { sheetId: sheetArg, sheetRange: "A1:ZZ100000" };
  }
  if (!(await pathExists(CONFIG_PATH))) {
    throw new Error(
      "缺少 scripts/submissions.config.json。请写上你的表格 ID，例如：\n" +
        '{ "sheetId": "Google 表格网址里 /d/ 后那串", "sheetRange": "A1:ZZ100000" }',
    );
  }
  const cfg = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  if (!cfg.sheetId) {
    throw new Error("submissions.config.json 里缺少 sheetId。");
  }
  return { sheetId: cfg.sheetId, sheetRange: cfg.sheetRange || "A1:ZZ100000" };
}

export async function loadState() {
  if (await pathExists(STATE_PATH)) {
    try {
      return JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
    } catch {
      /* 坏了当空 */
    }
  }
  return { importedKeys: [], log: [] };
}

export async function saveState(state) {
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

// 连 Google，返回 sheets + drive 客户端。
export async function getClients() {
  const auth = await getAuthorizedClient();
  return {
    sheets: google.sheets({ version: "v4", auth }),
    drive: google.drive({ version: "v3", auth }),
  };
}

// 读表格 → 解析成投稿对象数组。imported 标记哪些已导入过。
export async function listSubmissions(clients, config, state) {
  const resp = await clients.sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: config.sheetRange,
  });
  const rows = resp.data.values || [];
  if (rows.length < 2) {
    return { headers: rows[0] || [], cols: {}, submissions: [] };
  }
  const headers = rows[0];
  const cols = {};
  for (const [key, kws] of Object.entries(COLUMN_KEYWORDS)) {
    cols[key] = findColumn(headers, kws);
  }
  if (cols.mainPhoto < 0) {
    throw new Error("没在表头里认出「照片上传」那一列。请确认表格是这个表单关联的回答表。");
  }
  const importedSet = new Set(state.importedKeys);
  const cell = (row, key) => (cols[key] >= 0 ? String(row[cols[key]] ?? "").trim() : "");

  const submissions = [];
  rows.slice(1).forEach((row, index) => {
    const mainPhotoIds = extractDriveIds(cell(row, "mainPhoto"));
    if (mainPhotoIds.length === 0) {
      return; // 没照片跳过（照片必填，正常不会有）
    }
    const key = mainPhotoIds[0];
    submissions.push({
      rowKey: key, // 用主图 Drive 文件 id 当唯一标识
      rowIndex: index,
      timestamp: cell(row, "timestamp"),
      submitter: cell(row, "contributor"),
      dateFound: cell(row, "dateFound"),
      location: cell(row, "location"),
      observation: cell(row, "observation"),
      surroundings: cell(row, "surroundings"),
      additionalNotes: cell(row, "additionalNotes"),
      weather: cell(row, "weather"),
      mainPhotoIds,
      additionalPhotoIds: extractDriveIds(cell(row, "additionalPhoto")),
      imported: importedSet.has(key),
    });
  });
  return { headers, cols, submissions };
}

const MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

// 拿一张 Drive 文件：返回 buffer + mime + name + 扩展名。
export async function fetchDrivePhoto(clients, fileId) {
  let name = "";
  let mime = "";
  try {
    const meta = await clients.drive.files.get({ fileId, fields: "name,mimeType" });
    name = meta.data.name || "";
    mime = meta.data.mimeType || "";
  } catch {
    /* 拿不到元信息也继续下载 */
  }
  const res = await clients.drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  const chunks = [];
  await new Promise((resolve, reject) => {
    res.data.on("data", (c) => chunks.push(c));
    res.data.on("end", resolve);
    res.data.on("error", reject);
  });
  const ext = path.extname(name).toLowerCase() || MIME_EXT[mime] || ".jpg";
  return { buffer: Buffer.concat(chunks), name, mime, ext };
}

function isHeicExt(ext) {
  return /\.(heic|heif)$/i.test(ext || "");
}

async function nextFolderId(dateStr, usedThisRun) {
  const pendingDir = path.join(recordsRoot, PENDING_CATEGORY);
  let existing = [];
  try {
    existing = await fs.readdir(pendingDir);
  } catch {
    /* 还不存在 */
  }
  const prefix = `form_${dateStr}_`;
  let n = 1;
  while (existing.includes(`${prefix}${n}`) || usedThisRun.has(`${prefix}${n}`)) {
    n += 1;
  }
  const id = `${prefix}${n}`;
  usedThisRun.add(id);
  return id;
}

export async function nextSourceIndexStart() {
  let max = 0;
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.name === "record.json") {
        try {
          const rec = await readRecordFile(full);
          if (typeof rec.sourceIndex === "number" && rec.sourceIndex > max) max = rec.sourceIndex;
        } catch {
          /* 跳过坏文件 */
        }
      }
    }
  }
  await walk(recordsRoot);
  return max + 1;
}

export function yyyymmdd(timestampCell) {
  const d = new Date(String(timestampCell || "").replace(/\./g, "/"));
  const use = Number.isNaN(d.getTime()) ? new Date() : d;
  const y = use.getFullYear();
  const m = String(use.getMonth() + 1).padStart(2, "0");
  const day = String(use.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// 把一条投稿生成成 record（下载照片、写 record.json、更新去重状态）。
// overrides：编辑器收件箱里用户改过的字段 + 坐标。CLI 不传就用投稿原值。
// 返回 { id, dir, heicCount }。不在这里 rebuild（调用方决定何时重建）。
export async function importSubmission(clients, submission, overrides = {}, ctx = {}) {
  const usedThisRun = ctx.usedThisRun || new Set();
  const sourceIndex = typeof ctx.sourceIndex === "number" ? ctx.sourceIndex : await nextSourceIndexStart();

  const timestamp = overrides.timestamp ?? submission.timestamp ?? "";
  const dateStr = yyyymmdd(timestamp);
  const id = await nextFolderId(dateStr, usedThisRun);
  const recordDir = path.join(recordsRoot, PENDING_CATEGORY, id);
  await fs.mkdir(recordDir, { recursive: true });

  const allIds = [...(submission.mainPhotoIds || []), ...(submission.additionalPhotoIds || [])];
  const mediaHints = [];
  let heicCount = 0;
  for (let i = 0; i < allIds.length; i += 1) {
    const { buffer, ext } = await fetchDrivePhoto(clients, allIds[i]);
    const filename = i === 0 ? `${id}${ext}` : `${id}_${i + 1}${ext}`;
    const destAbs = path.join(recordDir, filename);
    await fs.writeFile(destAbs, buffer);
    if (isHeicExt(ext)) {
      heicCount += 1;
    } else if (isDerivableImage(filename)) {
      try {
        await generateDerivatives(destAbs);
      } catch {
        /* 缩略图失败不影响导入 */
      }
    }
    mediaHints.push({ file: filename, role: i === 0 ? "primary" : "detail" });
  }

  // 内容段落：收件箱可能传来用户改过的整段文字（blocksText，按空行分段）；否则用投稿原答案拼。
  let blocks;
  if (typeof overrides.blocksText === "string") {
    blocks = overrides.blocksText
      .split(/\n{2,}/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ type: "text", text }));
  } else {
    blocks = buildBlocks(submission);
  }

  const coords =
    overrides.coords && typeof overrides.coords.lat === "number" && typeof overrides.coords.lng === "number"
      ? { lat: overrides.coords.lat, lng: overrides.coords.lng }
      : null;

  const record = {
    schemaVersion: 1,
    sourceIndex,
    locationText: overrides.locationText ?? submission.location ?? "",
    locationLevels: [],
    photoCoordinates: null,
    locationCoordinates: coords,
    photoTime: "",
    time: overrides.time ?? submission.dateFound ?? "",
    title: { ja: "", en: "" },
    displayId: "",
    umbrellaType: "",
    umbrellaColor: "",
    umbrellaCount: "",
    umbrellaUnits: [],
    editFlag: "",
    linkedId: "",
    submissionType: "contributed",
    submitter: overrides.submitter ?? submission.submitter ?? "",
    submissionChannel: "Google 表单",
    submissionTime: timestamp,
    submitterNote: "",
    remarks: "",
    locationApprox: true,
    timeApprox: true,
    blurApprox: false,
    approxZoom: "",
    blurLabel: "",
    story: blocks.map((b) => b.text).join("\n\n"),
    blocks,
    weather: null,
    media: mediaHints,
  };

  const recordPath = path.join(recordDir, "record.json");
  const merged = await mergeRecordMediaWithFolder(recordPath, record);
  await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
  return { id, dir: recordDir, heicCount };
}

// 记一条已导入（去重）。
export function markImported(state, submission, meta = {}) {
  if (!state.importedKeys.includes(submission.rowKey)) {
    state.importedKeys.push(submission.rowKey);
  }
  state.log = state.log || [];
  state.log.push({
    id: meta.id,
    key: submission.rowKey,
    at: new Date().toISOString(),
    contributor: submission.submitter,
    location: submission.location,
    heic: meta.heicCount || 0,
  });
}

// 重建 data/umbrellas.json。
export function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(here, "build-umbrellas.mjs")], {
      cwd: rootDir,
      stdio: "inherit",
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`build 退出码 ${code}`))));
  });
}
