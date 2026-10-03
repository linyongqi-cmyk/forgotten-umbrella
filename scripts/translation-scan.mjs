const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힣]/;
const FULLWIDTH = /[！-～、-〿]/;

export function collectionNameTranslationHits(records = [], markerGroups = {}) {
  const groups = new Map();
  for (const record of records) {
    const id = typeof record?.markerGroupId === "string" ? record.markerGroupId.trim() : "";
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, record.markerGroupName || "");
  }
  const hits = [];
  for (const [id, legacyName] of groups) {
    const translated = markerGroups?.[id]?.name || {};
    const configuredJa = typeof translated.ja === "string" ? translated.ja.trim() : "";
    const ja = configuredJa || String(legacyName || "").trim();
    const en = typeof translated.en === "string" ? translated.en.trim() : "";
    if (ja && !en && (configuredJa || CJK.test(ja))) hits.push({ id, field: "markerGroupName.en", value: ja, tag: "en空" });
    if (en && (CJK.test(en) || FULLWIDTH.test(en))) hits.push({ id, field: "markerGroupName.en", value: en, tag: "EN" });
  }
  return hits;
}
