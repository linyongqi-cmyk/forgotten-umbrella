import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [app, styles, html] = await Promise.all([
  fs.readFile(new URL("../app.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../styles.css", import.meta.url), "utf8"),
  fs.readFile(new URL("../index.html", import.meta.url), "utf8"),
]);

test("新增标点 stays on the persistent toolbar, not inside the workbench", () => {
  const groupsStart = app.indexOf("function setupEditorWorkbench() {");
  const groupsEnd = app.indexOf("function syncEditorWorkbench()", groupsStart);
  const workbenchSetup = app.slice(groupsStart, groupsEnd);

  assert.match(app, /toolbar\.appendChild\(addButton\)/);
  assert.doesNotMatch(workbenchSetup, /#editor-add/);
});

test("map-layer icons use the same configurable Lucide stroke as other editor icons", () => {
  const mapLayerButtons = html.match(/<button id="(?:map-layers|blur-adjust)-toggle"[\s\S]*?<\/button>/g) || [];

  assert.equal(mapLayerButtons.length, 2);
  for (const button of mapLayerButtons) {
    assert.match(button, /fill="none"/);
    assert.match(button, /stroke="currentColor"/);
    assert.match(button, /stroke-width="var\(--icon-stroke, 1\.7\)"/);
    assert.match(button, /stroke-linecap="round"/);
    assert.match(button, /stroke-linejoin="round"/);
  }
});

test("marker preview is a separate compact window from marker settings", () => {
  assert.match(app, /class="marker-preview-window"/);
  assert.match(app, /class="texts-editor marker-editor"/);
  assert.match(styles, /\.marker-preview-window\s*\{/);
});

test("marker preview compares categories in a compact status-by-status matrix", () => {
  assert.match(styles, /\.marker-preview-window \.marker-preview-icons\s*\{[^}]*repeat\(5, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /@media \(max-width: 1280px\)\s*\{[^}]*\.marker-editor-overlay\s*\{[^}]*flex-direction: column/s);
});

test("copy editor groups editable copy under page-level headings", () => {
  for (const heading of ["统计页面", "Type 页面", "About 页面"]) {
    assert.ok(app.includes(heading), `missing page group: ${heading}`);
  }
  assert.match(app, /class="texts-page-group"/);
});
