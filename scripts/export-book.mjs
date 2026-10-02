#!/usr/bin/env node
// 书籍导出脚本（版本化）——只读数据 + 复制/转换图片，绝不修改任何原始记录/原图。
//
// 文件夹结构（book-export/）：
//   images/<ID>/               每把伞一个文件夹，里面是它的全部图片（主图 + 补充/细节/插画，
//                              不按角色分类）。主图叫 <ID>.jpg，其余 <ID>_2 / <ID>_3…。
//                              印刷用；webp/heic 自动转 jpg。CSV 数据合并只指向主图。
//   videos/                    补充里的动画（.mov/.mp4…），不能进印刷，单独放这里备查
//   thumbs/                    共享索引小图（600px jpg，兼容老版 InDesign）
//   versions/<时间戳>/         每次导出一个独立版本，旧版本永不改动
//       umbrellas-own.csv          自己拍的伞（不含隐藏的）
//       umbrellas-contributed.csv  投稿伞（不含隐藏的）
//       umbrellas-hidden-own.csv         隐藏的·自己拍（单独成表，列同上；有隐藏时才生成）
//       umbrellas-hidden-contributed.csv 隐藏的·投稿
//       index-by-time.csv          目录①按时间
//       index-by-location.csv      目录②按地点
//       index-by-type.csv          目录③按类型
//       index-by-time/location/type_额外修改.csv  手动排版用的额外修改目录
//       目录分段说明.md             额外修改目录的分段说明（仅供查看）
//       manifest.csv               配图清单 + 印刷分辨率体检
//       CHANGES.md                 与上一版的差异（新增/修改/删除）
//       changes-own.csv            自己拍的新增/修改/删除记录（给 InDesign 补页）
//       changes-contributed.csv    投稿的新增/修改/删除记录（给 InDesign 补页）
//       changes.csv                同上，表格版（给 InDesign 对照补页用）
//       _snapshot.json             机器对比用，勿手改/勿删
//   README.txt                 使用说明
//
// 用法：node scripts/export-book.mjs            正常导出一个新版本
//       node scripts/export-book.mjs --rebuild-images   强制重生所有主图/缩略图
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toPosix = (v) => v.split(path.sep).join('/');
// 导出目的地：默认导到用户 iCloud 的排版工程文件夹（书籍以那里为准）。
// 只要它的上一级（010-bookbinding）存在就用它；换机器/找不到时自动回退到仓库内 book-export。
// 也可用环境变量 BOOK_EXPORT_DIR 覆盖。
const ICLOUD_OUT = '/Users/eiki/Library/Mobile Documents/com~apple~CloudDocs/iGHONE Works/2025.3.15-忘れられた傘/010-bookbinding/book-export';
const OUT = process.env.BOOK_EXPORT_DIR
  ? path.resolve(process.env.BOOK_EXPORT_DIR)
  : (fs.existsSync(path.dirname(ICLOUD_OUT)) ? ICLOUD_OUT : path.join(ROOT, 'book-export'));
const IMG_OUT = path.join(OUT, 'images');
const THUMB_OUT = path.join(OUT, 'thumbs');
const VERSIONS = path.join(OUT, 'versions');
const FORCE_IMG = process.argv.includes('--rebuild-images');
fs.mkdirSync(IMG_OUT, { recursive: true });
fs.mkdirSync(THUMB_OUT, { recursive: true });
fs.mkdirSync(VERSIONS, { recursive: true });

const records = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/umbrellas.json'), 'utf8'));

// ---------- 隐藏的伞（filebox/hidden/**）----------
// 这些记录被移出了 filebox/records，不会进 data/umbrellas.json，网站上也看不到；
// 但书籍导出仍要收录它们，标注 Hidden=yes 并排到表格最上方（用户 2026-08-10 要求）。
function parseCategoryFolder(name) {
  const m = name.match(/^(.*)\((.*)\)$/);
  return m ? { category: m[1] || 'unknown', categoryGroup: m[2] || '' } : { category: name || 'unknown', categoryGroup: '' };
}
function loadHiddenRecords() {
  const root = path.join(ROOT, 'filebox', 'hidden');
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const catDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!catDir.isDirectory()) continue;
    const { category, categoryGroup } = parseCategoryFolder(catDir.name);
    const catAbs = path.join(root, catDir.name);
    for (const recDir of fs.readdirSync(catAbs, { withFileTypes: true })) {
      if (!recDir.isDirectory()) continue;
      const recPath = path.join(catAbs, recDir.name, 'record.json');
      if (!fs.existsSync(recPath)) continue;
      const raw = readRecordSync(recPath);
      if (!raw) continue;
      const media = Array.isArray(raw.media) ? raw.media : [];
      const primary = media.find((m) => m?.role === 'primary') || media[0];
      if (!primary?.file) continue;
      const original = toPosix(path.relative(ROOT, path.join(catAbs, recDir.name, primary.file)));
      out.push({
        ...raw,
        _hidden: true,
        id: recDir.name,
        category, categoryGroup,
        image: original, imageOriginal: original,
        sourceIndex: Number.isInteger(raw.sourceIndex) ? raw.sourceIndex : Number.MAX_SAFE_INTEGER,
        submissionType: raw.submissionType === 'contributed' ? 'contributed' : 'own',
      });
    }
  }
  return out;
}
// record.json 带 // 注释，用同一套解析（record-utils）。这里同步包装一下。
function readRecordSync(p) {
  try {
    const txt = fs.readFileSync(p, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    return JSON.parse(txt);
  } catch { return null; }
}
for (const h of loadHiddenRecords()) records.push(h);

// 排序：隐藏的排最上方，其余按 sourceIndex。
records.sort((a, b) => (b._hidden ? 1 : 0) - (a._hidden ? 1 : 0) || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0));

// ---------- 小工具 ----------
const NUM = { 1: '', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
const pick = (v, lang) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v[lang] ?? '';
  return String(v);
};
const isContrib = (r) => r.submissionType === 'contributed';
const idOf = (r) => (r.displayId || '').trim() || r.id || '';
const typeOf = (r) => (r.categoryGroup ? `${r.category}(${r.categoryGroup})` : r.category || '');
// Windows、macOS 和 iCloud 都不接受文件夹名以句号/空格结尾；显示 ID 本身不改，只处理导出文件夹名。
const safeName = (r) => idOf(r).replace(/[\/\\]/g, '_').replace(/[. ]+$/g, '_') || 'unnamed';

function buildObject(rec) {
  const units = Array.isArray(rec.umbrellaUnits) ? rec.umbrellaUnits : [];
  // 没有逐把伞的信息时：数量明确标了 unknown → 显示 "unknown"（区别于漏填）；完全没填 → 留空。
  if (!units.length) return rec.umbrellaCount === 'unknown' ? 'unknown' : '';
  const groups = new Map();
  for (const u of units) {
    const color = (u.colorDetail || (u.color === 'transparent' ? 'transparent' : u.color) || '').trim();
    const kind = (u.kind || '').trim();
    const key = color + '|' + kind;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const parts = [];
  for (const [key, n] of groups) {
    const [color, kind] = key.split('|');
    const words = [NUM[n] ?? String(n), color, kind].filter(Boolean);
    if (words.length) parts.push(words.join(' '));
  }
  return parts.join('; ');
}
function buildState(rec) {
  const set = new Set();
  for (const u of rec.umbrellaUnits || []) {
    (u.status || []).forEach((s) => s && set.add(s));
    if (u.statusOther) set.add(u.statusOther);
  }
  return [...set].join(', ');
}
function storyOf(rec, lang) {
  const parts = [];
  for (const b of rec.blocks || []) {
    if (b && b.type === 'text') {
      const t = pick(b.text, lang);
      if (t) parts.push(t);
    }
  }
  if (parts.length) return parts.join('\n');
  return lang === 'ja' ? (typeof rec.story === 'string' ? rec.story : pick(rec.story, 'ja')) : '';
}
function dialogueOf(rec, lang) {
  const parts = [];
  for (const b of rec.blocks || []) {
    if (b && b.type === 'dialogue') {
      const t = pick(b.text, lang);
      if (t) parts.push(t);
    }
  }
  if (parts.length) return parts.join('\n');
  return pick(rec.story, lang);
}
const rawTime = (rec) => rec.time || rec.photoTime || rec.submissionTime || '';
function fmtDate(raw) {
  if (!raw) return { full: '', ym: '', ts: Number.POSITIVE_INFINITY };
  // 日期与时间之间可能是 T、空格，或手动覆盖时存的「逗号+空格」（如 "2026.05.02, 19:56"）。
  const m = String(raw).match(/(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T ,]\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return { full: String(raw), ym: '', ts: Number.POSITIVE_INFINITY };
  const [, y, mo, d, h, mi] = m;
  const Y = y, M = mo.padStart(2, '0'), D = d ? d.padStart(2, '0') : '';
  let full;
  if (D && h != null) full = `${Y}.${M}.${D}, ${h}:${mi}`;
  else if (D) full = `${Y}.${M}.${D}`;
  else full = `${Y}.${M}`;
  const H = h != null ? h.padStart(2, '0') : '00';
  const parsedTs = new Date(`${Y}-${M}-${D || '01'}T${H}:${mi ?? '00'}:00`).getTime();
  const ts = Number.isFinite(parsedTs) ? parsedTs : Number.POSITIVE_INFINITY;
  return { full, ym: `${Y}.${M}`, ts };
}
function csv(rows) {
  return rows
    .map((row) =>
      row
        .map((v) => {
          const s = v == null ? '' : String(v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(',')
    )
    .join('\r\n');
}
function imgSize(p) {
  try {
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', p], { encoding: 'utf8' });
    return { w: +(out.match(/pixelWidth:\s*(\d+)/) || [])[1] || 0, h: +(out.match(/pixelHeight:\s*(\d+)/) || [])[1] || 0 };
  } catch {
    return { w: 0, h: 0 };
  }
}

// ---------- 图片（共享，增量生成） ----------
// 结构：images/<ID>/ 一个文件夹 = 一把伞的全部图片（主图 + 补充/细节/插画），不再按角色分类。
//   · 主图命名 <ID>.<ext>，CSV 数据合并只指向它；
//   · 其余图按顺序 <ID>_2 / <ID>_3 …，方便手动排版时在同一文件夹里挑选；
//   · webp/heic 一律转 jpg（老版 InDesign 兼容）；
//   · 动画（.mov/.mp4/…）不能进印刷，单独收到 book-export/videos/，命名 <ID>_vN.<ext>。
const VIDEO_OUT = path.join(OUT, 'videos');
fs.mkdirSync(VIDEO_OUT, { recursive: true });
const VIDEO_EXT = new Set(['.mov', '.mp4', '.m4v', '.avi', '.webm', '.mkv']);
const CONVERT_EXT = new Set(['.webp', '.heic', '.heif']); // 这些转成 jpg
const imgRel = {}; // id -> images/<ID>/<主图>（相对 book-export 根）
const thumbRel = {}; // id -> thumbs/xxx.jpg
const manifestRows = [['ID', 'Source', 'Image File', 'Origin', 'Pixels', 'A4 full-page @300dpi?', '文件夹内图片数', '动画数']];
let missing = 0, lowres = 0, madeImg = 0, madeThumb = 0, madeExtra = 0, madeVideo = 0;

// 旧版扁平结构清理：images/ 根目录下若残留旧的散图文件（非文件夹），删掉（都是生成物，安全）。
for (const e of fs.readdirSync(IMG_OUT, { withFileTypes: true })) {
  if (e.isFile()) { try { fs.rmSync(path.join(IMG_OUT, e.name)); } catch {} }
}

// 把一张原图落地到目标路径：统一烘焙 EXIF 方向，避免 InDesign 数据合并把竖图转错。
// sharp 默认不写回旧 EXIF，所以导出图会变成「像素已转正 + orientation 归零」。
async function materialize(srcAbs, destAbs, ext) {
  if (!FORCE_IMG && fs.existsSync(destAbs)) return false;
  // iCloud 对 sharp 直接写入/原子替换有时会返回 EPERM；先写到本地临时文件，再复制到 iCloud。
  const tempAbs = path.join('/private/tmp', `forgotten-umbrella-${process.pid}-${Date.now()}${path.extname(destAbs)}`);
  try {
    await sharp(srcAbs).rotate().toFile(tempAbs);
  } catch (error) {
    if (!CONVERT_EXT.has(ext)) throw error;
    execFileSync('sips', ['-s', 'format', 'jpeg', srcAbs, '--out', tempAbs], { stdio: 'ignore' });
  }
  fs.copyFileSync(tempAbs, destAbs);
  fs.rmSync(tempAbs, { force: true });
  return true;
}

// 文件夹名去重：不同记录若 displayId/id 撞名（如两条 yueliang(5)），会落进同一文件夹互相覆盖。
// 这里保证每条记录一个独立文件夹（撞名的自动加 __2/__3 后缀），并记录下来最后提醒用户去数据里改。
const usedNm = new Set();
const nameCollisions = [];
for (const rec of records) {
  const id = rec.id;
  const primarySrc = rec.imageOriginal || rec.image || '';
  const primaryAbs = primarySrc ? path.join(ROOT, primarySrc) : '';
  const baseNm = safeName(rec);
  let nm = baseNm;
  if (usedNm.has(nm)) {
    let k = 2;
    while (usedNm.has(`${baseNm}__${k}`)) k++;
    nm = `${baseNm}__${k}`;
    nameCollisions.push({ display: baseNm, folder: nm, id });
  }
  usedNm.add(nm);
  const source = isContrib(rec) ? 'contributed' : 'own';
  if (!primaryAbs || !fs.existsSync(primaryAbs)) {
    missing++;
    manifestRows.push([id, source, '(missing)', primarySrc, '', 'NO IMAGE', 0, 0]);
    continue;
  }
  const recDir = path.dirname(primaryAbs); // 记录文件夹（补充图与主图同目录）
  const destDir = path.join(IMG_OUT, nm);
  fs.mkdirSync(destDir, { recursive: true });

  // 收集该记录的所有 media（主图排第一），逐一落地。
  const media = Array.isArray(rec.media) && rec.media.length
    ? rec.media
    : [{ file: path.basename(primaryAbs), role: 'primary', original: primarySrc }];
  const primary = media.find((m) => m?.role === 'primary') || media[0];
  const ordered = [primary, ...media.filter((m) => m !== primary)];

  const expected = new Set(); // 本文件夹应有的文件名（用于清理旧的多余图）
  let imgK = 1, vidK = 0, folderImgCount = 0, vidCount = 0;
  for (const m of ordered) {
    if (!m || !m.file) continue;
    const mAbs = m.original ? path.join(ROOT, m.original) : path.join(recDir, m.file);
    if (!fs.existsSync(mAbs)) continue;
    const ext = path.extname(mAbs).toLowerCase();
    if (VIDEO_EXT.has(ext)) {
      // 动画：单独放 videos/，不进伞的图片文件夹。
      vidK++; vidCount++;
      const vName = `${nm}_v${vidK}${ext}`;
      const vAbs = path.join(VIDEO_OUT, vName);
      if (FORCE_IMG || !fs.existsSync(vAbs)) { fs.copyFileSync(mAbs, vAbs); madeVideo++; }
      continue;
    }
    const outExt = CONVERT_EXT.has(ext) ? '.jpg' : ext;
    const isPrimary = m === primary;
    const destName = isPrimary ? nm + outExt : `${nm}_${imgK}${outExt}`;
    if (!isPrimary) imgK++;
    expected.add(destName);
    folderImgCount++;
    const destAbs = path.join(destDir, destName);
    if (await materialize(mAbs, destAbs, ext)) { if (isPrimary) madeImg++; else madeExtra++; }
    if (isPrimary) imgRel[id] = 'images/' + nm + '/' + destName;
  }

  // 清理该文件夹里不再需要的旧图（例如以前多的补充图已删除）。
  for (const e of fs.readdirSync(destDir, { withFileTypes: true })) {
    if (e.isFile() && !expected.has(e.name)) { try { fs.rmSync(path.join(destDir, e.name)); } catch {} }
  }

  // 缩略图（索引用，保持扁平 thumbs/<ID>.jpg，从主图生成）。
  const tName = nm + '.jpg';
  const tAbs = path.join(THUMB_OUT, tName);
  if (FORCE_IMG || !fs.existsSync(tAbs)) {
    const tTemp = path.join('/private/tmp', `forgotten-umbrella-thumb-${process.pid}-${Date.now()}.jpg`);
    try {
      await sharp(primaryAbs).rotate().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).jpeg().toFile(tTemp);
      fs.copyFileSync(tTemp, tAbs);
      madeThumb++;
    } catch {} finally { fs.rmSync(tTemp, { force: true }); }
  }
  thumbRel[id] = fs.existsSync(tAbs) ? 'thumbs/' + tName : '';

  const { w, h } = imgSize(primaryAbs);
  const ok = w >= 2480 && h >= 2480 ? 'yes' : w >= 1400 ? 'small only' : 'NO';
  if (ok !== 'yes') lowres++;
  manifestRows.push([id, source, path.basename(imgRel[id] || ''), primarySrc, `${w}x${h}`, ok, folderImgCount, vidCount]);
}

// ---------- 组装每条记录的导出字段 ----------
// CSV 放在 versions/<ts>/ 里，图片在 book-export/images/，相对路径需 ../../
// 排版在 Windows 上做，Windows 版 InDesign 数据合并要反斜杠路径，否则找不到图（显示缺图）。
const UP = '../../';
const winPath = (p) => p.replace(/\//g, '\\');
// 标题合并成一列：格式 (日文/英文)，括号是英文半角。两个都空→空；只有一个→只放那个。
function titleField(rec) {
  const ja = pick(rec.title, 'ja').trim(), en = pick(rec.title, 'en').trim();
  if (!ja && !en) return '';
  return ja && en ? `(${ja}/${en})` : `(${ja || en})`;
}
// InDesign 数据合并会把单元格里的换行当成「新记录」→ 多出空白页。所以 Story 里的换行统一压成空格。
const oneLine = (s) => String(s || '').replace(/\r?\n/g, ' ').replace(/ {2,}/g, ' ').trim();
function ownFields(rec) {
  return {
    Title: titleField(rec), Type: typeOf(rec),
    Date: fmtDate(rawTime(rec)).full, Object: buildObject(rec), State: buildState(rec),
    Location: rec.locationText || '', Story_JP: oneLine(storyOf(rec, 'ja')), Story_EN: oneLine(storyOf(rec, 'en')),
  };
}
function conFields(rec) {
  return {
    Date: fmtDate(rawTime(rec)).full, Location: rec.locationText || '', PhotoBy: rec.submitter || '',
    Note_JP: oneLine(dialogueOf(rec, 'ja')),
    Note_EN: oneLine(dialogueOf(rec, 'en')),
  };
}

// 隐藏的伞（filebox/hidden/**）不进这两份「原本」CSV，单独成表（下面的 hiddenOwnRows/hiddenConRows），
// 列结构完全相同，所以同一套 InDesign 数据合并模板可以直接拿去做隐藏页。
// Folder 列：Excel（Windows）里可点击、直接打开这把伞的图片文件夹去挑图。
//   做法是往单元格里写 =HYPERLINK("相对路径","显示文字")；Excel 打开 CSV 时会把 = 开头的当公式解析。
//   路径用相对（..\..\images\<ID>\），和 @Image 一样以 CSV 自身位置为基准，换机器也能用。
//   （InDesign 数据合并把这列当普通文本，不放到版面上就没影响。）
const OWN_HEAD = ['@Image', 'Folder', 'ID', 'Title', 'Type', 'Date', 'Object', 'State', 'Location', 'Story_JP', 'Story_EN'];
const CON_HEAD = ['@Image', 'Folder', 'ID', 'Date', 'Location', 'PhotoBy', 'Note_JP', 'Note_EN'];
const ownRows = [OWN_HEAD];
const conRows = [CON_HEAD];
const hiddenOwnRows = [OWN_HEAD];
const hiddenConRows = [CON_HEAD];
// 生成一个指向图片文件夹的 Excel 超链接公式；没有图就留空。
const folderLink = (id, label) => {
  if (!imgRel[id]) return '';
  const folderWin = winPath(UP + path.posix.dirname(imgRel[id]) + '/'); // ..\..\images\<ID>\
  return `=HYPERLINK("${folderWin}","${label}")`;
};
const snapshot = {}; // id -> {source, id, fields}
const exportTimeKey = (rec) => fmtDate(rawTime(rec)).ts || Number.POSITIVE_INFINITY;
const mainRowsRecords = [...records].sort((a, b) =>
  exportTimeKey(a) - exportTimeKey(b)
  || (a.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (b.sourceIndex ?? Number.MAX_SAFE_INTEGER)
  || idOf(a).localeCompare(idOf(b), undefined, { numeric: true })
);
for (const rec of mainRowsRecords) {
  const id = rec.id, img = winPath(UP + (imgRel[id] || ''));
  const link = folderLink(id, idOf(rec));
  if (isContrib(rec)) {
    const f = conFields(rec);
    (rec._hidden ? hiddenConRows : conRows).push([img, link, idOf(rec), f.Date, f.Location, f.PhotoBy, f.Note_JP, f.Note_EN]);
    snapshot[id] = { source: 'contributed', id: idOf(rec), fields: { ...f } };
  } else {
    const f = ownFields(rec);
    (rec._hidden ? hiddenOwnRows : ownRows).push([img, link, idOf(rec), f.Title, f.Type, f.Date, f.Object, f.State, f.Location, f.Story_JP, f.Story_EN]);
    snapshot[id] = { source: 'own', id: idOf(rec), fields: { ...f } };
  }
}

// ---------- 三份索引 ----------
const IDX_HEAD = ['Group', 'Source', 'ID', 'Title_JP', 'Title_EN', 'Location', 'Date', '@Thumb', 'PageRef'];
const idxRow = (rec, group) => [
  group, isContrib(rec) ? 'contributed' : 'own', idOf(rec),
  pick(rec.title, 'ja'), pick(rec.title, 'en'), rec.locationText || '', fmtDate(rawTime(rec)).full,
  winPath(UP + (thumbRel[rec.id] || '')),
  `{{PAGE:${idOf(rec)}}}`,
];
// 索引=书籍目录，隐藏的伞不进目录（它们只在单独的 hidden CSV 里）。
const visibleRecords = records.filter((r) => !r._hidden);
const timeSortKey = (r) => fmtDate(rawTime(r)).full ? fmtDate(rawTime(r)).ts : Number.POSITIVE_INFINITY;
const byTime = [...visibleRecords].sort((a, b) => timeSortKey(a) - timeSortKey(b) || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0) || idOf(a).localeCompare(idOf(b), undefined, { numeric: true }));
const timeRows = [IDX_HEAD, ...byTime.map((r) => idxRow(r, fmtDate(rawTime(r)).ym || '(no date)'))];
const pref = (r) => (r.locationLevels && r.locationLevels[0]) || '(unknown)';
const lvl = (r, i) => (r.locationLevels && r.locationLevels[i]) || '';
const isUnknownSortValue = (v) => !String(v || '').trim() || ['unknown', '(unknown)'].includes(String(v).trim().toLowerCase());
const locationSortKey = (r) => isUnknownSortValue(pref(r)) ? '\uffff' : pref(r);
const byLoc = [...visibleRecords].sort((a, b) => locationSortKey(a).localeCompare(locationSortKey(b)) || timeSortKey(a) - timeSortKey(b) || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0) || idOf(a).localeCompare(idOf(b), undefined, { numeric: true }));
const locRows = [IDX_HEAD, ...byLoc.map((r) => idxRow(r, pref(r)))];
const typeSortKey = (r) => isUnknownSortValue(typeOf(r)) ? '\uffff' : typeOf(r);
const byType = [...visibleRecords].sort((a, b) => typeSortKey(a).localeCompare(typeSortKey(b)) || timeSortKey(a) - timeSortKey(b) || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0) || idOf(a).localeCompare(idOf(b), undefined, { numeric: true }));
const typeRows = [IDX_HEAD, ...byType.map((r) => idxRow(r, typeOf(r)))];

// ---------- 差异对比（找上一版快照） ----------
// 版本文件夹名：YYYY-MM-DD_vN（同一天多次导出，N 从 0 递增，不再覆盖）。
// 兼容历史命名：纯日期 YYYY-MM-DD、旧的 YYYY-MM-DD_HHMM（都当作该日 v0 之前的更早版本）。
function parseVersionName(name) {
  let m = name.match(/^(\d{4}-\d{2}-\d{2})_v(\d+)$/);
  if (m) return { date: m[1], ver: Number(m[2]) };
  m = name.match(/^(\d{4}-\d{2}-\d{2})(?:_\d{4})?$/); // 纯日期 或 旧 _HHMM
  if (m) return { date: m[1], ver: -1 };
  return { date: name, ver: -1 };
}
function listVersions() {
  if (!fs.existsSync(VERSIONS)) return [];
  return fs.readdirSync(VERSIONS)
    .filter((d) => fs.existsSync(path.join(VERSIONS, d, '_snapshot.json')))
    .map((name) => { const p = parseVersionName(name); return { name, ...p, key: p.date + '#' + String(p.ver + 100000).padStart(7, '0') }; })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
const existingVersions = listVersions();
const prevName = existingVersions.length ? existingVersions[existingVersions.length - 1].name : null;
let prevSnap = null;
if (prevName) {
  try { prevSnap = JSON.parse(fs.readFileSync(path.join(VERSIONS, prevName, '_snapshot.json'), 'utf8')); } catch {}
}
const changes = { added: [], changed: [], removed: [] };
if (prevSnap) {
  for (const id of Object.keys(snapshot)) {
    if (!prevSnap[id]) { changes.added.push(id); continue; }
    const a = prevSnap[id].fields, b = snapshot[id].fields;
    const diffFields = Object.keys(b).filter((k) => (a[k] ?? '') !== (b[k] ?? ''));
    if (prevSnap[id].id !== snapshot[id].id) diffFields.unshift('ID/DisplayName');
    if (diffFields.length) changes.changed.push({ id, fields: diffFields });
  }
  for (const id of Object.keys(prevSnap)) if (!snapshot[id]) changes.removed.push(id);
}

// ---------- 写版本文件夹 ----------
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
// 文件夹名 = 当天日期 + _vN。当天第一份是 _v0，之后每导一次 N 自增，旧的都保留。
const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const todayMaxVer = existingVersions
  .filter((v) => v.date === dateStr && v.ver >= 0)
  .reduce((m, v) => Math.max(m, v.ver), -1);
const ts = `${dateStr}_v${todayMaxVer + 1}`;
const VDIR = path.join(VERSIONS, ts);
fs.mkdirSync(VDIR, { recursive: true });
// CSV 用 UTF-16LE + BOM（Windows/InDesign 的原生「Unicode」格式）写：
//   · InDesign 数据合并不认 UTF-8 的 BOM（会报「不含记录/不受支持」），但认 UTF-16；
//   · UTF-16 也解决日文乱码（Windows Excel / InDesign 都能正确读）；Mac 的 Numbers/Excel 也正常。
// Node \u7684 'utf16le' \u53EA\u5199\u6B63\u6587\u4E0D\u5199 BOM\uFF0C\u6240\u4EE5\u5148\u62FC\u4E00\u4E2A U+FEFF\uFF0C\u7F16\u7801\u540E\u5F00\u5934\u5C31\u662F LE BOM(FF FE)\u3002
const writeUtf16 = (p, text) => fs.writeFileSync(p, Buffer.from('\uFEFF' + text, 'utf16le'));
const w = (name, rows) => writeUtf16(path.join(VDIR, name), csv(rows));
w('umbrellas-own.csv', ownRows);
w('umbrellas-contributed.csv', conRows);
// 隐藏的伞单独成表（只有存在时才写，避免生成空文件）。
if (hiddenOwnRows.length > 1) w('umbrellas-hidden-own.csv', hiddenOwnRows);
if (hiddenConRows.length > 1) w('umbrellas-hidden-contributed.csv', hiddenConRows);
w('index-by-time.csv', timeRows);
w('index-by-location.csv', locRows);
w('index-by-type.csv', typeRows);
w('manifest.csv', manifestRows);
fs.writeFileSync(path.join(VDIR, '_snapshot.json'), JSON.stringify(snapshot, null, 0), 'utf8');

// 额外修改目录是排版用的独立目录版本，沿用既有本地脚本生成规则。
const extraIndexFiles = [
  'index-by-time_额外修改.csv',
  'index-by-location_额外修改.csv',
  'index-by-type_额外修改.csv',
  'index-for-table.csv',
  'index-for-table_额外修改.csv',
  '目录分段说明.md',
];
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'export-indexes-local.mjs')], { cwd: ROOT, stdio: 'ignore' });
  for (const name of extraIndexFiles) {
    const src = path.join(ROOT, '导出表格', name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(VDIR, name));
  }
} catch (error) {
  console.warn(`⚠️ 额外修改目录生成失败：${error.message}`);
}

// CHANGES.md + changes.csv
const titleOf = (id) => {
  const s = snapshot[id] || (prevSnap && prevSnap[id]);
  // Title 已是 (日/英) 格式（旧快照可能还是 Title_JP/Title_EN，做个兼容拼接）。
  const t = s ? (s.fields.Title || [s.fields.Title_JP, s.fields.Title_EN].filter(Boolean).join('/')) : '';
  return t ? ` ${t}` : '';
};
let md = `# 变更对比：${ts}`;
md += prevName ? ` ← 上一版 ${prevName}\n\n` : `（首个版本，无对比基准）\n\n`;
if (!prevSnap) {
  md += `这是第一个版本，共 ${records.length} 条记录。\n`;
} else {
  md += `## ➕ 新增 ${changes.added.length} 条\n`;
  md += changes.added.length ? changes.added.map((id) => `- ${snapshot[id].id} ${titleOf(id)} — ${snapshot[id].fields.Type || snapshot[id].source}`).join('\n') + '\n' : '（无）\n';
  md += `\n## ✏️ 修改 ${changes.changed.length} 条\n`;
  md += changes.changed.length ? changes.changed.map((c) => `- ${snapshot[c.id].id} ${titleOf(c.id)} — 改动字段：${c.fields.join('、')}`).join('\n') + '\n' : '（无）\n';
  md += `\n## ➖ 删除 ${changes.removed.length} 条\n`;
  md += changes.removed.length ? changes.removed.map((id) => `- ${prevSnap[id].id} ${titleOf(id)}`).join('\n') + '\n' : '（无）\n';
}
const ownN = ownRows.length - 1, conN = conRows.length - 1;
const hOwnN = hiddenOwnRows.length - 1, hConN = hiddenConRows.length - 1;
md += `\n## 合计\n自己拍 ${ownN}｜投稿 ${conN}｜隐藏（单独表）自己拍 ${hOwnN}+投稿 ${hConN}｜总 ${records.length}\n`;
md += `\n> InDesign 里只需按上面「新增/修改」补对应的页即可，不用整本重做。删除的伞记得从书里撤下。\n`;
fs.writeFileSync(path.join(VDIR, 'CHANGES.md'), md, 'utf8');

const chRows = [['Change', 'ID', 'Source', 'Fields', 'Title']];
for (const id of changes.added) chRows.push(['added', snapshot[id].id, snapshot[id].source, '', snapshot[id].fields.Title || '']);
for (const c of changes.changed) chRows.push(['changed', snapshot[c.id].id, snapshot[c.id].source, c.fields.join(' '), snapshot[c.id].fields.Title || '']);
for (const id of changes.removed) chRows.push(['removed', prevSnap[id].id, prevSnap[id].source, '', prevSnap[id].fields.Title || '']);
writeUtf16(path.join(VDIR, 'changes.csv'), csv(chRows));

// own/contributed 分开，方便 InDesign 只导入需要补页的那一类记录。
const changeEvents = [
  ...changes.added.map((id) => ({ type: 'added', id })),
  ...changes.changed.map((entry) => ({ type: 'changed', id: entry.id })),
  ...changes.removed.map((id) => ({ type: 'removed', id })),
];
const currentRowsById = new Map([...ownRows.slice(1), ...conRows.slice(1)].map((row) => [row[2], row]));
const oldValues = (record, source) => {
  const f = record.fields || {};
  if (source === 'own') return ['', '', record.id || '', f.Title || '', f.Type || '', f.Date || '', f.Object || '', f.State || '', f.Location || '', f.Story_JP || '', f.Story_EN || ''];
  return ['', '', record.id || '', f.Date || '', f.Location || '', f.PhotoBy || '', f.Note_JP || '', f.Note_EN || ''];
};
const writeSplitChanges = (name, source, headers) => {
  const rows = [['Change', ...headers]];
  for (const event of changeEvents) {
    const record = snapshot[event.id] || (prevSnap && prevSnap[event.id]);
    if (!record || record.source !== source) continue;
    const currentRow = snapshot[event.id] ? currentRowsById.get(snapshot[event.id].id) : null;
    rows.push([event.type, ...(currentRow || oldValues(record, source))]);
  }
  writeUtf16(path.join(VDIR, name), csv(rows));
};
writeSplitChanges('changes-own.csv', 'own', OWN_HEAD);
writeSplitChanges('changes-contributed.csv', 'contributed', CON_HEAD);

// README（固定，说明如何使用）
fs.writeFileSync(path.join(OUT, 'README.txt'),
`忘れられた傘 / Forgotten Umbrellas —— 书籍数据导出包
========================================================
这个文件夹由 scripts/export-book.mjs 自动生成，请勿手改（改了下次会被覆盖）。

【文件夹结构】
  images/<ID>/   每把伞一个文件夹，里面是这把伞的全部图片（主图 + 补充/细节/插画，
                 全放一起，不分类）。主图叫 <ID>.jpg，其余叫 <ID>_2.jpg / <ID>_3.jpg…
                 手动排版时到对应 ID 的文件夹里挑图即可。webp/heic 已转 jpg。
  videos/        补充里的动画（.mov/.mp4…），不能进印刷，单独放这里备查
  thumbs/        索引用小图（600px jpg，一把伞一张，用主图生成）
  versions/      每次导出一个独立版本（时间戳命名），旧版本永不改动
  README.txt     本说明

【每个版本文件夹里】
  umbrellas-own.csv          自己拍的伞（InDesign 数据合并用；不含隐藏的）
  umbrellas-contributed.csv  投稿伞（不含隐藏的）
  umbrellas-hidden-own.csv         隐藏的·自己拍（列和上面一样，可套同一个模板；有隐藏时才生成）
  umbrellas-hidden-contributed.csv 隐藏的·投稿
  index-by-time / location / type .csv   三份目录数据（不含隐藏的）
  index-by-time / location / type _额外修改.csv   加入额外图片后的排版目录
  目录分段说明.md         额外修改目录的分组范围说明（仅供查看）
  manifest.csv               配图清单 + 印刷分辨率体检
  CHANGES.md                 和上一版的差异（先看这个！）
  changes-own.csv            自己拍的变更页补页数据
  changes-contributed.csv    投稿变更页补页数据
  changes.csv                差异表格版
  _snapshot.json             机器对比用，勿删

【InDesign 里怎么用】
  1. 用最新版本文件夹里的 CSV 做数据合并。
  2. CSV 里图片是相对路径（../../images/…），所以 CSV 必须留在它自己的版本
     文件夹里、images/ 和 thumbs/ 留在 book-export 根下，别拆开。
  3. 更新书籍时：先看新版本的 CHANGES.md，只补「新增/修改」的那几页即可。

【怎么重新生成】
  在 Mac 项目目录里跑：
    npm run records:build && node scripts/export-book.mjs
  （第一条把录入的数据聚合，第二条导出一个带当前时间戳的新版本。）
`, 'utf8');

console.log(`✅ 导出完成 → ${path.join(OUT, 'versions', ts)}/`);
console.log(`   记录 ${records.length}：自己拍 ${ownN} + 投稿 ${conN}｜隐藏单独表 ${hOwnN}+${hConN}｜缺图 ${missing}｜低分辨率 ${lowres}`);
console.log(`   图片：新增主图 ${madeImg}、补充图 ${madeExtra}、动画 ${madeVideo}、缩略图 ${madeThumb}（已存在的跳过；--rebuild-images 强制重生）`);
if (prevSnap) console.log(`   对比上一版 ${prevName}：新增 ${changes.added.length}、修改 ${changes.changed.length}、删除 ${changes.removed.length}（详见 CHANGES.md）`);
else console.log(`   首个版本，无对比基准。`);
if (nameCollisions.length) {
  console.log(`\n⚠️  发现 ${nameCollisions.length} 条 ID 撞名（已自动改文件夹名避免覆盖，但建议去数据里改成唯一 ID）：`);
  for (const c of nameCollisions) console.log(`     "${c.display}" 撞名 → 文件夹改为 ${c.folder}（记录 ${c.id}）`);
}
