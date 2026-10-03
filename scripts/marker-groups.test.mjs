import assert from "node:assert/strict";
import test from "node:test";
import * as markerGroups from "../marker-groups.mjs";

test("groupMarkerItems groups records by ID and preserves named singleton groups", () => {
  assert.equal(typeof markerGroups.groupMarkerItems, "function");
  const groups = markerGroups.groupMarkerItems([
    { id: "a", markerGroupId: "near", markerGroupName: "Nearby", coordinates: { lat: 35, lng: 135 } },
    { id: "b", markerGroupId: "near", markerGroupName: "Nearby", coordinates: { lat: 35.001, lng: 135 } },
    { id: "c", markerGroupId: "single", markerGroupName: "Solo", coordinates: { lat: 36, lng: 136 } },
    { id: "d", markerGroupId: "", coordinates: { lat: 35, lng: 135 } },
  ]);

  assert.deepEqual([...groups.keys()], ["near", "single"]);
  assert.equal(groups.get("near").length, 2);
  assert.equal(groups.get("single")[0].markerGroupName, "Solo");
});

test("listMarkerGroups sorts the closest collection first from the edited record", () => {
  assert.equal(typeof markerGroups.listMarkerGroups, "function");
  const groups = markerGroups.listMarkerGroups([
    { id: "far", markerGroupId: "far", markerGroupName: "Far", coordinates: { lat: 36, lng: 136 } },
    { id: "spread-a", markerGroupId: "spread", markerGroupName: "Spread", coordinates: { lat: 34.5, lng: 135 } },
    { id: "spread-b", markerGroupId: "spread", markerGroupName: "Spread", coordinates: { lat: 35.5, lng: 135 } },
    { id: "near", markerGroupId: "near", markerGroupName: "Near", coordinates: { lat: 35.0001, lng: 135 } },
    { id: "near-2", markerGroupId: "near", markerGroupName: "Near", coordinates: { lat: 35.0002, lng: 135 } },
  ], { lat: 35, lng: 135 });

  assert.equal(groups[0].id, "near");
  assert.equal(groups[0].name, "Near");
  assert.equal(groups[0].count, 2);
  assert.equal(groups[1].id, "spread");
  assert.equal(groups[2].id, "far");
});

test("group count is a Google Maps label over the unchanged configured marker icon", () => {
  const baseIcon = {
    url: "data:image/svg+xml;base64,existing-configured-marker",
    scaledSize: { width: 40, height: 40 },
    anchor: { x: 20, y: 38 },
  };

  const presentation = markerGroups.markerGroupPresentation(baseIcon, 2, { x: 20, y: 16.67 });

  assert.equal(presentation.icon.url, baseIcon.url);
  assert.equal(presentation.icon.scaledSize, baseIcon.scaledSize);
  assert.deepEqual(presentation.icon.labelOrigin, { x: 20, y: 16.67 });
  assert.deepEqual(presentation.label, {
    text: "2",
    color: "#ffffff",
    fontFamily: "Arial, sans-serif",
    fontSize: "12px",
    fontWeight: "700",
    className: "marker-group-count-label",
  });
});

test("hovered collection grows its count label with the existing marker hover size", () => {
  const baseIcon = {
    url: "data:image/svg+xml;base64,existing-configured-marker",
    scaledSize: { width: 45, height: 45 },
    anchor: { x: 22.5, y: 43 },
  };

  const normal = markerGroups.markerGroupPresentation(baseIcon, 2, { x: 22.5, y: 18.75 });
  const hovered = markerGroups.markerGroupPresentation(baseIcon, 2, { x: 22.5, y: 18.75 }, { hover: true });

  assert.equal(normal.label.fontSize, "12px");
  assert.equal(hovered.label.fontSize, "14px");
});

test("collection focus mask center is the viewport-space center of the map", () => {
  assert.equal(typeof markerGroups.markerGroupFocusMaskCenter, "function");

  assert.deepEqual(markerGroups.markerGroupFocusMaskCenter({ left: 48, top: 24, width: 640, height: 480 }), {
    x: 368,
    y: 264,
  });
});

test("focus mask center interpolates in step with the map camera animation", () => {
  assert.equal(typeof markerGroups.interpolateFocusMaskPoint, "function");

  assert.deepEqual(markerGroups.interpolateFocusMaskPoint({ x: 400, y: 300 }, { x: 100, y: 200 }, 0), {
    x: 400,
    y: 300,
  });
  assert.deepEqual(markerGroups.interpolateFocusMaskPoint({ x: 400, y: 300 }, { x: 100, y: 200 }, 0.5), {
    x: 250,
    y: 250,
  });
  assert.deepEqual(markerGroups.interpolateFocusMaskPoint({ x: 400, y: 300 }, { x: 100, y: 200 }, 1), {
    x: 100,
    y: 200,
  });
});

test("entering collection focus closes an open detail only in browse mode", () => {
  assert.equal(typeof markerGroups.shouldCloseFocusBeforeMarkerGroupExpansion, "function");
  const shouldClose = markerGroups.shouldCloseFocusBeforeMarkerGroupExpansion;

  assert.equal(shouldClose({ focusMode: true, editMode: false }), true);
  assert.equal(shouldClose({ focusMode: false, editMode: false }), false);
  assert.equal(shouldClose({ focusMode: true, editMode: true }), false);
});

test("only user map movement clears a stationary collection blur", () => {
  assert.equal(typeof markerGroups.shouldClearMarkerGroupFocus, "function");

  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: true, cameraAnimating: false, interactionType: "dragstart" }), true);
  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: true, cameraAnimating: false, interactionType: "zoom_changed" }), true);
  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: true, cameraAnimating: true, interactionType: "zoom_changed" }), false);
  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: true, cameraAnimating: false, interactionType: "idle" }), false);
  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: false, cameraAnimating: false, interactionType: "dragstart" }), false);
});

test("collection expansion is exclusive, toggles on repeat, and is disabled in edit mode", () => {
  assert.equal(typeof markerGroups.nextExpandedMarkerGroup, "function");
  const next = markerGroups.nextExpandedMarkerGroup;

  assert.equal(next(null, { type: "group-click", groupId: "a" }), "a");
  assert.equal(next("a", { type: "group-click", groupId: "b" }), "b");
  assert.equal(next("a", { type: "group-click", groupId: "a" }), null);
  assert.equal(next("a", { type: "group-click", groupId: "b", editMode: true }), null);
});

test("clicking a member preserves only its currently expanded collection", () => {
  const next = markerGroups.nextExpandedMarkerGroup;

  assert.equal(next("a", { type: "member-click", groupId: "a" }), "a");
  assert.equal(next("a", { type: "member-click", groupId: "b" }), null);
  assert.equal(next("a", { type: "other-marker-click" }), null);
});

test("map interaction closes an expanded collection unless a focus animation is running", () => {
  const next = markerGroups.nextExpandedMarkerGroup;

  assert.equal(next("a", { type: "map-interaction", interactionType: "dragstart" }), null);
  assert.equal(next("a", { type: "map-interaction", interactionType: "zoom_changed" }), null);
  assert.equal(next("a", { type: "map-interaction", interactionType: "zoom_changed", cameraAnimating: true }), "a");
  assert.equal(next("a", { type: "map-interaction", interactionType: "dragstart", cameraAnimating: true }), null);
  assert.equal(next("a", { type: "map-interaction", interactionType: "click", cameraAnimating: true }), null);
  assert.equal(next("a", { type: "map-interaction", interactionType: "idle" }), "a");
  assert.equal(next(null, { type: "map-interaction", interactionType: "dragstart" }), null);
});

test("programmatic zoom changes keep a collection focus preview alive until the camera settles", () => {
  assert.equal(typeof markerGroups.shouldStopMarkerGroupPreview, "function");
  const shouldStop = markerGroups.shouldStopMarkerGroupPreview;

  assert.equal(shouldStop({ previewActive: true, actionType: "map-interaction", interactionType: "zoom_changed", cameraAnimating: true }), false);
  assert.equal(shouldStop({ previewActive: true, actionType: "map-interaction", interactionType: "zoom_changed", cameraAnimating: false }), true);
  assert.equal(shouldStop({ previewActive: true, actionType: "map-interaction", interactionType: "dragstart", cameraAnimating: true }), true);
  assert.equal(shouldStop({ previewActive: true, actionType: "other-marker-click", cameraAnimating: false }), true);
  assert.equal(shouldStop({ previewActive: false, actionType: "map-interaction", interactionType: "zoom_changed", cameraAnimating: false }), false);
});

test("only the newest focus-camera animation may finish its blur state", () => {
  assert.equal(typeof markerGroups.isCurrentCameraAnimation, "function");

  assert.equal(markerGroups.isCurrentCameraAnimation(8, 8), true);
  assert.equal(markerGroups.isCurrentCameraAnimation(9, 8), false);
});

test("filter and view changes always close an expanded collection", () => {
  const next = markerGroups.nextExpandedMarkerGroup;

  assert.equal(next("a", { type: "filter-change" }), null);
  assert.equal(next("a", { type: "view-change" }), null);
});

test("collection style inherits ordinary marker colors until collection parts are customized", () => {
  assert.equal(typeof markerGroups.sanitizeMarkerGroupStyle, "function");

  assert.deepEqual(markerGroups.sanitizeMarkerGroupStyle(undefined), {
    lineColors: {},
    regionColors: {},
  });
});

test("collection style saves valid colors independently for each marker part", () => {
  const style = markerGroups.sanitizeMarkerGroupStyle({
    lineColors: { line1: "#237ac4", line4: "#111111", line2: "bad" },
    regionColors: { region2: "#39a96b", region1: "#fff" },
  });

  assert.deepEqual(style, {
    lineColors: { line1: "#237ac4" },
    regionColors: { region2: "#39a96b" },
  });
});

test("legacy collection color migrates to the existing marker-part color shape", () => {
  const style = markerGroups.sanitizeMarkerGroupStyle(undefined, "#237ac4");

  assert.deepEqual(style, {
    lineColors: { line1: "#237ac4", line2: "#237ac4", line3: "#237ac4" },
    regionColors: { region1: "#237ac4", region2: "#237ac4", region3: "#237ac4" },
  });
});

test("marker focus and blur settings are independent per group and default when unset", () => {
  assert.equal(typeof markerGroups.markerGroupSettingsFor, "function");
  assert.equal(typeof markerGroups.updateMarkerGroupSettings, "function");

  const settings = markerGroups.updateMarkerGroupSettings({}, "kyoto", {
    focusZoom: 16.5,
    blur: 9,
  });
  const first = markerGroups.markerGroupSettingsFor(settings, "kyoto");
  const second = markerGroups.markerGroupSettingsFor(settings, "another-group");

  assert.deepEqual(first, {
    focusZoom: 16.5,
    blur: 9,
    radius: 126,
    feather: 138,
    veil: 0.3,
    labelDistance: 260,
    labelRotate: -135,
    name: { ja: "", en: "" },
  });
  assert.deepEqual(second, {
    focusZoom: 18,
    blur: 6,
    radius: 126,
    feather: 138,
    veil: 0.3,
    labelDistance: 260,
    labelRotate: -135,
    name: { ja: "", en: "" },
  });
  assert.equal(markerGroups.markerGroupSettingsFor(settings, "kyoto").focusZoom, 16.5);
});

test("collection settings keep localized names and ring-text controls per group", () => {
  const settings = markerGroups.updateMarkerGroupSettings({}, "kyoto", {
    name: { ja: "京都の集合", en: "Kyoto group" },
    labelDistance: 310,
    labelRotate: -42,
  });

  assert.deepEqual(markerGroups.markerGroupSettingsFor(settings, "kyoto"), {
    focusZoom: 18,
    blur: 6,
    radius: 126,
    feather: 138,
    veil: 0.3,
    labelDistance: 310,
    labelRotate: -42,
    name: { ja: "京都の集合", en: "Kyoto group" },
  });
  assert.equal(markerGroups.markerGroupNameFor(settings, "kyoto", "旧名称", "en"), "Kyoto group");
  assert.equal(markerGroups.markerGroupNameFor(settings, "kyoto", "旧名称", "ja"), "京都の集合");
  assert.equal(markerGroups.markerGroupNameFor({}, "legacy", "旧名称", "en"), "旧名称");
});

test("new collection ring text uses supplied defaults and invalid names fall back safely", () => {
  const settings = markerGroups.updateMarkerGroupSettings({}, "new", {
    labelDistance: 9999,
    labelRotate: -9999,
    name: { ja: "  新集合  ", en: "  " },
  });

  assert.deepEqual(markerGroups.markerGroupSettingsFor(settings, "new", {
    labelDistance: 280,
    labelRotate: -90,
  }), {
    focusZoom: 18,
    blur: 6,
    radius: 126,
    feather: 138,
    veil: 0.3,
    labelDistance: 600,
    labelRotate: -180,
    name: { ja: "新集合", en: "" },
  });
  assert.equal(markerGroups.markerGroupNameFor(settings, "new", "旧名称", "en"), "新集合");
});

test("site settings sanitizer preserves bilingual collection names and inherited ring defaults", () => {
  const sanitized = markerGroups.sanitizeMarkerGroupSettingsMap({
    group: { name: { ja: "集合", en: "Group" } },
  }, { labelDistance: 315, labelRotate: 22 });

  assert.deepEqual(sanitized.group, {
    focusZoom: 18,
    blur: 6,
    radius: 126,
    feather: 138,
    veil: 0.3,
    labelDistance: 315,
    labelRotate: 22,
    name: { ja: "集合", en: "Group" },
  });
});

test("marker group settings are bounded before they can affect the map", () => {
  const settings = markerGroups.updateMarkerGroupSettings({}, "safe", {
    focusZoom: 40,
    blur: -5,
    radius: 900,
    feather: -3,
    veil: 2,
  });

  assert.deepEqual(markerGroups.markerGroupSettingsFor(settings, "safe"), {
    focusZoom: 21,
    blur: 0,
    radius: 420,
    feather: 0,
    veil: 0.8,
    labelDistance: 260,
    labelRotate: -135,
    name: { ja: "", en: "" },
  });
});
