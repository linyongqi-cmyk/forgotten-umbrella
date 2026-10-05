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

test("marker preview uses status columns and category rows with centered row labels", () => {
  const rendererStart = app.indexOf("function renderMarkerPreviewItems() {");
  const rendererEnd = app.indexOf("function updateMarkerPreview()", rendererStart);
  const renderer = app.slice(rendererStart, rendererEnd);

  assert.match(renderer, /<table class="marker-preview-table">/);
  assert.match(renderer, /<th scope="col">类别<\/th>/);
  assert.match(renderer, /MARKER_CATEGORIES\.map\(\(cat\) => `<tr>[\s\S]*?<th scope="row">/);
  assert.match(renderer, /\$\{rows\.map\(\(row\) => `<td>/);
  assert.match(styles, /\.marker-preview-table tbody th\[scope="row"\][^{]*\{[^}]*text-align:\s*center/s);
  assert.match(styles, /\.marker-preview-table\s*\{/);
  assert.match(styles, /\.marker-preview-table-wrap\s*\{[^}]*overflow: auto/s);
});

test("marker preview and settings are side by side on desktop", () => {
  assert.match(styles, /\.marker-editor-overlay\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(350px,\s*0\.78fr\)\s+minmax\(550px,\s*1\.22fr\)/s);
});

test("marker color controls use clear part names without SVG tag summaries", () => {
  for (const label of ["外部线段", "内部线段", "外部填充", "中心填充"]) {
    assert.ok(app.includes(label), `missing marker color label: ${label}`);
  }
  const categoryEditorStart = app.indexOf("function markerCategoryEditor(cat, draft) {");
  const categoryEditorEnd = app.indexOf("function markerColorControl(", categoryEditorStart);
  const categoryEditor = app.slice(categoryEditorStart, categoryEditorEnd);
  assert.doesNotMatch(categoryEditor, /markerPartsList\(parts\)/);
  assert.match(styles, /\.marker-color-grid\s*\{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.marker-color-row\s*\{[^}]*grid-template-columns:\s*minmax\(44px,\s*0\.9fr\)\s+26px\s+minmax\(58px,\s*1\.1fr\)/s);
});

test("special marker state tuning is no longer rendered in the marker editor", () => {
  const bodyStart = app.indexOf("function renderMarkerEditorBody() {");
  const bodyEnd = app.indexOf("function markerGroupStyleControls(", bodyStart);
  const body = app.slice(bodyStart, bodyEnd);
  assert.doesNotMatch(body, /特殊状态调整|markerStateEditor\(stateKey/);
});

test("copy editor groups editable copy under page-level headings", () => {
  for (const heading of ["统计页面", "Type 页面", "About 页面"]) {
    assert.ok(app.includes(heading), `missing page group: ${heading}`);
  }
  assert.match(app, /class="texts-page-group"/);
});
