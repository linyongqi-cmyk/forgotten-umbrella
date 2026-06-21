import fs from "node:fs/promises";
import path from "node:path";
import { stringifyRecordWithComments } from "./record-utils.mjs";

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, "data", "umbrellas.json");
const recordsRoot = path.join(rootDir, "filebox", "records");

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function safeSegment(value) {
  return value && value.trim() ? value.trim() : "unknown";
}

function categoryFolderName(item) {
  if (!safeSegment(item.category) || safeSegment(item.category) === "unknown") {
    if (!safeSegment(item.categoryGroup) || safeSegment(item.categoryGroup) === "unknown") {
      return "unknown";
    }
  }
  return `${safeSegment(item.category)}(${safeSegment(item.categoryGroup)})`;
}

function createRecord(item, sourceIndex, imageFilename) {
  return {
    schemaVersion: 1,
    sourceIndex,
    locationText: item.locationText || "",
    locationLevels: Array.isArray(item.locationLevels) ? item.locationLevels : [],
    photoCoordinates: item.photoCoordinates ?? null,
    locationCoordinates: item.locationCoordinates ?? null,
    photoTime: item.photoTime || "",
    time: item.time || "",
    title: item.title || "",
    umbrellaType: item.umbrellaType || "",
    umbrellaColor: item.umbrellaColor || "",
    umbrellaStatus: item.umbrellaStatus || "",
    story: item.story || "",
    media: [
      {
        id: item.id,
        file: imageFilename,
        role: "primary",
        photoTime: item.photoTime || "",
        story: item.story || "",
        legacyThumb: item.thumb || ""
      }
    ]
  };
}

const sourceItems = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const skipped = [];

for (const [index, item] of sourceItems.entries()) {
  const imageSource = path.join(rootDir, item.image);
  try {
    await fs.access(imageSource);
  } catch {
    skipped.push({ id: item.id, image: item.image });
    continue;
  }

  const imageFilename = path.basename(item.image);
  const recordDir = path.join(recordsRoot, categoryFolderName(item), item.id);
  const imageTarget = path.join(recordDir, imageFilename);
  const recordPath = path.join(recordDir, "record.json");

  await fs.mkdir(recordDir, { recursive: true });
  await fs.copyFile(imageSource, imageTarget);

  const record = createRecord(item, index, imageFilename);
  await fs.writeFile(recordPath, stringifyRecordWithComments(record), "utf8");
}

const summary = {
  seededRecords: sourceItems.length - skipped.length,
  skipped
};

console.log(JSON.stringify(summary, null, 2));
