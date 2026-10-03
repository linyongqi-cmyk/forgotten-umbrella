// 侦测「还没翻译到位」的字段。判据按「每个字段该是什么文字」来定，可靠、不靠猜。
//
//   npm run i18n:scan            只扫 git 改动/新增的记录（平时用，列表短）
//   npm run i18n:scan -- --all   全库扫一遍（偶尔用，也就一秒）
//
// 规则（命中=没翻到位）：
//   [EN]  规定纯英文的字段，含任何 汉字/假名/全角 → 报。100% 可靠。
//         locationText / blurLabel / displayId / submitter / media[].title /
//         colorDetail / statusOther / title.en / blocks[].text.en
//   [en空] 双语字段 ja 有内容但 en 空 → 报（漏译英文）。
//         title / blocks[].text（含对话）
//   [@@]  任何字段含 @@ 手动标记 → 报（你在编辑器里随手打的「请翻译」记号）。
//   [隐藏] 任何上面字段含方向控制字符/零宽/BOM（复制粘贴带进来的垃圾）→ 报。
//   [疑似] title.ja / blocks[].text.ja 无假名且含简体中文专用字 → 低置信提醒，需人工确认。
//
// 说明：真正只能靠「疑似」猜的场景极少——中文标题/段落通常 en 也空，会被 [en空] 抓到。
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { readRecordFile } from "./record-utils.mjs";
import { collectionNameTranslationHits } from "./translation-scan.mjs";

const ROOTS = ["filebox/records", "filebox/hidden"];
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힣]/; // 假名/汉字/扩展/谚文
const FULLWIDTH = /[！-～、-〿]/; // 全角标点/符号
const HIDDEN = /[​-‏‪-‮⁦-⁩﻿]/; // 方向控制/零宽/BOM
const AT = "@@";
// 简体中文专用字（现代日语基本不用）——只当 media 之外 ja 字段的「疑似中文」弱提示
const ZH = new Set(
  "这那们什么怎呢吗观编过时东车图员应认极长门问场边样记录伞买卖见觉话语让给现实发对开关闭题归块链还么虽但所因已经旧剩当该级结继续纸纪约纷纵综绿维绝统丝贝贵费资质账购贴赛轮软转较进远运连选适递邮鸡鸭鸟龙齿齐龟庆队际陆险难页顶顺须顾颜风飞饭饮饿馆验骨鲜麦党华单卫厂厅历压县参双变号叶听启响啊嘛团园围圆图场坏块坚执扩护报担拟挂损换据摄携敌显术机杀杂权条来构枪标栏树档检楼欢欧残毁毕气汉污没济测涂涌润涨渐温游满滚灭灯灵灾炉点炼热爱状独狭猫环电画畅疗疮痒盏盐监盖盘着矿码砖础确".split("")
);

function isEnglishViolation(s) {
  return typeof s === "string" && s.trim() !== "" && (CJK.test(s) || FULLWIDTH.test(s));
}
function hasHidden(s) {
  return typeof s === "string" && HIDDEN.test(s);
}
function hasAt(s) {
  return typeof s === "string" && s.includes(AT);
}
function suspectChinese(s) {
  if (typeof s !== "string" || !CJK.test(s)) return false;
  if (/[぀-ヿ]/.test(s)) return false; // 有假名 → 认作日语
  if (s.includes("的")) return true;
  for (const c of s) if (ZH.has(c)) return true;
  return false;
}

// ---- 一贯性检查（全局，读术语表）--------------------------------------------
const MACRON = /[āīūēōĀĪŪĒŌ]/;
const TOKYO_WARD = /Ward,\s*Tokyo\b/;
const GLOSSARY = "翻译对照表.md";

// 读术语表「## 禁止变体」那张表：`| 正确 | 禁止变体（逗号分隔） |`
function loadForbiddenVariants() {
  if (!fs.existsSync(GLOSSARY)) return [];
  const lines = fs.readFileSync(GLOSSARY, "utf8").split("\n");
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (line.startsWith("#")) inSection = /禁止变体/.test(line);
    if (!inSection || !line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // cells[0]/[last] 是空（首尾 |）；有效列在中间
    const cols = cells.slice(1, -1);
    if (cols.length < 2) continue;
    if (/^正确/.test(cols[0]) || /^-+$/.test(cols[0].replace(/:/g, ""))) continue; // 表头/分隔线
    const correct = cols[0];
    const variants = cols[1].split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (correct && variants.length) out.push({ correct, variants });
  }
  return out;
}

// 收集一条记录里所有「应为英文」的字段值（字段路径 -> 值），供一贯性检查用
function englishFieldValues(j) {
  const out = [];
  const push = (field, v) => { if (typeof v === "string" && v.trim()) out.push([field, v]); };
  push("locationText", j.locationText);
  push("blurLabel", j.blurLabel);
  push("displayId", j.displayId);
  push("submitter", j.submitter);
  if (j.title) push("title.en", j.title.en);
  (j.umbrellaUnits || []).forEach((u, i) => { if (u) { push(`umbrellaUnits[${i}].colorDetail`, u.colorDetail); push(`umbrellaUnits[${i}].statusOther`, u.statusOther); } });
  (j.blocks || []).forEach((b, i) => { if (b && b.text) push(`blocks[${i}].en`, b.text.en); });
  (j.media || []).forEach((m, i) => { if (m) push(`media[${i}].title`, m.title); });
  return out;
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "record.json") out.push(p);
  }
}

function changedRecordFiles() {
  const raw = execSync("git -c core.quotepath=false status --porcelain", { encoding: "utf8" });
  const set = new Set();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let p = line.slice(3).trim();
    if (p.includes(" -> ")) p = p.split(" -> ").pop().trim(); // 重命名取新名
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
    if (!ROOTS.some((r) => p.startsWith(r))) continue;
    if (p.endsWith("record.json")) {
      if (fs.existsSync(p)) set.add(p);
    } else if (p.endsWith("/") || fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const out = [];
      walk(p.replace(/\/$/, ""), out);
      out.forEach((f) => set.add(f));
    }
  }
  return [...set];
}

function siteSettingsChanged() {
  const raw = execSync("git -c core.quotepath=false status --porcelain", { encoding: "utf8" });
  return raw.split("\n").some((line) => line.slice(3).trim().replace(/^"|"$/g, "") === "data/site-settings.json");
}

function scanRecord(file, hits) {
  const j = record(file);
  const id = path.basename(path.dirname(file));
  const add = (field, value, tag) => hits.push({ file, id, field, value, tag });

  const en = (field, v) => {
    if (isEnglishViolation(v)) add(field, v, "EN");
    if (hasHidden(v)) add(field, v, "隐藏");
    if (hasAt(v)) add(field, v, "@@");
  };
  const bilingual = (field, obj) => {
    if (!obj || typeof obj !== "object") return;
    en(field + ".en", obj.en);
    if ((obj.ja || "").trim() && !(obj.en || "").trim()) add(field, obj.ja, "en空");
    if (hasAt(obj.ja)) add(field + ".ja", obj.ja, "@@");
    if (hasHidden(obj.ja)) add(field + ".ja", obj.ja, "隐藏");
    if (suspectChinese(obj.ja)) add(field + ".ja", obj.ja, "疑似");
  };

  bilingual("title", j.title);
  en("locationText", j.locationText);
  en("blurLabel", j.blurLabel);
  en("displayId", j.displayId);
  en("submitter", j.submitter);
  (j.umbrellaUnits || []).forEach((u, i) => {
    if (!u) return;
    en(`umbrellaUnits[${i}].colorDetail`, u.colorDetail);
    en(`umbrellaUnits[${i}].statusOther`, u.statusOther);
  });
  (j.blocks || []).forEach((b, i) => {
    if (b && (b.type === "text" || b.type === "dialogue")) bilingual(`blocks[${i}]`, b.text);
  });
  (j.media || []).forEach((m, i) => {
    if (m) en(`media[${i}].title`, m.title);
  });
  return j;
}

// 缓存：readRecordFile 是 async，这里同步包一层
const _cache = new Map();
function record(file) {
  return _cache.get(file);
}

async function main() {
  const all = process.argv.includes("--all");
  let files = all ? (() => { const o = []; ROOTS.forEach((r) => walk(r, o)); return o.sort(); })() : changedRecordFiles().sort();
  const settingsChanged = !all && siteSettingsChanged();
  if (!all && files.length === 0 && !settingsChanged) {
    console.log("没有 git 改动/新增的记录。要全库扫描用：npm run i18n:scan -- --all");
    return;
  }
  for (const f of files) _cache.set(f, await readRecordFile(f));

  const hits = [];
  const records = files.map((file) => _cache.get(file));
  for (const f of files) scanRecord(f, hits);
  if (all || settingsChanged) {
    const groupFiles = all ? files : (() => { const o = []; ROOTS.forEach((r) => walk(r, o)); return o.sort(); })();
    const allRecords = all ? records : await Promise.all(groupFiles.map((file) => readRecordFile(file)));
    const rawSettings = JSON.parse(fs.readFileSync("data/site-settings.json", "utf8"));
    collectionNameTranslationHits(allRecords, rawSettings?.markerGroups).forEach((hit) => {
      hits.push({ file: "data/site-settings.json", id: hit.id, field: hit.field, value: hit.value, tag: hit.tag });
    });
  } else {
    collectionNameTranslationHits(records, {}).forEach((hit) => {
      hits.push({ file: "data/site-settings.json", id: hit.id, field: hit.field, value: hit.value, tag: hit.tag });
    });
  }

  const byId = new Map();
  for (const h of hits) {
    if (!byId.has(h.file)) byId.set(h.file, []);
    byId.get(h.file).push(h);
  }
  const collectionCount = new Set(hits.filter((hit) => hit.file === "data/site-settings.json").map((hit) => hit.id)).size;
  console.log(`模式：${all ? "全库" : "只看改动/新增"}　扫描 ${files.length} 条记录${all || settingsChanged ? `及 ${collectionCount} 个待检查集合` : ""}\n`);
  if (hits.length === 0) {
    console.log("✓ 没有发现需要翻译的地方。");
    return;
  }
  for (const [file, list] of byId) {
    console.log("=== " + (file === "data/site-settings.json" ? "集合名称" : path.basename(path.dirname(file))) + "  (" + file + ")");
    for (const h of list) console.log(`  [${h.tag}] ${h.id !== path.basename(path.dirname(file)) ? `${h.id} ` : ""}${h.field} = ${JSON.stringify(h.value)}`);
  }
  const tally = {};
  hits.forEach((h) => (tally[h.tag] = (tally[h.tag] || 0) + 1));
  console.log(`\n共 ${hits.length} 处，涉及 ${byId.size} 条记录。分类：` + JSON.stringify(tally));
  console.log("说明：[疑似] 需人工确认（可能是正规日语）；其余为可靠命中。");
}

// 一贯性检查：始终扫全库（术语/罗马字统一，是全局问题）
async function consistency() {
  const allFiles = [];
  ROOTS.forEach((r) => walk(r, allFiles));
  allFiles.sort();
  const recs = [];
  for (const f of allFiles) recs.push([f, await readRecordFile(f)]);

  const forbidden = loadForbiddenVariants();
  const cons = []; // {file, field, value, why}
  const jaToEn = new Map(); // ja -> Map(en -> [where])，查「同日文不同英文」

  for (const [file, j] of recs) {
    const id = path.basename(path.dirname(file));
    for (const [field, v] of englishFieldValues(j)) {
      if (MACRON.test(v)) cons.push({ id, file, field, value: v, why: "音调符号(macron)，应去掉" });
      if (TOKYO_WARD.test(v)) cons.push({ id, file, field, value: v, why: "东京应用 City 不用 Ward" });
      for (const { correct, variants } of forbidden)
        for (const bad of variants)
          if (v.includes(bad)) cons.push({ id, file, field, value: v, why: `禁止变体「${bad}」→应用「${correct}」` });
    }
    // 双语字段 ja->en 冲突
    const pairs = [];
    if (j.title && (j.title.ja || "").trim() && (j.title.en || "").trim()) pairs.push(["title", j.title.ja.trim(), j.title.en.trim()]);
    (j.blocks || []).forEach((b, i) => { if (b && b.text && (b.text.ja || "").trim() && (b.text.en || "").trim()) pairs.push([`blocks[${i}]`, b.text.ja.trim(), b.text.en.trim()]); });
    for (const [field, ja, en] of pairs) {
      if (!jaToEn.has(ja)) jaToEn.set(ja, new Map());
      const em = jaToEn.get(ja);
      if (!em.has(en)) em.set(en, []);
      em.get(en).push(`${id} ${field}`);
    }
  }

  const conflicts = [...jaToEn.entries()].filter(([, em]) => em.size > 1);

  console.log("\n────────── 一贯性检查（全库）──────────");
  if (cons.length === 0 && conflicts.length === 0) {
    console.log("✓ 罗马字/术语一致，无冲突。");
    return;
  }
  if (cons.length) {
    const byRec = new Map();
    cons.forEach((c) => { if (!byRec.has(c.file)) byRec.set(c.file, []); byRec.get(c.file).push(c); });
    for (const [file, list] of byRec) {
      console.log("=== " + path.basename(path.dirname(file)));
      list.forEach((c) => console.log(`  [${c.why}] ${c.field} = ${JSON.stringify(c.value)}`));
    }
  }
  if (conflicts.length) {
    console.log("\n— 同一个日文，被翻成了不同英文（择一统一）：");
    for (const [ja, em] of conflicts) {
      console.log("  日文：" + JSON.stringify(ja.slice(0, 40) + (ja.length > 40 ? "…" : "")));
      for (const [en, where] of em) console.log(`     → ${JSON.stringify(en.slice(0, 50))}  (${where.join("; ")})`);
    }
  }
  console.log(`\n一贯性问题：${cons.length} 处规范/术语 + ${conflicts.length} 组日英冲突。`);
}

main().then(consistency);
