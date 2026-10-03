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

export function markerGroupPresentation(icon, count, labelOrigin, { hover = false } = {}) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const text = safeCount > 99 ? "99+" : String(safeCount);
  const baseFontSize = text.length === 1 ? 12 : text.length === 2 ? 10 : 8;
  const fontSize = `${hover ? Math.round(baseFontSize * 1.125) : baseFontSize}px`;
  return {
    icon: { ...icon, labelOrigin },
    label: {
      text,
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
      fontSize,
      fontWeight: "700",
      className: "marker-group-count-label",
    },
  };
}

export function markerGroupFocusMaskCenter(mapRect) {
  return {
    x: mapRect.left + mapRect.width / 2,
    y: mapRect.top + mapRect.height / 2,
  };
}

export function interpolateFocusMaskPoint(from, to, progress) {
  const amount = Math.min(1, Math.max(0, Number(progress) || 0));
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export function shouldCloseFocusBeforeMarkerGroupExpansion({ focusMode, editMode }) {
  return Boolean(focusMode && !editMode);
}

export function shouldHandleFallbackMarkerClick({ insideGoogleMap }) {
  return !insideGoogleMap;
}

export function shouldClearMarkerGroupFocus({ active, cameraAnimating, interactionType }) {
  return Boolean(active && !cameraAnimating && ["dragstart", "zoom_changed"].includes(interactionType));
}

export function shouldStopMarkerGroupPreview({ previewActive, actionType, interactionType, cameraAnimating }) {
  if (!previewActive) return false;
  return !(actionType === "map-interaction" && interactionType === "zoom_changed" && cameraAnimating);
}

export function isCurrentCameraAnimation(currentAnimationId, completionAnimationId) {
  return currentAnimationId === completionAnimationId;
}

export function nextExpandedMarkerGroup(currentGroupId, action = {}) {
  switch (action.type) {
    case "group-click":
      if (action.editMode || typeof action.groupId !== "string" || !action.groupId) return null;
      return currentGroupId === action.groupId ? null : action.groupId;
    case "member-click":
      return currentGroupId && currentGroupId === action.groupId ? currentGroupId : null;
    case "map-interaction":
      return (action.cameraAnimating && action.interactionType === "zoom_changed") || !["dragstart", "zoom_changed", "click"].includes(action.interactionType)
        ? currentGroupId || null
        : null;
    case "other-marker-click":
    case "filter-change":
    case "view-change":
      return null;
    default:
      return currentGroupId || null;
  }
}

export function sanitizeMarkerGroupStyle(raw, legacyColor = "") {
  const out = { lineColors: {}, regionColors: {} };
  const oldColor = typeof legacyColor === "string" && /^#[0-9a-f]{6}$/i.test(legacyColor.trim())
    ? legacyColor.trim()
    : "";
  for (const group of ["lineColors", "regionColors"]) {
    const prefix = group === "lineColors" ? "line" : "region";
    for (let index = 1; index <= 3; index += 1) {
      const key = `${prefix}${index}`;
      const value = raw?.[group]?.[key];
      if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())) {
        out[group][key] = value.trim();
      } else if (!raw?.[group] && oldColor) {
        out[group][key] = oldColor;
      }
    }
  }
  return out;
}

export const DEFAULT_MARKER_GROUP_SETTINGS = Object.freeze({
  focusZoom: 18,
  blur: 6,
  radius: 126,
  feather: 138,
  veil: 0.3,
  labelDistance: 260,
  labelRotate: -135,
  name: Object.freeze({ ja: "", en: "" }),
});

const MARKER_GROUP_SETTING_RANGES = {
  focusZoom: [3, 21],
  blur: [0, 16],
  radius: [40, 420],
  feather: [0, 180],
  veil: [0, 0.8],
  labelDistance: [-600, 600],
  labelRotate: [-180, 180],
};

function clampMarkerGroupSetting(key, value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const [minimum, maximum] = MARKER_GROUP_SETTING_RANGES[key];
  return Math.min(maximum, Math.max(minimum, number));
}

function sanitizeMarkerGroupName(raw) {
  const clean = (value) => typeof value === "string" ? value.trim().slice(0, 80) : "";
  return { ja: clean(raw?.ja), en: clean(raw?.en) };
}

export function markerGroupSettingsFor(settingsById, groupId, defaults = DEFAULT_MARKER_GROUP_SETTINGS) {
  const saved = settingsById && typeof settingsById === "object" ? settingsById[groupId] : null;
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_MARKER_GROUP_SETTINGS)) {
    if (key === "name") continue;
    const supplied = defaults?.[key];
    const resolvedFallback = Number.isFinite(Number(supplied)) ? Number(supplied) : fallback;
    out[key] = clampMarkerGroupSetting(key, saved?.[key], resolvedFallback);
  }
  out.name = sanitizeMarkerGroupName(saved?.name);
  return out;
}

export function markerGroupNameFor(settingsById, groupId, legacyName = "", language = "ja") {
  const name = sanitizeMarkerGroupName(settingsById?.[groupId]?.name);
  const primary = language === "en" ? name.en : name.ja;
  const fallback = language === "en" ? name.ja : name.en;
  return primary || fallback || (typeof legacyName === "string" ? legacyName.trim() : "") || groupId;
}

export function updateMarkerGroupSettings(settingsById, groupId, patch) {
  if (typeof groupId !== "string" || !/^[\w.-]{1,128}$/.test(groupId)) return { ...(settingsById || {}) };
  const current = markerGroupSettingsFor(settingsById, groupId);
  const next = { ...current };
  for (const key of Object.keys(DEFAULT_MARKER_GROUP_SETTINGS)) {
    if (key === "name") continue;
    if (patch && Object.hasOwn(patch, key)) {
      next[key] = clampMarkerGroupSetting(key, patch[key], current[key]);
    }
  }
  if (patch && Object.hasOwn(patch, "name")) next.name = sanitizeMarkerGroupName(patch.name);
  return { ...(settingsById || {}), [groupId]: next };
}

export function sanitizeMarkerGroupSettingsMap(raw, defaults = DEFAULT_MARKER_GROUP_SETTINGS) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [groupId, settings] of Object.entries(raw)) {
    if (!/^[\w.-]{1,128}$/.test(groupId)) continue;
    out[groupId] = markerGroupSettingsFor({ [groupId]: settings }, groupId, defaults);
  }
  return out;
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
