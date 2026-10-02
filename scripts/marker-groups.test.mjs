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
