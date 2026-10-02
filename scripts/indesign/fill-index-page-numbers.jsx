#target indesign

// 将图片页上的 FU_RecordID 段落样式与目录中的页码对应起来。
// 页码后会保留不可见的 [[FU_PAGE:ID]] 标记，页面移动后可再次运行本脚本更新。
(function () {
  var ID_STYLE_NAME = 'FU_RecordID';
  var PAGE_MARKER_PREFIX = '[[FU_PAGE:';

  if (app.documents.length === 0) {
    alert('请先打开已经合并好的 InDesign 书籍文件。');
    return;
  }

  var doc = app.activeDocument;
  var idStyle;
  try {
    idStyle = doc.paragraphStyles.itemByName(ID_STYLE_NAME);
    idStyle.name;
  } catch (e) {
    alert('找不到段落样式：' + ID_STYLE_NAME + '\n请先给图片页上的 ID 套用这个段落样式。');
    return;
  }

  function trimText(value) {
    return String(value || '').replace(/^\s+|\s+$/g, '').replace(/[\r\n]/g, '');
  }

  function pageNameOf(textObject) {
    if (!textObject.parentTextFrames || textObject.parentTextFrames.length === 0) return '';
    var frame = textObject.parentTextFrames[0];
    return frame.parentPage ? frame.parentPage.name : '';
  }

  function markerConditionOf(documentObject) {
    var condition = documentObject.conditions.itemByName('FU_PageRef');
    if (!condition.isValid) {
      condition = documentObject.conditions.add();
      condition.name = 'FU_PageRef';
    }
    condition.visible = false;
    return condition;
  }

  function applyMarkerCondition(textObject, condition) {
    // applyConditions is more reliable than assigning appliedConditions in
    // older ExtendScript versions.
    textObject.applyConditions([condition], true);
  }

  function storyOf(textObject) {
    if (textObject.parentStory) return textObject.parentStory;
    if (textObject.parentTextFrames && textObject.parentTextFrames.length) {
      return textObject.parentTextFrames[0].parentStory;
    }
    return null;
  }

  function replaceWithMarker(textObject, replacement, markerStart, condition) {
    var story = storyOf(textObject);
    var start = textObject.insertionPoints[0].index;
    textObject.contents = replacement;
    if (!story) return false;
    var markerRange = story.characters.itemByRange(start + markerStart, start + replacement.length - 1);
    applyMarkerCondition(markerRange, condition);
    return true;
  }

  function clearFind() {
    app.findGrepPreferences = NothingEnum.NOTHING;
    app.changeGrepPreferences = NothingEnum.NOTHING;
  }

  var markerCondition = markerConditionOf(doc);
  // Hidden conditional text can be skipped by findGrep. Show it briefly while
  // collecting IDs, then hide it again before the script finishes.
  markerCondition.visible = true;

  clearFind();
  app.findGrepPreferences.appliedParagraphStyle = idStyle;
  app.findGrepPreferences.findWhat = '.+';
  var idTexts = doc.findGrep();
  var pageById = {};
  var duplicates = [];

  for (var i = 0; i < idTexts.length; i++) {
    // 图片页上的 FU_RecordID 必须只包含 ID，不要把标题放在同一个文字框里。
    var id = trimText(idTexts[i].contents);
    var pageName = pageNameOf(idTexts[i]);
    if (!id || !pageName) continue;
    if (pageById[id] && pageById[id] !== pageName) {
      duplicates.push(id + '：第 ' + pageById[id] + ' 页 / 第 ' + pageName + ' 页');
    }
    pageById[id] = pageName;
  }

  clearFind();
  app.findGrepPreferences.findWhat = '\\{\\{PAGE:[^\\}]+\\}\\}';
  var references = doc.findGrep();
  var missing = [];
  var updated = 0;

  // 第一次运行：把占位符替换成页码，并在后面保存隐藏 ID 标记。
  for (var j = references.length - 1; j >= 0; j--) {
    var token = references[j].contents;
    var refId = token.replace(/^\{\{PAGE:/, '').replace(/\}\}$/, '');
    if (pageById[refId]) {
      var marker = PAGE_MARKER_PREFIX + refId + ']]';
      var visiblePage = pageById[refId];
      replaceWithMarker(references[j], visiblePage + marker, visiblePage.length, markerCondition);
      updated++;
    } else {
      replaceWithMarker(references[j], '??' + PAGE_MARKER_PREFIX + refId + ']]', 2, markerCondition);
      missing.push(refId);
    }
  }

  // 后续运行：根据隐藏标记重新查找目录中的原始 ID，并更新前面的页码。
  clearFind();
  app.findGrepPreferences.findWhat = '[^\\s\\r\\n]+\\[\\[FU_PAGE:[^\\]]+\\]\\]';
  var markedReferences = doc.findGrep();
  for (var k = markedReferences.length - 1; k >= 0; k--) {
    var marked = markedReferences[k].contents;
    var markerStart = marked.indexOf(PAGE_MARKER_PREFIX);
    if (markerStart < 0) continue;
    var markedId = marked.substring(markerStart + PAGE_MARKER_PREFIX.length, marked.length - 2);
    var currentPage = pageById[markedId];
    var replacement = (currentPage || '??') + marked.substring(markerStart);
    var existingMarkerStart = replacement.length - (marked.length - markerStart);
    replaceWithMarker(markedReferences[k], replacement, existingMarkerStart, markerCondition);
    updated++;
    if (!currentPage) missing.push(markedId);
  }

  clearFind();
  markerCondition.visible = false;

  var message = '页码已更新。\n\n';
  message += '找到图片页 ID：' + idTexts.length + ' 个\n';
  message += '更新目录页码：' + updated + ' 个';
  if (duplicates.length) message += '\n\n重复 ID：\n' + duplicates.slice(0, 20).join('\n');
  if (missing.length) message += '\n\n找不到图片页的 ID：\n' + missing.slice(0, 20).join('\n');
  alert(message);
})();
