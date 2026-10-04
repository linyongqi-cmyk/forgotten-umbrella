import test from "node:test";
import assert from "node:assert/strict";
import { autoClusterMarkerItems, sanitizeAutoMarkerClusterMaxZoom } from "../auto-marker-groups.mjs";

const project = (item) => ({ x: item.coordinates.lng, y: item.coordinates.lat });

test("auto clusters nearby independent records without consuming manual collections", () => {
  const items = [
    { id: "a", coordinates: { lat: 0, lng: 0 } },
    { id: "b", coordinates: { lat: 0, lng: 20 } },
    { id: "manual", markerGroupId: "named", coordinates: { lat: 0, lng: 10 } },
  ];

  const groups = autoClusterMarkerItems(items, project, { zoom: 10, maxZoom: 14, radius: 30 });

  assert.deepEqual(groups.map((group) => group.members.map((item) => item.id)), [["a", "b"]]);
});

test("all independent records are unclustered at or above the configured zoom threshold", () => {
  const items = [
    { id: "a", coordinates: { lat: 0, lng: 0 } },
    { id: "b", coordinates: { lat: 0, lng: 1 } },
  ];

  assert.deepEqual(autoClusterMarkerItems(items, project, { zoom: 14, maxZoom: 14, radius: 30 }), []);
});

test("singletons and records without usable coordinates are not emitted as auto groups", () => {
  const items = [
    { id: "a", coordinates: { lat: 0, lng: 0 } },
    { id: "b", coordinates: { lat: 0, lng: 100 } },
    { id: "missing" },
  ];

  assert.deepEqual(autoClusterMarkerItems(items, project, { zoom: 10, maxZoom: 14, radius: 30 }), []);
});

test("auto-cluster threshold uses zoom 14 by default and stays within map zoom limits", () => {
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(undefined), 14);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(null), 14);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(""), 14);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(2), 3);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(22), 18);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(12.5), 12.5);
});
