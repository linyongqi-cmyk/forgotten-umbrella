import assert from "node:assert/strict";
import test from "node:test";
import { autoSaveStatusMessage, draftCloseAction, editorEscapeAction, submissionReadErrorMessage } from "./editor-feedback.mjs";

test("autosave feedback distinguishes pending, success, and failure for users", () => {
  assert.equal(autoSaveStatusMessage("saving"), "正在自动保存…");
  assert.equal(autoSaveStatusMessage("saved"), "设置已自动保存 ✓");
  assert.equal(autoSaveStatusMessage("error", "连接失败"), "自动保存失败：连接失败");
});

test("closing a dirty editor draft uses the same save-or-discard choice everywhere", () => {
  assert.equal(draftCloseAction(false, false), "close");
  assert.equal(draftCloseAction(true, true), "save");
  assert.equal(draftCloseAction(true, false), "discard");
});

test("Escape closes the top editor surface before leaving edit mode", () => {
  assert.equal(editorEscapeAction({ inboxOpen: true, editMode: true }), "close-inbox");
  assert.equal(editorEscapeAction({ markerEditorOpen: true, editMode: true }), "close-marker-editor");
  assert.equal(editorEscapeAction({ groupPickerOpen: true, editMode: true }), "close-group-picker");
  assert.equal(editorEscapeAction({ workbenchOpen: true, editMode: true }), "close-workbench");
  assert.equal(editorEscapeAction({ editMode: true }), "leave-edit-mode");
});

test("expired Google submission authorization gives a clear recovery instruction", () => {
  assert.match(submissionReadErrorMessage("invalid_grant"), /授权已过期/);
  assert.match(submissionReadErrorMessage("invalid_grant"), /submissions:auth/);
  assert.equal(submissionReadErrorMessage("网络连接失败"), "网络连接失败");
});
