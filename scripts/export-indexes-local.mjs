#!/usr/bin/env node
// 只在本地生成目录 CSV，不处理图片，也不写入 iCloud。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '导出表格');
fs.mkdirSync(OUT, { recursive: true });
const sourceRecords = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/umbrellas.json'), 'utf8')).filter((r) => !r._hidden);
const parent8622 = sourceRecords.find((r) => r.id === 'IMG_8622');
const extraImages = parent8622 ? [
  { ...parent8622, id: 'IMG_8245', displayId: 'IMG_8245', time: '2026-03-10T20:15:42+09:00', photoTime: '', title: { ja: '', en: '' }, _extra: true },
  { ...parent8622, id: 'IMG_8621', displayId: 'IMG_8621', time: '2026-04-24T18:25:04+09:00', photoTime: '', title: { ja: '', en: '' }, _extra: true },
] : [];
const modifiedRecords = sourceRecords.filter((r) => r.id !== 'IMG_8622').concat(extraImages);
const idOf = (r) => (r.displayId || '').trim() || r.id || '';
const typeOf = (r) => r.categoryGroup ? `${r.category}(${r.categoryGroup})` : r.category || '';
const NUM = { 1: '', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
function buildObject(rec) {
  const units = Array.isArray(rec.umbrellaUnits) ? rec.umbrellaUnits : [];
  if (!units.length) return rec.umbrellaCount === 'unknown' ? 'unknown' : '';
  const groups = new Map();
  for (const unit of units) {
    const color = (unit.colorDetail || (unit.color === 'transparent' ? 'transparent' : unit.color) || '').trim();
    const kind = (unit.kind || '').trim();
    const key = `${color}|${kind}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups].map(([key, count]) => {
    const [color, kind] = key.split('|');
    return [NUM[count] ?? String(count), color, kind].filter(Boolean).join(' ');
  }).filter(Boolean).join('; ');
}
function buildState(rec) {
  const states = new Set();
  for (const unit of rec.umbrellaUnits || []) {
    (unit.status || []).forEach((status) => status && states.add(status));
    if (unit.statusOther) states.add(unit.statusOther);
  }
  return [...states].join(', ');
}
const rawTime = (r) => r.time || r.photoTime || r.submissionTime || '';
function date(raw) {
  const m = String(raw || '').match(/(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T ,]\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return { full: '', ts: Number.POSITIVE_INFINITY, ym: '' };
  const [, y, mo, d, h, mi] = m;
  const M = mo.padStart(2, '0'), D = d ? d.padStart(2, '0') : '01';
  const full = d ? `${y}.${M}.${D}${h ? `, ${h}:${mi}` : ''}` : `${y}.${M}`;
  const H = h ? h.padStart(2, '0') : '00';
  return { full, ts: new Date(`${y}-${M}-${D}T${H}:${mi || '00'}:00`).getTime(), ym: `${y}.${M}` };
}
const loc = (r, i) => (r.locationLevels && r.locationLevels[i]) || '';
const pref = (r) => loc(r, 0) || '(unknown)';
const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const unknown = (v) => !String(v || '').trim() || ['unknown', '(unknown)'].includes(String(v).trim().toLowerCase());
const locationKey = (r) => unknown(pref(r)) ? '\uffff' : pref(r);
const typeKey = (r) => unknown(typeOf(r)) ? '\uffff' : typeOf(r);
const sortTime = (list) => [...list].sort((a, b) => date(rawTime(a)).ts - date(rawTime(b)).ts || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0) || cmp(idOf(a), idOf(b)));
const sortLocation = (list) => [...list].sort((a, b) => locationKey(a).localeCompare(locationKey(b)) || date(rawTime(a)).ts - date(rawTime(b)).ts || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0) || cmp(idOf(a), idOf(b)));
const sortType = (list) => [...list].sort((a, b) => typeKey(a).localeCompare(typeKey(b)) || date(rawTime(a)).ts - date(rawTime(b)).ts || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0) || cmp(idOf(a), idOf(b)));
const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const write = (name, rows) => fs.writeFileSync(path.join(OUT, name), Buffer.from('\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n'), 'utf16le'));
const head = ['Group', 'Source', 'ID', 'Title_JP', 'Title_EN', 'Location', 'Date', '@Thumb', 'PageRef'];
const thumbOf = (r) => r._extra ? '' : `..\\..\\thumbs\\${idOf(r).replace(/[\\/. ]+$/g, '_')}.jpg`;
const row = (r, group) => [group, r.submissionType === 'contributed' ? 'contributed' : 'own', idOf(r), r.title?.ja || '', r.title?.en || '', r.locationText || '', date(rawTime(r)).full, thumbOf(r), `{{PAGE:${idOf(r)}}}`];
const writeSet = (list, suffix = '') => {
  const byTime = sortTime(list);
  const byLocation = sortLocation(list);
  const byType = sortType(list);
  write(`index-by-time${suffix}.csv`, [head, ...byTime.map((r) => row(r, date(rawTime(r)).ym || '(no date)'))]);
  write(`index-by-location${suffix}.csv`, [head, ...byLocation.map((r) => row(r, unknown(pref(r)) ? '(unknown)' : pref(r)))]);
  write(`index-by-type${suffix}.csv`, [head, ...byType.map((r) => row(r, unknown(typeOf(r)) ? '(unknown)' : typeOf(r)))]);
  return { byTime, byLocation, byType };
};
const original = writeSet(sourceRecords);
const modified = writeSet(modifiedRecords, '_额外修改');

// 给书籍最后的统计/信息表使用：只保留 own，顺序与时间目录一致。
const tableHead = ['ID', 'Time', 'Object', 'State', 'Place', 'Type', 'PageRef'];
const tableRow = (r) => [
  idOf(r),
  date(rawTime(r)).full,
  buildObject(r),
  buildState(r),
  unknown(pref(r)) ? '(unknown)' : pref(r),
  unknown(typeOf(r)) ? '(unknown)' : typeOf(r),
  `{{PAGE:${idOf(r)}}}`,
];
const writeTable = (list, suffix = '') => {
  const rows = sortTime(list.filter((r) => r.submissionType !== 'contributed'));
  write(`index-for-table${suffix}.csv`, [tableHead, ...rows.map(tableRow)]);
  return rows.length;
};
const originalOwnCount = writeTable(sourceRecords);
const modifiedOwnCount = writeTable(modifiedRecords, '_额外修改');
const segmentRows = (list, keyOf) => {
  const rows = [];
  let current = null;
  for (const record of list) {
    const group = keyOf(record);
    if (!current || current.group !== group) {
      current = { group, start: idOf(record), end: idOf(record), count: 0 };
      rows.push(current);
    }
    current.end = idOf(record);
    current.count += 1;
  }
  return rows;
};
const formatSegments = (title, segments) => [
  `## ${title}`, '', '| 分组 | 起始图片 | 结束图片 | 数量 |', '|---|---|---|---:|',
  ...segments.map((s) => `| ${s.group} | ${s.start} | ${s.end} | ${s.count} |`), '',
];
const notes = [
  '# 目录分段说明', '',
  '这是给本人查看的说明文件，不参与任何导出脚本，也不用于 InDesign 数据合并。', '',
  '数据依据：带 `_额外修改` 后缀的三份目录 CSV。每一行的“起始图片～结束图片”表示该分组在目录中的连续范围。不带后缀的三份 CSV 是未加入额外图片、保留 `IMG_8622` 的原始目录。', '',
  ...formatSegments('时间目录', segmentRows(modified.byTime, (r) => date(rawTime(r)).ym || '(no date)')),
  ...formatSegments('地点目录', segmentRows(modified.byLocation, (r) => unknown(pref(r)) ? '(unknown)' : pref(r))),
  ...formatSegments('类型目录', segmentRows(modified.byType, (r) => unknown(typeOf(r)) ? '(unknown)' : typeOf(r))),
];
fs.writeFileSync(path.join(OUT, '目录分段说明.md'), `${notes.join('\n')}\n`, 'utf8');
console.log(`本地目录 CSV 已生成 → ${OUT}`);
console.log(`原始目录 ${sourceRecords.length}：按时间 ${original.byTime.length}，按地点 ${original.byLocation.length}，按类型 ${original.byType.length}，表格 own ${originalOwnCount}`);
console.log(`额外修改目录 ${modifiedRecords.length}：按时间 ${modified.byTime.length}，按地点 ${modified.byLocation.length}，按类型 ${modified.byType.length}，表格 own ${modifiedOwnCount}`);
