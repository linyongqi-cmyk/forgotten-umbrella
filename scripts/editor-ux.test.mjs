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

test("marker preview uses category column headers and status row headers without repeated labels", () => {
  const rendererStart = app.indexOf("function renderMarkerPreviewItems() {");
  const rendererEnd = app.indexOf("function updateMarkerPreview()", rendererStart);
  const renderer = app.slice(rendererStart, rendererEnd);

  assert.match(renderer, /<table class="marker-preview-table">/);
  assert.match(renderer, /<th scope="col">状态<\/th>/);
  assert.match(renderer, /<th scope="row">\$\{escapeHtml\(row\.label\)\}<\/th>/);
  assert.doesNotMatch(renderer, /<span>\$\{escapeHtml\(markerLabel\(cat\)\)\}<\/span>/);
  assert.match(styles, /\.marker-preview-table\s*\{/);
  assert.match(styles, /\.marker-preview-table-wrap\s*\{[^}]*overflow: auto/s);
});

test("copy editor groups editable copy under page-level headings", () => {
  for (const heading of ["统计页面", "Type 页面", "About 页面"]) {
    assert.ok(app.includes(heading), `missing page group: ${heading}`);
  }
  assert.match(app, /class="texts-page-group"/);
});
