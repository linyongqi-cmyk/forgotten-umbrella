import fs from "node:fs/promises";
import path from "node:path";
import { mergeRecordMediaWithFolder, readRecordFile, stringifyRecordWithComments } from "./record-utils.mjs";

const rootDir = process.cwd();
const recordsRoot = path.join(rootDir, "filebox", "records");

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

const files = await getRecordFiles(recordsRoot);

for (const filePath of files) {
  const record = await readRecordFile(filePath);
  const merged = await mergeRecordMediaWithFolder(filePath, record);
  await fs.writeFile(filePath, stringifyRecordWithComments(merged), "utf8");
}

console.log(JSON.stringify({ formattedRecords: files.length }, null, 2));
