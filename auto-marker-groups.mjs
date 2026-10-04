export const DEFAULT_AUTO_MARKER_CLUSTER_MAX_ZOOM = 14;

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

  const candidates = [];
  for (const item of items) {
    if (!item || (typeof item.markerGroupId === "string" && item.markerGroupId.trim())) continue;
    if (!Number.isFinite(item.coordinates?.lat) || !Number.isFinite(item.coordinates?.lng)) continue;
    let point;
    try {
      point = projectPoint(item);
    } catch {
      continue;
    }
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;
    candidates.push({ item, point });
  }

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
    .map((component) => {
      const members = component.map(({ item }) => item);
      const ids = members.map((item) => String(item.id)).sort();
      return {
        id: `auto:${ids.join("|")}`,
        members,
        point: {
          x: component.reduce((sum, entry) => sum + entry.point.x, 0) / component.length,
          y: component.reduce((sum, entry) => sum + entry.point.y, 0) / component.length,
        },
      };
    });
}
