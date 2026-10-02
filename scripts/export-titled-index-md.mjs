#!/usr/bin/env node
// 根据三份原始目录 CSV 的顺序，生成便于人工查看的标题图片清单。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, '导出表格');
const OUT = path.join(DIR, '有标题图片清单.md');

function parseCsv(file) {
  const text = fs.readFileSync(path.join(DIR, file), 'utf16le').replace(/^\uFEFF/, '');
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
  const header = rows.shift();
  return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(header.map((key, i) => [key, r[i] || ''])));
}

const sections = [
  ['时间目录', 'index-by-time.csv'],
  ['地点目录', 'index-by-location.csv'],
  ['类型目录', 'index-by-type.csv'],
];
const lines = [
  '# 有标题图片清单',
  '',
  '> 按三份原始目录 CSV 的顺序整理。只列出填写了标题的图片；标题格式为“日文标题/英文标题”。',
  '',
];
for (const [label, file] of sections) {
  const rows = parseCsv(file).filter((r) => r.Title_JP.trim() || r.Title_EN.trim());
  lines.push(`## ${label}`, '', '| 序号 | 图片 ID | 标题 |', '|---:|---|---|');
  rows.forEach((r, i) => {
    const title = `${r.Title_JP.trim()}/${r.Title_EN.trim()}`;
    lines.push(`| ${i + 1} | ${r.ID} | ${title.replace(/\|/g, '\\|')} |`);
  });
  lines.push('', `共 ${rows.length} 张`, '');
}
fs.writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`已生成：${OUT}`);
