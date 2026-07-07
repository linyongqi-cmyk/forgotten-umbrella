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
  isImageFile,
  isVideoFile,
} from "./record-utils.mjs";
import { parseExif } from "./exif.mjs";
import { fetchWeatherData } from "./weather.mjs";
import { generateDerivatives, removeDerivatives, isDerivableImage, isDerivativeFile } from "./image-derivatives.mjs";
import {
  loadConfig as loadSubmissionsConfig,
  loadState as loadSubmissionsState,
  saveState as saveSubmissionsState,
  getClients as getSubmissionClients,
  listSubmissions,
  fetchDrivePhoto,
  importSubmission,
  markImported,
  nextFolderId,
  yyyymmdd,
  PENDING_CATEGORY,
} from "./submissions-core.mjs";

// 新增/替换图片后，就地生成缩略图 + 网页版 webp（失败不阻断保存，只记日志）。
async function makeDerivatives(absImagePath) {
  if (!isDerivableImage(absImagePath)) {
    return;
  }
  try {
    await generateDerivatives(absImagePath, { force: true });
  } catch (err) {
    console.error(`[derivatives] 生成失败 ${absImagePath}: ${err.message}`);
  }
}

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordsRoot = path.join(rootDir, "filebox", "records");
// 用户「修改记录」撤回功能：删除的标点先移到这里（软删除），需要时可原位恢复；
// 图片一并保留。gitignore 掉，不进仓库。
const trashRoot = path.join(rootDir, "filebox", ".trash");
const buildScript = path.join(rootDir, "scripts", "build-umbrellas.mjs");
const textsPath = path.join(rootDir, "data", "texts.json");
const siteSettingsPath = path.join(rootDir, "data", "site-settings.json");
const themePath = path.join(rootDir, "data", "theme.json");
const markerSettingsPath = path.join(rootDir, "data", "marker-settings.json");

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

  // 对外显示名（替换页面上显示的 ID；不动文件夹/文件名，空=显示原文件名）。
  if (Object.prototype.hasOwnProperty.call(payload, "displayId")) {
    record.displayId = typeof payload.displayId === "string" ? payload.displayId.trim() : "";
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

// 后端最终把关：只允许能在网页里正常显示的格式。防止 HEIC 等浏览器打不开的文件混进来
// （HEIC 曾让整站构建崩掉）。前端也会先拦一道，这里是兜底，谁都绕不过去。
const ALLOWED_IMAGE_HINT = "jpg / jpeg / png / webp / gif / avif";
const ALLOWED_VIDEO_HINT = "mp4 / mov / webm / m4v";

function assertImageFilename(filename) {
  if (!isImageFile(filename)) {
    throw new ApiError(400, `不支持的图片格式「${filename}」。主图只能是：${ALLOWED_IMAGE_HINT}（HEIC 等请先转成 jpg）。`);
  }
}

function assertMediaFilename(filename) {
  if (!isImageFile(filename) && !isVideoFile(filename)) {
    throw new ApiError(400, `不支持的文件格式「${filename}」。图片：${ALLOWED_IMAGE_HINT}；视频：${ALLOWED_VIDEO_HINT}（HEIC 等请先转成 jpg）。`);
  }
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
  assertMediaFilename(filename); // 追加的媒体：图片或视频，其它一律拒绝
  const buffer = decodeImageData(payload.dataBase64);
  const savedImagePath = path.join(path.dirname(recordPath), filename);
  await fs.writeFile(savedImagePath, buffer);
  await makeDerivatives(savedImagePath); // 自动生成缩略图 + 网页版

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
  // 只数真正的原图，别把 .thumb.webp / .web.webp 生成物算进去（否则删掉最后一张
  // 原图后残留的生成物会让程序误以为还有图片）。
  const stillHasImage = remaining.some(
    (name) => /\.(jpe?g|png|webp|gif|avif)$/i.test(name) && !isDerivativeFile(name),
  );
  if (!stillHasImage) {
    throw new ApiError(400, "无法删除最后一张图片：每条记录至少需要保留一张图片。");
  }
  await fs.rm(path.join(recordDir, filename), { force: true });
  await removeDerivatives(path.join(recordDir, filename)); // 连带删掉缩略图 + 网页版
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
  assertImageFilename(filename); // 新建标点的主图必须是能显示的图片格式
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
  const createdImagePath = path.join(recordDir, filename);
  await fs.writeFile(createdImagePath, imageBuffer);
  await makeDerivatives(createdImagePath); // 自动生成缩略图 + 网页版

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

// Save the visual theme (icon stroke width + detail-page 4-category font size/line
// height/weight) to data/theme.json. Only these known numeric keys, each clamped to a
// safe range, so a bad POST can never write surprising values. v154: 详情正文拆成
// overlay(主图浮字)/dialogue(对话)/para(段落)/id(ID) 四类，每类 size/line/weight。
const SIZE_C = { min: 10, max: 24 };
const LINE_C = { min: 1, max: 2.2 };
const WEIGHT_C = { min: 300, max: 700 };
const THEME_CLAMP = {
  iconStroke: { min: 1, max: 3, def: 1.8 },
  overlaySize: { ...SIZE_C, def: 13 },
  overlayLine: { ...LINE_C, def: 1.45 },
  overlayWeight: { ...WEIGHT_C, def: 400 },
  overlayGap: { min: 0, max: 30, def: 5 },
  dialogueSize: { ...SIZE_C, def: 13 },
  dialogueLine: { ...LINE_C, def: 1.45 },
  dialogueWeight: { ...WEIGHT_C, def: 400 },
  dialogueGap: { min: 0, max: 30, def: 5 },
  paraSize: { ...SIZE_C, def: 13 },
  paraLine: { ...LINE_C, def: 1.45 },
  paraWeight: { ...WEIGHT_C, def: 400 },
  paraGap: { min: 0, max: 30, def: 8 },
  idSize: { min: 12, max: 32, def: 20 },
  idLine: { ...LINE_C, def: 1.2 },
  idWeight: { min: 300, max: 800, def: 600 },
  // 任务6：手机端详情抽屉手势参数（范围要和 app.js THEME_RANGES 对齐，否则保存会被抹掉）。
  sheetFollow: { min: 0.5, max: 1.5, def: 1.0 },
  sheetSnapRatio: { min: 0.1, max: 0.5, def: 0.28 },
  sheetExitRatio: { min: 0.1, max: 0.5, def: 0.22 },
  sheetSnapMs: { min: 120, max: 700, def: 300 },
  sheetExitMs: { min: 120, max: 700, def: 260 },
  sheetInertia: { min: 0, max: 300, def: 120 },
  sheetExitFade: { min: 0, max: 0.8, def: 0.2 },
};

export async function saveTheme(payload) {
  const out = {};
  for (const [key, r] of Object.entries(THEME_CLAMP)) {
    const n = Number(payload?.[key]);
    out[key] = Number.isFinite(n) ? Math.min(Math.max(n, r.min), r.max) : r.def;
  }
  await fs.writeFile(themePath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  return { ok: true };
}

const MARKER_CATS = ["own", "own-title", "contrib", "contrib-story", "contrib-blurred"];
const MARKER_LINE_KEYS = ["line1", "line2", "line3"];
const MARKER_REGION_KEYS = ["region1", "region2", "region3"];
const DEFAULT_MARKER_SVG_TEXT = "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/></svg>";
const DEFAULT_MARKER_COLORS_API = {
  own: "#d95d42",
  "own-title": "#982a1f",
  contrib: "#2f9e67",
  "contrib-story": "#1f6d43",
  "contrib-blurred": "#7f8f9c",
};

function cleanMarkerSvg(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  if (!text.startsWith("<svg")) return fallback;
  return text.slice(0, 120000);
}

function cleanMarkerColor(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  if (/^#[0-9a-f]{6}$/i.test(text) || /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(text)) {
    return text;
  }
  return fallback;
}

export async function saveMarkerSettings(payload) {
  const stroke = Number(payload?.strokeWidth);
  const out = {
    svg: cleanMarkerSvg(payload?.svg, DEFAULT_MARKER_SVG_TEXT),
    strokeWidth: Number.isFinite(stroke) ? Math.min(Math.max(stroke, 0.5), 8) : 1.2,
    regionOpacity: {},
    categories: {},
    states: payload?.states && typeof payload.states === "object" ? payload.states : { normal: {}, listSelected: {}, focused: {} },
  };
  for (const key of MARKER_REGION_KEYS) {
    const n = Number(payload?.regionOpacity?.[key]);
    out.regionOpacity[key] = Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0;
  }
  for (const cat of MARKER_CATS) {
    const source = payload?.categories?.[cat] || {};
    const fallback = DEFAULT_MARKER_COLORS_API[cat] || "#000000";
    out.categories[cat] = { svg: cleanMarkerSvg(source.svg, ""), lineColors: {}, regionColors: {} };
    for (const key of MARKER_LINE_KEYS) {
      out.categories[cat].lineColors[key] = cleanMarkerColor(source.lineColors?.[key], fallback);
    }
    for (const key of MARKER_REGION_KEYS) {
      out.categories[cat].regionColors[key] = cleanMarkerColor(source.regionColors?.[key], fallback);
    }
  }
  await fs.writeFile(markerSettingsPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
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

// ── 投稿收件箱（只对本机）：列出 Google 表单投稿 / 预览照片 / 导入成正式标点 ──

// 某条投稿（rowKey）曾导入成哪个文件夹 id：从去重日志里取最后一条。
function importedIdForKey(state, rowKey) {
  const log = Array.isArray(state.log) ? state.log : [];
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i] && log[i].key === rowKey && log[i].id) {
      return log[i].id;
    }
  }
  return "";
}

// 对账（用户 1.4）：已标记「已导入」但对应 record 文件夹已被用户删除的，撤销标记，
// 让它能重新导入。改动了就写回 state。返回是否有改动。
async function reconcileImportedState(state) {
  const keys = Array.isArray(state.importedKeys) ? state.importedKeys : [];
  const kept = [];
  let changed = false;
  for (const key of keys) {
    const id = importedIdForKey(state, key);
    // 日志里查不到 id 的老数据，保守起见保留（不误删标记）。
    if (!id) {
      kept.push(key);
      continue;
    }
    const recordPath = path.join(recordsRoot, PENDING_CATEGORY, id, "record.json");
    if (await pathExists(recordPath)) {
      kept.push(key);
    } else {
      changed = true; // 文件夹没了 → 撤销「已导入」
    }
  }
  if (changed) {
    state.importedKeys = kept;
    await saveSubmissionsState(state);
  }
  return changed;
}

// 列出表单投稿（已导入的带 imported 标记 + 目标 record 文件夹 id）。
async function submissionsList() {
  const config = await loadSubmissionsConfig();
  const state = await loadSubmissionsState();
  const clients = await getSubmissionClients();
  await reconcileImportedState(state);
  const { submissions, cols } = await listSubmissions(clients, config, state);
  // 给每条投稿附上 record 文件夹 id 当标题（用户 1.1）：已导入的用真实 id，未导入的算个预览 id
  // （和将来点「导入并编辑」时生成的一致）。
  const usedThisRun = new Set();
  for (const s of submissions) {
    if (s.imported) {
      s.folderId = importedIdForKey(state, s.rowKey) || "";
    } else {
      s.folderId = await nextFolderId(yyyymmdd(s.timestamp), usedThisRun);
    }
  }
  const recognized = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v >= 0]));
  return { ok: true, submissions, recognized };
}

function guessImageMime(ext) {
  const m = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
  };
  return m[String(ext || "").toLowerCase()] || "image/jpeg";
}

// 取一张投稿照片给收件箱预览：普通图片返回 base64 dataUrl；HEIC 只返回标记（前端显示占位）。
async function submissionsPhoto(payload) {
  const fileId = String(payload?.fileId || "").trim();
  if (!fileId) {
    throw new ApiError(400, "缺少 fileId。");
  }
  const clients = await getSubmissionClients();
  const { buffer, mime, name, ext } = await fetchDrivePhoto(clients, fileId);
  if (/\.(heic|heif)$/i.test(ext)) {
    // HEIC 浏览器打不开，也读不了 EXIF——只回占位标记。
    return { ok: true, heic: true, name, ext };
  }
  const mimeOut = mime && mime.startsWith("image/") ? mime : guessImageMime(ext);
  // 顺手把这张照片的 EXIF（拍摄时间 + GPS 坐标）读出来给收件箱显示（功能 2）。
  // 投稿照片常是截图/转存，多半没有 EXIF，读不到就返回 { dateTime:"", coordinates:null }。
  const exif = parseExif(buffer);
  return {
    ok: true,
    heic: false,
    name,
    ext,
    dataUrl: `data:${mimeOut};base64,${buffer.toString("base64")}`,
    exif: { dateTime: exif.dateTime || "", coordinates: exif.coordinates || null },
  };
}

// 把某条投稿（带用户在收件箱改过的信息+坐标）导入成正式标点。
async function submissionsImport(payload) {
  const rowKey = String(payload?.rowKey || "").trim();
  if (!rowKey) {
    throw new ApiError(400, "缺少 rowKey。");
  }
  const config = await loadSubmissionsConfig();
  const state = await loadSubmissionsState();
  const clients = await getSubmissionClients();
  const { submissions } = await listSubmissions(clients, config, state);
  const sub = submissions.find((s) => s.rowKey === rowKey);
  if (!sub) {
    throw new ApiError(404, "找不到这条投稿（表格可能变过了）。");
  }
  if (sub.imported) {
    throw new ApiError(409, "这条投稿已经导入过了。");
  }
  const c = payload?.coords;
  const overrides = {
    coords: c && typeof c.lat === "number" && typeof c.lng === "number" ? { lat: c.lat, lng: c.lng } : null,
    submitter: typeof payload?.submitter === "string" ? payload.submitter : undefined,
    time: typeof payload?.time === "string" ? payload.time : undefined,
    locationText: typeof payload?.locationText === "string" ? payload.locationText : undefined,
    blocksText: typeof payload?.blocksText === "string" ? payload.blocksText : undefined,
  };
  const meta = await importSubmission(clients, sub, overrides);
  markImported(state, sub, meta);
  await saveSubmissionsState(state);
  await rebuildDatabase();
  return { ok: true, id: meta.id, heicCount: meta.heicCount };
}

// Single entry point used by server.js. Returns a plain JSON-serializable object.
export async function handleEditorApi(pathname, payload) {
  switch (pathname) {
    case "/api/save-record":
      return saveRecord(payload);
    case "/api/save-texts":
      return saveTexts(payload);
    case "/api/save-theme":
      return saveTheme(payload);
    case "/api/save-marker-settings":
      return saveMarkerSettings(payload);
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
    case "/api/submissions/list":
      return submissionsList(payload);
    case "/api/submissions/photo":
      return submissionsPhoto(payload);
    case "/api/submissions/import":
      return submissionsImport(payload);
    default:
      throw new ApiError(404, `Unknown editor endpoint: ${pathname}`);
  }
}

export { ApiError };
