// One-off: split the contributed record rednote_1164552325_1 (which actually
// holds TWO umbrellas at two spots) into _1 (Kinshicho Station, 2024.06.13) and
// _2 (park public restroom, 2024.06.14), and cross-link them via linkedId.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRecordFile, stringifyRecordWithComments, mergeRecordMediaWithFolder } from "./record-utils.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseDir = path.join(rootDir, "filebox", "records", "submission(pending)");
const dir1 = path.join(baseDir, "rednote_1164552325_1");
const dir2 = path.join(baseDir, "rednote_1164552325_2");

async function nextSourceIndex() {
  let max = -1;
  const root = path.join(rootDir, "filebox", "records");
  const walk = async (d) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name === "record.json") {
        const r = await readRecordFile(full);
        if (Number.isInteger(r.sourceIndex) && r.sourceIndex > max) max = r.sourceIndex;
      }
    }
  };
  await walk(root);
  return max + 1;
}

const rec1 = await readRecordFile(path.join(dir1, "record.json"));
const idx2 = await nextSourceIndex();

// Move the second photo into the new folder.
await fs.mkdir(dir2, { recursive: true });
const file2 = "rednote_1164552325_2_1.jpg";
await fs.rename(path.join(dir1, "rednote_1164552325_1_2.jpg"), path.join(dir2, file2));

// Record _2: park public restroom umbrella (2024.06.14).
const rec2 = {
  ...rec1,
  sourceIndex: idx2,
  locationText: "public restroom in a park, Kinshicho area, Sumida City, Tokyo",
  locationCoordinates: { lat: 35.6975, lng: 139.8135 },
  time: "2024.06.14",
  submissionTime: "2026.04.21 02:21",
  linkedId: "rednote_1164552325_1",
  blocks: [],
  media: [{ id: "rednote_1164552325_2_1", file: file2, role: "primary", title: "", photoTime: "", story: "", legacyThumb: "" }],
};
const path2 = path.join(dir2, "record.json");
await fs.writeFile(path2, stringifyRecordWithComments(await mergeRecordMediaWithFolder(path2, rec2)), "utf8");

// Record _1: Kinshicho Station umbrella (2024.06.13), now single-photo + linked.
rec1.locationText = "Kinshicho Station, Sumida City, Tokyo";
rec1.locationCoordinates = { lat: 35.6967, lng: 139.8146 };
rec1.time = "2024.06.13";
rec1.linkedId = "rednote_1164552325_2";
rec1.blocks = [];
const path1 = path.join(dir1, "record.json");
await fs.writeFile(path1, stringifyRecordWithComments(await mergeRecordMediaWithFolder(path1, rec1)), "utf8");

console.log("拆分完成：_1(金丝町站) <-> _2(公园厕所)，已互链。");
