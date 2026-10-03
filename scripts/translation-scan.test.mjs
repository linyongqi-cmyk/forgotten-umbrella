import assert from "node:assert/strict";
import test from "node:test";
import { collectionNameTranslationHits } from "./translation-scan.mjs";

test("translation scan finds untranslated legacy and configured collection names once per group", () => {
  const hits = collectionNameTranslationHits([
    { markerGroupId: "old", markerGroupName: "旧集合" },
    { markerGroupId: "old", markerGroupName: "旧集合" },
    { markerGroupId: "english-legacy", markerGroupName: "Existing English Name" },
    { markerGroupId: "complete", markerGroupName: "Old label" },
    { markerGroupId: "new", markerGroupName: "旧名称" },
    { markerGroupId: "", markerGroupName: "not a group" },
  ], {
    complete: { name: { ja: "既存", en: "Existing" } },
    new: { name: { ja: "新集合", en: "" } },
  });

  assert.deepEqual(hits, [
    { id: "old", field: "markerGroupName.en", value: "旧集合", tag: "en空" },
    { id: "new", field: "markerGroupName.en", value: "新集合", tag: "en空" },
  ]);
});

test("translation scan flags non-English collection translations", () => {
  assert.deepEqual(collectionNameTranslationHits([
    { markerGroupId: "bad-en", markerGroupName: "名前" },
  ], { "bad-en": { name: { ja: "名前", en: "集合" } } }), [
    { id: "bad-en", field: "markerGroupName.en", value: "集合", tag: "EN" },
  ]);
});
