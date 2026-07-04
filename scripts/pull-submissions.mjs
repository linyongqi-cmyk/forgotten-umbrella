// 投稿导入脚本（方法 B：直接连 Google）。
//
// 它干嘛的：一条命令 `npm run submissions:pull`，把你 Google 表单的新投稿
// （投稿者填的信息 + 上传的照片）拉到本地，自动生成 submission(pending) 里的
// record 草稿——各个信息已经预填进「编辑器对应的框」，你打开编辑器只需核对、
// 补坐标、补伞的细节。已经导入过的投稿会自动跳过（不会重复）。
//
// 照片：能显示的格式（jpg/png/webp…）会顺带生成缩略图/网页版；HEIC 会照样下载
// 保留，但标记为「待手动转换」，前端遇到 HEIC 不显示裂图、只显示提醒（阶段 2）。
//
// 前置：① scripts/google-credentials.json（阶段 0 从 Google Cloud 下的密钥）；
//       ② scripts/submissions.config.json（写你的表格 ID）。都见「投稿导入-使用说明.md」。
//
// 用法：
//   node scripts/pull-submissions.mjs            正式导入
//   node scripts/pull-submissions.mjs --dry-run  只看会导入哪些，不写文件（先试跑）

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
const PENDING_CATEGORY = "submission(pending)"; // 投稿伞的正式分类
const CONFIG_PATH = path.join(here, "submissions.config.json");
const STATE_PATH = path.join(here, ".submissions-state.json");

const DRY_RUN = process.argv.includes("--dry-run");
const sheetArg = process.argv.find((a) => a.startsWith("--sheet="));

// ── 表单问题 → record 字段：靠关键词认列（表头就是表单的问题文字，中英日都行）──
const COLUMN_KEYWORDS = {
  timestamp: ["タイムスタンプ", "timestamp", "时间戳"],
  mainPhoto: ["傘の写真", "photo of the umbrella"],
  dateFound: ["発見日時", "date found"],
  location: ["発見場所", "location"],
  observation: ["観察メモ", "observation notes"],
  contributor: ["署名", "contributor name"],
  additionalPhoto: ["追加写真", "追加写真", "additional photos"],
  weather: ["数日前の天気", "weather on the day"],
  surroundings: ["周囲の環境", "surroundings"],
  additionalNotes: ["追加メモ", "additional notes"],
};

function findColumn(headers, keywords) {
  const lower = headers.map((h) => String(h || "").toLowerCase());
  for (let i = 0; i < lower.length; i += 1) {
    if (keywords.some((kw) => lower[i].includes(kw.toLowerCase()))) {
      return i;
    }
  }
  return -1;
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadConfig() {
  if (sheetArg) {
    return { sheetId: sheetArg.slice("--sheet=".length).trim(), sheetRange: "A1:ZZ100000" };
  }
  if (!(await pathExists(CONFIG_PATH))) {
    throw new Error(
      "缺少 scripts/submissions.config.json。请建一个，写上你的表格 ID，例如：\n" +
        '{ "sheetId": "把你 Google 表格网址里 /d/ 后面那串粘这里", "sheetRange": "A1:ZZ100000" }',
    );
  }
  const cfg = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  if (!cfg.sheetId) {
    throw new Error("submissions.config.json 里缺少 sheetId。");
  }
  return { sheetId: cfg.sheetId, sheetRange: cfg.sheetRange || "A1:ZZ100000" };
}

async function loadState() {
  if (await pathExists(STATE_PATH)) {
    try {
      return JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
    } catch {
      /* 坏了就当空 */
    }
  }
  return { importedKeys: [], log: [] };
}

async function saveState(state) {
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

// 从上传题的单元格里抽出 Drive 文件 id（可能多张，逗号/换行分隔）。
function extractDriveIds(cell) {
  const text = String(cell || "");
  const ids = [];
  const re = /[?&]id=([A-Za-z0-9_-]+)|\/d\/([A-Za-z0-9_-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    ids.push(m[1] || m[2]);
  }
  return ids;
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

async function downloadDriveFile(drive, fileId, destAbsPath) {
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  const chunks = [];
  await new Promise((resolve, reject) => {
    res.data.on("data", (c) => chunks.push(c));
    res.data.on("end", resolve);
    res.data.on("error", reject);
  });
  await fs.writeFile(destAbsPath, Buffer.concat(chunks));
}

// 挑下一个日期序号：form_YYYYMMDD_N。
async function nextFolderId(dateStr, usedThisRun) {
  const pendingDir = path.join(recordsRoot, PENDING_CATEGORY);
  let existing = [];
  try {
    existing = await fs.readdir(pendingDir);
  } catch {
    /* 文件夹还不存在 */
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

// 扫所有 record.json 找最大 sourceIndex，新记录接在后面（保持输出顺序稳定）。
async function nextSourceIndexStart() {
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

function yyyymmdd(timestampCell) {
  const d = new Date(String(timestampCell || "").replace(/\./g, "/"));
  const use = Number.isNaN(d.getTime()) ? new Date() : d;
  const y = use.getFullYear();
  const m = String(use.getMonth() + 1).padStart(2, "0");
  const day = String(use.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// 把投稿者写的文字答案拼成「内容段落」blocks（每条非空答案一个文字块，方便你在编辑器里挪/删）。
function buildBlocks({ observation, surroundings, additionalNotes, weather }) {
  const blocks = [];
  const push = (text) => {
    const t = String(text || "").trim();
    if (t) blocks.push({ type: "text", text: t });
  };
  push(observation);
  push(surroundings);
  push(additionalNotes);
  // 天气是选择题（雨/晴/不记得），加个括号标注，明显是投稿者记忆、方便你后续删/挪。
  const w = String(weather || "").trim();
  if (w && !/覚えていない|don'?t remember/i.test(w)) {
    blocks.push({ type: "text", text: `（投稿者记忆的天气 / Weather as recalled: ${w}）` });
  }
  return blocks;
}

async function main() {
  const config = await loadConfig();
  const auth = await getAuthorizedClient();
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: config.sheetRange,
  });
  const rows = resp.data.values || [];
  if (rows.length < 2) {
    console.log("表格里还没有投稿回答（或只有表头）。");
    return;
  }
  const headers = rows[0];
  const dataRows = rows.slice(1);

  const cols = {};
  for (const [key, kws] of Object.entries(COLUMN_KEYWORDS)) {
    cols[key] = findColumn(headers, kws);
  }
  console.log("认到的列：", Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v >= 0 ? headers[v] : "❌没认到"])));
  if (cols.mainPhoto < 0) {
    throw new Error("没在表头里认出「照片上传」那一列。请确认表格是这个表单关联的回答表。");
  }

  const state = await loadState();
  const importedSet = new Set(state.importedKeys);
  let usedThisRun = new Set();
  let sourceIndex = await nextSourceIndexStart();

  const cell = (row, key) => (cols[key] >= 0 ? row[cols[key]] : "");
  let created = 0;
  let skipped = 0;
  let wouldImport = 0;

  for (const row of dataRows) {
    const mainIds = extractDriveIds(cell(row, "mainPhoto"));
    if (mainIds.length === 0) {
      skipped += 1;
      continue; // 没照片的回答跳过（照片是必填，正常不会发生）
    }
    const key = mainIds[0]; // 用主图 Drive 文件 id 当唯一标识去重
    if (importedSet.has(key)) {
      skipped += 1;
      continue;
    }

    const timestamp = String(cell(row, "timestamp") || "").trim();
    const dateStr = yyyymmdd(timestamp);
    const id = await nextFolderId(dateStr, usedThisRun);

    const contributor = String(cell(row, "contributor") || "").trim();
    const dateFound = String(cell(row, "dateFound") || "").trim();
    const location = String(cell(row, "location") || "").trim();
    const blocks = buildBlocks({
      observation: cell(row, "observation"),
      surroundings: cell(row, "surroundings"),
      additionalNotes: cell(row, "additionalNotes"),
      weather: cell(row, "weather"),
    });
    const additionalIds = extractDriveIds(cell(row, "additionalPhoto"));
    const allIds = [...mainIds, ...additionalIds];

    console.log(
      `\n${DRY_RUN ? "[试跑] " : ""}投稿 → ${id}` +
        `\n   署名：${contributor || "(匿名)"}  时间：${dateFound || "?"}  地点：${location || "?"}` +
        `\n   照片：${allIds.length} 张  内容段落：${blocks.length} 段`,
    );

    if (DRY_RUN) {
      importedSet.add(key); // 试跑内也标记，避免同一次重复统计
      wouldImport += 1;
      continue;
    }

    const recordDir = path.join(recordsRoot, PENDING_CATEGORY, id);
    await fs.mkdir(recordDir, { recursive: true });

    // 下载所有照片，主图命名成 <id>.<ext>，其余 <id>_2.<ext>…
    const mediaHints = [];
    let heicCount = 0;
    for (let i = 0; i < allIds.length; i += 1) {
      const fileId = allIds[i];
      let ext = ".jpg";
      let origName = "";
      try {
        const meta = await drive.files.get({ fileId, fields: "name,mimeType" });
        origName = meta.data.name || "";
        ext = path.extname(origName).toLowerCase() || MIME_EXT[meta.data.mimeType] || ".jpg";
      } catch {
        /* 拿不到元信息就用默认扩展名 */
      }
      const filename = i === 0 ? `${id}${ext}` : `${id}_${i + 1}${ext}`;
      const destAbs = path.join(recordDir, filename);
      await downloadDriveFile(drive, fileId, destAbs);
      if (/\.(heic|heif)$/i.test(ext)) {
        heicCount += 1;
      } else if (isDerivableImage(filename)) {
        try {
          await generateDerivatives(destAbs);
        } catch {
          /* 生成缩略图失败不影响导入 */
        }
      }
      mediaHints.push({ file: filename, role: i === 0 ? "primary" : "detail" });
    }

    const record = {
      schemaVersion: 1,
      sourceIndex: sourceIndex++,
      locationText: location,
      locationLevels: [],
      photoCoordinates: null,
      locationCoordinates: null,
      photoTime: "",
      time: dateFound,
      title: { ja: "", en: "" },
      displayId: "",
      umbrellaType: "",
      umbrellaColor: "",
      umbrellaCount: "",
      umbrellaUnits: [],
      editFlag: "",
      linkedId: "",
      submissionType: "contributed",
      submitter: contributor,
      submissionChannel: "Google 表单",
      submissionTime: timestamp,
      submitterNote: "",
      remarks: "",
      locationApprox: true, // 投稿地点多为大概
      timeApprox: true, // 投稿时间多为大概
      blurApprox: false,
      approxZoom: "",
      blurLabel: "",
      story: blocks.map((b) => b.text).join("\n\n"),
      blocks,
      weather: null, // 没坐标，等你在编辑器设好坐标再抓天气
      media: mediaHints,
    };

    const recordPath = path.join(recordDir, "record.json");
    const merged = await mergeRecordMediaWithFolder(recordPath, record);
    await fs.writeFile(recordPath, stringifyRecordWithComments(merged), "utf8");

    importedSet.add(key);
    state.log.push({ id, key, at: new Date().toISOString(), contributor, location, heic: heicCount });
    created += 1;
    if (heicCount > 0) {
      console.log(`   ⚠️ 有 ${heicCount} 张是 HEIC，已下载但前端会显示「待转换」提醒，需你手动转 jpg 再替换。`);
    }
  }

  state.importedKeys = [...importedSet];

  if (DRY_RUN) {
    console.log(`\n[试跑] 会新导入 ${wouldImport} 条，跳过（已导入/无照片）${skipped} 条。`);
    console.log("试跑结束，没有改动任何文件。去掉 --dry-run 才会真正导入。");
    return;
  }

  await saveState(state);
  console.log(`\n完成：新导入 ${created} 条，跳过（已导入/无照片）${skipped} 条。`);

  if (created > 0) {
    console.log("重建 data/umbrellas.json …");
    await runBuild();
    console.log("重建完成。现在可以打开本地编辑器核对这些新投稿。");
  }
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(here, "build-umbrellas.mjs")], {
      cwd: rootDir,
      stdio: "inherit",
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`build 退出码 ${code}`))));
  });
}

main().catch((e) => {
  console.error("\n出错了：", e.message);
  process.exit(1);
});
