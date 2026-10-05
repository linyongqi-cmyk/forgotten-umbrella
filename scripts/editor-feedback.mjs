export function autoSaveStatusMessage(status, detail = "") {
  if (status === "saving") return "正在自动保存…";
  if (status === "saved") return "设置已自动保存 ✓";
  if (status === "error") return `自动保存失败：${detail || "请重试"}`;
  return "";
}

export function draftCloseAction(hasChanges, saveConfirmed) {
  if (!hasChanges) return "close";
  return saveConfirmed ? "save" : "discard";
}

export function editorEscapeAction(state = {}) {
  if (state.imageExpanded) return "close-image";
  if (state.navMenuOpen) return "close-nav-menu";
  if (state.inboxOpen) return "close-inbox";
  if (state.hiddenOpen) return "close-hidden";
  if (state.createOpen) return "close-create";
  if (state.markerEditorOpen) return "close-marker-editor";
  if (state.themeEditorOpen) return "close-theme-editor";
  if (state.textsEditorOpen) return "close-texts-editor";
  if (state.blurAdjustOpen) return "close-blur-adjust";
  if (state.mapLayersOpen) return "close-map-layers";
  if (state.groupPickerOpen) return "close-group-picker";
  if (state.workbenchOpen) return "close-workbench";
  if (state.recordEditorOpen) return "close-record-editor";
  if (state.editMode) return "leave-edit-mode";
  if (state.focusMode) return "close-focus-mode";
  return "none";
}
