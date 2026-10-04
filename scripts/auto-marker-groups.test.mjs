import test from "node:test";
import assert from "node:assert/strict";
import { autoClusterMarkerItems, autoMarkerGroupFocusTarget, sanitizeAutoMarkerClusterMaxZoom } from "../auto-marker-groups.mjs";

const project = (item) => ({ x: item.coordinates.lng, y: item.coordinates.lat });

function flattenIds(group) {
  return group.members.flatMap((item) => item.autoCluster ? flattenIds(item) : [item.id]).sort();
}

test("distant records in the same prefecture are grouped at country scale", () => {
  const items = [
    { id: "a", locationLevels: ["Kyoto", "Kyoto City", "Minami Ward"], coordinates: { lat: 0, lng: 0 } },
    { id: "b", locationLevels: ["Kyoto", "Uji City", "Uji"], coordinates: { lat: 0, lng: 1000 } },
    { id: "c", locationLevels: ["Osaka", "Osaka City", "Kita Ward"], coordinates: { lat: 0, lng: 5000 } },
  ];

  const groups = autoClusterMarkerItems(items, project, { zoom: 6, maxZoom: 14, radius: 1 });

  const kyotoGroup = groups.find((group) => group.recordCount === 2);
  assert.ok(kyotoGroup);
  assert.deepEqual(flattenIds(kyotoGroup), ["a", "b"]);
  assert.equal(kyotoGroup.areaLevel, 0);
  assert.equal(kyotoGroup.regionLabel, "Kyoto");
});

test("zooming in refines automatic grouping from prefecture to city and ward", () => {
  const items = [
    { id: "a", locationLevels: ["Kyoto", "Kyoto City", "Minami Ward"], coordinates: { lat: 0, lng: 0 } },
    { id: "b", locationLevels: ["Kyoto", "Kyoto City", "Fushimi Ward"], coordinates: { lat: 0, lng: 500 } },
    { id: "c", locationLevels: ["Kyoto", "Uji City", "Uji"], coordinates: { lat: 0, lng: 1000 } },
  ];

  const prefectureGroups = autoClusterMarkerItems(items, project, { zoom: 6, maxZoom: 14, radius: 1 });
  const cityGroups = autoClusterMarkerItems(items, project, { zoom: 9, maxZoom: 14, radius: 1 });
  const wardGroups = autoClusterMarkerItems(items.slice(0, 2), project, { zoom: 11, maxZoom: 14, radius: 1 });

  assert.deepEqual(prefectureGroups[0].members.map((item) => item.id), ["a", "b", "c"]);
  assert.deepEqual(cityGroups[0].members.map((item) => item.id), ["a", "b"]);
  assert.equal(cityGroups[0].areaLevel, 1);
  assert.equal(cityGroups[0].regionLabel, "Kyoto City");
  assert.equal(wardGroups.length, 0);
});

test("automatic nearby groups show their English region names", () => {
  const items = [
    { id: "a", locationLevels: ["Kyoto", "Kyoto City", "Minami Ward"], coordinates: { lat: 0, lng: 0 } },
    { id: "b", locationLevels: ["Kyoto", "Kyoto City", "Fushimi Ward"], coordinates: { lat: 0, lng: 10 } },
  ];

  const groups = autoClusterMarkerItems(items, project, { zoom: 11, maxZoom: 14, radius: 64 });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].regionLabel, "Fushimi Ward / Minami Ward");
});

test("automatic collection focus targets the group's center and next zoom level", () => {
  assert.deepEqual(autoMarkerGroupFocusTarget({
    coordinates: { lat: 35.01, lng: 135.72 },
    nextZoom: 10,
  }, 8.5), {
    coordinates: { lat: 35.01, lng: 135.72 },
    targetZoom: 10,
  });
  assert.equal(autoMarkerGroupFocusTarget({ coordinates: { lat: 35, lng: 135 } }, 8), null);
});

test("manual collection markers join regional groups and count their records", () => {
  const items = [
    { id: "single", locationLevels: ["Kyoto", "Kyoto City", "Minami Ward"], coordinates: { lat: 0, lng: 0 } },
    {
      id: "manual:fitness",
      markerGroupId: "fitness",
      manualCollection: true,
      recordCount: 2,
      locationLevels: ["Kyoto", "Kyoto City", "Minami Ward"],
      coordinates: { lat: 0, lng: 1000 },
    },
  ];

  const groups = autoClusterMarkerItems(items, project, { zoom: 11, maxZoom: 14, radius: 1 });

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].members.map((item) => item.id), ["single", "manual:fitness"]);
  assert.equal(groups[0].recordCount, 3);
  assert.equal(groups[0].manualCollectionCount, 1);
});

test("nearby regional markers are collision-merged, including manual collection counts", () => {
  const items = [
    { id: "a", locationLevels: ["Kyoto", "Kyoto City", "Minami Ward"], coordinates: { lat: 0, lng: 0 } },
    { id: "b", locationLevels: ["Kyoto", "Uji City", "Uji"], coordinates: { lat: 0, lng: 2 } },
    {
      id: "manual:fitness",
      markerGroupId: "fitness",
      manualCollection: true,
      recordCount: 2,
      locationLevels: ["Kyoto", "Kyoto City", "Minami Ward"],
      coordinates: { lat: 0, lng: 1 },
    },
  ];

  const groups = autoClusterMarkerItems(items, project, { zoom: 6, maxZoom: 14, radius: 4 });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].recordCount, 4);
  assert.equal(groups[0].manualCollectionCount, 1);
  assert.deepEqual(flattenIds(groups[0]), ["a", "b", "manual:fitness"]);
});

test("raw records already represented by a manual collection are not double-counted", () => {
  const items = [
    { id: "member-a", markerGroupId: "fitness", locationLevels: ["Kyoto"], coordinates: { lat: 0, lng: 0 } },
    { id: "member-b", markerGroupId: "fitness", locationLevels: ["Kyoto"], coordinates: { lat: 0, lng: 1 } },
    {
      id: "manual:fitness",
      markerGroupId: "fitness",
      manualCollection: true,
      recordCount: 2,
      locationLevels: ["Kyoto"],
      coordinates: { lat: 0, lng: 0.5 },
    },
  ];

  const groups = autoClusterMarkerItems(items, project, { zoom: 6, maxZoom: 14, radius: 30 });

  assert.equal(groups.length, 0);
});

test("nearby items with incomplete address levels still use screen-distance grouping", () => {
  const items = [
    { id: "a", locationText: "Sakyo Ward", coordinates: { lat: 0, lng: 0 } },
    { id: "b", locationText: "Nakagyo Ward", coordinates: { lat: 0, lng: 20 } },
    { id: "far", coordinates: { lat: 0, lng: 100 } },
  ];

  const groups = autoClusterMarkerItems(items, project, { zoom: 11, maxZoom: 14, radius: 30 });

  assert.deepEqual(groups.map((group) => group.members.map((item) => item.id)), [["a", "b"]]);
  assert.equal(groups[0].areaLevel, null);
  assert.equal(groups[0].regionLabel, "Nakagyo Ward / Sakyo Ward");
});

test("all markers, including manual collections, are unclustered at the configured zoom threshold", () => {
  const items = [
    { id: "a", locationLevels: ["Kyoto", "Kyoto City", "Minami Ward"], coordinates: { lat: 0, lng: 0 } },
    { id: "manual:x", markerGroupId: "x", recordCount: 2, coordinates: { lat: 0, lng: 1 } },
  ];

  assert.deepEqual(autoClusterMarkerItems(items, project, { zoom: 14, maxZoom: 14, radius: 30 }), []);
});

test("singletons and records without usable coordinates are not emitted as auto groups", () => {
  const items = [
    { id: "a", locationLevels: ["Kyoto"], coordinates: { lat: 0, lng: 0 } },
    { id: "far", locationLevels: ["Osaka"], coordinates: { lat: 0, lng: 100 } },
    { id: "missing", locationLevels: ["Kyoto"] },
  ];

  assert.deepEqual(autoClusterMarkerItems(items, project, { zoom: 6, maxZoom: 14, radius: 1 }), []);
});

test("auto-cluster threshold uses zoom 14 by default and stays within map zoom limits", () => {
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(undefined), 14);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(null), 14);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(""), 14);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(2), 3);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(22), 18);
  assert.equal(sanitizeAutoMarkerClusterMaxZoom(12.5), 12.5);
});
