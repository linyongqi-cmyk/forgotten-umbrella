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

test("only user map movement clears a stationary collection blur", () => {
  assert.equal(typeof markerGroups.shouldClearMarkerGroupFocus, "function");

  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: true, cameraAnimating: false, interactionType: "dragstart" }), true);
  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: true, cameraAnimating: false, interactionType: "zoom_changed" }), true);
  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: true, cameraAnimating: true, interactionType: "zoom_changed" }), false);
  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: true, cameraAnimating: false, interactionType: "idle" }), false);
  assert.equal(markerGroups.shouldClearMarkerGroupFocus({ active: false, cameraAnimating: false, interactionType: "dragstart" }), false);
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
  });
  assert.deepEqual(second, {
    focusZoom: 18,
    blur: 6,
    radius: 126,
    feather: 138,
    veil: 0.3,
  });
  assert.equal(markerGroups.markerGroupSettingsFor(settings, "kyoto").focusZoom, 16.5);
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
  });
});
