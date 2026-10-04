export const DEFAULT_AUTO_MARKER_CLUSTER_MAX_ZOOM = 14;

const PREFECTURE_DETAIL_ZOOM = 8;
const CITY_DETAIL_ZOOM = 10;

export function sanitizeAutoMarkerClusterMaxZoom(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return DEFAULT_AUTO_MARKER_CLUSTER_MAX_ZOOM;
  }
  const zoom = Number(value);
  return Number.isFinite(zoom)
    ? Math.min(18, Math.max(3, zoom))
    : DEFAULT_AUTO_MARKER_CLUSTER_MAX_ZOOM;
}

export function autoClusterMarkerItems(items = [], projectPoint = () => null, {
  zoom = 0,
  maxZoom = 14,
  radius = 64,
} = {}) {
  const threshold = sanitizeAutoMarkerClusterMaxZoom(maxZoom);
  if (zoom === null || zoom === undefined || String(zoom).trim() === "" || !Number.isFinite(Number(zoom)) || Number(zoom) >= threshold) return [];

  const zoomLevel = Number(zoom);
  const areaLevel = zoomLevel < PREFECTURE_DETAIL_ZOOM
    ? 0
    : zoomLevel < CITY_DETAIL_ZOOM
      ? 1
      : 2;
  const areaBuckets = new Map();
  const spatialCandidates = [];

  for (const item of items) {
    if (!item || (item.markerGroupId && !item.manualCollection)) continue;
    if (!Number.isFinite(item.coordinates?.lat) || !Number.isFinite(item.coordinates?.lng)) continue;
    let point;
    try {
      point = projectPoint(item);
    } catch {
      continue;
    }
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;

    const levels = Array.isArray(item.locationLevels)
      ? item.locationLevels.map((level) => String(level || "").trim()).filter(Boolean)
      : [];
    const regionLevels = levels.slice(0, areaLevel + 1);
    if (regionLevels.length === areaLevel + 1) {
      const regionKey = regionLevels.map((part) => part.toLocaleLowerCase()).join("|");
      if (!areaBuckets.has(regionKey)) areaBuckets.set(regionKey, []);
      areaBuckets.get(regionKey).push({ item, point });
    } else {
      spatialCandidates.push({ item, point });
    }
  }

  const areaGroups = [];
  for (const [regionKey, bucket] of areaBuckets) {
    if (bucket.length < 2) {
      spatialCandidates.push(...bucket);
      continue;
    }
    areaGroups.push(makeAutoGroup(bucket, {
      id: `area:${areaLevel}:${regionKey}`,
      areaLevel,
      nextZoom: Math.min(threshold, areaLevel === 0 ? PREFECTURE_DETAIL_ZOOM : areaLevel === 1 ? CITY_DETAIL_ZOOM : threshold),
    }));
  }

  const collisionGroups = clusterNearby([
    ...spatialCandidates,
    ...areaGroups.map((item) => ({ item, point: item.point })),
  ], radius, threshold);
  const mergedEntries = new Set(collisionGroups.flatMap((group) => group.members));
  return [
    ...areaGroups.filter((item) => !mergedEntries.has(item)),
    ...collisionGroups,
  ];
}

function clusterNearby(candidates, radius, maxZoom) {
  if (candidates.length < 2) return [];
  const maxDistance = Math.max(1, Number.isFinite(Number(radius)) ? Number(radius) : 64);
  const parent = candidates.map((_, index) => index);
  const rootOf = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };

  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const dx = candidates[left].point.x - candidates[right].point.x;
      const dy = candidates[left].point.y - candidates[right].point.y;
      if (dx * dx + dy * dy <= maxDistance * maxDistance) {
        const leftRoot = rootOf(left);
        const rightRoot = rootOf(right);
        if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
      }
    }
  }

  const components = new Map();
  candidates.forEach((candidate, index) => {
    const root = rootOf(index);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(candidate);
  });
  return [...components.values()]
    .filter((component) => component.length > 1)
    .map((component) => makeAutoGroup(component, {
      id: "nearby",
      areaLevel: null,
      nextZoom: maxZoom,
    }));
}

function makeAutoGroup(entries, { id, areaLevel, nextZoom }) {
  const members = entries.map(({ item }) => item);
  const ids = members.map((item) => String(item.id)).sort();
  const recordCount = members.reduce((sum, item) => sum + Math.max(1, Number(item.recordCount) || 1), 0);
  const projectedPoint = {
    x: entries.reduce((sum, entry) => sum + entry.point.x, 0) / entries.length,
    y: entries.reduce((sum, entry) => sum + entry.point.y, 0) / entries.length,
  };
  const coordinates = members.reduce((center, item) => ({
    lat: center.lat + item.coordinates.lat / members.length,
    lng: center.lng + item.coordinates.lng / members.length,
  }), { lat: 0, lng: 0 });
  return {
    id: `${id}:${ids.join("|")}`,
    members,
    point: projectedPoint,
    coordinates,
    autoCluster: true,
    recordCount,
    manualCollectionCount: members.reduce((sum, item) => sum + (item.manualCollection ? 1 : Number(item.manualCollectionCount) || 0), 0),
    areaLevel,
    nextZoom: Math.min(nextZoom, ...members.map((item) => Number(item.nextZoom) || nextZoom)),
  };
}
