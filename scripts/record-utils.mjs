import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

export async function readRecordFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(stripJsonComments(raw));
}

export function stringifyRecordWithComments(record) {
  const lines = [
    "{",
    '  // 版本号。以后如果记录结构升级，可以用这个字段做兼容。',
    `  "schemaVersion": ${JSON.stringify(record.schemaVersion ?? 1)},`,
    '  // 旧 umbrellas.json 中的顺序。当前用于稳定输出顺序，平时不需要手改。',
    `  "sourceIndex": ${JSON.stringify(record.sourceIndex ?? 0)},`,
    '  // 手动填写的展示地址。',
    `  "locationText": ${JSON.stringify(record.locationText ?? "")},`,
    '  // 地址层级。按从大到小填写，例如 ["Tokyo", "Shibuya"]。',
    `  "locationLevels": ${JSON.stringify(record.locationLevels ?? [], null, 2).replace(/\n/g, "\n  ")},`,
    '  // 照片 EXIF 读取到的坐标。地图默认继续使用这里。',
    `  "photoCoordinates": ${JSON.stringify(record.photoCoordinates ?? null, null, 2).replace(/\n/g, "\n  ")},`,
    '  // 如果你想手动覆盖地图坐标，可以填写；没有就保持 null。',
    `  "locationCoordinates": ${JSON.stringify(record.locationCoordinates ?? null, null, 2).replace(/\n/g, "\n  ")},`,
    '  // 照片 EXIF 读取到的拍摄时间。',
    `  "photoTime": ${JSON.stringify(record.photoTime ?? "")},`,
    '  // 如果你想手动覆盖显示时间，可以填写；没有就保持空字符串。',
    `  "time": ${JSON.stringify(record.time ?? "")},`,
    '  // 手动标题。没有就保持空字符串。',
    `  "title": ${JSON.stringify(record.title ?? "")},`,
    '  // 伞的类型，例如 transparent、folding。没有就保持空字符串。',
    `  "umbrellaType": ${JSON.stringify(record.umbrellaType ?? "")},`,
    '  // 伞的颜色（旧字段，保留兼容，当前展示改用 umbrellaUnits）。',
    `  "umbrellaColor": ${JSON.stringify(record.umbrellaColor ?? "")},`,
    '  // 伞的数量。可填 "1"~"5" 或 "unknown"，空白表示未填。',
    `  "umbrellaCount": ${JSON.stringify(record.umbrellaCount ?? "")},`,
    '  // 每把伞的属性列表。{ color, colorDetail, kind, status:[], statusOther }，随数量增减。',
    `  "umbrellaUnits": ${JSON.stringify(record.umbrellaUnits ?? [], null, 2).replace(/\n/g, "\n  ")},`,
    '  // 编辑用的标记颜色（yellow/black/white，空=无标记）。仅编辑模式地图上显示。',
    `  "editFlag": ${JSON.stringify(record.editFlag ?? "")},`,
    '  // 这个标点整体的文字说明（由正文段落合并而来，用于卡片简介）。',
    `  "story": ${JSON.stringify(record.story ?? "")},`,
    '  // 详情页的图文编排顺序。每项是 {"type":"text","text":...} 或 {"type":"photo","file":...}。',
    `  "blocks": ${JSON.stringify(record.blocks ?? [], null, 2).replace(/\n/g, "\n  ")},`,
    '  // 这个标点下的媒体列表。第一项通常是主图。',
    '  "media": ['
  ];

  const media = Array.isArray(record.media) ? record.media : [];
  media.forEach((item, index) => {
    const suffix = index === media.length - 1 ? "" : ",";
    lines.push("    {");
    lines.push('      // 媒体 ID。主图通常和文件夹名一致。');
    lines.push(`      "id": ${JSON.stringify(item.id ?? "")},`);
    lines.push('      // 文件名。文件本体放在当前 record.json 所在文件夹里。');
    lines.push(`      "file": ${JSON.stringify(item.file ?? "")},`);
    lines.push('      // 角色。建议使用 primary、detail、illustration。');
    lines.push(`      "role": ${JSON.stringify(item.role ?? "")},`);
    lines.push('      // 这张媒体自己的标题。没有就保持空字符串。');
    lines.push(`      "title": ${JSON.stringify(item.title ?? "")},`);
    lines.push('      // 这张媒体自己的拍摄时间。没有就保持空字符串。');
    lines.push(`      "photoTime": ${JSON.stringify(item.photoTime ?? "")},`);
    lines.push('      // 这张媒体自己的说明文字。');
    lines.push(`      "story": ${JSON.stringify(item.story ?? "")},`);
    lines.push('      // 旧缩略图路径。当前保留给过渡期网站使用，先不要手改。');
    lines.push(`      "legacyThumb": ${JSON.stringify(item.legacyThumb ?? "")},`);
    lines.push('      // 灯箱放大图上的准星锁定点。归一化坐标 {x,y}（0~1）；没有就是 null。');
    lines.push(`      "crosshair": ${JSON.stringify(item.crosshair ?? null)}`);
    lines.push(`    }${suffix}`);
  });

  lines.push("  ]");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

export async function listRecordImageFiles(recordDir) {
  const entries = await fs.readdir(recordDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

// Sync the media list with the image files on disk while PRESERVING the order
// stored in record.json (so the editor's reordering / primary choice sticks).
// Stored entries whose file vanished are dropped; new files on disk are
// appended at the end.
export async function mergeRecordMediaWithFolder(recordPath, record) {
  const recordDir = path.dirname(recordPath);
  const recordId = path.basename(recordDir);
  const folderFiles = await listRecordImageFiles(recordDir);
  const folderSet = new Set(folderFiles);
  const existingMedia = Array.isArray(record.media) ? record.media.filter((item) => item?.file) : [];

  const ordered = existingMedia.filter((item) => folderSet.has(item.file));
  const referenced = new Set(ordered.map((item) => item.file));
  folderFiles.forEach((file) => {
    if (!referenced.has(file)) {
      ordered.push({ file });
    }
  });

  const explicitPrimary = ordered.find((item) => item.role === "primary");
  const primaryFile =
    (explicitPrimary && explicitPrimary.file) ||
    ordered.find((item) => path.parse(item.file).name === recordId)?.file ||
    ordered[0]?.file ||
    "";

  const media = ordered.map((item) => {
    const isPrimary = item.file === primaryFile;
    return {
      id: item.id || path.parse(item.file).name,
      file: item.file,
      role: isPrimary ? "primary" : item.role && item.role !== "primary" ? item.role : "detail",
      title: item.title ?? "",
      photoTime: item.photoTime ?? (isPrimary ? record.photoTime || "" : ""),
      story: item.story ?? "",
      legacyThumb: item.legacyThumb ?? "",
      crosshair: item.crosshair ?? null,
    };
  });

  return {
    ...record,
    media,
  };
}

function stripJsonComments(input) {
  let output = "";
  let inString = false;
  let stringChar = "";
  let isEscaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
        output += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += current;
      if (isEscaped) {
        isEscaped = false;
      } else if (current === "\\") {
        isEscaped = true;
      } else if (current === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      stringChar = current;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += current;
  }

  return output;
}
