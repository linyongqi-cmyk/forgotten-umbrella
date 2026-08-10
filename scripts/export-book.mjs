#!/usr/bin/env node
// 书籍导出脚本（版本化）——只读数据 + 复制/转换图片，绝不修改任何原始记录/原图。
//
// 文件夹结构（book-export/）：
//   images/                    共享主图（印刷用；webp 原图自动转 jpg）
//   thumbs/                    共享索引小图（600px jpg，兼容老版 InDesign）
//   versions/<时间戳>/         每次导出一个独立版本，旧版本永不改动
//       umbrellas-own.csv          自己拍的伞
//       umbrellas-contributed.csv  投稿伞
//       index-by-time.csv          目录①按时间
//       index-by-location.csv      目录②按地点
//       index-by-type.csv          目录③按类型
//       manifest.csv               配图清单 + 印刷分辨率体检
//       CHANGES.md                 与上一版的差异（新增/修改/删除）
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
const safeName = (r) => idOf(r).replace(/[\/\\]/g, '_');

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
const rawTime = (rec) => rec.time || rec.photoTime || rec.submissionTime || '';
function fmtDate(raw) {
  if (!raw) return { full: '', ym: '', ts: 0 };
  // 日期与时间之间可能是 T、空格，或手动覆盖时存的「逗号+空格」（如 "2026.05.02, 19:56"）。
  const m = String(raw).match(/(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T ,]\s*(\d{2}):(\d{2}))?/);
  if (!m) return { full: String(raw), ym: '', ts: 0 };
  const [, y, mo, d, h, mi] = m;
  const Y = y, M = mo.padStart(2, '0'), D = d ? d.padStart(2, '0') : '';
  let full;
  if (D && h != null) full = `${Y}.${M}.${D}, ${h}:${mi}`;
  else if (D) full = `${Y}.${M}.${D}`;
  else full = `${Y}.${M}`;
  const ts = new Date(`${Y}-${M}-${D || '01'}T${h ?? '00'}:${mi ?? '00'}:00`).getTime() || 0;
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
const imgRel = {}; // id -> images/xxx（相对 book-export 根）
const thumbRel = {}; // id -> thumbs/xxx.jpg
const manifestRows = [['ID', 'Source', 'Image File', 'Origin', 'Pixels', 'A4 full-page @300dpi?']];
let missing = 0, lowres = 0, madeImg = 0, madeThumb = 0;

for (const rec of records) {
  const id = rec.id;
  const src = rec.imageOriginal || rec.image || '';
  const srcAbs = src ? path.join(ROOT, src) : '';
  const nm = safeName(rec);
  const source = isContrib(rec) ? 'contributed' : 'own';
  if (!srcAbs || !fs.existsSync(srcAbs)) {
    missing++;
    manifestRows.push([id, source, '(missing)', src, '', 'NO IMAGE']);
    continue;
  }
  const ext = path.extname(srcAbs).toLowerCase();
  const destName = ext === '.webp' ? nm + '.jpg' : nm + ext;
  const destAbs = path.join(IMG_OUT, destName);
  if (FORCE_IMG || !fs.existsSync(destAbs)) {
    if (ext === '.webp') execFileSync('sips', ['-s', 'format', 'jpeg', srcAbs, '--out', destAbs], { stdio: 'ignore' });
    else fs.copyFileSync(srcAbs, destAbs);
    madeImg++;
  }
  imgRel[id] = 'images/' + destName;
  const tName = nm + '.jpg';
  const tAbs = path.join(THUMB_OUT, tName);
  if (FORCE_IMG || !fs.existsSync(tAbs)) {
    try {
      execFileSync('sips', ['-Z', '600', '-s', 'format', 'jpeg', srcAbs, '--out', tAbs], { stdio: 'ignore' });
      madeThumb++;
    } catch {}
  }
  thumbRel[id] = fs.existsSync(tAbs) ? 'thumbs/' + tName : '';
  const { w, h } = imgSize(srcAbs);
  const ok = w >= 2480 && h >= 2480 ? 'yes' : w >= 1400 ? 'small only' : 'NO';
  if (ok !== 'yes') lowres++;
  manifestRows.push([id, source, destName, src, `${w}x${h}`, ok]);
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
    Note_JP: oneLine(pick(rec.submitterNote, 'ja') || (typeof rec.submitterNote === 'string' ? rec.submitterNote : '')),
    Note_EN: oneLine(pick(rec.submitterNote, 'en')),
  };
}

const ownRows = [['@Image', 'Hidden', 'ID', 'Title', 'Type', 'Date', 'Object', 'State', 'Location', 'Story_JP', 'Story_EN']];
const conRows = [['@Image', 'Hidden', 'ID', 'Date', 'Location', 'PhotoBy', 'Note_JP', 'Note_EN']];
const snapshot = {}; // id -> {source, id, fields}
for (const rec of records) {
  const id = rec.id, img = winPath(UP + (imgRel[id] || ''));
  const hidden = rec._hidden ? 'yes' : '';
  if (isContrib(rec)) {
    const f = conFields(rec);
    conRows.push([img, hidden, idOf(rec), f.Date, f.Location, f.PhotoBy, f.Note_JP, f.Note_EN]);
    snapshot[id] = { source: 'contributed', id: idOf(rec), fields: { Hidden: hidden, ...f } };
  } else {
    const f = ownFields(rec);
    ownRows.push([img, hidden, idOf(rec), f.Title, f.Type, f.Date, f.Object, f.State, f.Location, f.Story_JP, f.Story_EN]);
    snapshot[id] = { source: 'own', id: idOf(rec), fields: { Hidden: hidden, ...f } };
  }
}

// ---------- 三份索引 ----------
const IDX_HEAD = ['Group', 'Source', 'ID', 'Title_JP', 'Title_EN', 'Location', 'Date', '@Thumb'];
const idxRow = (rec, group) => [
  group, isContrib(rec) ? 'contributed' : 'own', idOf(rec),
  pick(rec.title, 'ja'), pick(rec.title, 'en'), rec.locationText || '', fmtDate(rawTime(rec)).full,
  winPath(UP + (thumbRel[rec.id] || '')),
];
const byTime = [...records].sort((a, b) => fmtDate(rawTime(a)).ts - fmtDate(rawTime(b)).ts);
const timeRows = [IDX_HEAD, ...byTime.map((r) => idxRow(r, fmtDate(rawTime(r)).ym || '(no date)'))];
const pref = (r) => (r.locationLevels && r.locationLevels[0]) || '(unknown)';
const lvl = (r, i) => (r.locationLevels && r.locationLevels[i]) || '';
const byLoc = [...records].sort((a, b) => pref(a).localeCompare(pref(b)) || lvl(a, 1).localeCompare(lvl(b, 1)) || lvl(a, 2).localeCompare(lvl(b, 2)));
const locRows = [IDX_HEAD, ...byLoc.map((r) => idxRow(r, pref(r)))];
const byType = [...records].sort((a, b) => typeOf(a).localeCompare(typeOf(b)) || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0));
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
w('index-by-time.csv', timeRows);
w('index-by-location.csv', locRows);
w('index-by-type.csv', typeRows);
w('manifest.csv', manifestRows);
fs.writeFileSync(path.join(VDIR, '_snapshot.json'), JSON.stringify(snapshot, null, 0), 'utf8');

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
md += `\n## 合计\n自己拍 ${ownN}｜投稿 ${conN}｜总 ${records.length}\n`;
md += `\n> InDesign 里只需按上面「新增/修改」补对应的页即可，不用整本重做。删除的伞记得从书里撤下。\n`;
fs.writeFileSync(path.join(VDIR, 'CHANGES.md'), md, 'utf8');

const chRows = [['Change', 'ID', 'Source', 'Fields', 'Title']];
for (const id of changes.added) chRows.push(['added', snapshot[id].id, snapshot[id].source, '', snapshot[id].fields.Title || '']);
for (const c of changes.changed) chRows.push(['changed', snapshot[c.id].id, snapshot[c.id].source, c.fields.join(' '), snapshot[c.id].fields.Title || '']);
for (const id of changes.removed) chRows.push(['removed', prevSnap[id].id, prevSnap[id].source, '', prevSnap[id].fields.Title || '']);
writeUtf16(path.join(VDIR, 'changes.csv'), csv(chRows));

// README（固定，说明如何使用）
fs.writeFileSync(path.join(OUT, 'README.txt'),
`忘れられた傘 / Forgotten Umbrellas —— 书籍数据导出包
========================================================
这个文件夹由 scripts/export-book.mjs 自动生成，请勿手改（改了下次会被覆盖）。

【文件夹结构】
  images/        印刷用主图（142 张，webp 已转 jpg）
  thumbs/        索引用小图（600px jpg）
  versions/      每次导出一个独立版本（时间戳命名），旧版本永不改动
  README.txt     本说明

【每个版本文件夹里】
  umbrellas-own.csv          自己拍的伞（InDesign 数据合并用）
  umbrellas-contributed.csv  投稿伞
  index-by-time / location / type .csv   三份目录数据
  manifest.csv               配图清单 + 印刷分辨率体检
  CHANGES.md                 和上一版的差异（先看这个！）
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
console.log(`   记录 ${records.length}：自己拍 ${ownN} + 投稿 ${conN}｜缺图 ${missing}｜低分辨率 ${lowres}`);
console.log(`   图片：新增主图 ${madeImg}、缩略图 ${madeThumb}（已存在的跳过；--rebuild-images 强制重生）`);
if (prevSnap) console.log(`   对比上一版 ${prevName}：新增 ${changes.added.length}、修改 ${changes.changed.length}、删除 ${changes.removed.length}（详见 CHANGES.md）`);
else console.log(`   首个版本，无对比基准。`);
