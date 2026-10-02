import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in app.js`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `${name} should have a closing brace`);
  return source.slice(start, end + 2);
}

const context = {};
vm.runInNewContext(
  `${extractFunction("parseLooseDateParts")}\n${extractFunction("statsMonthKey")}\nglobalThis.statsMonthKey = statsMonthKey;`,
  context,
);

assert.equal(context.statsMonthKey("2026.5.29 15:21"), "2026-05");
assert.equal(context.statsMonthKey("2026-05-29T15:21"), "2026-05");
assert.equal(context.statsMonthKey("2026/5/29"), "2026-05");
assert.equal(context.statsMonthKey(""), "no-time");

console.log("stats month key checks passed");
