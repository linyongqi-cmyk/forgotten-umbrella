function hasCoordinates(item) {
  return Number.isFinite(item?.coordinates?.lat) && Number.isFinite(item?.coordinates?.lng);
}

export function groupMarkerItems(items = []) {
  const groups = new Map();
  for (const item of items) {
    const groupId = typeof item?.markerGroupId === "string" ? item.markerGroupId.trim() : "";
    if (!groupId) continue;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(item);
  }
  return groups;
}

export function markerGroupCenter(members = []) {
  const located = members.filter(hasCoordinates);
  if (!located.length) return null;
  const total = located.length;
  return located.reduce((center, item) => ({
    lat: center.lat + item.coordinates.lat / total,
    lng: center.lng + item.coordinates.lng / total,
  }), { lat: 0, lng: 0 });
}

function distanceMeters(a, b) {
  if (!hasCoordinates({ coordinates: a }) || !hasCoordinates({ coordinates: b })) return Infinity;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latDelta = radians(b.lat - a.lat);
  const lngDelta = radians(b.lng - a.lng);
  const value = Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function listMarkerGroups(items = [], origin = null) {
  const hasOrigin = hasCoordinates({ coordinates: origin });
  return [...groupMarkerItems(items)].map(([id, members]) => {
    const center = markerGroupCenter(members);
    const name = members.find((item) => typeof item.markerGroupName === "string" && item.markerGroupName.trim())
      ?.markerGroupName.trim() || id;
    const nearestMemberDistance = hasOrigin
      ? members.filter(hasCoordinates).reduce((nearest, item) => Math.min(nearest, distanceMeters(origin, item.coordinates)), Infinity)
      : Infinity;
    return {
      id,
      name,
      count: members.length,
      center,
      distanceMeters: nearestMemberDistance,
      members,
    };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name));
}
