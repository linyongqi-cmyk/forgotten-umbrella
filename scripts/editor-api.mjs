// Local-only editing backend for the admin editor.
//
// This module is loaded on demand by server.js to handle /api/* requests.
// It writes changes back to the canonical filebox/records/<id>/record.json
// (preserving the Chinese comment template) and then regenerates
// data/umbrellas.json by running the existing build script.
//
// It is intended to run ONLY on the local machine. server.js additionally
// guards these routes so they never respond to non-localhost callers.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mergeRecordMediaWithFolder,
  readRecordFile,
  stringifyRecordWithComments,
} from "./record-utils.mjs";
import { parseExif } from "./exif.mjs";
import { fetchWeatherData } from "./weather.mjs";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordsRoot = path.join(rootDir, "filebox", "records");
// 用户「修改记录」撤回功能：删除的标点先移到这里（软删除），需要时可原位恢复；
// 图片一并保留。gitignore 掉，不进仓库。
const trashRoot = path.join(rootDir, "filebox", ".trash");
const buildScript = path.join(rootDir, "scripts", "build-umbrellas.mjs");
const textsPath = path.join(rootDir, "data", "texts.json");
const siteSettingsPath = path.join(rootDir, "data", "site-settings.json");

// Plain text fields the editor is allowed to overwrite. (title is handled
// separately because it is now bilingual { ja, en }.)
const TEXT_FIELDS = ["locationText", "time", "umbrellaType", "story"];

// A bilingual field: accepts { ja, en } or a legacy plain string (-> ja slot).
function sanitizeBilingual(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ja: String(value.ja ?? "").trim(), en: String(value.en ?? "").trim() };
  }
  return { ja: String(value ?? "").trim(), en: "" };
}

const COUNT_VALUES = new Set(["1", "2", "3", "4", "5", "unknown", ""]);
const COLOR_VALUES = new Set(["transparent", "translucent", "colored", "patterned", "other", "unknown", ""]);
const KIND_VALUES = new Set(["folding", "long umbrella", "unknown", ""]);
const STATUS_VALUES = new Set(["fastened", "unfastened", "broken", "worn", "deteriorated", "unknown", "other"]);

function sanitizeCount(value) {
  const text = String(value ?? "");
  return COUNT_VALUES.has(text) ? text : "";
}

function sanitizeUnits(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 5).map((unit) => ({
    color: COLOR_VALUES.has(unit?.color) ? unit.color : "",
    colorDetail: typeof unit?.colorDetail === "string" ? unit.colorDetail : "",
    kind: KIND_VALUES.has(unit?.kind) ? unit.kind : "",
    status: sanitizeStatus(unit?.status),
    statusOther: typeof unit?.statusOther === "string" ? unit.statusOther : "",
  }));
}

function sanitizeStatus(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  return value.filter((item) => STATUS_VALUES.has(item) && !seen.has(item) && seen.add(item));
}

// Detail-page content blocks: ordered text paragraphs and photo references.
function sanitizeBlocks(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const blocks = [];
  for (const block of value) {
    if (block?.type === "text" || block?.type === "dialogue") {
      const text = sanitizeBilingual(block.text);
      if (text.ja || text.en) {
        blocks.push({ type: block.type, text });
      }
    } else if (block?.type === "photo" && typeof block.file === "string" && block.file) {
      blocks.push({ type: "photo", file: path.basename(block.file) });
    }
  }
  return blocks;
}

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function getRecordFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return getRecordFiles(fullPath);
      }
      return entry.name === "record.json" ? [fullPath] : [];
    }),
  );
  return files.flat();
}

// Resolve a record id (= its folder name) to its record.json path, making sure
// the result stays safely inside filebox/records.
async function findRecordPathById(id) {
  const files = await getRecordFiles(recordsRoot);
  const match = files.find((file) => path.basename(path.dirname(file)) === id);
  if (!match) {
    return null;
  }
  const resolved = path.resolve(match);
  if (!resolved.startsWith(recordsRoot)) {
    throw new ApiError(400, "Resolved path escaped the records folder.");
  }
  return resolved;
}

function sanitizeCoordinates(value) {
  if (value === null) {
    return null;
  }
  if (!value || typeof value !== "object") {
    return undefined; // leave the field untouched
  }
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

function sanitizeLevels(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
}

async function rebuildDatabase() {
  await execFileAsync(process.execPath, [buildScript], { cwd: rootDir });
}

// Save edited fields for a single record, then rebuild data/umbrellas.json.
export async function saveRecord(payload) {
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  if (!id) {
    throw new ApiError(400, "Missing record id.");
  }

  const recordPath = await findRecordPathById(id);
  if (!recordPath) {
    throw new ApiError(404, `No record found for id "${id}".`);
  }

  const record = await readRecordFile(recordPath);
  // 用户「修改记录」：把改动前的完整 record.json 快照返回给前端，作为「撤回」基线
  // （撤回时原样写回）。深拷贝，避免后续原地修改污染。
  const previous = JSON.parse(JSON.stringify(record));

  for (const field of TEXT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      record[field] = String(payload[field] ?? "");
    }
  }

  // Bilingual title { ja, en } (accepts a legacy string too).
  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    record.title = sanitizeBilingual(payload.title);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "locationLevels")) {
    record.locationLevels = sanitizeLevels(payload.locationLevels);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "umbrellaCount")) {
    record.umbrellaCount = sanitizeCount(payload.umbrellaCount);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "umbrellaUnits")) {
    record.umbrellaUnits = sanitizeUnits(payload.umbrellaUnits);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "blocks")) {
    record.blocks = sanitizeBlocks(payload.blocks);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "editFlag")) {
    record.editFlag = ["yellow", "black", "white"].includes(payload.editFlag) ? payload.editFlag : "";
  }

  // Optional hyperlink to another point (just its id; empty = no link).
  if (Object.prototype.hasOwnProperty.call(payload, "linkedId")) {
    record.linkedId = typeof payload.linkedId === "string" ? payload.linkedId.trim() : "";
  }

  // Submission origin (own vs contributed) + contributed-only metadata.
  if (Object.prototype.hasOwnProperty.call(payload, "submissionType")) {
    record.submissionType = payload.submissionType === "contributed" ? "contributed" : "own";
  }
  for (const field of ["submitter", "submissionChannel", "submissionTime", "submitterNote", "remarks"]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      record[field] = String(payload[field] ?? "").trim();
    }
  }
  for (const field of ["locationApprox", "timeApprox", "blurApprox"]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      record[field] = Boolean(payload[field]);
    }
  }
  // T7 per-point focus zoom: store as a number, or "" to clear (use default).
  if (Object.prototype.hasOwnProperty.call(payload, "approxZoom")) {
    const z = Number(payload.approxZoom);
    record.approxZoom = payload.approxZoom !== "" && Number.isFinite(z) ? z : "";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "blurLabel")) {
    record.blurLabel = String(payload.blurLabel ?? "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, "locationCoordinates")) {
    const coords = sanitizeCoordinates(payload.locationCoordinates);
    if (coords !== undefined) {
      record.locationCoordinates = coords;
    }
  }

  // Per-photo metadata + ordering + primary choice come from the editor.
  if (Array.isArray(payload.media)) {
    record.media = applyMediaMetadata(record.media, payload.media);
  }

  // Keep the media list consistent with the files actually on disk.
  const merged = await mergeRecordMediaWithFolder(recordPath, record);
  await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
  await rebuildDatabase();

  return { ok: true, id, media: merged.media, previous };
}

const MEDIA_ROLES = new Set(["primary", "supplement", "detail", "illustration"]);

// Merge editor-supplied media metadata onto the existing entries, keeping the
// editor's order. Anything missing falls back to the stored value.
function applyMediaMetadata(existing, incoming) {
  const existingByFile = new Map(
    (Array.isArray(existing) ? existing : []).filter((item) => item?.file).map((item) => [item.file, item]),
  );
  return incoming
    .filter((item) => item && typeof item.file === "string")
    .map((item) => {
      const file = path.basename(item.file);
      const prev = existingByFile.get(file) || {};
      const role = typeof item.role === "string" && MEDIA_ROLES.has(item.role) ? item.role : prev.role || "detail";
      return {
        id: typeof item.id === "string" && item.id ? item.id : prev.id || "",
        file,
        role,
        title: typeof item.title === "string" ? item.title : prev.title || "",
        photoTime: typeof item.photoTime === "string" ? item.photoTime : prev.photoTime || "",
        story: typeof item.story === "string" ? item.story : prev.story || "",
        legacyThumb: prev.legacyThumb || "",
        // 非破坏性裁剪；editor 传 null/对象，缺省沿用旧值。
        crop: Object.prototype.hasOwnProperty.call(item, "crop") ? sanitizeCrop(item.crop) : prev.crop ?? null,
        // 天气：编辑器不回传 weather 本体（由「获取天气」接口写），保存时沿用旧值。
        weather: prev.weather ?? null,
        // 「显示天气」勾选框：editor 回传布尔就用它，否则沿用旧值（主图默认显示）。
        showWeather:
          typeof item.showWeather === "boolean"
            ? item.showWeather
            : typeof prev.showWeather === "boolean"
              ? prev.showWeather
              : role === "primary",
      };
    });
}

// Crop = { aspect, scale, posX, posY } or null (原图). Numbers are clamped.
const CROP_ASPECTS = new Set(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"]);
function sanitizeCrop(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  // "custom" = 自由比例 (user-dragged box ratio, stored in ar). "free" = 原图.
  const aspect = value.aspect === "custom" ? "custom" : CROP_ASPECTS.has(value.aspect) ? value.aspect : "free";
  const scale = Number.isFinite(value.scale) ? Math.min(4, Math.max(1, value.scale)) : 1;
  const posX = Number.isFinite(value.posX) ? Math.min(100, Math.max(0, value.posX)) : 50;
  const posY = Number.isFinite(value.posY) ? Math.min(100, Math.max(0, value.posY)) : 50;
  // No real crop (original aspect, no zoom, centered) → store null to keep records clean.
  if (aspect === "free" && scale === 1 && posX === 50 && posY === 50) {
    return null;
  }
  const out = { aspect, scale, posX, posY };
  // "free" keeps the natural aspect ratio; "custom" keeps the chosen box ratio — both
  // need `ar` so the site can render the crop box.
  if ((aspect === "free" || aspect === "custom") && Number.isFinite(value.ar) && value.ar > 0) {
    out.ar = value.ar;
  }
  return out;
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || "")).replace(/[^A-Za-z0-9._-]/g, "_");
  if (!base || base === "." || base === ".." || base.startsWith(".")) {
    throw new ApiError(400, "Invalid filename.");
  }
  return base;
}

// A category is the whole folder name, e.g. "hookable(affordance)" or "unknown".
function sanitizeCategory(name) {
  const raw = String(name || "unknown").trim();
  if (!/^[A-Za-z0-9 _()-]+$/.test(raw) || raw.includes("..")) {
    return "unknown";
  }
  return raw;
}

function decodeImageData(dataBase64) {
  if (typeof dataBase64 !== "string" || !dataBase64) {
    throw new ApiError(400, "Missing image data.");
  }
  const comma = dataBase64.indexOf(",");
  const raw = dataBase64.startsWith("data:") && comma >= 0 ? dataBase64.slice(comma + 1) : dataBase64;
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length) {
    throw new ApiError(400, "Image data could not be decoded.");
  }
  return buffer;
}

async function rewriteAndRebuild(recordPath) {
  const record = await readRecordFile(recordPath);
  const merged = await mergeRecordMediaWithFolder(recordPath, record);
  await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
  await rebuildDatabase();
  return merged;
}

// Add (or replace) an image file inside an existing record folder.
export async function uploadImage(payload) {
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  const recordPath = id ? await findRecordPathById(id) : null;
  if (!recordPath) {
    throw new ApiError(404, `No record found for id "${id}".`);
  }
  const filename = sanitizeFilename(payload.filename);
  const buffer = decodeImageData(payload.dataBase64);
  await fs.writeFile(path.join(path.dirname(recordPath), filename), buffer);

  // Seed the new image's photoTime from its EXIF so supplement/detail photos
  // show their capture time too (#4). Don't overwrite an existing value.
  const exif = parseExif(buffer);
  if (exif.dateTime) {
    const record = await readRecordFile(recordPath);
    const media = Array.isArray(record.media) ? record.media : [];
    const existing = media.find((m) => m.file === filename);
    if (existing) {
      if (!existing.photoTime) {
        existing.photoTime = exif.dateTime;
      }
    } else {
      media.push({ id: path.parse(filename).name, file: filename, role: "detail", title: "", photoTime: exif.dateTime, story: "", legacyThumb: "" });
    }
    record.media = media;
    const merged = await mergeRecordMediaWithFolder(recordPath, record);
    await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
    await rebuildDatabase();
    return { ok: true, id, file: filename, media: merged.media };
  }

  const merged = await rewriteAndRebuild(recordPath);
  return { ok: true, id, file: filename, media: merged.media };
}

// Remove an image file from a record (refuses to delete the last image).
export async function deleteImage(payload) {
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  const recordPath = id ? await findRecordPathById(id) : null;
  if (!recordPath) {
    throw new ApiError(404, `No record found for id "${id}".`);
  }
  const recordDir = path.dirname(recordPath);
  const filename = sanitizeFilename(payload.file);
  const remaining = (await fs.readdir(recordDir)).filter(
    (name) => name !== "record.json" && name !== filename,
  );
  const stillHasImage = remaining.some((name) => /\.(jpe?g|png|webp|gif|avif)$/i.test(name));
  if (!stillHasImage) {
    throw new ApiError(400, "无法删除最后一张图片：每条记录至少需要保留一张图片。");
  }
  await fs.rm(path.join(recordDir, filename), { force: true });
  const merged = await rewriteAndRebuild(recordPath);
  return { ok: true, id, media: merged.media };
}

async function nextSourceIndex() {
  const files = await getRecordFiles(recordsRoot);
  let max = -1;
  for (const file of files) {
    const record = await readRecordFile(file);
    if (Number.isInteger(record.sourceIndex) && record.sourceIndex > max) {
      max = record.sourceIndex;
    }
  }
  return max + 1;
}

// Create a brand new record folder (under filebox/records/unknown by default)
// seeded with one primary image. Optional starting coordinates put a draggable
// marker on the map so the user can position it.
export async function createRecord(payload) {
  const filename = sanitizeFilename(payload.filename);
  const id = path.parse(filename).name;
  const category = sanitizeCategory(payload.category);
  const recordDir = path.join(recordsRoot, category, id);
  const recordPath = path.join(recordDir, "record.json");
  if (!path.resolve(recordDir).startsWith(recordsRoot)) {
    throw new ApiError(400, "Resolved path escaped the records folder.");
  }
  if (await pathExists(recordDir)) {
    throw new ApiError(409, `已存在同名记录 "${id}"。请用不同文件名。`);
  }

  await fs.mkdir(recordDir, { recursive: true });
  const imageBuffer = decodeImageData(payload.dataBase64);
  await fs.writeFile(path.join(recordDir, filename), imageBuffer);

  // Pull GPS + capture time straight out of the photo's EXIF. When the photo
  // carries a real position, drop the point there; otherwise fall back to the
  // coordinates the editor sent (the current map center).
  const exif = parseExif(imageBuffer);
  const sentCoords = sanitizeCoordinates(payload.coordinates);
  const fallbackCoords = sentCoords && sentCoords !== undefined ? sentCoords : null;
  const record = {
    schemaVersion: 1,
    sourceIndex: await nextSourceIndex(),
    locationText: "",
    locationLevels: [],
    photoCoordinates: exif.coordinates || null,
    locationCoordinates: exif.coordinates || fallbackCoords,
    photoTime: exif.dateTime || "",
    time: "",
    title: { ja: "", en: "" },
    umbrellaType: "",
    umbrellaColor: "",
    umbrellaStatus: "",
    submissionType: payload.submissionType === "contributed" ? "contributed" : "own",
    submitter: typeof payload.submitter === "string" ? payload.submitter.trim() : "",
    submissionChannel: typeof payload.submissionChannel === "string" ? payload.submissionChannel.trim() : "",
    submitterNote: typeof payload.submitterNote === "string" ? payload.submitterNote.trim() : "",
    locationApprox: Boolean(payload.locationApprox),
    timeApprox: Boolean(payload.timeApprox),
    blurApprox: Boolean(payload.blurApprox),
    approxZoom: "",
    blurLabel: "",
    story: "",
    media: [{ id, file: filename, role: "primary", title: "", photoTime: "", story: "", legacyThumb: "" }],
  };
  const merged = await mergeRecordMediaWithFolder(recordPath, record);
  // 2.1：新建标点时自动抓主图天气（有坐标+时间才抓；抓不到不影响建卡）。
  await tryAutoFetchPrimaryWeather(merged);
  await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
  await rebuildDatabase();
  return { ok: true, id, coordinates: record.locationCoordinates, fromExif: Boolean(exif.coordinates) };
}

// 尽力给主图抓「拍摄前 24 小时」天气，写进主图 media.weather；任何失败都吞掉（不阻断建卡）。
async function tryAutoFetchPrimaryWeather(record) {
  try {
    const media = Array.isArray(record.media) ? record.media : [];
    const primary = media.find((m) => m?.role === "primary") || media[0];
    if (!primary) {
      return;
    }
    const coords =
      sanitizeCoordinates(record.locationCoordinates) || sanitizeCoordinates(record.photoCoordinates);
    const refTime = String(primary.photoTime || record.time || record.photoTime || "").trim();
    if (!coords || coords === undefined || !refTime) {
      return;
    }
    primary.weather = await fetchWeatherData(coords.lat, coords.lng, refTime, { hoursBefore: 24 });
  } catch {
    /* 天气抓不到不影响建卡 */
  }
}

// Delete an entire record folder — but SOFT: move it (images + record.json) into
// filebox/.trash so the「修改记录」面板可以「撤回」把它原位恢复。返回 trashKey 和
// 删除前的 record 数据（供前端历史条目显示）。
export async function deleteRecord(payload) {
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  const recordPath = id ? await findRecordPathById(id) : null;
  if (!recordPath) {
    throw new ApiError(404, `No record found for id "${id}".`);
  }
  const recordDir = path.resolve(path.dirname(recordPath));
  if (recordDir === recordsRoot || !recordDir.startsWith(recordsRoot)) {
    throw new ApiError(400, "Refusing to delete outside the records folder.");
  }
  const record = await readRecordFile(recordPath).catch(() => null);
  // Remember where it came from (category/id relative path) so undo puts it back.
  const relDir = path.relative(recordsRoot, recordDir);
  await fs.mkdir(trashRoot, { recursive: true });
  const trashKey = `${sanitizeTrashId(id)}__${Date.now()}`;
  const trashDir = path.join(trashRoot, trashKey);
  await fs.rename(recordDir, trashDir);
  await fs.writeFile(path.join(trashRoot, `${trashKey}.meta.json`), JSON.stringify({ relDir }), "utf8");
  await rebuildDatabase();
  return { ok: true, id, trashKey, record };
}

// Undo a MODIFY (or a create-then-modify): overwrite the record.json with the raw
// pre-edit snapshot the frontend kept. The folder must still exist (modify never
// removes it). Media are re-synced with the files on disk.
export async function restoreRecordData(payload) {
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  const record = payload?.record;
  if (!id || !record || typeof record !== "object") {
    throw new ApiError(400, "缺少要恢复的记录数据。");
  }
  const recordPath = await findRecordPathById(id);
  if (!recordPath) {
    throw new ApiError(404, `找不到记录「${id}」，可能已被删除。`);
  }
  const merged = await mergeRecordMediaWithFolder(recordPath, record);
  await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
  await rebuildDatabase();
  return { ok: true, id };
}

// Undo a DELETE: move the trashed folder back to its original category/id location.
export async function restoreTrashed(payload) {
  const trashKey = typeof payload?.trashKey === "string" ? payload.trashKey.trim() : "";
  if (!/^[A-Za-z0-9._()-]+__\d+$/.test(trashKey)) {
    throw new ApiError(400, "非法的回收站标识。");
  }
  const trashDir = path.join(trashRoot, trashKey);
  const metaPath = path.join(trashRoot, `${trashKey}.meta.json`);
  if (!(await pathExists(trashDir))) {
    throw new ApiError(404, "回收站里找不到它（可能已恢复或被清空）。");
  }
  let relDir = "";
  try {
    relDir = JSON.parse(await fs.readFile(metaPath, "utf8"))?.relDir || "";
  } catch {
    /* meta missing */
  }
  if (!relDir) {
    throw new ApiError(500, "缺少恢复位置信息，无法自动恢复。");
  }
  const targetDir = path.resolve(path.join(recordsRoot, relDir));
  if (!targetDir.startsWith(recordsRoot)) {
    throw new ApiError(400, "恢复路径非法。");
  }
  if (await pathExists(targetDir)) {
    throw new ApiError(409, "已存在同名记录，无法恢复。");
  }
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.rename(trashDir, targetDir);
  await fs.rm(metaPath, { force: true });
  await rebuildDatabase();
  return { ok: true };
}

// A record id used inside a trash folder name — keep it filesystem-safe. (The id
// itself is already constrained, but a contributed id can contain parentheses.)
function sanitizeTrashId(id) {
  return String(id).replace(/[^A-Za-z0-9._()-]/g, "_") || "record";
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

// Move a record into a different category folder (keeps the same id).
export async function moveRecord(payload) {
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  const recordPath = id ? await findRecordPathById(id) : null;
  if (!recordPath) {
    throw new ApiError(404, `No record found for id "${id}".`);
  }
  const category = sanitizeCategory(payload.category);
  const currentDir = path.resolve(path.dirname(recordPath));
  const targetDir = path.resolve(path.join(recordsRoot, category, id));
  if (!targetDir.startsWith(recordsRoot)) {
    throw new ApiError(400, "Resolved path escaped the records folder.");
  }
  if (targetDir === currentDir) {
    return { ok: true, id, category };
  }
  if (await pathExists(targetDir)) {
    throw new ApiError(409, `分类 "${category}" 下已存在同名记录 "${id}"。`);
  }
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.rename(currentDir, targetDir);
  await rebuildDatabase();
  return { ok: true, id, category };
}

// 用户 T3 天气联动（v127 改成按「每张图」抓）：点某张图的「获取天气」时调用。
// 坐标用记录级 (locationCoordinates 优先，退回 photoCoordinates)——单张图没有自己的坐标；
// 时间用「这张图自己的 photoTime 优先，退回记录 time/photoTime」。
// 主图抓「拍摄前 24 小时」逐时（画横轴）；补充/细节图只抓拍摄当时 1 点（单个图例）。
// 写进 该 media.weather 再重建。payload.mediaId 指定哪张（缺省=主图）；clear 清这张。
export async function fetchWeather(payload) {
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  if (!id) {
    throw new ApiError(400, "Missing record id.");
  }
  const recordPath = await findRecordPathById(id);
  if (!recordPath) {
    throw new ApiError(404, `No record found for id "${id}".`);
  }
  const record = await readRecordFile(recordPath);
  const mediaList = Array.isArray(record.media) ? record.media : [];
  const mediaId = typeof payload?.mediaId === "string" ? payload.mediaId.trim() : "";
  const target = mediaId
    ? mediaList.find((m) => m?.id === mediaId || m?.file === mediaId)
    : mediaList.find((m) => m?.role === "primary") || mediaList[0];
  if (!target) {
    throw new ApiError(404, mediaId ? `找不到这张图（${mediaId}）。` : "这条记录没有图片。");
  }

  const persist = async () => {
    const merged = await mergeRecordMediaWithFolder(recordPath, record);
    await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
    await rebuildDatabase();
  };

  if (payload?.clear) {
    target.weather = null;
    await persist();
    return { ok: true, id, mediaId: target.id, weather: null };
  }

  const coords =
    sanitizeCoordinates(record.locationCoordinates) || sanitizeCoordinates(record.photoCoordinates);
  if (!coords || coords === undefined) {
    throw new ApiError(400, "这条记录没有坐标，先在地图上给它定个位置再抓天气。");
  }
  const refTime = String(target.photoTime || record.time || record.photoTime || "").trim();
  if (!refTime) {
    throw new ApiError(400, "这张图没有拍摄时间，无法查当时的天气。");
  }
  const hoursBefore = target.role === "primary" ? 24 : 0;

  let weather;
  try {
    weather = await fetchWeatherData(coords.lat, coords.lng, refTime, { hoursBefore });
  } catch (err) {
    throw new ApiError(502, err?.message || "抓取天气失败。");
  }
  target.weather = weather;
  await persist();
  return { ok: true, id, mediaId: target.id, weather };
}

// Save the editable UI copy (type descriptions + stats intro) to data/texts.json
// (item 12). This is the canonical source the frontend fetches; no rebuild needed.
function sanitizeParas(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((p) => String(p ?? "").trim()).filter(Boolean);
}

function sanitizeAboutSection(value) {
  return {
    titleJa: String(value?.titleJa ?? "").trim(),
    titleEn: String(value?.titleEn ?? "").trim(),
    bodyJa: sanitizeParas(value?.bodyJa),
    bodyEn: sanitizeParas(value?.bodyEn),
  };
}

export async function saveTexts(payload) {
  const statsIntro = {
    ja: String(payload?.statsIntro?.ja ?? "").trim(),
    en: String(payload?.statsIntro?.en ?? "").trim(),
  };
  const about = {
    section1: sanitizeAboutSection(payload?.about?.section1),
    section2: sanitizeAboutSection(payload?.about?.section2),
  };
  const typeDescriptions = {};
  const incoming = payload?.typeDescriptions;
  if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
    for (const [key, value] of Object.entries(incoming)) {
      // Keep folder-style type keys only (e.g. "hookable(affordance)"); reject
      // anything with path characters so we never write surprising keys.
      if (!/^[A-Za-z0-9 _()-]+$/.test(key)) {
        continue;
      }
      typeDescriptions[key] = { ja: sanitizeParas(value?.ja), en: sanitizeParas(value?.en) };
    }
  }
  const out = { statsIntro, typeDescriptions, about };
  await fs.writeFile(textsPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  return { ok: true };
}

// Save the tunable site settings (focus-blur params + the three map-label filter
// sets) to data/site-settings.json. This is the online source of truth — the local
// map/blur panels POST here whenever the user tweaks a slider, so tuning goes live on
// the next push. We sanitize hard: only known keys, known vis values, numeric-or-blank
// zoom fields, so a corrupt POST can never write surprising JSON.
const SITE_MAP_KEYS = ["roadmap", "sat1", "sat2"];
const SITE_CATEGORY_KEYS = [
  "poiLabels", "poiIcons", "poiBusiness", "poiPark", "poiAttraction",
  "roadLabels", "roadGeometry", "highway", "transit", "transitLabels",
  "administrative", "waterLabels", "landscape",
];
const SITE_VIS_VALUES = ["auto", "show", "fade", "hide"];
const SITE_BLUR_KEYS = [
  "blurN", "radiusN", "featherN", "blurA", "radiusA", "featherA", "veilA",
  "labelDistanceA", "labelRotateA",
];

function sanitizeZoomField(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

function sanitizeCategorySet(raw) {
  const out = {};
  for (const key of SITE_CATEGORY_KEYS) {
    const c = raw && typeof raw === "object" ? raw[key] : null;
    const vis = SITE_VIS_VALUES.includes(c?.vis) ? c.vis : "auto";
    out[key] = { vis, zoom: sanitizeZoomField(c?.zoom), zoomMax: sanitizeZoomField(c?.zoomMax) };
  }
  return out;
}

export async function saveSiteSettings(payload) {
  const blur = {};
  const rawBlur = payload && typeof payload.blur === "object" ? payload.blur : {};
  for (const key of SITE_BLUR_KEYS) {
    const n = Number(rawBlur[key]);
    if (Number.isFinite(n)) {
      blur[key] = n;
    }
  }
  const mapLayers = {};
  const rawMap = payload && typeof payload.mapLayers === "object" ? payload.mapLayers : {};
  for (const mapKey of SITE_MAP_KEYS) {
    mapLayers[mapKey] = sanitizeCategorySet(rawMap[mapKey]);
  }
  const out = { blur, mapLayers };
  await fs.writeFile(siteSettingsPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  return { ok: true };
}

// Single entry point used by server.js. Returns a plain JSON-serializable object.
export async function handleEditorApi(pathname, payload) {
  switch (pathname) {
    case "/api/save-record":
      return saveRecord(payload);
    case "/api/save-texts":
      return saveTexts(payload);
    case "/api/save-site-settings":
      return saveSiteSettings(payload);
    case "/api/upload-image":
      return uploadImage(payload);
    case "/api/delete-image":
      return deleteImage(payload);
    case "/api/create-record":
      return createRecord(payload);
    case "/api/delete-record":
      return deleteRecord(payload);
    case "/api/restore-record-data":
      return restoreRecordData(payload);
    case "/api/restore-trashed":
      return restoreTrashed(payload);
    case "/api/move-record":
      return moveRecord(payload);
    case "/api/fetch-weather":
      return fetchWeather(payload);
    default:
      throw new ApiError(404, `Unknown editor endpoint: ${pathname}`);
  }
}

export { ApiError };
