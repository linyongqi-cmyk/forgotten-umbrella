#!/usr/bin/env node
// 给一个已经导出的书籍版本补写 InDesign 变更 CSV 和详细 CHANGES.md。
import fs from 'node:fs';
import path from 'node:path';

const VDIR = path.resolve(process.env.BOOK_VERSION_DIR || '');
if (!VDIR || !fs.existsSync(path.join(VDIR, '_snapshot.json'))) {
  throw new Error('请设置 BOOK_VERSION_DIR，例如指向 2026-09-21_v0。');
}

function parseCsv(file) {
  const text = fs.readFileSync(file, 'utf16le').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(head.map((key, i) => [key, r[i] || ''])));
}

const writeUtf16 = (file, text) => fs.writeFileSync(file, Buffer.from('\uFEFF' + text, 'utf16le'));
const csv = (rows) => rows.map((row) => row.map((value) => {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\r\n');
const oneLine = (value) => String(value ?? '').replace(/\r?\n/g, ' ').replace(/ {2,}/g, ' ').trim();
const shown = (value) => oneLine(value) || '（空）';

const currentSnapshot = JSON.parse(fs.readFileSync(path.join(VDIR, '_snapshot.json'), 'utf8'));
const versionRoot = path.dirname(VDIR);
const currentName = path.basename(VDIR);
const previousName = fs.readdirSync(versionRoot)
  .filter((name) => name !== currentName && fs.existsSync(path.join(versionRoot, name, '_snapshot.json')))
  .sort()
  .pop();
const previousSnapshot = previousName
  ? JSON.parse(fs.readFileSync(path.join(versionRoot, previousName, '_snapshot.json'), 'utf8'))
  : {};

const added = Object.keys(currentSnapshot).filter((id) => !previousSnapshot[id]);
const changed = Object.keys(currentSnapshot).map((id) => {
  if (!previousSnapshot[id]) return null;
  const before = previousSnapshot[id].fields || {}, after = currentSnapshot[id].fields || {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]);
  if (previousSnapshot[id].id !== currentSnapshot[id].id) fields.unshift('ID/显示名');
  return fields.length ? { id, fields } : null;
}).filter(Boolean);
const removed = Object.keys(previousSnapshot).filter((id) => !currentSnapshot[id]);

const ownHead = parseCsv(path.join(VDIR, 'umbrellas-own.csv'));
const conHead = parseCsv(path.join(VDIR, 'umbrellas-contributed.csv'));
const ownHeaders = ['@Image', 'Folder', 'ID', 'Title', 'Type', 'Date', 'Object', 'State', 'Location', 'Story_JP', 'Story_EN'];
const conHeaders = ['@Image', 'Folder', 'ID', 'Date', 'Location', 'PhotoBy', 'Note_JP', 'Note_EN'];
const previousDir = previousName ? path.join(versionRoot, previousName) : null;
const previousOwn = previousDir && fs.existsSync(path.join(previousDir, 'umbrellas-own.csv')) ? parseCsv(path.join(previousDir, 'umbrellas-own.csv')) : [];
const previousCon = previousDir && fs.existsSync(path.join(previousDir, 'umbrellas-contributed.csv')) ? parseCsv(path.join(previousDir, 'umbrellas-contributed.csv')) : [];
const indexById = (rows) => new Map(rows.map((r) => [r.ID, ownHeaders.map((key) => r[key] || '')]));
const ownNow = indexById(ownHead), conNow = new Map(conHead.map((r) => [r.ID, conHeaders.map((key) => r[key] || '')]));
const ownBefore = indexById(previousOwn), conBefore = new Map(previousCon.map((r) => [r.ID, conHeaders.map((key) => r[key] || '')]));

function writeChangeCsv(filename, source, headers, now, before) {
  const rows = [['Change', ...headers]];
  const events = [
    ...added.map((id) => ({ type: 'added', id })),
    ...changed.map((entry) => ({ type: 'changed', ...entry })),
    ...removed.map((id) => ({ type: 'removed', id })),
  ];
  for (const event of events) {
    const record = currentSnapshot[event.id] || previousSnapshot[event.id];
    if (!record || record.source !== source) continue;
    const values = now.get(record.id) || before.get(record.id) || new Array(headers.length).fill('');
    if (!values[2]) values[2] = record.id;
    rows.push([event.type, ...values]);
  }
  writeUtf16(path.join(VDIR, filename), csv(rows));
}
writeChangeCsv('changes-own.csv', 'own', ownHeaders, ownNow, ownBefore);
writeChangeCsv('changes-contributed.csv', 'contributed', conHeaders, conNow, conBefore);

const titleOf = (record) => record?.fields?.Title ? ` ${record.fields.Title}` : '';
const detail = (entry) => entry.fields.map((field) => {
  if (field === 'ID/显示名') return `${field}（${shown(previousSnapshot[entry.id]?.id)} → ${shown(currentSnapshot[entry.id]?.id)}）`;
  return `${field}（${shown(previousSnapshot[entry.id]?.fields?.[field])} → ${shown(currentSnapshot[entry.id]?.fields?.[field])}）`;
}).join('、');
let md = `# 变更对比：${currentName}`;
md += previousName ? ` ← 上一版 ${previousName}\n\n` : '（无上一版）\n\n';
md += `## ➕ 新增 ${added.length} 条\n`;
md += added.length ? added.map((id) => `- ${currentSnapshot[id].id}${titleOf(currentSnapshot[id])} — ${currentSnapshot[id].source}`).join('\n') + '\n' : '（无）\n';
md += `\n## ✏️ 修改 ${changed.length} 条\n`;
md += changed.length ? changed.map((entry) => `- ${currentSnapshot[entry.id].id}${titleOf(currentSnapshot[entry.id])} — ${detail(entry)}`).join('\n') + '\n' : '（无）\n';
md += `\n## ➖ 删除 ${removed.length} 条\n`;
md += removed.length ? removed.map((id) => `- ${previousSnapshot[id].id}${titleOf(previousSnapshot[id])} — ${previousSnapshot[id].source}`).join('\n') + '\n' : '（无）\n';
const hiddenOwn = fs.existsSync(path.join(VDIR, 'umbrellas-hidden-own.csv')) ? parseCsv(path.join(VDIR, 'umbrellas-hidden-own.csv')).length : 0;
const hiddenCon = fs.existsSync(path.join(VDIR, 'umbrellas-hidden-contributed.csv')) ? parseCsv(path.join(VDIR, 'umbrellas-hidden-contributed.csv')).length : 0;
const totalRecords = ownHead.length + conHead.length + hiddenOwn + hiddenCon;
md += `\n## 合计\n自己拍 ${ownHead.length}｜投稿 ${conHead.length}｜隐藏（单独表）自己拍 ${hiddenOwn}+投稿 ${hiddenCon}｜总 ${totalRecords}\n`;
md += '\n## 给 InDesign 的补页文件\n';
md += '- `changes-own.csv`：自己拍的新增、修改、删除记录，可直接作为数据合并源。\n';
md += '- `changes-contributed.csv`：投稿的新增、修改、删除记录，可直接作为数据合并源。\n';
md += '- `added` 是新增页，`changed` 是需要替换/更新的页，`removed` 是需要从书中撤下的页。\n';
md += '\n> 图片路径仍然是相对于本版本文件夹的路径；CSV 使用 UTF-16LE，适合 Windows/InDesign。\n';
fs.writeFileSync(path.join(VDIR, 'CHANGES.md'), md, 'utf8');
const summaryRows = [['Change', 'ID', 'Source', 'Fields', 'Title']];
for (const id of added) summaryRows.push(['added', currentSnapshot[id].id, currentSnapshot[id].source, '', currentSnapshot[id].fields.Title || '']);
for (const entry of changed) summaryRows.push(['changed', currentSnapshot[entry.id].id, currentSnapshot[entry.id].source, entry.fields.join(' '), currentSnapshot[entry.id].fields.Title || '']);
for (const id of removed) summaryRows.push(['removed', previousSnapshot[id].id, previousSnapshot[id].source, '', previousSnapshot[id].fields.Title || '']);
writeUtf16(path.join(VDIR, 'changes.csv'), csv(summaryRows));
console.log(`已写入 ${path.join(VDIR, 'changes-own.csv')}`);
console.log(`已写入 ${path.join(VDIR, 'changes-contributed.csv')}`);
console.log(`已更新 ${path.join(VDIR, 'CHANGES.md')}`);
