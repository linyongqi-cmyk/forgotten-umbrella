// One-time backfill: read EXIF out of the image files already on disk and fill
// in any EMPTY photoTime / photoCoordinates fields. It never overwrites values
// that are already set, so manual edits and earlier data are safe.
//
// Run with: node scripts/backfill-exif.mjs   (then it rebuilds umbrellas.json)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readRecordFile, stringifyRecordWithComments } from "./record-utils.mjs";
import { parseExif } from "./exif.mjs";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordsRoot = path.join(rootDir, "filebox", "records");
const buildScript = path.join(rootDir, "scripts", "build-umbrellas.mjs");

async function findRecordFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findRecordFiles(full);
      }
      return entry.name === "record.json" ? [full] : [];
    }),
  );
  return nested.flat();
}

async function exifForFile(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    return parseExif(buffer);
  } catch {
    return { coordinates: null, dateTime: "" };
  }
}

let recordsChanged = 0;
let mediaTimesFilled = 0;
let coordsFilled = 0;

const recordFiles = await findRecordFiles(recordsRoot);

for (const recordFile of recordFiles) {
  const record = await readRecordFile(recordFile);
  const recordDir = path.dirname(recordFile);
  const media = Array.isArray(record.media) ? record.media : [];
  let changed = false;

  for (const item of media) {
    if (!item?.file || item.photoTime) {
      continue; // already has a time (or no file) — leave it alone
    }
    const exif = await exifForFile(path.join(recordDir, item.file));
    if (exif.dateTime) {
      item.photoTime = exif.dateTime;
      mediaTimesFilled += 1;
      changed = true;
    }
  }

  // Fill record-level photoTime / photoCoordinates from the primary photo's EXIF.
  const primary = media.find((m) => m.role === "primary") || media[0];
  if (primary?.file) {
    const exif = await exifForFile(path.join(recordDir, primary.file));
    if (!record.photoTime && exif.dateTime) {
      record.photoTime = exif.dateTime;
      changed = true;
    }
    if (!record.photoCoordinates && exif.coordinates) {
      record.photoCoordinates = exif.coordinates;
      coordsFilled += 1;
      changed = true;
    }
  }

  if (changed) {
    await fs.writeFile(recordFile, stringifyRecordWithComments(record), "utf8");
    recordsChanged += 1;
  }
}

console.log(`Records changed: ${recordsChanged}`);
console.log(`Media photoTime filled: ${mediaTimesFilled}`);
console.log(`Record photoCoordinates filled: ${coordsFilled}`);

console.log("Rebuilding data/umbrellas.json …");
await execFileAsync(process.execPath, [buildScript], { cwd: rootDir });
console.log("Done.");
