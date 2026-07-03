import fs from "node:fs/promises";
import path from "node:path";
import { mergeRecordMediaWithFolder, readRecordFile } from "./record-utils.mjs";
import { derivativeNames, isDerivableImage, isDerivativeFile } from "./image-derivatives.mjs";

const rootDir = process.cwd();
const recordsRoot = path.join(rootDir, "filebox", "records");
const outputPath = path.join(rootDir, "data", "umbrellas.json");

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// 一张媒体对应三种前端路径：
//   thumb    —— 400px 缩略图（列表/地图小图）
//   src      —— 1280px 网页版（详情页展示 + 放大时先显示的图）
//   original —— 原图（放大后后台渐进式下载，下完淡入替换 src）
// 生成物缺失（还没 build 过图 / 视频）时优雅回退到原图。
async function resolveMediaPaths(recordDir, file, legacyThumb) {
  const originalRel = toPosix(path.relative(rootDir, path.join(recordDir, file)));
  if (!isDerivableImage(file) || isDerivativeFile(file)) {
    return { src: originalRel, thumb: legacyThumb || originalRel, original: originalRel };
  }
  const names = derivativeNames(file);
  const webAbs = path.join(recordDir, names.web);
  const thumbAbs = path.join(recordDir, names.thumb);
  const [hasWeb, hasThumb] = await Promise.all([fileExists(webAbs), fileExists(thumbAbs)]);
  return {
    src: hasWeb ? toPosix(path.relative(rootDir, webAbs)) : originalRel,
    thumb: hasThumb ? toPosix(path.relative(rootDir, thumbAbs)) : legacyThumb || originalRel,
    original: originalRel,
  };
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

async function buildUmbrellaItem(recordPath, record) {
  const recordDir = path.dirname(recordPath);
  const recordId = path.basename(recordDir);
  const categoryDir = path.basename(path.dirname(recordDir));
  const { category, categoryGroup } = parseCategoryFolder(categoryDir);
  const primary = Array.isArray(record.media)
    ? record.media.find((item) => item?.role === "primary") || record.media[0]
    : null;

  if (!primary?.file) {
    // 半成品投稿（还没放进能显示的主图，或图片是浏览器不支持的 HEIC 等）不该拖垮整站构建。
    // 跳过它、只打印警告——record.json 原样保留，等补齐主图后重建即可。
    console.warn(`⚠️  跳过（没有可显示的主图）：${toPosix(path.relative(rootDir, recordPath))}`);
    return null;
  }

  const media = await Promise.all(record.media.map(async (entry) => {
    const paths = await resolveMediaPaths(recordDir, entry.file, entry.legacyThumb);
    return {
      id: entry.id || path.parse(entry.file).name,
      file: entry.file,
      src: paths.src,
      thumb: paths.thumb,
      original: paths.original,
      role: entry.role || "detail",
      title: entry.title || "",
      photoTime: entry.photoTime || "",
      story: entry.story || "",
      // 非破坏性裁剪（不改本地文件，只影响网站显示）。null = 原图。
      crop: entry.crop || null,
      // 每张图自己的天气 + 是否显示（主图默认显示，补充/细节勾选才显示）。
      weather: entry.weather && typeof entry.weather === "object" ? entry.weather : null,
      showWeather:
        typeof entry.showWeather === "boolean" ? entry.showWeather : entry.role === "primary",
    };
  }));

  // 主图（封面）也用网页版展示 + 缩略图，原图留给放大渐进式加载。
  const primaryPaths = media.find((m) => m.file === primary.file) || media[0];

  // 主图天气 = 详情页主横轴用（兼容旧的 record.weather：若主图没抓过但记录级有，就沿用）。
  const primaryWeather =
    (primary.weather && typeof primary.weather === "object" ? primary.weather : null) ||
    (record.weather && typeof record.weather === "object" ? record.weather : null);

  return {
    sourceIndex: Number.isInteger(record.sourceIndex) ? record.sourceIndex : Number.MAX_SAFE_INTEGER,
    item: {
      id: recordId,
      image: primaryPaths.src,
      imageOriginal: primaryPaths.original,
      photoTime: record.photoTime || primary.photoTime || "",
      time: record.time || "",
      photoCoordinates: normalizeCoordinates(record.photoCoordinates),
      locationCoordinates: normalizeCoordinates(record.locationCoordinates),
      locationText: record.locationText || "",
      title: record.title || "",
      displayId: record.displayId || "",
      umbrellaType: record.umbrellaType || "",
      umbrellaColor: record.umbrellaColor || "",
      umbrellaCount: record.umbrellaCount || "",
      umbrellaUnits: Array.isArray(record.umbrellaUnits) ? record.umbrellaUnits : [],
      story: record.story || "",
      blocks: Array.isArray(record.blocks) ? record.blocks : [],
      editFlag: record.editFlag || "",
      weather: primaryWeather,
      linkedId: record.linkedId || "",
      submissionType: record.submissionType === "contributed" ? "contributed" : "own",
      submitter: record.submitter || "",
      submissionChannel: record.submissionChannel || "",
      submissionTime: record.submissionTime || "",
      submitterNote: record.submitterNote || "",
      remarks: record.remarks || "",
      locationApprox: Boolean(record.locationApprox),
      timeApprox: Boolean(record.timeApprox),
      // T7: contributed umbrellas with a deliberately fuzzy location — use a
      // special white-blur focus and an optional per-point zoom.
      blurApprox: Boolean(record.blurApprox),
      approxZoom: Number.isFinite(Number(record.approxZoom)) && record.approxZoom !== "" ? Number(record.approxZoom) : null,
      // T7: optional text shown under the pin in the blurred focus view (defaults
      // to the display address when blank).
      blurLabel: record.blurLabel || "",
      categoryGroup,
      category,
      thumb: primaryPaths.thumb || primary.legacyThumb || "",
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
  const built = await buildUmbrellaItem(recordFile, record);
  if (built) {
    builtItems.push(built);
  }
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
