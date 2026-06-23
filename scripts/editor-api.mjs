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

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordsRoot = path.join(rootDir, "filebox", "records");
const buildScript = path.join(rootDir, "scripts", "build-umbrellas.mjs");

// Plain text fields the editor is allowed to overwrite.
const TEXT_FIELDS = ["locationText", "time", "title", "umbrellaType", "story"];

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
    if (block?.type === "text" && typeof block.text === "string" && block.text.trim()) {
      blocks.push({ type: "text", text: block.text });
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

  for (const field of TEXT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      record[field] = String(payload[field] ?? "");
    }
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

  return { ok: true, id, media: merged.media };
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
      };
    });
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
    title: "",
    umbrellaType: "",
    umbrellaColor: "",
    umbrellaStatus: "",
    story: "",
    media: [{ id, file: filename, role: "primary", title: "", photoTime: "", story: "", legacyThumb: "" }],
  };
  const merged = await mergeRecordMediaWithFolder(recordPath, record);
  await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");
  await rebuildDatabase();
  return { ok: true, id, coordinates: record.locationCoordinates, fromExif: Boolean(exif.coordinates) };
}

// Delete an entire record folder (images + record.json).
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
  await fs.rm(recordDir, { recursive: true, force: true });
  await rebuildDatabase();
  return { ok: true, id };
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

// Single entry point used by server.js. Returns a plain JSON-serializable object.
export async function handleEditorApi(pathname, payload) {
  switch (pathname) {
    case "/api/save-record":
      return saveRecord(payload);
    case "/api/upload-image":
      return uploadImage(payload);
    case "/api/delete-image":
      return deleteImage(payload);
    case "/api/create-record":
      return createRecord(payload);
    case "/api/delete-record":
      return deleteRecord(payload);
    case "/api/move-record":
      return moveRecord(payload);
    default:
      throw new ApiError(404, `Unknown editor endpoint: ${pathname}`);
  }
}

export { ApiError };
