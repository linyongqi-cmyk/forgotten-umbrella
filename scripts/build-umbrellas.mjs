import fs from "node:fs/promises";
import path from "node:path";
import { mergeRecordMediaWithFolder, readRecordFile } from "./record-utils.mjs";

const rootDir = process.cwd();
const recordsRoot = path.join(rootDir, "filebox", "records");
const outputPath = path.join(rootDir, "data", "umbrellas.json");

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function getRecordFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return getRecordFiles(fullPath);
    }
    return entry.name === "record.json" ? [fullPath] : [];
  }));
  return files.flat();
}

function parseCategoryFolder(folderName) {
  if (folderName === "unknown") {
    return { category: "unknown", categoryGroup: "" };
  }
  const match = folderName.match(/^(.*)\((.*)\)$/);
  if (!match) {
    return { category: folderName || "unknown", categoryGroup: "" };
  }
  return {
    category: match[1] || "unknown",
    categoryGroup: match[2] || ""
  };
}

function normalizeLevels(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function normalizeCoordinates(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const { lat, lng } = value;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }
  return { lat, lng };
}

function buildUmbrellaItem(recordPath, record) {
  const recordDir = path.dirname(recordPath);
  const recordId = path.basename(recordDir);
  const categoryDir = path.basename(path.dirname(recordDir));
  const { category, categoryGroup } = parseCategoryFolder(categoryDir);
  const primary = Array.isArray(record.media)
    ? record.media.find((item) => item?.role === "primary") || record.media[0]
    : null;

  if (!primary?.file) {
    throw new Error(`Missing primary media in ${recordPath}`);
  }

  const imagePath = path.join(recordDir, primary.file);
  const media = record.media.map((entry) => {
    const mediaPath = path.join(recordDir, entry.file);
    return {
      id: entry.id || path.parse(entry.file).name,
      file: entry.file,
      src: toPosix(path.relative(rootDir, mediaPath)),
      thumb: entry.legacyThumb || toPosix(path.relative(rootDir, mediaPath)),
      role: entry.role || "detail",
      title: entry.title || "",
      photoTime: entry.photoTime || "",
      story: entry.story || "",
    };
  });

  return {
    sourceIndex: Number.isInteger(record.sourceIndex) ? record.sourceIndex : Number.MAX_SAFE_INTEGER,
    item: {
      id: recordId,
      image: toPosix(path.relative(rootDir, imagePath)),
      photoTime: record.photoTime || primary.photoTime || "",
      time: record.time || "",
      photoCoordinates: normalizeCoordinates(record.photoCoordinates),
      locationCoordinates: normalizeCoordinates(record.locationCoordinates),
      locationText: record.locationText || "",
      title: record.title || "",
      umbrellaType: record.umbrellaType || "",
      umbrellaColor: record.umbrellaColor || "",
      umbrellaCount: record.umbrellaCount || "",
      umbrellaUnits: Array.isArray(record.umbrellaUnits) ? record.umbrellaUnits : [],
      umbrellaStatus: Array.isArray(record.umbrellaStatus)
        ? record.umbrellaStatus
        : record.umbrellaStatus
          ? [record.umbrellaStatus]
          : [],
      umbrellaStatusOther: record.umbrellaStatusOther || "",
      story: record.story || "",
      categoryGroup,
      category,
      thumb: primary.legacyThumb || "",
      media,
      locationLevels: normalizeLevels(record.locationLevels)
    }
  };
}

const recordFiles = await getRecordFiles(recordsRoot);
const builtItems = [];

for (const recordFile of recordFiles) {
  const rawRecord = await readRecordFile(recordFile);
  const record = await mergeRecordMediaWithFolder(recordFile, rawRecord);
  builtItems.push(buildUmbrellaItem(recordFile, record));
}

builtItems.sort((a, b) => {
  if (a.sourceIndex !== b.sourceIndex) {
    return a.sourceIndex - b.sourceIndex;
  }
  return a.item.id.localeCompare(b.item.id);
});

const outputItems = builtItems.map(({ item }) => item);
await fs.writeFile(outputPath, `${JSON.stringify(outputItems, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ recordCount: outputItems.length, outputPath: toPosix(path.relative(rootDir, outputPath)) }, null, 2));
