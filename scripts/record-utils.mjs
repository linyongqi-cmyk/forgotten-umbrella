import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);
// Media = images + videos. Videos are valid media (playable in the detail page)
// but never chosen as the primary cover (the cover must be a still image).
const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

export function isImageFile(file) {
  return IMAGE_EXTENSIONS.has(path.extname(String(file || "")).toLowerCase());
}

// 自动生成的缩略图 / 网页版（NAME.thumb.webp / NAME.web.webp）。它们不是独立媒体，
// 扫描文件夹同步 media 列表时必须排除，否则会被当成新照片塞进 record。
export function isDerivativeFile(file) {
  return /\.(thumb|web)\.webp$/i.test(String(file || ""));
}

export function isVideoFile(file) {
  return VIDEO_EXTENSIONS.has(path.extname(String(file || "")).toLowerCase());
}

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
    '  // 关联标点：填另一个标点的 ID（如 "IMG_6383"），详情页主图右下角会显示可跳转链接。空=无。',
    `  "linkedId": ${JSON.stringify(record.linkedId ?? "")},`,
    '  // 来源："contributed"=外部投稿的伞（不是作者自己拍的）；"own" 或空=作者自己拍的。',
    `  "submissionType": ${JSON.stringify(record.submissionType ?? "")},`,
    '  // 投稿者署名（仅投稿伞用，详情页致谢显示）。没有就保持空字符串。',
    `  "submitter": ${JSON.stringify(record.submitter ?? "")},`,
    '  // 投稿渠道/日期（自由文本，如 "微信 2025-06"，仅内部管理用，不公开展示）。',
    `  "submissionChannel": ${JSON.stringify(record.submissionChannel ?? "")},`,
    '  // 投稿时间（仅投稿伞用，默认取照片文件的建立时间；可手动覆盖，优先显示手填值）。',
    `  "submissionTime": ${JSON.stringify(record.submissionTime ?? "")},`,
    '  // 投稿者原话/备注（投稿者说的背景话，可能展示在详情页）。',
    `  "submitterNote": ${JSON.stringify(record.submitterNote ?? "")},`,
    '  // 备注栏（投稿伞总览表用，目前留空，未来再定用途）。',
    `  "remarks": ${JSON.stringify(record.remarks ?? "")},`,
    '  // 地点是否只是"大概"（投稿伞常常只知道城市）。true=详情页地点前加"约"。',
    `  "locationApprox": ${JSON.stringify(record.locationApprox ?? false)},`,
    '  // 时间是否只是"大概"。true=详情页时间前加"约"。',
    `  "timeApprox": ${JSON.stringify(record.timeApprox ?? false)},`,
    '  // T7 模糊地址：true=聚焦时用白色模糊特效（区别于普通深色模糊），清晰圈更大。仅投稿伞用。',
    `  "blurApprox": ${JSON.stringify(record.blurApprox ?? false)},`,
    '  // T7 该点专属聚焦缩放级别（数字，留空=用默认 18）。模糊地址时常调小一点让位置更含糊。',
    `  "approxZoom": ${JSON.stringify(record.approxZoom ?? "")},`,
    '  // T7 模糊聚焦时标点下方显示的文字（留空=用显示地址 locationText）。',
    `  "blurLabel": ${JSON.stringify(record.blurLabel ?? "")},`,
    '  // 这个标点整体的文字说明（由正文段落合并而来，用于卡片简介）。',
    `  "story": ${JSON.stringify(record.story ?? "")},`,
    '  // 详情页的图文编排顺序。每项是 {"type":"text","text":...} 或 {"type":"photo","file":...}。',
    `  "blocks": ${JSON.stringify(record.blocks ?? [], null, 2).replace(/\n/g, "\n  ")},`,
    '  // 天气（自动抓取，勿手改）：编辑器点「抓取天气」时用坐标+拍摄时间从 Open-Meteo 查回来的',
    '  // 「拍摄前 24 小时」逐时天气。null=还没抓。{source,fetchedAt,lat,lon,referenceTime,hourly:[{time,code,temp}]}',
    `  "weather": ${JSON.stringify(record.weather ?? null)},`,
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
    lines.push('      // 非破坏性裁剪（不改本地文件，只影响网站显示）。null=原图，否则 {aspect,scale,posX,posY}。');
    lines.push(`      "crop": ${JSON.stringify(item.crop ?? null)},`);
    lines.push('      // 这张图自己的天气（编辑器点「获取天气」抓，勿手改）。主图=拍摄前24小时逐时(画横轴)，');
    lines.push('      // 补充/细节图=只拍摄当时1点(显示单个图例)。null=没抓。{source,fetchedAt,lat,lon,referenceTime,hourly:[{time,code,temp}]}');
    lines.push(`      "weather": ${JSON.stringify(item.weather ?? null)},`);
    lines.push('      // 是否在网站上显示这张图的天气。主图默认 true，补充/细节默认 false（勾选「显示天气」才 true）。');
    lines.push(`      "showWeather": ${JSON.stringify(item.showWeather ?? (item.role === "primary"))}`);
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
    .filter(
      (entry) =>
        entry.isFile() &&
        MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
        !isDerivativeFile(entry.name),
    )
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

  // The cover must be a still image — never a video. Fall back through:
  // explicit image primary → image named after the folder → first image → first file.
  const explicitPrimary = ordered.find((item) => item.role === "primary" && isImageFile(item.file));
  const primaryFile =
    (explicitPrimary && explicitPrimary.file) ||
    ordered.find((item) => isImageFile(item.file) && path.parse(item.file).name === recordId)?.file ||
    ordered.find((item) => isImageFile(item.file))?.file ||
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
      crop: item.crop ?? null,
      // 保留每张图自己的天气 + 显示开关（否则一保存就丢）。
      weather: item.weather ?? null,
      showWeather: typeof item.showWeather === "boolean" ? item.showWeather : isPrimary,
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
