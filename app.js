import { GOOGLE_MAPS_API_KEY } from "./config.js";

const state = {
  umbrellas: [],
  selectedId: null,
  listSort: "time",
  listSubfilter: "all",
  listOrder: "desc",
  query: "",
  map: null,
  markers: new Map(),
  googleReady: false,
  googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  focusMarkerId: null,
  focusPositionedId: null,
  suppressNextFit: false,
  cameraAnimationFrame: null,
  projectionOverlay: null,
  archiveMode: "time",
  archiveSubfilter: "all",
  archiveOrder: "desc",
  archiveCollapsedGroups: new Set(),
  // 統計 cross-tab: which dimension on each axis (#5). Default type × object (#3).
  statsX: "type",
  statsY: "object",
  // 統計 overview table (item 6): default order is by IMG name. date/type/area are
  // click-to-sort columns (asc/desc). object/state are single-value dropdown
  // filters opened from their header ("all" = no filter); overviewMenuOpen tracks
  // which dropdown is currently open.
  overviewSortKey: "img",
  overviewSortDir: "asc",
  overviewFilters: { object: "all", state: "all" },
  overviewMenuOpen: null,
  searchOpen: false,
  // Map view: a primary base (普通地图 roadmap ↔ 卫星 satellite) plus, when on
  // satellite, an extra toggle for text labels (satellite ↔ hybrid).
  mapBase: "satellite",
  mapLabels: false,
  poiShown: false,
  imageExpanded: false,
  focusMediaIndex: 0,
  // Media that can be enlarged (everything except illustrations) + which one is
  // currently shown in the expanded lightbox.
  focusMediaList: [],
  expandedIndex: 0,
  // Set just before a photo switch so the box morphs (FLIP) to the new size (#1).
  flipResize: false,
  imageZoom: 1,
  imagePanX: 0,
  imagePanY: 0,
  imageFrameWidth: 0,
  imageFrameHeight: 0,
  imageDragStart: null,
  ignoreFocusCloseUntil: 0,
  isFocusCameraAnimating: false,
  languageMenuOpen: false,
  lang: "ja",
  editMode: false,
  editingId: null,
  pendingCoords: {},
  suppressMarkerClickUntil: 0,
  entryZoomPlayed: false,
};

const FOCUS_ANIMATION_MS = 900;
const FOCUS_MARKER_SCREEN = {
  xDesktop: 0.23,
  yDesktop: 0.5,
  xMobile: 0.5,
  yMobile: 0.42,
};
const MARKER_VISUAL_CENTER_OFFSET_Y = 20;
// Fallback center when geolocation is denied / unavailable / outside Japan: Tokyo Station.
const DEFAULT_MAP_CENTER = { lat: 35.681236, lng: 139.767125 };
// Rough bounding box of Japan; geolocation only jumps to the user when inside it.
const JAPAN_BOUNDS = { minLat: 24, maxLat: 46, minLng: 122, maxLng: 154 };
const DEFAULT_MAP_ZOOM = 16;
// Floor on zoom-out: keeps the map from receding past the "whole of Japan" scale
// (without this the user could zoom out to the whole globe).
const MIN_MAP_ZOOM = 5;
const FOCUS_MAP_ZOOM = 18;
const RESET_ZOOM_ANIMATION_MS = 760;
const GEOLOCATION_TIMEOUT_MS = 2500;
// First entry into the map zooms in from a "whole main island" scale.
const ENTRY_START_ZOOM = 5;
const ENTRY_ZOOM_ANIMATION_MS = 1600;

// ---- Language (日本語 / English) -------------------------------------------
// Bilingual values are stored as { ja, en }; legacy records use a plain string
// (treated as the Japanese version). localize() picks the active language and
// falls back to whatever is filled in.
function localize(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    return value[state.lang] || value.ja || value.en || "";
  }
  return String(value);
}

function getStoredLang() {
  try {
    return localStorage.getItem("fu-lang") === "en" ? "en" : "ja";
  } catch {
    return "ja";
  }
}

// The few UI strings that switch with the language toggle (per the spec: the
// About copy and the "Archive" heading). Everything else stays as authored.
const UI_TEXT = {
  aboutTitle: {
    ja: "短い滞在を、戻れる座標に",
    en: "Turning a brief pause into a coordinate you can return to",
  },
  aboutBody: {
    ja: "このプロトタイプは、忘れられた傘を場所・時間・天気・素材の四つの手がかりに分解します。現在の画像にはまだ仮の内容が含まれていますが、地図・アーカイブ・絞り込みの仕組みはすでに拡張でき、今後は実際の写真・取材テキスト・音声記録を直接組み込めます。",
    en: "This prototype breaks a forgotten umbrella down into four threads — place, time, weather and material. The images are still placeholders, but the map, archive and filtering are ready to grow, so real photos, interview notes or audio can be plugged in later.",
  },
  archiveHeading: { ja: "アーカイブ", en: "Archive" },
  // Map type / satellite-label toggle buttons (their text is set dynamically by
  // syncMapTypeButton, so they can't carry a data-i18n attribute).
  mapToMap: { ja: "地図", en: "Map" },
  mapToSatellite: { ja: "衛星", en: "Satellite" },
  mapHintToMap: { ja: "普通の地図に切り替え", en: "Switch to map" },
  mapHintToSatellite: { ja: "衛星写真に切り替え", en: "Switch to satellite" },
  labelsOn: { ja: "文字オン", en: "Labels on" },
  labelsOff: { ja: "文字オフ", en: "Labels off" },
  labelsHintShow: { ja: "衛星写真に文字を表示", en: "Show satellite labels" },
  labelsHintHide: { ja: "衛星写真の文字を非表示", en: "Hide satellite labels" },
};

// Static UI labels in the HTML carry a data-i18n="key" attribute; applyLanguage
// swaps their text by language. Add a key here + the attribute in index.html.
const I18N = {
  sortBy: { ja: "並び替え", en: "Sort by" },
  sortTime: { ja: "時間", en: "Time" },
  sortType: { ja: "種類", en: "Type" },
  sortPlace: { ja: "場所", en: "Place" },
  statsTab: { ja: "統計", en: "Stats" },
  aboutStatLocations: { ja: "記録された地点", en: "Recorded locations" },
  aboutStatPrototype: { ja: "プロトタイプ", en: "Prototype" },
  aboutStatInstall: { ja: "アプリとしてインストール可能", en: "Installable as an app" },
};

function applyLanguage() {
  document.documentElement.lang = state.lang;
  const aboutTitle = document.querySelector(".about-copy h2");
  if (aboutTitle) {
    aboutTitle.textContent = UI_TEXT.aboutTitle[state.lang];
  }
  const aboutBody = document.querySelector(".about-copy span");
  if (aboutBody) {
    aboutBody.textContent = UI_TEXT.aboutBody[state.lang];
  }
  document.querySelectorAll(".panel-heading h2, .section-heading h2").forEach((heading) => {
    heading.textContent = UI_TEXT.archiveHeading[state.lang];
  });
  // Swap every static labelled element (sidebar chips, archive controls, about
  // stats) to the current language.
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const entry = I18N[el.dataset.i18n];
    if (entry) {
      el.textContent = entry[state.lang] || entry.ja;
    }
  });
  // The map base / label toggle buttons set their own text — refresh it too.
  syncMapTypeButton();
  // Re-render everything that contains per-record bilingual text.
  render();
}

// Shared umbrella-attribute option sets (used by both the editor and the public
// display so the wording always matches). Labels are bilingual to help picking.
const UMBRELLA_COUNT_OPTIONS = ["1", "2", "3", "4", "5", "unknown"];
const COUNT_WORDS = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };
const UMBRELLA_COLOR_OPTIONS = [
  { value: "transparent", label: "transparent 透明" },
  { value: "translucent", label: "translucent 半透明" },
  { value: "colored", label: "colored 彩色" },
  { value: "patterned", label: "patterned 花纹" },
  { value: "other", label: "other 其他" },
  { value: "unknown", label: "unknown 未知" },
];
const UMBRELLA_KIND_OPTIONS = [
  { value: "long umbrella", label: "long umbrella 长柄伞" },
  { value: "folding", label: "folding 折叠伞" },
  { value: "unknown", label: "unknown 未知" },
];
const UMBRELLA_STATUS_OPTIONS = [
  { value: "fastened", label: "fastened 收拢" },
  { value: "unfastened", label: "unfastened 张开" },
  { value: "broken", label: "broken 损坏" },
  { value: "worn", label: "worn 磨损" },
  { value: "deteriorated", label: "deteriorated 老化" },
  { value: "unknown", label: "unknown 未知" },
  { value: "other", label: "other 其他" },
];
// Colors whose displayed word comes from the free-text detail box.
const COLOR_NEEDS_DETAIL = new Set(["colored", "patterned", "other"]);

const els = {
  welcome: document.querySelector("#welcome-screen"),
  enterSite: document.querySelector("#enter-site"),
  titleText: document.querySelector(".welcome-title-text"),
  titleLines: Array.from(document.querySelectorAll(".welcome-title-line[data-text]")),
  crosshairX: document.querySelector("#crosshair-line-x"),
  crosshairY: document.querySelector("#crosshair-line-y"),
  crosshairRing: document.querySelector("#crosshair-ring"),
  focusImageFrame: document.querySelector(".focus-image-frame"),
  turbulenceX: document.querySelector("#filter-x-turbulence"),
  turbulenceY: document.querySelector("#filter-y-turbulence"),
  turbulenceImage: document.querySelector("#filter-image-turbulence"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  search: document.querySelector("#search-input"),
  searchBox: document.querySelector(".search-box"),
  searchToggle: document.querySelector("#search-toggle"),
  chips: document.querySelectorAll("[data-list-sort]"),
  listSecondary: document.querySelector("#list-secondary-row"),
  listOrderToggle: document.querySelector("#list-order-toggle"),
  list: document.querySelector("#archive-list"),
  mapCanvas: document.querySelector("#google-map"),
  mapMessage: document.querySelector("#map-message"),
  focusBlur: document.querySelector("#focus-blur"),
  focusPanel: document.querySelector("#focus-image-panel"),
  focusImage: document.querySelector("#focus-image"),
  focusCaption: document.querySelector("#focus-caption"),
  focusHeader: document.querySelector("#focus-header"),
  focusClose: document.querySelector("#focus-close"),
  focusThumbs: document.querySelector("#focus-thumbs"),
  focusExpandedCaption: document.querySelector("#focus-expanded-caption"),
  archiveContent: document.querySelector("#archive-content"),
  resultCount: document.querySelector("#result-count"),
  resetMap: document.querySelector("#reset-map"),
  mapTypeToggle: document.querySelector("#map-type-toggle"),
  mapLabelsToggle: document.querySelector("#map-labels-toggle"),
  statCount: document.querySelector("#stat-count"),
  mapView: document.querySelector("#map-view"),
  toggleList: document.querySelector("#toggle-list"),
  archiveModeControls: document.querySelectorAll("[data-archive-mode]"),
  archiveSecondary: document.querySelector("#archive-secondary-row"),
  archiveOrderToggle: document.querySelector("#archive-order-toggle"),
  languageSwitcher: document.querySelector(".language-switcher"),
  languageToggle: document.querySelector("#language-toggle"),
  languageMenu: document.querySelector("#language-menu"),
};

// The editor only ever exists on the local machine. On the published
// (GitHub Pages) site this is false, so none of the editor UI is created and
// visitors never see an entry point.
const IS_LOCAL = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname);

init();

async function init() {
  state.lang = getStoredLang();
  state.umbrellas = await loadUmbrellaData();
  TEXTS = await loadTexts();
  state.selectedId = null;

  initWelcomeTitleLayout();
  bindEvents();
  applyLanguage();
  render();
  await initGoogleMap();
  render();
  if (IS_LOCAL) {
    setupEditor();
  }
  registerServiceWorker();
}

// Editable UI copy (type descriptions + stats intro), centralised in
// data/texts.json and edited via the local-only 文案編集 panel (item 12).
let TEXTS = { statsIntro: { ja: "", en: "" }, typeDescriptions: {} };

async function loadTexts() {
  try {
    const response = await fetch("data/texts.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load data/texts.json: ${response.status}`);
    }
    const raw = await response.json();
    return {
      statsIntro: {
        ja: String(raw?.statsIntro?.ja || ""),
        en: String(raw?.statsIntro?.en || ""),
      },
      typeDescriptions: raw?.typeDescriptions && typeof raw.typeDescriptions === "object" ? raw.typeDescriptions : {},
    };
  } catch (error) {
    console.error(error);
    return { statsIntro: { ja: "", en: "" }, typeDescriptions: {} };
  }
}

async function loadUmbrellaData() {
  try {
    const response = await fetch("data/umbrellas.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load data/umbrellas.json: ${response.status}`);
    }
    const raw = await response.json();
    // Keep the raw, un-merged records so the editor can show real manual
    // override values (e.g. manual time vs. EXIF time) rather than the
    // display-merged ones.
    state.rawById = new Map(
      Array.isArray(raw) ? raw.filter((item) => item?.id).map((item) => [item.id, item]) : [],
    );
    return normalizeUmbrellaData(raw);
  } catch (error) {
    console.error(error);
    showMapMessage("Archive data could not be loaded.");
    return [];
  }
}

function normalizeUmbrellaData(items) {
  return items
    .map((item) => {
      const umbrellaType = item.umbrellaType || "";
      const umbrellaColor = item.umbrellaColor || "";
      const categoryType = formatCategoryType(item);
      const locationLevels = normalizeLocationLevels(item.locationLevels);
      const locationText = item.locationText || formatLocationLevels(locationLevels);
      const umbrellaCount = item.umbrellaCount || "";
      const umbrellaUnits = Array.isArray(item.umbrellaUnits) ? item.umbrellaUnits : [];
      // Count=unknown: we can't describe individual umbrellas, so object and
      // state are shown as "unknown" on the detail page rather than left blank
      // (item 5). Otherwise build them from the units as usual.
      const objectText = umbrellaCount === "unknown" ? "unknown" : buildObjectText(umbrellaCount, umbrellaUnits);
      const objectLines = umbrellaCount === "unknown" ? ["unknown"] : buildObjectGroups(umbrellaCount, umbrellaUnits);
      const statusText = umbrellaCount === "unknown" ? "unknown" : statusTextFromUnits(umbrellaUnits);
      const statusLines = umbrellaCount === "unknown" ? ["unknown"] : statusLinesFromUnits(umbrellaUnits);
      const coordinates = item.locationCoordinates || item.photoCoordinates;
      const time = item.time || item.photoTime || "";
      const prefecture = locationLevels[0] || "Unknown";
      const adminArea = locationLevels.slice(1).join(", ") || locationText || "Unknown";
      return {
        ...item,
        title: item.title || "",
        displayName: item.id,
        thumb: item.thumb || item.image,
        location: locationText,
        locationText,
        locationLevels,
        coordinates,
        time,
        photoTime: item.photoTime || "",
        locationCoordinates: item.locationCoordinates || null,
        photoCoordinates: item.photoCoordinates || null,
        umbrellaType,
        umbrellaColor,
        umbrellaCount,
        umbrellaUnits,
        statusText,
        statusLines,
        objectText,
        objectLines,
        story: item.story || "",
        blocks: Array.isArray(item.blocks) ? item.blocks : [],
        editFlag: item.editFlag || "",
        media: normalizeMedia(item),
        type: categoryType || "uncategorized",
        prefecture,
        adminArea,
        material: objectText,
      };
    })
    .filter((item) => item.id && item.image);
}

function normalizeMedia(item) {
  const baseMedia = Array.isArray(item.media) && item.media.length
    ? item.media
    : [
        {
          id: item.id,
          file: item.image?.split("/").pop() || "",
          src: item.image,
          thumb: item.thumb || item.image,
          role: "primary",
          title: "",
          photoTime: item.photoTime || "",
          story: item.story || "",
        },
      ];

  const normalized = baseMedia.map((entry, index) => ({
    id: entry.id || `${item.id}-${index + 1}`,
    file: entry.file || (entry.src || item.image || "").split("/").pop() || "",
    src: entry.src || item.image,
    thumb: entry.thumb || entry.src || item.thumb || item.image,
    role: entry.role || (index === 0 ? "primary" : "detail"),
    title: entry.title || "",
    photoTime: entry.photoTime || "",
    story: entry.story || "",
  }));

  if (!normalized.some((entry) => entry.role === "primary") && normalized[0]) {
    normalized[0].role = "primary";
  }

  return normalized;
}

function initWelcomeTitleLayout() {
  // Render every line as individual letter spans so both lines can be
  // justified to the same width (left and right edges line up).
  els.titleLines.forEach((line) => {
    const text = line.dataset.text ?? "";
    line.innerHTML = text
      .split("")
      .map((character) => `<span>${character}</span>`)
      .join("");
  });
}

function bindEvents() {
  els.enterSite?.addEventListener("click", enterSite);
  initWelcomeCrosshair();
  syncPanelToggleLabels();
  syncArchiveControls();
  syncListControls(filteredUmbrellas());
  syncSearchBox();

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      if (!view) {
        return;
      }

      // Switching views from an open detail page closes it first (#4).
      if (els.mapView?.classList.contains("is-focus-mode")) {
        closeFocusMode({ resetZoom: false });
      }

      els.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      els.views.forEach((section) => section.classList.toggle("is-active", section.id === `${view}-view`));

      if (view === "map" && state.googleReady) {
        setTimeout(() => google.maps.event.trigger(state.map, "resize"), 80);
      }
    });
  });

  els.search?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  els.chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const sort = chip.dataset.listSort;
      // Clicking 时间 again while already sorting by time flips asc/desc.
      if (sort === "time" && state.listSort === "time") {
        state.listOrder = state.listOrder === "desc" ? "asc" : "desc";
      } else {
        state.listSort = sort;
        state.listSubfilter = "all";
      }
      els.chips.forEach((item) => item.classList.toggle("is-active", item.dataset.listSort === state.listSort));
      syncListControls(filteredUmbrellas());
      render();
    });
  });

  els.resetMap?.addEventListener("click", () => {
    state.listSort = "time";
    state.listSubfilter = "all";
    state.listOrder = "desc";
    state.query = "";
    state.selectedId = null;
    state.focusMarkerId = null;
    state.focusPositionedId = null;
    closeFocusMode();

    if (els.search) {
      els.search.value = "";
    }

    els.chips.forEach((chip) => chip.classList.toggle("is-active", chip.dataset.listSort === "time"));
    syncListControls(filteredUmbrellas());
    render();
    fitMapToItems(filteredUmbrellas());
  });

  els.toggleList?.addEventListener("click", togglePanel);
  els.focusImage?.addEventListener("click", (event) => {
    event.stopPropagation();
    // Already expanded? a click there is just for panning — don't re-open.
    if (!state.imageExpanded) {
      openExpandedImage();
    }
  });
  els.focusImage?.addEventListener("load", () => {
    els.focusPanel?.classList.remove("is-loading");
    if (state.imageExpanded) {
      setExpandedImageFrame();
      updateExpandedImageTransform();
    }
  });
  els.focusImage?.addEventListener("pointerdown", startExpandedImageDrag);
  document.addEventListener("pointermove", dragExpandedImage);
  document.addEventListener("pointerup", stopExpandedImageDrag);
  els.focusPanel?.addEventListener("click", (event) => event.stopPropagation());
  els.focusClose?.addEventListener("click", () => closeFocusMode({ resetZoom: true }));
  els.focusBlur?.addEventListener("click", () => {
    // A swipe just switched images — don't also treat it as a close click.
    if (state.blurSwiped) {
      state.blurSwiped = false;
      return;
    }
    if (state.imageExpanded) {
      closeExpandedImage();
    }
  });
  els.focusPanel?.addEventListener("wheel", handleExpandedImageWheel, { passive: false });
  // Click a supplement/detail photo in the article to enlarge it (#12).
  els.focusCaption?.addEventListener("click", (event) => {
    const img = event.target.closest?.("img[data-expandable]");
    if (!img) {
      return;
    }
    const file = img.getAttribute("data-media-file");
    const index = (state.focusMediaList || []).findIndex((m) => m.file === file);
    if (index >= 0) {
      expandImageAt(index);
    }
  });
  // Side thumbnail rail in the expanded lightbox switches images (#13).
  els.focusThumbs?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-thumb-index]");
    if (!button) {
      return;
    }
    showExpandedImageAt(Number(button.dataset.thumbIndex));
  });

  // #2c: a horizontal swipe over the blank area beside the enlarged image
  // switches photos; a plain click there still closes the lightbox.
  els.focusBlur?.addEventListener("pointerdown", startBlurSwipe);
  els.focusBlur?.addEventListener("pointerup", endBlurSwipe);

  els.searchToggle?.addEventListener("click", () => {
    state.searchOpen = !state.searchOpen;
    syncSearchBox();
  });

  els.mapTypeToggle?.addEventListener("click", toggleMapType);
  els.mapLabelsToggle?.addEventListener("click", toggleMapLabels);

  els.listSecondary?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-list-subfilter]");
    if (!button) {
      return;
    }

    state.listSubfilter = button.dataset.listSubfilter;
    render();
  });

  els.archiveModeControls.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.archiveMode;
      // Clicking 时间 again while already sorting by time flips asc/desc.
      if (mode === "time" && state.archiveMode === "time") {
        state.archiveOrder = state.archiveOrder === "desc" ? "asc" : "desc";
      } else {
        state.archiveMode = mode;
        state.archiveSubfilter = "all";
      }
      syncArchiveControls();
      renderArchive();
    });
  });

  els.archiveSecondary?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-archive-subfilter]");
    if (!button) {
      return;
    }

    state.archiveSubfilter = button.dataset.archiveSubfilter;
    renderArchive();
  });

  // 統計 cross-tab: changing either axis dropdown re-renders the tables (#5).
  els.archiveContent?.addEventListener("change", (event) => {
    const axis = event.target.closest?.("[data-stats-axis]");
    if (axis) {
      if (axis.dataset.statsAxis === "x") {
        state.statsX = axis.value;
      } else {
        state.statsY = axis.value;
      }
      renderArchive();
    }
  });

  // 統計 overview (item 6): date/type/area headers sort (toggle direction on a
  // repeat click); object/state headers open a single-value filter dropdown.
  els.archiveContent?.addEventListener("click", (event) => {
    const sortHead = event.target.closest?.("[data-overview-sort]");
    if (sortHead) {
      const key = sortHead.dataset.overviewSort;
      if (state.overviewSortKey === key) {
        state.overviewSortDir = state.overviewSortDir === "asc" ? "desc" : "asc";
      } else {
        state.overviewSortKey = key;
        state.overviewSortDir = "asc";
      }
      state.overviewMenuOpen = null;
      renderArchive();
      return;
    }
    const filterToggle = event.target.closest?.("[data-overview-filter-toggle]");
    if (filterToggle) {
      const field = filterToggle.dataset.overviewFilterToggle;
      state.overviewMenuOpen = state.overviewMenuOpen === field ? null : field;
      renderArchive();
      return;
    }
    const filterSet = event.target.closest?.("[data-overview-filter-set]");
    if (filterSet) {
      state.overviewFilters[filterSet.dataset.overviewFilterSet] = filterSet.dataset.value;
      state.overviewMenuOpen = null;
      renderArchive();
    }
  });

  // Archive card: the ✎ button opens the same editor drawer in place (no jump
  // to the map); double-clicking a card jumps to its spot on the map.
  els.archiveContent?.addEventListener("click", (event) => {
    const editButton = event.target.closest?.("[data-card-edit]");
    if (!editButton) {
      return;
    }
    event.stopPropagation();
    const card = editButton.closest(".photo-card");
    if (card?.dataset.id && IS_LOCAL && typeof editor !== "undefined" && editor.root) {
      openEditor(card.dataset.id);
    }
  });

  els.archiveContent?.addEventListener("dblclick", (event) => {
    const card = event.target.closest?.(".photo-card");
    if (card?.dataset.id) {
      jumpToMapLocation(card.dataset.id);
      return;
    }
    // 統計 overview: double-clicking an IMG cell jumps to its map detail (#7).
    const idCell = event.target.closest?.("[data-overview-id]");
    if (idCell?.dataset.overviewId) {
      jumpToMapLocation(idCell.dataset.overviewId);
    }
  });

  els.languageToggle?.addEventListener("click", () => {
    state.languageMenuOpen = !state.languageMenuOpen;
    syncLanguageMenu();
  });

  els.languageMenu?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-lang]");
    if (button) {
      state.lang = button.dataset.lang.startsWith("en") ? "en" : "ja";
      try {
        localStorage.setItem("fu-lang", state.lang);
      } catch {
        /* ignore storage errors */
      }
      applyLanguage();
    }
    state.languageMenuOpen = false;
    syncLanguageMenu();
  });

  document.addEventListener("click", (event) => {
    if (!els.languageSwitcher?.contains(event.target)) {
      state.languageMenuOpen = false;
      syncLanguageMenu();
    }
  });

  // Close an open overview filter dropdown when clicking outside of it (item 6).
  document.addEventListener("click", (event) => {
    if (state.overviewMenuOpen && !event.target.closest?.(".overview-filter-head")) {
      state.overviewMenuOpen = null;
      renderArchive();
    }
  });

  // Keep the (fixed) overview dropdown glued to its button while scrolling/resizing.
  window.addEventListener("scroll", () => state.overviewMenuOpen && positionOverviewMenu(), true);
  window.addEventListener("resize", () => state.overviewMenuOpen && positionOverviewMenu());

  document.addEventListener(
    "click",
    (event) => {
      const markerElement = event.target.closest?.("[title]");
      const item = state.umbrellas.find((entry) => entry.id === markerElement?.getAttribute("title"));
      if (item) {
        selectUmbrella(item.id, { focus: true });
      }
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (state.imageExpanded) {
      closeExpandedImage();
      return;
    }

    if (els.mapView.classList.contains("is-focus-mode")) {
      closeFocusMode({ resetZoom: true });
    }
  });
}

function syncPanelToggleLabels() {
  updatePanelButton(
    els.toggleList,
    els.mapView.classList.contains("is-list-collapsed"),
    "\u30ea\u30b9\u30c8\u3092\u9589\u3058\u308b",
    "\u30ea\u30b9\u30c8\u3092\u958b\u304f",
  );
}

function syncArchiveControls() {
  els.archiveModeControls.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.archiveMode === state.archiveMode);
  });

  // The 时间 button shows ↓ (newest first) / ↑ (oldest first) when active.
  els.archiveModeControls.forEach((button) => {
    if (button.dataset.archiveMode !== "time") {
      return;
    }
    const arrow = button.querySelector(".sort-arrow");
    if (arrow) {
      arrow.textContent = state.archiveMode === "time" ? (state.archiveOrder === "asc" ? " ↑" : " ↓") : "";
    }
  });
}

function syncListControls(items) {
  els.chips.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.listSort === state.listSort);
  });

  // The 时间 chip shows ↓ (newest first) / ↑ (oldest first) when active.
  els.chips.forEach((chip) => {
    if (chip.dataset.listSort !== "time") {
      return;
    }
    const arrow = chip.querySelector(".sort-arrow");
    if (arrow) {
      arrow.textContent = state.listSort === "time" ? (state.listOrder === "asc" ? " ↑" : " ↓") : "";
    }
  });

  if (!els.listSecondary) {
    return;
  }

  if (state.listSort !== "type" && state.listSort !== "place") {
    els.listSecondary.hidden = true;
    els.listSecondary.innerHTML = "";
    return;
  }

  const field = state.listSort === "type" ? "type" : "prefecture";
  const counts = countByField(items, field);
  const options = [
    { key: "all", label: `all (${items.length})` },
    ...Array.from(counts.entries()).map(([key, count]) => ({ key, label: `${key} (${count})` })),
  ];

  els.listSecondary.hidden = false;
  els.listSecondary.innerHTML = options
    .map(
      (option) => `
        <button class="list-subcontrol ${option.key === state.listSubfilter ? "is-active" : ""}" data-list-subfilter="${option.key}" type="button">
          ${option.label}
        </button>
      `,
    )
    .join("");
}

function syncSearchBox() {
  if (!els.searchBox || !els.searchToggle) {
    return;
  }

  els.searchBox.hidden = !state.searchOpen;
  els.searchToggle.setAttribute("aria-expanded", String(state.searchOpen));
  els.searchToggle.setAttribute("aria-label", state.searchOpen ? "close search" : "open search");
  if (state.searchOpen) {
    els.search?.focus();
  }
}

function syncLanguageMenu() {
  els.languageSwitcher?.classList.toggle("is-open", state.languageMenuOpen);
  els.languageToggle?.setAttribute("aria-expanded", String(state.languageMenuOpen));
  if (els.languageMenu) {
    els.languageMenu.hidden = !state.languageMenuOpen;
  }
}

function initWelcomeCrosshair() {
  if (!els.welcome || !els.crosshairX || !els.crosshairY || window.matchMedia("(pointer: coarse)").matches) {
    return;
  }

  const pointer = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    renderedX: window.innerWidth / 2,
    renderedY: window.innerHeight / 2,
    active: false,
    titleActive: false,
    noise: 0,
    noiseTarget: 0,
  };

  const renderFrame = () => {
    pointer.renderedX = lerp(pointer.renderedX, pointer.x, 0.15);
    pointer.renderedY = lerp(pointer.renderedY, pointer.y, 0.15);
    pointer.noise = lerp(pointer.noise, pointer.noiseTarget, 0.14);

    els.crosshairY.style.transform = `translate3d(${pointer.renderedX}px, 0, 0)`;
    els.crosshairX.style.transform = `translate3d(0, ${pointer.renderedY}px, 0)`;
    if (els.crosshairRing) {
      els.crosshairRing.style.transform = `translate3d(${pointer.renderedX}px, ${pointer.renderedY}px, 0) translate(-50%, -50%)`;
    }

    if (els.turbulenceX && els.turbulenceY) {
      const turbulence = Math.max(pointer.noise, 0.000001).toFixed(6);
      els.turbulenceX.setAttribute("baseFrequency", turbulence);
      els.turbulenceY.setAttribute("baseFrequency", turbulence);
      els.turbulenceImage?.setAttribute("baseFrequency", Math.max(pointer.noise / 3, 0.000001).toFixed(6));
    }

    requestAnimationFrame(renderFrame);
  };

  const move = (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (!pointer.active) {
      pointer.active = true;
      els.welcome.classList.add("is-crosshair-active");
    }

    const titleBounds = getWelcomeTextBounds();
    const isTitleHovered =
      titleBounds &&
      event.clientX >= titleBounds.left &&
      event.clientX <= titleBounds.right &&
      event.clientY >= titleBounds.top &&
      event.clientY <= titleBounds.bottom;

    if (isTitleHovered && !pointer.titleActive) {
      pointer.titleActive = true;
      startNoise();
    } else if (!isTitleHovered && pointer.titleActive) {
      pointer.titleActive = false;
      stopNoise();
    }

    els.welcome.classList.toggle("is-title-hovered", Boolean(isTitleHovered));
  };

  const startNoise = () => {
    pointer.noiseTarget = 1;
    els.crosshairX.style.filter = "url(#filter-noise-x)";
    els.crosshairY.style.filter = "url(#filter-noise-y)";
    setTimeout(() => {
      pointer.noiseTarget = 0;
    }, 120);
    setTimeout(() => {
      els.crosshairX.style.filter = "none";
      els.crosshairY.style.filter = "none";
    }, 520);
  };

  const stopNoise = () => {
    pointer.noiseTarget = 0;
    els.welcome.classList.remove("is-title-hovered");
  };

  window.addEventListener("mousemove", move);
  requestAnimationFrame(renderFrame);
}

function getWelcomeTextBounds() {
  const textParts = Array.from(els.titleText?.querySelectorAll(".welcome-title-line, .welcome-title-line span") ?? []);
  if (textParts.length === 0) {
    return els.titleText?.getBoundingClientRect();
  }

  return textParts.reduce(
    (bounds, part) => {
      const rect = part.getBoundingClientRect();
      return {
        left: Math.min(bounds.left, rect.left),
        right: Math.max(bounds.right, rect.right),
        top: Math.min(bounds.top, rect.top),
        bottom: Math.max(bounds.bottom, rect.bottom),
      };
    },
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity },
  );
}

function lerp(a, b, n) {
  return (1 - n) * a + n * b;
}

function enterSite() {
  document.body.classList.add("is-entered");

  if (state.googleReady) {
    setTimeout(() => {
      google.maps.event.trigger(state.map, "resize");
      playEntryZoom();
    }, 460);
  }
}

// On the first entry, sweep the camera from a whole-main-island scale down to
// the default city view. Runs once per session.
function playEntryZoom() {
  if (state.entryZoomPlayed || !state.googleReady || !state.map) {
    return;
  }
  state.entryZoomPlayed = true;

  const targetCenter = state.map.getCenter();
  const startTime = performance.now();
  // The map already sits at ENTRY_START_ZOOM from init, so we animate straight
  // up to the default city zoom without snapping (no flash of the default view).
  const step = (now) => {
    const t = Math.min((now - startTime) / ENTRY_ZOOM_ANIMATION_MS, 1);
    const eased = easeInOutCubic(t);
    setMapCamera(targetCenter, lerp(ENTRY_START_ZOOM, DEFAULT_MAP_ZOOM, eased));
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      setMapCamera(targetCenter, DEFAULT_MAP_ZOOM);
    }
  };
  requestAnimationFrame(step);
}

function togglePanel() {
  const className = "is-list-collapsed";
  const expandedLabel = "\u30ea\u30b9\u30c8\u3092\u9589\u3058\u308b";
  const collapsedLabel = "\u30ea\u30b9\u30c8\u3092\u958b\u304f";

  els.mapView.classList.toggle(className);
  const isCollapsed = els.mapView.classList.contains(className);
  updatePanelButton(els.toggleList, isCollapsed, expandedLabel, collapsedLabel);
}

function collapseListPanel() {
  if (els.mapView.classList.contains("is-list-collapsed")) {
    return;
  }

  els.mapView.classList.add("is-list-collapsed");
  updatePanelButton(
    els.toggleList,
    true,
    "\u30ea\u30b9\u30c8\u3092\u9589\u3058\u308b",
    "\u30ea\u30b9\u30c8\u3092\u958b\u304f",
  );
  if (state.googleReady) {
    setTimeout(() => google.maps.event.trigger(state.map, "resize"), 280);
  }
}

function updatePanelButton(button, isCollapsed, expandedLabel, collapsedLabel) {
  if (!button) {
    return;
  }

  button.setAttribute("aria-expanded", String(!isCollapsed));
  button.setAttribute("aria-label", isCollapsed ? collapsedLabel : expandedLabel);
  button.setAttribute("title", isCollapsed ? collapsedLabel : expandedLabel);
}

async function initGoogleMap() {
  try {
    await loadGoogleMaps(state.googleMapsApiKey);
  } catch (error) {
    const currentOrigin = window.location.origin;
    showMapMessage(
      state.googleMapsApiKey && state.googleMapsApiKey !== "YOUR_GOOGLE_MAPS_API_KEY"
        ? `\u5730\u56f3\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002Google Cloud \u306e API \u30ad\u30fc\u306e Website restrictions \u3092\u78ba\u8a8d\u3057\u3001${currentOrigin}/* \u304c\u8a31\u53ef\u3055\u308c\u3066\u3044\u308b\u304b\u3054\u78ba\u8a8d\u304f\u3060\u3055\u3044\u3002`
        : "\u307e\u305a config.js \u306b Google Maps API Key \u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
    );
    return;
  }

  state.map = new google.maps.Map(els.mapCanvas, {
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
    minZoom: MIN_MAP_ZOOM,
    mapTypeId: effectiveMapTypeId(),
    isFractionalZoomEnabled: true,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    cameraControl: false,
    rotateControl: false,
    zoomControl: false,
    clickableIcons: false,
    gestureHandling: "greedy",
    styles: state.mapBase === "roadmap" ? mapStyles : satelliteStylesForZoom(DEFAULT_MAP_ZOOM),
  });

  state.projectionOverlay = new google.maps.OverlayView();
  state.projectionOverlay.onAdd = () => {};
  state.projectionOverlay.draw = () => {};
  state.projectionOverlay.onRemove = () => {};
  state.projectionOverlay.setMap(state.map);

  state.map.addListener("dragstart", dismissFocusAfterUserMapInteraction);
  state.map.addListener("zoom_changed", dismissFocusAfterUserMapInteraction);
  state.map.addListener("zoom_changed", refreshSatellitePoi);

  const initialCenter = await getInitialMapCenter();
  state.map.setCenter(initialCenter);
  // Pre-position at the whole-main-island scale so the very first frame the
  // user sees (when they leave the welcome screen) is already the island view;
  // playEntryZoom then zooms in. This avoids a flash of the default city view.
  state.map.setZoom(ENTRY_START_ZOOM);
  syncMapTypeButton();

  state.googleReady = true;
  state.suppressNextFit = true;
  if (els.mapMessage) {
    els.mapMessage.hidden = true;
  }
  // If the user already tapped "enter" before the map finished loading, run the
  // zoom-in now instead of leaving them stranded at the island scale.
  if (document.body.classList.contains("is-entered")) {
    playEntryZoom();
  }
}

function isInsideJapan(coords) {
  return (
    coords.lat >= JAPAN_BOUNDS.minLat &&
    coords.lat <= JAPAN_BOUNDS.maxLat &&
    coords.lng >= JAPAN_BOUNDS.minLng &&
    coords.lng <= JAPAN_BOUNDS.maxLng
  );
}

function getInitialMapCenter() {
  if (!navigator.geolocation) {
    return Promise.resolve(DEFAULT_MAP_CENTER);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (center) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(center);
    };

    const timeoutId = window.setTimeout(() => finish(DEFAULT_MAP_CENTER), GEOLOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeoutId);
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        // Only jump to the user's real position when they are inside Japan;
        // outside Japan we treat it like "no location" and fall back to Tokyo.
        finish(isInsideJapan(here) ? here : DEFAULT_MAP_CENTER);
      },
      () => {
        window.clearTimeout(timeoutId);
        finish(DEFAULT_MAP_CENTER);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: GEOLOCATION_TIMEOUT_MS,
      },
    );
  });
}

function toggleMapType() {
  if (!state.googleReady) {
    return;
  }

  // Primary toggle: 普通地图(roadmap) ↔ 卫星(satellite).
  state.mapBase = state.mapBase === "roadmap" ? "satellite" : "roadmap";
  applyMapType();
  syncMapTypeButton();
}

// Secondary toggle (only meaningful on satellite): text labels on/off, which is
// the difference between Google's "satellite" and "hybrid" map types.
function toggleMapLabels() {
  if (!state.googleReady) {
    return;
  }
  state.mapLabels = !state.mapLabels;
  applyMapType();
  syncMapTypeButton();
}

// The actual Google map type id derived from the base + labels state.
function effectiveMapTypeId() {
  if (state.mapBase === "roadmap") {
    return "roadmap";
  }
  return state.mapLabels ? "hybrid" : "satellite";
}

function currentMapStyles() {
  if (state.mapBase === "roadmap") {
    return mapStyles;
  }
  return satelliteStylesForZoom(state.map?.getZoom?.() ?? DEFAULT_MAP_ZOOM);
}

function applyMapType() {
  if (state.googleReady) {
    state.map.setMapTypeId(effectiveMapTypeId());
    // Plain map keeps its roads; satellite/hybrid drops the road line overlay
    // and shows POI only when zoomed in.
    state.poiShown = state.mapBase === "satellite" && currentMapStyles() === SATELLITE_STYLES_NEAR;
    state.map.setOptions({ styles: currentMapStyles() });
  }
}

// Swap POI labels in/out as the zoom crosses the reveal threshold (satellite only).
function refreshSatellitePoi() {
  if (!state.googleReady || state.mapBase !== "satellite") {
    return;
  }
  const zoomedIn = state.map.getZoom() >= POI_REVEAL_ZOOM;
  const showPoi = POI_SHOW_WHEN_ZOOMED_IN ? zoomedIn : !zoomedIn;
  if (showPoi === state.poiShown) {
    return;
  }
  state.poiShown = showPoi;
  state.map.setOptions({ styles: currentMapStyles() });
}

function syncMapTypeButton() {
  const onSatellite = state.mapBase === "satellite";
  const lang = state.lang;
  if (els.mapTypeToggle) {
    // Button shows the base you'll switch TO.
    const label = onSatellite ? UI_TEXT.mapToMap[lang] : UI_TEXT.mapToSatellite[lang];
    const hint = onSatellite ? UI_TEXT.mapHintToMap[lang] : UI_TEXT.mapHintToSatellite[lang];
    els.mapTypeToggle.textContent = label;
    els.mapTypeToggle.setAttribute("aria-label", hint);
    els.mapTypeToggle.setAttribute("title", hint);
  }
  if (els.mapLabelsToggle) {
    // The labels button only appears while on satellite.
    els.mapLabelsToggle.hidden = !onSatellite;
    const label = state.mapLabels ? UI_TEXT.labelsOff[lang] : UI_TEXT.labelsOn[lang];
    const hint = state.mapLabels ? UI_TEXT.labelsHintHide[lang] : UI_TEXT.labelsHintShow[lang];
    els.mapLabelsToggle.textContent = label;
    els.mapLabelsToggle.setAttribute("aria-label", hint);
    els.mapLabelsToggle.setAttribute("title", hint);
  }
}

function loadGoogleMaps(apiKey) {
  if (!apiKey || apiKey === "YOUR_GOOGLE_MAPS_API_KEY") {
    return Promise.reject(new Error("Missing Google Maps API key"));
  }

  if (window.google?.maps) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const callbackName = `initForgottenUmbrellaMap_${Date.now()}`;
    const script = document.createElement("script");
    const authFailureName = "__forgottenUmbrellaAuthFailure";
    let timeoutId = null;

    const cleanup = () => {
      delete window[callbackName];
      if (window[authFailureName]) {
        delete window[authFailureName];
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };

    const fail = (reason) => {
      cleanup();
      reject(reason);
    };

    window[callbackName] = () => {
      cleanup();
      resolve();
    };

    window[authFailureName] = () => {
      fail(new Error("Google Maps authentication failed"));
    };

    window.gm_authFailure = window[authFailureName];

    timeoutId = window.setTimeout(() => {
      fail(new Error("Google Maps loading timed out"));
    }, 12000);

    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=en&region=JP&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      fail(new Error("Google Maps script failed"));
    };

    document.head.append(script);
  });
}

function filteredUmbrellas() {
  return state.umbrellas.filter((item) => {
    const haystack = [
      item.id,
      item.location,
      item.time,
      item.type,
      item.material,
      item.statusText,
      item.story,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.query);
  });
}

function render() {
  const items = filteredUmbrellas();

  if (!items.some((item) => item.id === state.selectedId)) {
    state.selectedId = null;
  }
  if (!items.some((item) => item.id === state.focusMarkerId)) {
    state.focusMarkerId = null;
  }

  renderList(items);
  renderMapMarkers(items);
  renderFocusImage();
  renderArchive();

  if (els.resultCount) {
    els.resultCount.textContent = `${items.length} item`;
  }
  if (els.statCount) {
    els.statCount.textContent = String(state.umbrellas.length);
  }
}

// Tracks the last sidebar-list click so we can detect a double-click manually: a
// single click pans the map and re-renders the list (replacing the buttons), which
// would break the browser's native dblclick detection. Module-level so it survives
// those re-renders.
let listLastClick = { id: null, t: 0 };

function renderList(items) {
  if (!els.list) {
    return;
  }

  syncListControls(items);
  const sortedItems = sortListItems(filterListItems(items));

  els.list.innerHTML = sortedItems
    .map(
      (item) => `
        <button class="location-button ${item.id === state.selectedId ? "is-active" : ""}" data-id="${item.id}" type="button">
          <img src="${item.thumb}" alt="${item.id}" loading="lazy" decoding="async" />
          <span class="location-copy">
            <span class="location-idrow">
              <strong>${escapeHtml(item.id)}</strong>
              ${localize(item.title) ? `<span class="location-title">${escapeHtml(localize(item.title))}</span>` : ""}
            </span>
            <span class="location-meta">
              <span class="location-meta-place">${escapeHtml(item.location || "—")}</span>
              <span class="location-meta-time">${escapeHtml(formatListDate(item.time) || "")}</span>
            </span>
          </span>
        </button>
      `,
    )
    .join("");

  els.list.querySelectorAll(".location-button").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      const now = Date.now();
      // Double-click (same item within 350ms): jump to it AND open its detail
      // page. Single click just pans/selects on the map.
      if (listLastClick.id === id && now - listLastClick.t < 350) {
        listLastClick = { id: null, t: 0 };
        selectUmbrella(id, { focus: true });
      } else {
        listLastClick = { id, t: now };
        selectUmbrella(id, { panMap: true });
      }
    });
  });
}

function filterListItems(items) {
  if ((state.listSort !== "type" && state.listSort !== "place") || state.listSubfilter === "all") {
    return items;
  }

  const field = state.listSort === "type" ? "type" : "prefecture";
  return items.filter((item) => item[field] === state.listSubfilter);
}

function sortListItems(items) {
  if (state.listSort === "time") {
    return sortByTime(items, state.listOrder);
  }

  if (state.listSort === "type") {
    return sortByCount(items, "type");
  }

  if (state.listSort === "place") {
    return [...items].sort(
      (a, b) =>
        String(a.prefecture).localeCompare(String(b.prefecture)) ||
        String(a.adminArea).localeCompare(String(b.adminArea)) ||
        getTimeValue(b) - getTimeValue(a),
    );
  }

  return [...items];
}

function renderMapMarkers(items) {
  if (!state.googleReady) {
    return;
  }

  state.markers.forEach((marker) => marker.setMap(null));
  state.markers.clear();

  items.filter(hasCoordinates).forEach((item) => {
    const marker = new google.maps.Marker({
      map: state.map,
      position: item.coordinates,
      title: item.id,
      icon: markerIcon(item.id === state.focusMarkerId, flagColorFor(item)),
      draggable: state.editMode,
    });

    marker.addListener("click", (event) => {
      event.domEvent?.stopPropagation?.();
      // A drag often fires a trailing click — ignore it so it can't reopen the
      // editor and wipe the just-dragged coordinates.
      if (performance.now() < (state.suppressMarkerClickUntil || 0)) {
        return;
      }
      if (state.editMode) {
        openEditor(item.id);
        return;
      }
      state.ignoreFocusCloseUntil = performance.now() + 180;
      // #5: clicking the already-focused marker again (after panning/zooming it
      // out of the clear circle) re-centres it instead of doing nothing.
      if (state.focusMarkerId === item.id) {
        state.focusPositionedId = null;
      }
      selectUmbrella(item.id, { focus: true });
    });
    marker.addListener("dragend", (event) => {
      state.suppressMarkerClickUntil = performance.now() + 500;
      const lat = event.latLng?.lat();
      const lng = event.latLng?.lng();
      if (typeof lat === "number" && typeof lng === "number") {
        onMarkerDragged(item.id, { lat, lng });
      }
    });
    marker.addListener("mouseover", () => {
      marker.setIcon(hoverMarkerIcon(item.id === state.focusMarkerId, flagColorFor(item)));
    });
    marker.addListener("mouseout", () => {
      marker.setIcon(markerIcon(item.id === state.focusMarkerId, flagColorFor(item)));
    });
    state.markers.set(item.id, marker);
  });

  if (state.suppressNextFit) {
    state.suppressNextFit = false;
  }
}

function renderFocusImage() {
  const item = state.umbrellas.find((entry) => entry.id === state.selectedId);
  if (!item || !els.focusImage || !els.focusCaption) {
    return;
  }

  const cover = (item.media || []).find((m) => m.role === "primary") || item.media?.[0];
  // Everything except illustrations can be enlarged (cover + supplement + detail).
  state.focusMediaList = getExpandableMedia(item);

  els.focusPanel?.classList.add("is-loading");
  els.focusImage.src = cover?.src || item.image;
  els.focusImage.alt = localize(item.title) || item.id;
  if (els.focusHeader) {
    els.focusHeader.innerHTML = renderFocusHeader(item);
  }
  els.focusCaption.innerHTML = renderFocusArticle(item);
  if (els.focusImage.complete && els.focusImage.naturalWidth > 0) {
    els.focusPanel?.classList.remove("is-loading");
  }
  closeExpandedImage();
}

// The detail page body: an ordered flow of paragraphs and photos. Falls back
// to story + non-primary photos for records saved before blocks existed.
function effectiveBlocks(item) {
  const blocks = Array.isArray(item.blocks) ? item.blocks : [];
  if (blocks.length) {
    return blocks;
  }
  const out = [];
  if (item.story) {
    item.story
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text) => out.push({ type: "text", text }));
  }
  (item.media || [])
    .filter((m) => m.role !== "primary")
    .forEach((m) => out.push({ type: "photo", file: m.file }));
  return out;
}

// Fixed header (stays put while the images/text scroll): id(title), place, time.
function renderFocusHeader(item) {
  const title = localize(item.title);
  const focusTitle = title ? `${item.id}(${title})` : item.id;
  return `
    <h3 class="focus-title">${escapeHtml(focusTitle)}</h3>
    ${item.location ? `<p class="focus-meta">${escapeHtml(item.location)}</p>` : ""}
    ${formatDateTime(item.time) ? `<p class="focus-meta">${escapeHtml(formatDateTime(item.time))}</p>` : ""}
  `;
}

function renderFocusArticle(item) {
  const infoRows = [];
  const typeValue = formatInformationType(item);
  if (typeValue) {
    infoRows.push({ label: "type", lines: [typeValue] });
  }
  if (item.objectLines?.length) {
    infoRows.push({ label: "object", lines: item.objectLines });
  }
  if (item.statusLines?.length) {
    infoRows.push({ label: "state", lines: item.statusLines });
  }

  const mediaByFile = {};
  (item.media || []).forEach((m) => {
    mediaByFile[m.file] = m;
  });

  const blocksHtml = effectiveBlocks(item)
    .map((block) => {
      if (block.type === "text") {
        const text = localize(block.text);
        if (!text) {
          return "";
        }
        // Each "\n" in the stored text is a paragraph break; render one <p> per
        // paragraph so the line breaks actually show. Japanese justifies both
        // edges, English stays left-aligned ([[text-justify-rule]]).
        const justify = state.lang === "ja" ? " is-justify" : "";
        return text
          .split("\n")
          .map((para) => para.trim())
          .filter(Boolean)
          .map((para) => `<p class="item-story${justify}">${escapeHtml(para)}</p>`)
          .join("");
      }
      const media = mediaByFile[block.file];
      if (!media) {
        return "";
      }
      // Caption "title, ID, time" (title omitted when empty), small + right-aligned.
      const caption = [media.title, media.id, formatDateTime(mediaDisplayTime(media))].filter(Boolean).join(", ");
      // Supplement/detail photos can be enlarged; illustrations cannot (#12).
      const expandable = media.role !== "illustration";
      const expandAttrs = expandable ? ` data-expandable="1" data-media-file="${escapeHtml(media.file)}"` : "";
      return `<figure class="focus-photo">
          <img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.title || media.id || "")}" loading="lazy" decoding="async"${expandAttrs} />
          ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
        </figure>`;
    })
    .join("");

  const infoHtml = infoRows.length
    ? `<h4 class="focus-info-heading">information</h4>
      <div class="focus-info">
        ${infoRows
          .map(
            (row) => `<div class="focus-info-row">
              <span class="focus-info-label">${row.label}:</span>
              <div class="focus-info-value">${row.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
            </div>`,
          )
          .join("")}
      </div>`
    : "";

  return `
    <div class="focus-caption-inner">
      ${infoHtml}
      ${blocksHtml}
    </div>
  `;
}

// ---- 統計 (statistics) page (#5) -------------------------------------------

// The dimensions you can put on either axis of the cross-tab. `object` merges the
// umbrella's colour and kind into one descriptor (#3). Labels are always English,
// regardless of the site language (#2).
const STATS_DIMS = ["type", "object", "state", "month", "place"];
const STATS_DIM_LABELS = {
  type: "type",
  object: "object",
  state: "state",
  month: "month",
  place: "place",
};
const STATS_TYPE_ORDER = [
  "hookable(affordance)",
  "drop(behavior)",
  "disposal(behavior)",
  "placement(behavior)",
  "payment(behavior)",
  "restroom(place)",
  "corner(affordance)",
  "transit(place)",
  "unknown",
];

// One row per umbrella (umbrellaUnits entry). A record with no units counts once
// so every photo is represented. `state` is multi-valued (a unit can have several
// status flags), the rest are single-valued.
function buildStatsUnits() {
  const units = [];
  state.umbrellas.forEach((item) => {
    // Count=unknown: we don't know how many umbrellas there are, so the record
    // is excluded from the cross-tab counts entirely (item 5). A record with a
    // numeric count whose colour/kind is unknown is still counted (we know it's
    // 1-N umbrellas) and shows up as "unknown …".
    if (item.umbrellaCount === "unknown") {
      return;
    }
    // Normalise the month key: some records store the time with "." separators
    // (e.g. "2026.05.02, 19:56"), others with "-", which split one month into two
    // cross-tab buckets ("2026.05" vs "2026-05"). Force "-" (#5 follow-up).
    const month = item.time ? String(item.time).slice(0, 7).replace(/[./]/g, "-") : "no-time";
    const place = item.prefecture || "unknown";
    const raw = Array.isArray(item.umbrellaUnits) ? item.umbrellaUnits : [];
    const first = raw[0] || {};
    const n = Number(item.umbrellaCount);
    // Apply the same "a blank trailing umbrella copies the first" rule the detail
    // page uses (applyUnitInheritance); otherwise a count=2 record with only the
    // first umbrella filled produces a phantom "unknown unknown" (issue 1).
    const desc =
      Number.isInteger(n) && n >= 1 ? applyUnitInheritance(item.umbrellaCount, raw) : raw.length ? raw : [{}];
    desc.forEach((u, i) => {
      const rawUnit = raw[i] || {};
      const inheritedBlank = i > 0 && !rawUnit.color && !rawUnit.kind;
      const src = inheritedBlank ? first : rawUnit;
      const status = Array.isArray(src.status) && src.status.length ? src.status.slice() : ["unknown"];
      units.push({
        type: item.type || "unknown",
        object: statsObjectValue(u),
        state: status,
        month,
        place,
      });
    });
  });
  return units;
}

// `object` = colour category + kind, merged into one descriptor (#3). Colours
// stay at the category level (transparent / translucent / colored / patterned /
// unknown — never the free-text shade), and the kind is spelled out in full so
// the value reads e.g. "unknown long umbrella" rather than just "unknown long".
// Long vs folding are always kept apart. Both the cross-tab and the overview use
// this single function so they always agree.
function statsObjectValue(u) {
  const color = u.color || "unknown";
  const kind = u.kind === "folding" ? "folding umbrella" : u.kind === "long umbrella" ? "long umbrella" : "unknown";
  return `${color} ${kind}`;
}

function statsDimValues(unit, dim) {
  return dim === "state" ? unit.state : [unit[dim]];
}

// Short label for an axis value (a type drops its "(group)" suffix).
function statsValueLabel(dim, value) {
  return dim === "type" ? String(value).replace(/\(.*\)$/, "") : value;
}

function statsOrderValues(values, dim) {
  if (dim === "type") {
    return values.sort((a, b) => STATS_TYPE_ORDER.indexOf(a) - STATS_TYPE_ORDER.indexOf(b));
  }
  if (dim === "month") {
    return values.sort();
  }
  const trailing = (v) => (v === "unknown" || v === "no-time" ? 1 : 0);
  return values.sort((a, b) => trailing(a) - trailing(b) || String(a).localeCompare(String(b)));
}

function renderStats() {
  // Intro paragraph (bilingual) lives in data/texts.json now (item 12).
  const intro = TEXTS.statsIntro[state.lang] || TEXTS.statsIntro.ja || TEXTS.statsIntro.en || "";
  // 大段正文：日语两边对齐，英语左对齐（[[text-justify-rule]]）。
  const introJustify = state.lang === "ja" ? " is-justify" : "";
  els.archiveContent.innerHTML = `
    <p class="stats-intro${introJustify}">${escapeHtml(intro)}</p>
    ${renderStatsPivot(buildStatsUnits())}
    ${renderStatsOverview()}
  `;
  positionOverviewMenu();
}

// The open overview filter dropdown is position:fixed (item 3), so place it right
// under its header button. Re-run on scroll/resize so it tracks the button.
function positionOverviewMenu() {
  const btn = els.archiveContent?.querySelector(".overview-filter-head.is-open .overview-filter-btn");
  const menu = els.archiveContent?.querySelector(".overview-filter-head.is-open .overview-filter-menu");
  if (!btn || !menu) {
    return;
  }
  const rect = btn.getBoundingClientRect();
  const viewportW = document.documentElement.clientWidth;
  const viewportH = document.documentElement.clientHeight;
  const margin = 8;
  const naturalH = menu.scrollHeight;
  const spaceBelow = viewportH - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  // If the table is short the page can't scroll, so a long dropdown placed below
  // could spill past the viewport bottom and become unreachable. Cap the menu's
  // height to the space available (it scrolls internally), and flip it above the
  // button when there's clearly more room up there.
  if (spaceBelow < Math.min(naturalH, 160) && spaceAbove > spaceBelow) {
    menu.style.top = "auto";
    menu.style.bottom = `${viewportH - rect.top + 2}px`;
    menu.style.maxHeight = `${Math.min(260, spaceAbove)}px`;
  } else {
    menu.style.bottom = "auto";
    menu.style.top = `${rect.bottom + 2}px`;
    menu.style.maxHeight = `${Math.min(260, spaceBelow)}px`;
  }
  // Keep the menu inside the viewport's right edge (rightmost columns).
  const menuW = menu.offsetWidth || 160;
  menu.style.left = `${Math.max(8, Math.min(rect.left, viewportW - menuW - 8))}px`;
}

function renderStatsAxisSelect(axis, current) {
  const options = STATS_DIMS.map(
    (dim) => `<option value="${dim}"${dim === current ? " selected" : ""}>${STATS_DIM_LABELS[dim]}</option>`,
  ).join("");
  return `<select class="stats-axis" data-stats-axis="${axis}" aria-label="${axis} axis">${options}</select>`;
}

// The interactive cross-tab: pick a dimension for rows and one for columns; each
// cell counts umbrellas, with totals along the bottom and right edge (#5).
function renderStatsPivot(units) {
  const xDim = state.statsX;
  const yDim = state.statsY;
  const matrix = new Map();
  const xSet = new Set();
  const ySet = new Set();
  units.forEach((u) => {
    const xs = statsDimValues(u, xDim);
    const ys = statsDimValues(u, yDim);
    xs.forEach((x) => xSet.add(x));
    ys.forEach((y) => ySet.add(y));
    ys.forEach((y) => {
      if (!matrix.has(y)) {
        matrix.set(y, new Map());
      }
      const row = matrix.get(y);
      xs.forEach((x) => row.set(x, (row.get(x) || 0) + 1));
    });
  });
  const xVals = statsOrderValues([...xSet], xDim);
  const yVals = statsOrderValues([...ySet], yDim);

  const colTotals = xVals.map(() => 0);
  let grand = 0;
  const bodyRows = yVals.map((y) => {
    const row = matrix.get(y) || new Map();
    let rowTotal = 0;
    const cells = xVals.map((x, i) => {
      const n = row.get(x) || 0;
      rowTotal += n;
      colTotals[i] += n;
      return `<td>${n || ""}</td>`;
    });
    grand += rowTotal;
    return `<tr><th scope="row">${escapeHtml(statsValueLabel(yDim, y))}</th>${cells.join("")}<td class="stats-total">${rowTotal}</td></tr>`;
  });

  const headCells = xVals.map((x) => `<th scope="col">${escapeHtml(statsValueLabel(xDim, x))}</th>`).join("");
  const totalCells = colTotals.map((n) => `<td class="stats-total">${n}</td>`).join("");

  return `
    <section class="stats-block">
      <div class="stats-axis-controls">
        <label>rows ${renderStatsAxisSelect("y", yDim)}</label>
        <label>columns ${renderStatsAxisSelect("x", xDim)}</label>
      </div>
      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr><th class="stats-corner">${STATS_DIM_LABELS[yDim]} \\ ${STATS_DIM_LABELS[xDim]}</th>${headCells}<th class="stats-total">TOTAL</th></tr>
          </thead>
          <tbody>
            ${bodyRows.join("")}
            <tr class="stats-total-row"><th scope="row">TOTAL</th>${totalCells}<td class="stats-total">${grand}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

// One overview row per umbrella (item 6a). A multi-umbrella record splits into
// rows tagged IMG_xxxx(1), IMG_xxxx(2)…; a single umbrella keeps the plain id.
// count=unknown stays a single row with object/state = "unknown" (item 5).
// `object` reuses statsObjectValue so it matches the cross-tab exactly (category
// colour + kind, never the free-text shade). `stateValues` keeps the canonical
// status flags ("other" stays "other", never the statusOther free text) so the
// single-status filter can match; `stateText` is just those joined for display.
function overviewRowsForItem(item) {
  const dateText = formatDateTime(item.time) || "";
  const base = {
    id: item.id,
    dateText,
    timeValue: getTimeValue(item),
    type: statsValueLabel("type", item.type || ""),
    area: item.location || "",
  };
  const single = (object, stateValues) => ({
    ...base,
    idLabel: item.id,
    object,
    stateValues,
    stateText: stateValues.join(", "),
  });
  if (item.umbrellaCount === "unknown") {
    return [single("unknown", ["unknown"])];
  }
  const raw = Array.isArray(item.umbrellaUnits) ? item.umbrellaUnits : [];
  const n = Number(item.umbrellaCount);
  if (!(Number.isInteger(n) && n >= 1)) {
    return [single(statsObjectValue(raw[0] || {}), normalizeStateValues(raw[0]))];
  }
  const desc = applyUnitInheritance(item.umbrellaCount, raw);
  const first = raw[0] || {};
  return desc.map((u, i) => {
    const rawUnit = raw[i] || {};
    const inheritedBlank = i > 0 && !rawUnit.color && !rawUnit.kind;
    const src = inheritedBlank ? first : rawUnit;
    const stateValues = normalizeStateValues(src);
    return {
      ...base,
      idLabel: n >= 2 ? `${item.id}(${i + 1})` : item.id,
      object: statsObjectValue(u),
      stateValues,
      stateText: stateValues.join(", "),
    };
  });
}

// Canonical status flags of a unit ("other" kept as "other", never expanded to
// the statusOther free text like "in umbrella sleeve" — item 4.7). Empty -> unknown.
function normalizeStateValues(unit) {
  const list = unit && Array.isArray(unit.status) ? unit.status.filter(Boolean) : [];
  return list.length ? list.slice() : ["unknown"];
}

function overviewSortArrow(key) {
  if (state.overviewSortKey !== key) {
    return "";
  }
  return state.overviewSortDir === "asc" ? " ↑" : " ↓";
}

// A clickable header that opens a dropdown of single values to filter by. The
// label shows the current pick (or the plain column name when "all"). The menu is
// only rendered when this column's menu is the open one (state.overviewMenuOpen).
function overviewFilterHead(field, label, values) {
  const current = state.overviewFilters[field];
  const btnLabel = current === "all" ? label : current;
  const open = state.overviewMenuOpen === field;
  const options = ["all", ...values];
  const menu = open
    ? `<div class="overview-filter-menu">${options
        .map(
          (v) =>
            `<button type="button" class="overview-filter-option${v === current ? " is-active" : ""}" data-overview-filter-set="${field}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`,
        )
        .join("")}</div>`
    : "";
  return `<th class="overview-filter-head${open ? " is-open" : ""}">
    <button type="button" class="overview-filter-btn" data-overview-filter-toggle="${field}">${escapeHtml(btnLabel)}<span class="overview-caret" aria-hidden="true">▾</span></button>
    ${menu}
  </th>`;
}

// Flat overview, one row per umbrella (item 6). date / type / area headers sort
// (click to toggle direction); object / state headers open a single-value filter
// dropdown. The IMG cell jumps to that record's map detail on double-click (#7).
function renderStatsOverview() {
  const allRows = state.umbrellas.flatMap(overviewRowsForItem);

  const filters = state.overviewFilters;
  const filtered = allRows.filter(
    (r) =>
      (filters.object === "all" || r.object === filters.object) &&
      (filters.state === "all" || r.stateValues.includes(filters.state)),
  );

  const dir = state.overviewSortDir === "asc" ? 1 : -1;
  const keyFns = {
    date: (a, b) => a.timeValue - b.timeValue,
    type: (a, b) => String(a.type).localeCompare(String(b.type)),
    area: (a, b) => String(a.area).localeCompare(String(b.area)),
    img: (a, b) => String(a.id).localeCompare(String(b.id)),
  };
  const cmp = keyFns[state.overviewSortKey] || keyFns.img;
  filtered.sort((a, b) => {
    // Keep a record's umbrellas adjacent + in natural order; only the key flips.
    const primary = cmp(a, b) || String(a.idLabel).localeCompare(String(b.idLabel));
    return primary * dir;
  });

  const objectValues = [...new Set(allRows.map((r) => r.object))].sort((a, b) => a.localeCompare(b));
  const stateValues = [...new Set(allRows.flatMap((r) => r.stateValues))].sort((a, b) => a.localeCompare(b));

  const rows = filtered
    .map((r) => {
      const idCell = `<td class="overview-id" data-overview-id="${escapeHtml(r.id)}">${escapeHtml(r.idLabel)}</td>`;
      const rest = [r.dateText, r.type, r.area, r.object, r.stateText];
      return `<tr>${idCell}${rest.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`;
    })
    .join("");

  // Show "(x/total)" while a filter is active, just "(total)" otherwise (item 4).
  const isFiltered = filters.object !== "all" || filters.state !== "all";
  const countLabel = isFiltered ? `${filtered.length}/${allRows.length}` : `${allRows.length}`;

  return `
    <section class="stats-block">
      <h3 class="stats-heading">${state.lang === "ja" ? "総覧" : "overview"} (${countLabel})</h3>
      <div class="stats-table-wrap">
        <table class="stats-table stats-overview">
          <thead>
            <tr>
              <th>IMG</th>
              <th class="overview-sort" data-overview-sort="date">date${overviewSortArrow("date")}</th>
              <th class="overview-sort" data-overview-sort="type">type${overviewSortArrow("type")}</th>
              <th class="overview-sort" data-overview-sort="area">area${overviewSortArrow("area")}</th>
              ${overviewFilterHead("object", "object", objectValues)}
              ${overviewFilterHead("state", "state", stateValues)}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderArchive() {
  if (!els.archiveContent) {
    return;
  }

  // The Archive page is independent of the map sidebar search (state.query): it
  // has its own chips/sub-filters. Always start from the full record set so a
  // search typed in the map panel never trims the Archive grid.
  const items = state.umbrellas;

  syncArchiveControls();
  renderArchiveSecondary(items);

  if (state.archiveMode === "stats") {
    renderStats(items);
    return;
  }

  const visibleItems = filterArchiveItems(items);
  const sorted = sortArchiveItems(visibleItems);

  if (state.archiveMode === "default" || state.archiveMode === "type") {
    // #6: when a specific type is selected, show its explanatory text above the
    // grid — one <p> per source paragraph; Japanese is justified, English isn't.
    let typeDescHtml = "";
    if (state.archiveMode === "type" && state.archiveSubfilter !== "all") {
      const desc = TEXTS.typeDescriptions[state.archiveSubfilter];
      const paras = desc ? desc[state.lang] || desc.ja || desc.en || [] : [];
      if (paras.length) {
        const justifyClass = state.lang === "ja" ? " is-justify" : "";
        typeDescHtml = `<div class="archive-type-desc${justifyClass}">${paras
          .map((p) => `<p>${escapeHtml(p)}</p>`)
          .join("")}</div>`;
      }
    }
    els.archiveContent.innerHTML = `
      ${typeDescHtml}
      <div class="photo-grid">
        ${sorted.map((item) => renderPhotoCard(item)).join("")}
      </div>
    `;
    return;
  }

  const groups = state.archiveMode === "place" ? groupByPlace(sorted) : groupByMonth(sorted);
  els.archiveContent.innerHTML = groups.map((group) => renderArchiveGroup(group)).join("");

  els.archiveContent.querySelectorAll("[data-group-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.groupToggle;
      if (state.archiveCollapsedGroups.has(key)) {
        state.archiveCollapsedGroups.delete(key);
      } else {
        state.archiveCollapsedGroups.add(key);
      }
      renderArchive();
    });
  });
}

function renderArchiveSecondary(items) {
  if (!els.archiveSecondary) {
    return;
  }

  if (state.archiveMode !== "type" && state.archiveMode !== "place") {
    els.archiveSecondary.hidden = true;
    els.archiveSecondary.innerHTML = "";
    return;
  }

  const field = state.archiveMode === "type" ? "type" : "prefecture";
  const counts = countByField(items, field);
  const options = [
    { key: "all", label: `all (${items.length})` },
    ...Array.from(counts.entries()).map(([key, count]) => ({ key, label: `${key} (${count})` })),
  ];

  els.archiveSecondary.hidden = false;
  els.archiveSecondary.innerHTML = options
    .map(
      (option) => `
        <button class="archive-subcontrol ${option.key === state.archiveSubfilter ? "is-active" : ""}" data-archive-subfilter="${option.key}" type="button">
          ${option.label}
        </button>
      `,
    )
    .join("");
}

function filterArchiveItems(items) {
  if ((state.archiveMode !== "type" && state.archiveMode !== "place") || state.archiveSubfilter === "all") {
    return items;
  }

  const field = state.archiveMode === "type" ? "type" : "prefecture";
  return items.filter((item) => item[field] === state.archiveSubfilter);
}

function sortArchiveItems(items) {
  if (state.archiveMode === "time") {
    return sortByTime(items, state.archiveOrder);
  }

  if (state.archiveMode === "type") {
    return sortByCount(items, "type");
  }

  if (state.archiveMode === "place") {
    return sortByCount(items, "prefecture");
  }

  return [...items];
}

function sortByCount(items, field) {
  const counts = countByField(items, field);
  return [...items].sort((a, b) => {
    const countDelta = counts.get(b[field]) - counts.get(a[field]);
    if (countDelta !== 0) {
      return countDelta;
    }
    return String(a[field]).localeCompare(String(b[field]));
  });
}

function countByField(items, field) {
  const counts = new Map();
  items.forEach((item) => counts.set(item[field], (counts.get(item[field]) ?? 0) + 1));
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function renderArchiveGroup(group) {
  const collapsed = state.archiveCollapsedGroups.has(group.key);
  return `
    <section class="archive-group ${collapsed ? "is-collapsed" : ""}" data-group-key="${group.key}">
      <div class="archive-group-header">
        <div>
          <h3>${group.label}</h3>
          <p>${group.items.length} item</p>
        </div>
        <button class="archive-group-toggle" type="button" data-group-toggle="${group.key}" aria-label="${collapsed ? "expand" : "collapse"}">
          <span aria-hidden="true">${collapsed ? "\u25be" : "\u2014"}</span>
        </button>
      </div>
      <div class="archive-group-body">
        ${group.children ? group.children.map((child) => renderArchiveGroup(child)).join("") : `<div class="photo-grid">${group.items.map((item) => renderPhotoCard(item)).join("")}</div>`}
      </div>
    </section>
  `;
}

// Small inline logos shown on the corner of an archive card.
const CARD_ICON_MULTI =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="14" height="14" rx="2.5"/><rect x="3" y="7" width="14" height="14" rx="2.5"/></svg>';
const CARD_ICON_ILLUSTRATION =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M14.5 5.5l4 4"/></svg>';

// Archive card: just the photo + id(+title) and corner logos. No address/time/
// status/colour text (that lives on the detail page now).
function renderPhotoCard(item) {
  const media = item.media || [];
  const extraPhotos = media.filter((m) => m.role === "supplement" || m.role === "detail").length;
  const hasIllustration = media.some((m) => m.role === "illustration");

  const badges = [];
  if (extraPhotos > 0) {
    badges.push(`<span class="card-badge" title="多图">${CARD_ICON_MULTI}</span>`);
  }
  if (hasIllustration) {
    badges.push(`<span class="card-badge" title="插图">${CARD_ICON_ILLUSTRATION}</span>`);
  }

  const cardTitle = localize(item.title);
  const titleHtml = cardTitle ? `<span class="card-title">${escapeHtml(cardTitle)}</span>` : "";

  return `
    <article class="photo-card" data-id="${escapeHtml(item.id)}">
      <div class="card-photo">
        <img src="${item.thumb}" alt="${escapeHtml(item.id)}" loading="lazy" decoding="async" />
        ${badges.length ? `<div class="card-badges">${badges.join("")}</div>` : ""}
        <button type="button" class="card-edit" data-card-edit aria-label="编辑此记录" title="编辑此记录">✎</button>
      </div>
      <div class="card-bar">
        <span class="card-id">${escapeHtml(item.id)}</span>
        ${titleHtml}
      </div>
    </article>
  `;
}

function renderItemText(item, context) {
  const isArchiveCard = context === "card";
  const locationLine = formatDetailLine(item.location, formatDateTime(item.time));
  const details = [
    item.title,
    locationLine || formatDateTime(item.time),
    item.material,
    item.statusText,
    item.story,
  ].filter(Boolean);
  const title = item.id;
  const storyClass = context === "focus" ? "item-story" : "item-story is-compact";

  return [
    `<h3>${escapeHtml(title)}</h3>`,
    ...details.map((detail, index) => {
      const className = index === details.length - 1 && detail === item.story ? storyClass : "item-detail";
      return `<p class="${className}">${escapeHtml(detail)}</p>`;
    }),
  ].join("");
}

function formatDetailLine(...parts) {
  return parts.filter(Boolean).join(" / ");
}

function formatListMeta(item) {
  return formatDetailLine(item.location, formatListDate(item.time)) || "time / location text needed";
}

function hasCoordinates(item) {
  return Number.isFinite(Number(item.coordinates?.lat)) && Number.isFinite(Number(item.coordinates?.lng));
}

function formatCategoryType(item) {
  if (item.category && item.categoryGroup) {
    return `${item.category}(${item.categoryGroup})`;
  }

  return item.category || item.categoryGroup || item.type || "";
}

function formatInformationType(item) {
  if (item.umbrellaType) {
    return item.umbrellaType;
  }
  // Show the actual folder name, e.g. "transit(place)".
  const category = item.category || "";
  if (category && item.categoryGroup) {
    return `${category}(${item.categoryGroup})`;
  }

  return category || item.categoryGroup || item.type || "";
}

function normalizeLocationLevels(levels) {
  return Array.isArray(levels)
    ? levels.map((level) => String(level || "").trim()).filter(Boolean).slice(0, 3)
    : [];
}

function formatLocationLevels(levels) {
  return normalizeLocationLevels(levels).join(", ");
}

// Expand the per-umbrella units to match the count, applying the rule
// "if only row 1 is filled, the other rows copy row 1".
function applyUnitInheritance(count, units) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1) {
    return [];
  }
  const base = Array.isArray(units) ? units : [];
  const first = base[0] || { color: "", colorDetail: "", kind: "" };
  const result = [];
  for (let i = 0; i < n; i += 1) {
    const unit = base[i] || {};
    const isEmpty = !unit.color && !unit.kind;
    result.push(
      isEmpty && i > 0
        ? { color: first.color || "", colorDetail: first.colorDetail || "", kind: first.kind || "" }
        : { color: unit.color || "", colorDetail: unit.colorDetail || "", kind: unit.kind || "" },
    );
  }
  return result;
}

// One umbrella's wording, e.g. "blue long umbrella".
function describeUnit(unit) {
  let colorWord = "";
  if (COLOR_NEEDS_DETAIL.has(unit.color)) {
    colorWord = String(unit.colorDetail || "").trim() || unit.color;
  } else if (unit.color === "transparent" || unit.color === "translucent") {
    colorWord = unit.color;
  }
  return [colorWord, unit.kind || ""].filter(Boolean).join(" ").trim();
}

// The final "object" text combining count + units, e.g. "two blue long umbrella".
function buildObjectText(count, units) {
  if (count === "unknown") {
    return "";
  }
  return buildObjectGroups(count, units).join(", ");
}

// Each distinct umbrella description as its own line (for the detail page).
// Identical ones are grouped with a count word (2+); "one" is never shown.
function buildObjectGroups(count, units) {
  if (count === "unknown") {
    return [];
  }
  const list = applyUnitInheritance(count, units);
  if (!list.length) {
    return [];
  }
  const words = list.map(describeUnit).filter(Boolean);
  if (!words.length) {
    return [];
  }
  const groups = [];
  words.forEach((word) => {
    const existing = groups.find((group) => group.word === word);
    if (existing) {
      existing.count += 1;
    } else {
      groups.push({ word, count: 1 });
    }
  });
  return groups.map((group) => {
    const num = group.count >= 2 ? COUNT_WORDS[group.count] || String(group.count) : "";
    return [num, group.word].filter(Boolean).join(" ");
  });
}

// One line per umbrella that has a status (its statuses joined). Identical
// lines collapse into one (so "all the same" shows a single line).
function statusLinesFromUnits(units) {
  const lines = (Array.isArray(units) ? units : [])
    .map((unit) => {
      const list = Array.isArray(unit.status) ? unit.status : [];
      return list
        .map((value) => (value === "other" ? String(unit.statusOther || "").trim() || "other" : value))
        .filter(Boolean)
        .join(", ");
    })
    .filter(Boolean);
  return [...new Set(lines)];
}

// Aggregate the distinct statuses across all umbrellas for the display line.
function statusTextFromUnits(units) {
  const all = [];
  (Array.isArray(units) ? units : []).forEach((unit) => {
    (Array.isArray(unit.status) ? unit.status : []).forEach((value) => {
      const text = value === "other" ? String(unit.statusOther || "").trim() || "other" : value;
      if (text && !all.includes(text)) {
        all.push(text);
      }
    });
  });
  return all.join(", ");
}

function getTimeValue(item) {
  const value = new Date(item.time).getTime();
  return Number.isFinite(value) ? value : -Infinity;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sortByTime(items, order) {
  return [...items].sort((a, b) => {
    const delta = getTimeValue(a) - getTimeValue(b);
    return order === "asc" ? delta : -delta;
  });
}

function groupByMonth(items) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  });
  const groups = new Map();

  items.forEach((item) => {
    const date = new Date(item.time);
    const hasTime = Number.isFinite(date.getTime());
    const key = hasTime ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "no-time";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: hasTime ? formatter.format(date) : "time needed",
        items: [],
      });
    }
    groups.get(key).items.push(item);
  });

  return Array.from(groups.values());
}

// Group by the address hierarchy: prefecture (level 0) → city (1) → ward (2),
// nesting one level deeper only where records actually have that level.
function groupByPlace(items) {
  function buildLevel(list, depth) {
    const groups = new Map();
    list.forEach((item) => {
      const levels = Array.isArray(item.locationLevels) ? item.locationLevels : [];
      const label = levels[depth] || (depth === 0 ? "Unknown" : "");
      const key = `lvl${depth}-${label || "unknown"}`;
      if (!groups.has(key)) {
        groups.set(key, { key, label: label || "Unknown", items: [] });
      }
      groups.get(key).items.push(item);
    });
    const ordered = Array.from(groups.values()).sort(
      (a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label),
    );
    return ordered.map((group) => {
      const hasDeeper = group.items.some(
        (item) => (Array.isArray(item.locationLevels) ? item.locationLevels.length : 0) > depth + 1,
      );
      return hasDeeper ? { ...group, children: buildLevel(group.items, depth + 1) } : group;
    });
  }
  return buildLevel(items, 0);
}

// Switch the top tabs over to the map view (used when jumping from Archive).
function switchToMapView() {
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === "map"));
  els.views.forEach((section) => section.classList.toggle("is-active", section.id === "map-view"));
  if (state.googleReady) {
    setTimeout(() => google.maps.event.trigger(state.map, "resize"), 80);
  }
}

// Jump from an Archive card to that point on the map and open its detail view.
function jumpToMapLocation(id) {
  const item = state.umbrellas.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  switchToMapView();
  if (hasCoordinates(item)) {
    setTimeout(() => selectUmbrella(id, { focus: true }), 90);
  }
}

function selectUmbrella(id, options = {}) {
  if (state.editMode) {
    openEditor(id);
    return;
  }
  state.selectedId = id;
  state.focusMediaIndex = 0;

  if (options.focus) {
    state.focusMarkerId = id;
    state.suppressNextFit = true;
    collapseListPanel();
  }

  render();

  if (state.googleReady) {
    const item = state.umbrellas.find((entry) => entry.id === id);
    if (item) {
      if (options.focus) {
        focusUmbrellaOnMap(item, id);
      } else if (hasCoordinates(item)) {
        state.focusPositionedId = null;
        closeFocusMode();
        state.map.panTo(item.coordinates);
        state.map.setZoom(Math.max(state.map.getZoom(), 15));
      }
    }
  }

  if (options.focus) {
    openFocusMode();
  }
}

function focusUmbrellaOnMap(item, id) {
  setFocusMaskPosition();
  // Always re-centre: clicking the focused marker again after the map has been
  // panned/zoomed should bring the marker back to the clear circle (#5).
  state.focusPositionedId = id;
  animateMarkerToFocus(item);
}

function openFocusMode() {
  setFocusBlurSuppressed(false);
  els.mapView.classList.add("is-focus-mode");
  els.focusPanel?.setAttribute("aria-hidden", "false");
  setFocusMaskPosition();
}

function closeFocusMode(options = {}) {
  if (state.cameraAnimationFrame) {
    cancelAnimationFrame(state.cameraAnimationFrame);
    state.cameraAnimationFrame = null;
  }
  state.isFocusCameraAnimating = false;

  const item = state.umbrellas.find((entry) => entry.id === state.focusMarkerId || entry.id === state.selectedId);
  if (options.resetZoom && state.googleReady && item && hasCoordinates(item)) {
    zoomToDefaultAroundMarker(item);
  }

  state.focusPositionedId = null;
  state.focusMarkerId = null;
  setFocusBlurSuppressed(false);
  closeExpandedImage();
  updateMarkerIcons();
  els.mapView.classList.remove("is-focus-mode");
  els.focusPanel?.setAttribute("aria-hidden", "true");
  els.focusPanel?.classList.remove("is-loading");
}

// Media that can be enlarged: cover + supplement + detail, but never illustrations.
function getExpandableMedia(item) {
  return (item?.media || []).filter((m) => m.role !== "illustration");
}

// Entry point from clicking the cover image — expand at the cover's position.
function openExpandedImage() {
  const list = state.focusMediaList || [];
  const coverIndex = Math.max(0, list.findIndex((m) => m.role === "primary"));
  expandImageAt(coverIndex);
}

// Enlarge the n-th expandable image; bring the marker back to the clear circle
// and re-blur the surroundings (#14); show the side thumbnail rail (#13).
function expandImageAt(index) {
  const list = state.focusMediaList || [];
  if (!els.focusPanel || !els.focusImage || !list.length) {
    return;
  }
  state.expandedIndex = Math.min(Math.max(index, 0), list.length - 1);
  state.imageExpanded = true;
  els.focusPanel.classList.add("is-expanded");
  els.mapView.classList.add("is-image-expanded");
  // Also on <body> so the top nav (which lives outside .workspace) can be
  // hidden/disabled while enlarged (#4).
  document.body.classList.add("is-image-expanded");
  preloadExpandableImages();
  loadExpandedImage();
  renderFocusThumbs();
  recenterFocusedMarker();
}

// Preload every enlargeable photo so switching between them is instant (#2b).
function preloadExpandableImages() {
  (state.focusMediaList || []).forEach((m) => {
    if (m.src) {
      const img = new Image();
      img.src = m.src;
    }
  });
}

// Jump to a given index: swap the photo, move the active marker on the rail and
// refresh the corner caption — without rebuilding the whole thumbnail rail (#2b).
function showExpandedImageAt(index) {
  const list = state.focusMediaList || [];
  if (!list.length) {
    return;
  }
  state.expandedIndex = ((index % list.length) + list.length) % list.length;
  // Tell setExpandedImageFrame to smoothly morph the box to the new photo's size
  // (FLIP) — this is a switch, not the initial expand or a window resize (#1).
  state.flipResize = true;
  loadExpandedImage();
  setActiveThumb(state.expandedIndex);
}

// Step to the previous/next photo (used by the blank-area swipe), wrapping round.
function switchExpandedImage(delta) {
  showExpandedImageAt(state.expandedIndex + delta);
}

// Swap the enlarged image to the current expandedIndex (used on open + switch).
function loadExpandedImage() {
  const media = (state.focusMediaList || [])[state.expandedIndex];
  if (!media || !els.focusImage) {
    return;
  }
  state.imageZoom = 1;
  state.imagePanX = 0;
  state.imagePanY = 0;
  els.focusImage.src = media.src;
  updateExpandedCaption(media);
  // If the image is already cached the "load" listener won't fire, so size now.
  if (els.focusImage.complete && els.focusImage.naturalWidth > 0) {
    setExpandedImageFrame();
    updateExpandedImageTransform();
  }
}

// The time shown for a photo: its own EXIF time, or — for the cover, when the
// image carries no EXIF — the record's manual/display time (#3).
function mediaDisplayTime(media) {
  if (media.photoTime) {
    return media.photoTime;
  }
  if (media.role === "primary") {
    const item = state.umbrellas.find((entry) => entry.id === state.selectedId);
    return item?.time || "";
  }
  return "";
}

// Corner caption on the enlarged photo: "title, id, time" — same content/style
// as a detail-page photo caption; shown for every photo incl. the cover (#3).
function updateExpandedCaption(media) {
  if (!els.focusExpandedCaption) {
    return;
  }
  const text = [media.title, media.id, formatDateTime(mediaDisplayTime(media))].filter(Boolean).join(", ");
  els.focusExpandedCaption.textContent = text;
  els.focusExpandedCaption.hidden = !text;
}

// Vertical thumbnail rail on the right; one per expandable image, active marked.
function renderFocusThumbs() {
  if (!els.focusThumbs) {
    return;
  }
  const list = state.focusMediaList || [];
  if (!state.imageExpanded || list.length <= 1) {
    els.focusThumbs.hidden = true;
    els.focusThumbs.innerHTML = "";
    return;
  }
  els.focusThumbs.hidden = false;
  els.focusThumbs.innerHTML = list
    .map(
      (m, i) => `
        <button type="button" class="focus-thumb ${i === state.expandedIndex ? "is-active" : ""}" data-thumb-index="${i}" aria-label="image ${i + 1}">
          <img src="${escapeHtml(m.thumb || m.src)}" alt="" loading="lazy" decoding="async" />
        </button>`,
    )
    .join("");
  positionFocusThumbs();
}

// Park the thumbnail rail just to the right of the (centered) enlarged image,
// reading the frame's real right edge so it survives any max-width clamping (#2a).
function positionFocusThumbs() {
  if (!els.focusThumbs || els.focusThumbs.hidden) {
    return;
  }
  if (window.matchMedia("(max-width: 820px)").matches) {
    // On narrow screens the CSS pins it to the screen edge — don't override.
    els.focusThumbs.style.left = "";
    return;
  }
  // The enlarged image is centered in the viewport, so its final right edge is
  // halfway across plus half the target frame width. We use the *target* width
  // (not the live rect) because the frame animates its width over 260ms when you
  // switch between differently-sized photos — reading the mid-animation rect was
  // what left the rail offset from the image (#1). The rail has a matching CSS
  // `left` transition so it glides to the same spot.
  let right;
  if (state.imageFrameWidth > 0) {
    right = window.innerWidth / 2 + state.imageFrameWidth / 2;
  } else {
    const frame = els.focusPanel?.querySelector(".focus-image-frame");
    if (!frame) {
      return;
    }
    right = frame.getBoundingClientRect().right;
  }
  els.focusThumbs.style.left = `${Math.round(right + 14)}px`;
}

// Move the "active" highlight on the rail without rebuilding it (#2b).
function setActiveThumb(index) {
  els.focusThumbs?.querySelectorAll(".focus-thumb").forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.thumbIndex) === index);
  });
}

// Blank-area swipe to switch photos (#2c). A short/near-still gesture is left to
// the click handler (which closes); a clear horizontal drag switches instead.
function startBlurSwipe(event) {
  if (!state.imageExpanded) {
    return;
  }
  state.blurSwipeStart = { x: event.clientX, y: event.clientY };
}

function endBlurSwipe(event) {
  const start = state.blurSwipeStart;
  state.blurSwipeStart = null;
  if (!start || !state.imageExpanded) {
    return;
  }
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
    state.blurSwiped = true; // suppress the close-on-click that follows
    switchExpandedImage(dx < 0 ? 1 : -1);
  }
}

// Bring the focused marker back to the clear circle and restore the blur (#14).
// Only animates if the marker has actually drifted off-centre, so expanding an
// image whose marker is already centred doesn't cause a tiny camera jitter.
function recenterFocusedMarker() {
  const id = state.focusMarkerId || state.selectedId;
  const item = state.umbrellas.find((entry) => entry.id === id);
  if (!item || !state.googleReady || !hasCoordinates(item)) {
    return;
  }
  setFocusBlurSuppressed(false);
  setFocusMaskPosition();

  const markerLatLng = new google.maps.LatLng(item.coordinates.lat, item.coordinates.lng);
  const markerScreen = getMarkerButtonScreenPoint(item) ?? getLatLngScreenPoint(markerLatLng);
  const target = getFocusTargetScreenPoint();
  const drift = Math.hypot(markerScreen.x - target.x, markerScreen.y - target.y);
  if (drift > 24) {
    animateMarkerToFocus(item);
  }
}

function closeExpandedImage() {
  const wasExpanded = state.imageExpanded;
  const viewedMedia = (state.focusMediaList || [])[state.expandedIndex];
  state.imageExpanded = false;
  state.imageZoom = 1;
  state.imagePanX = 0;
  state.imagePanY = 0;
  state.imageFrameWidth = 0;
  state.imageFrameHeight = 0;
  state.imageDragStart = null;
  state.flipResize = false;
  els.focusPanel?.classList.remove("is-expanded");
  els.mapView?.classList.remove("is-image-expanded");
  document.body.classList.remove("is-image-expanded");
  // Drop any in-flight FLIP transform/transition so the panel returns cleanly.
  if (els.focusPanel) {
    els.focusPanel.style.transition = "";
    els.focusPanel.style.transform = "";
  }
  els.focusImage?.style.setProperty("--image-zoom", "1");
  els.focusImage?.style.setProperty("--image-pan-x", "0px");
  els.focusImage?.style.setProperty("--image-pan-y", "0px");
  els.focusPanel?.style.removeProperty("--expanded-frame-width");
  els.focusPanel?.style.removeProperty("--expanded-frame-height");
  els.focusImage?.style.setProperty("--image-origin-x", "50%");
  els.focusImage?.style.setProperty("--image-origin-y", "50%");
  state.blurSwipeStart = null;
  if (els.focusThumbs) {
    els.focusThumbs.hidden = true;
    els.focusThumbs.innerHTML = "";
  }
  if (els.focusExpandedCaption) {
    els.focusExpandedCaption.hidden = true;
    els.focusExpandedCaption.textContent = "";
  }
  // Put the detail page's main image back to the cover (the lightbox swapped it).
  const item = state.umbrellas.find((entry) => entry.id === state.selectedId);
  const cover = (item?.media || []).find((m) => m.role === "primary") || item?.media?.[0];
  if (cover && els.focusImage && !els.focusImage.src.endsWith(cover.src)) {
    els.focusImage.src = cover.src || item.image;
  }
  // ...then scroll the detail page to the photo you were just viewing, so you land
  // where you left off rather than being yanked back to the top (#2).
  if (wasExpanded && viewedMedia) {
    scrollDetailToMedia(viewedMedia);
  }
}

// Scroll the detail article to a given photo. The cover sits at the very top;
// every other photo is a <figure> in the article keyed by its file name. We
// compute the target offset and scroll the panel explicitly (scrollIntoView's
// ancestor-walk proved unreliable right after the lightbox collapses).
function scrollDetailToMedia(media) {
  const scroll = document.querySelector("#focus-scroll");
  if (!media || !scroll) {
    return;
  }
  if (media.role === "primary") {
    scroll.scrollTo({ top: 0 });
    return;
  }
  const fig = els.focusCaption?.querySelector(`img[data-media-file="${media.file}"]`)?.closest(".focus-photo");
  if (!fig) {
    return;
  }
  const figRect = fig.getBoundingClientRect();
  const scRect = scroll.getBoundingClientRect();
  // Centre the figure in the visible part of the panel. Instant (not smooth) so
  // it isn't cancelled by the cover image re-loading and reflowing the article.
  const delta = figRect.top - scRect.top - (scroll.clientHeight - figRect.height) / 2;
  scroll.scrollTo({ top: Math.max(0, scroll.scrollTop + delta) });
}

function handleExpandedImageWheel(event) {
  if (!state.imageExpanded || !els.focusImage) {
    return;
  }

  event.preventDefault();
  const delta = event.deltaY < 0 ? 0.14 : -0.14;
  state.imageZoom = Math.min(4, Math.max(1, state.imageZoom + delta));
  clampExpandedImagePan();
  updateExpandedImageTransform();
}

function setExpandedImageFrame() {
  if (!els.focusPanel || !els.focusImage) {
    return;
  }

  const naturalWidth = els.focusImage.naturalWidth || els.focusImage.width || 1;
  const naturalHeight = els.focusImage.naturalHeight || els.focusImage.height || 1;
  const ratio = naturalWidth / naturalHeight;
  const maxWidth = window.innerWidth * (window.matchMedia("(max-width: 820px)").matches ? 0.86 : 0.8);
  const maxHeight = window.innerHeight * (window.matchMedia("(max-width: 820px)").matches ? 0.86 : 0.9);
  let width = maxHeight * ratio;
  let height = maxHeight;

  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }

  // FLIP: remember the current (old) box, apply the new size, then animate the
  // box back from old→new using transform scale — composited, so no reflow jank.
  const animate = state.flipResize;
  state.flipResize = false;
  const first = animate ? els.focusPanel.getBoundingClientRect() : null;

  state.imageFrameWidth = Math.round(width);
  state.imageFrameHeight = Math.round(height);
  els.focusPanel.style.setProperty("--expanded-frame-width", `${state.imageFrameWidth}px`);
  els.focusPanel.style.setProperty("--expanded-frame-height", `${state.imageFrameHeight}px`);
  positionFocusThumbs();
  els.focusImage.style.setProperty("--image-origin-x", "50%");
  els.focusImage.style.setProperty("--image-origin-y", "50%");

  if (animate && first) {
    flipExpandedPanel(first);
  }
}

// The "play" half of the FLIP: invert to the old size, then transition to identity.
function flipExpandedPanel(first) {
  const panel = els.focusPanel;
  const last = panel.getBoundingClientRect();
  if (!last.width || !last.height) {
    return;
  }
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
    return; // same size — nothing to morph
  }
  panel.style.transition = "none";
  panel.style.transform = `translate(-50%, -50%) scale(${sx}, ${sy})`;
  panel.getBoundingClientRect(); // commit the inverted state
  panel.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
  panel.style.transform = "translate(-50%, -50%) scale(1, 1)";
  const clear = () => {
    panel.style.transition = "";
    panel.style.transform = "";
    panel.removeEventListener("transitionend", clear);
  };
  panel.addEventListener("transitionend", clear);
}

function updateExpandedImageTransform() {
  clampExpandedImagePan();
  els.focusImage?.style.setProperty("--image-zoom", String(state.imageZoom));
  els.focusImage?.style.setProperty("--image-pan-x", `${state.imagePanX}px`);
  els.focusImage?.style.setProperty("--image-pan-y", `${state.imagePanY}px`);
}

function clampExpandedImagePan() {
  const maxX = Math.max(0, (state.imageFrameWidth * state.imageZoom - state.imageFrameWidth) / 2);
  const maxY = Math.max(0, (state.imageFrameHeight * state.imageZoom - state.imageFrameHeight) / 2);
  state.imagePanX = Math.min(maxX, Math.max(-maxX, state.imagePanX));
  state.imagePanY = Math.min(maxY, Math.max(-maxY, state.imagePanY));
}

function startExpandedImageDrag(event) {
  if (!state.imageExpanded) {
    return;
  }

  event.preventDefault();
  els.focusImage?.setPointerCapture?.(event.pointerId);
  state.imageDragStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    panX: state.imagePanX,
    panY: state.imagePanY,
  };
}

function dragExpandedImage(event) {
  if (!state.imageDragStart || state.imageDragStart.pointerId !== event.pointerId) {
    return;
  }

  state.imagePanX = state.imageDragStart.panX + event.clientX - state.imageDragStart.x;
  state.imagePanY = state.imageDragStart.panY + event.clientY - state.imageDragStart.y;
  updateExpandedImageTransform();
}

function stopExpandedImageDrag(event) {
  if (state.imageDragStart?.pointerId === event.pointerId) {
    state.imageDragStart = null;
  }
}

function dismissFocusAfterUserMapInteraction() {
  if (!els.mapView.classList.contains("is-focus-mode") || state.isFocusCameraAnimating) {
    return;
  }

  setFocusBlurSuppressed(true);
}

function zoomToDefaultAroundMarker(item) {
  const markerLatLng = new google.maps.LatLng(item.coordinates.lat, item.coordinates.lng);
  const markerScreen = getMarkerButtonScreenPoint(item) ?? getLatLngScreenPoint(markerLatLng);
  const startZoom = state.map.getZoom();
  const startTime = performance.now();

  state.isFocusCameraAnimating = true;

  const step = (now) => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / RESET_ZOOM_ANIMATION_MS, 1);
    const eased = easeInOutCubic(t);
    const zoom = lerp(startZoom, DEFAULT_MAP_ZOOM, eased);
    const center = getCenterForMarkerScreenPoint(markerLatLng, zoom, markerScreen);

    setMapCamera(center, zoom);

    if (t < 1) {
      state.cameraAnimationFrame = requestAnimationFrame(step);
    } else {
      state.cameraAnimationFrame = null;
      setMapCamera(getCenterForMarkerScreenPoint(markerLatLng, DEFAULT_MAP_ZOOM, markerScreen), DEFAULT_MAP_ZOOM);
      window.setTimeout(() => {
        state.isFocusCameraAnimating = false;
      }, 80);
    }
  };

  state.cameraAnimationFrame = requestAnimationFrame(step);
}

function setFocusMaskPosition() {
  const target = getFocusTargetScreenPoint();
  els.focusBlur?.style.setProperty("--focus-x", `${target.x}px`);
  els.focusBlur?.style.setProperty("--focus-y", `${target.y}px`);
}

function animateMarkerToFocus(item) {
  if (!hasCoordinates(item)) {
    return;
  }

  const projection = getWorldProjection();
  if (!projection || !state.map.getCenter()) {
    state.map.panTo(item.coordinates);
    state.map.setZoom(Math.max(state.map.getZoom(), FOCUS_MAP_ZOOM));
    return;
  }

  if (state.cameraAnimationFrame) {
    cancelAnimationFrame(state.cameraAnimationFrame);
    state.cameraAnimationFrame = null;
  }

  const markerLatLng = new google.maps.LatLng(item.coordinates.lat, item.coordinates.lng);
  const startZoom = state.map.getZoom();
  const endZoom = Math.max(startZoom, FOCUS_MAP_ZOOM);
  const startScreen = getMarkerButtonScreenPoint(item) ?? getLatLngScreenPoint(markerLatLng, startZoom);
  const endScreen = getFocusTargetScreenPoint();
  const startTime = performance.now();

  const step = (now) => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / FOCUS_ANIMATION_MS, 1);
    const eased = easeInOutCubic(t);
    const zoom = lerp(startZoom, endZoom, eased);
    const markerScreen = {
      x: lerp(startScreen.x, endScreen.x, eased),
      y: lerp(startScreen.y, endScreen.y, eased),
    };
    const center = getCenterForMarkerScreenPoint(markerLatLng, zoom, markerScreen);

    setMapCamera(center, zoom);

    if (t < 1) {
      state.cameraAnimationFrame = requestAnimationFrame(step);
    } else {
      state.cameraAnimationFrame = null;
      setMapCamera(getCenterForMarkerScreenPoint(markerLatLng, endZoom, endScreen), endZoom);
      setFocusMaskPosition();
      window.setTimeout(() => {
        state.isFocusCameraAnimating = false;
      }, 80);
    }
  };

  state.isFocusCameraAnimating = true;
  state.cameraAnimationFrame = requestAnimationFrame(step);
}

function getMarkerButtonScreenPoint(item) {
  if (!item?.id) {
    return null;
  }

  const escapedTitle = window.CSS?.escape ? CSS.escape(item.id) : item.id.replace(/"/g, '\\"');
  const markerElement = els.mapCanvas.querySelector(`[title="${escapedTitle}"]`);
  const markerRect = markerElement?.getBoundingClientRect();
  const mapRect = els.mapCanvas.getBoundingClientRect();

  if (!markerRect || markerRect.width === 0 || markerRect.height === 0) {
    return null;
  }

  return {
    x: markerRect.left - mapRect.left + markerRect.width / 2,
    y: markerRect.top - mapRect.top + markerRect.height / 2,
  };
}

function setMapCamera(center, zoom) {
  if (state.map.moveCamera) {
    state.map.moveCamera({ center, zoom });
    return;
  }

  state.map.setCenter(center);
  state.map.setZoom(zoom);
}

function getLatLngScreenPoint(latLng, zoom = state.map.getZoom()) {
  const projection = getWorldProjection();
  const scale = 2 ** zoom;
  const markerPoint = projection.fromLatLngToPoint(latLng);
  const centerPoint = projection.fromLatLngToPoint(state.map.getCenter());
  const mapRect = els.mapCanvas.getBoundingClientRect();

  return {
    x: (markerPoint.x - centerPoint.x) * scale + mapRect.width / 2,
    y: (markerPoint.y - centerPoint.y) * scale + mapRect.height / 2 - MARKER_VISUAL_CENTER_OFFSET_Y,
  };
}

function getCenterForMarkerScreenPoint(latLng, zoom, markerScreen) {
  const projection = getWorldProjection();
  const scale = 2 ** zoom;
  const markerPoint = projection.fromLatLngToPoint(latLng);
  const mapRect = els.mapCanvas.getBoundingClientRect();
  const centerPoint = new google.maps.Point(
    markerPoint.x - (markerScreen.x - mapRect.width / 2) / scale,
    markerPoint.y - (markerScreen.y + MARKER_VISUAL_CENTER_OFFSET_Y - mapRect.height / 2) / scale,
  );

  return projection.fromPointToLatLng(centerPoint);
}

function getWorldProjection() {
  return state.map?.getProjection?.();
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function setFocusBlurSuppressed(isSuppressed) {
  els.mapView?.classList.toggle("is-focus-map-active", isSuppressed);
}

function getFocusTargetScreenPoint() {
  const isMobile = window.matchMedia("(max-width: 820px)").matches;
  return {
    x: Math.round(window.innerWidth * (isMobile ? FOCUS_MARKER_SCREEN.xMobile : FOCUS_MARKER_SCREEN.xDesktop)),
    y: Math.round(window.innerHeight * (isMobile ? FOCUS_MARKER_SCREEN.yMobile : FOCUS_MARKER_SCREEN.yDesktop)),
  };
}

function fitMapToItems(items) {
  const itemsWithCoordinates = items.filter(hasCoordinates);
  if (!state.googleReady || itemsWithCoordinates.length === 0) {
    return;
  }

  if (itemsWithCoordinates.length === 1) {
    state.map.setCenter(itemsWithCoordinates[0].coordinates);
    state.map.setZoom(15);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  itemsWithCoordinates.forEach((item) => bounds.extend(item.coordinates));
  state.map.fitBounds(bounds, 72);
}

// Edit-mode marker flags (a colour to help find points that need work).
const FLAG_COLORS = { yellow: "#f2c200", black: "#1a1a1a", white: "#ffffff" };

function flagColorFor(item) {
  return state.editMode && item && FLAG_COLORS[item.editFlag] ? FLAG_COLORS[item.editFlag] : null;
}

function updateMarkerIcons() {
  state.markers.forEach((marker, id) => {
    const item = state.umbrellas.find((entry) => entry.id === id);
    marker.setIcon(markerIcon(id === state.focusMarkerId, flagColorFor(item)));
  });
}

function markerIcon(isActive, flagColor) {
  return {
    path: "M12 2C7.03 2 3 6.03 3 11c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9Z",
    fillColor: flagColor || (isActive ? "#1f8bb8" : "#c54f35"),
    fillOpacity: 1,
    strokeColor: flagColor === "#ffffff" ? "#1a1a1a" : "#ffffff",
    strokeOpacity: 1,
    strokeWeight: 2.1,
    scale: 1.55,
    anchor: new google.maps.Point(12, 26),
  };
}

function hoverMarkerIcon(isActive, flagColor) {
  return {
    ...markerIcon(isActive, flagColor),
    scale: 1.72,
  };
}

function showMapMessage(message) {
  if (!els.mapMessage) {
    return;
  }

  els.mapMessage.textContent = message;
  els.mapMessage.hidden = false;
}

function formatListDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join(".");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js?v=84", { updateViaCache: "none" });
  }
}

/* ----------------------------------------------------------------------------
 * Local-only admin editor
 *
 * Everything below runs only when IS_LOCAL is true (see init). It lets you edit
 * a record's text fields and drag its map marker to adjust coordinates, then
 * saves back to filebox/records via the local /api/save-record endpoint.
 * ------------------------------------------------------------------------- */

// Plain single-line/textarea fields keyed by record field name.
const PLAIN_FIELD_KEYS = ["time", "locationText"];

const editor = {
  root: null,
  fields: {},
  levels: [],
  coordReadout: null,
  draftCoords: null,
  unitsDraft: [],
};

function setupEditor() {
  // Both local-only buttons live in one fixed toolbar so they line up and share
  // the same size/style (item: 文案編集 sits to the right of 编辑模式).
  const toolbar = document.createElement("div");
  toolbar.className = "editor-toolbar";
  document.body.appendChild(toolbar);
  editor.toolbar = toolbar;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "editor-toggle";
  toggle.className = "editor-toggle";
  toggle.textContent = "✎ 编辑模式";
  toggle.addEventListener("click", toggleEditMode);
  toolbar.appendChild(toggle);
  editor.toggle = toggle;

  setupTextsEditor();

  const drawer = document.createElement("aside");
  drawer.className = "editor-drawer";
  drawer.setAttribute("aria-label", "record editor");
  drawer.innerHTML = `
    <header class="editor-head">
      <strong id="editor-title">编辑记录</strong>
      <button type="button" class="editor-close" aria-label="close">×</button>
    </header>
    <div class="editor-body"></div>
    <footer class="editor-actions">
      <button type="button" class="editor-save">保存</button>
      <button type="button" class="editor-cancel">取消</button>
    </footer>`;
  document.body.appendChild(drawer);
  editor.root = drawer;
  editor.titleEl = drawer.querySelector("#editor-title");

  const body = drawer.querySelector(".editor-body");

  const addField = (key, label, { textarea = false } = {}) => {
    const row = document.createElement("label");
    row.className = "editor-row";
    const control = textarea ? document.createElement("textarea") : document.createElement("input");
    if (textarea) {
      control.rows = 3;
    }
    row.innerHTML = `<span>${label}</span>`;
    row.appendChild(control);
    body.appendChild(row);
    editor.fields[key] = control;
    return control;
  };

  // 1. ID (read-only — it is the record's folder name = primary image name).
  const idRow = document.createElement("label");
  idRow.className = "editor-row";
  idRow.innerHTML = `<span>ID（自动＝主图文件名）</span>`;
  editor.idEl = document.createElement("input");
  editor.idEl.readOnly = true;
  idRow.appendChild(editor.idEl);
  body.appendChild(idRow);

  // Category (the whole folder name, e.g. "hookable(affordance)") = the type tag.
  const catRow = document.createElement("label");
  catRow.className = "editor-row";
  catRow.innerHTML = `<span>分类 Category（改这里会移动文件夹）</span>`;
  editor.category = document.createElement("select");
  catRow.appendChild(editor.category);
  body.appendChild(catRow);
  editor.category.addEventListener("change", onCategoryChange);

  // Marker flag (a colour to find points that still need work; edit-mode only).
  const flagRow = document.createElement("div");
  flagRow.className = "editor-row";
  flagRow.innerHTML = `
    <span>标记颜色 Flag（仅编辑模式可见，用来标记待办；点一下立即生效）</span>
    <div class="editor-flags">
      <button type="button" class="editor-flag flag-yellow" data-flag="yellow">黄·改数量/状态</button>
      <button type="button" class="editor-flag flag-black" data-flag="black">黑·加图片</button>
      <button type="button" class="editor-flag flag-white" data-flag="white">白·加文字</button>
      <button type="button" class="editor-flag flag-clear" data-flag="">清除</button>
    </div>`;
  body.appendChild(flagRow);
  editor.flagRow = flagRow;
  flagRow.querySelectorAll("[data-flag]").forEach((button) => {
    button.addEventListener("click", () => onFlagButton(button.dataset.flag));
  });

  // 2 title — bilingual (日本語 + English). 3 time.
  const titleRow = document.createElement("div");
  titleRow.className = "editor-row";
  titleRow.innerHTML = `
    <span>标题 Title（日本語 / English）</span>
    <input class="editor-title-ja" placeholder="日本語タイトル（默认空白）" />
    <input class="editor-title-en" placeholder="English title（可留空，英文系统会回退日文）" />`;
  body.appendChild(titleRow);
  editor.titleJa = titleRow.querySelector(".editor-title-ja");
  editor.titleEn = titleRow.querySelector(".editor-title-en");
  addField("time", "拍摄时间(覆盖) Time");

  // 4. Coordinates — placed right before the display address.
  const coordRow = document.createElement("div");
  coordRow.className = "editor-row";
  coordRow.innerHTML = `
    <span>坐标 Coordinates（在地图上拖动标记可调整）</span>
    <div class="editor-coord"><code class="editor-coord-readout">—</code>
      <button type="button" class="editor-coord-place">放到地图上</button>
      <button type="button" class="editor-coord-reset">恢复用照片坐标</button>
    </div>`;
  body.appendChild(coordRow);
  editor.coordReadout = coordRow.querySelector(".editor-coord-readout");
  coordRow.querySelector(".editor-coord-place").addEventListener("click", placeOnMapCenter);

  // 5. Display address (manual; falls back to the levels below when blank).
  addField("locationText", "显示地址 Location");

  // 6. Location levels — cascading dropdowns built from data/japan-areas.json.
  // Level 1 (japan/other/unknown) is not shown publicly; japan reveals the
  // prefecture → city → ward selects (each filterable by typing a keyword).
  const levelsRow = document.createElement("div");
  levelsRow.className = "editor-row editor-levels-row";
  levelsRow.innerHTML = `
    <span>地址层级 Address levels（japan 默认不展示）</span>
    <select class="lvl1">
      <option value="japan">日本 Japan</option>
      <option value="other">其他 Other（手填）</option>
      <option value="unknown">未知 Unknown</option>
    </select>
    <input class="lvl-other" placeholder="手动填写地址" hidden />
    <input class="lvl2" list="dl-lvl2" placeholder="都道府县 Prefecture（可输入筛选）" hidden />
    <input class="lvl3" list="dl-lvl3" placeholder="市 / 区 City" hidden />
    <input class="lvl4" list="dl-lvl4" placeholder="区 Ward" hidden />
    <datalist id="dl-lvl2"></datalist>
    <datalist id="dl-lvl3"></datalist>
    <datalist id="dl-lvl4"></datalist>`;
  body.appendChild(levelsRow);
  editor.lvl1 = levelsRow.querySelector(".lvl1");
  editor.lvlOther = levelsRow.querySelector(".lvl-other");
  editor.lvl2 = levelsRow.querySelector(".lvl2");
  editor.lvl3 = levelsRow.querySelector(".lvl3");
  editor.lvl4 = levelsRow.querySelector(".lvl4");
  editor.dl2 = levelsRow.querySelector("#dl-lvl2");
  editor.dl3 = levelsRow.querySelector("#dl-lvl3");
  editor.dl4 = levelsRow.querySelector("#dl-lvl4");
  editor.lvl1.addEventListener("change", onLevel1Change);
  editor.lvl2.addEventListener("change", onLevel2Change);
  editor.lvl3.addEventListener("change", onLevel3Change);
  // A datalist input filters its options by the current text, so a previous
  // selection would hide every other option. Clear on focus to show the full
  // list again, and restore the prior pick if nothing new is chosen.
  [editor.lvl2, editor.lvl3, editor.lvl4].forEach((input) => {
    input.addEventListener("focus", () => {
      input.dataset.prev = input.value;
      input.value = "";
    });
    input.addEventListener("blur", () => {
      if (!input.value) {
        input.value = input.dataset.prev || "";
      }
    });
  });
  loadAreas();

  // 7. Count. (类型已由「分类 Category」承担，去掉手写的伞的类型框)
  const countRow = document.createElement("label");
  countRow.className = "editor-row";
  countRow.innerHTML = `<span>伞的数量 Count</span>`;
  editor.count = document.createElement("select");
  editor.count.innerHTML = UMBRELLA_COUNT_OPTIONS.map(
    (value) => `<option value="${value}">${value}</option>`,
  ).join("");
  editor.count.addEventListener("change", () => {
    syncUnitsToCount();
    renderEditorUnits();
    renderEditorStatuses();
  });
  countRow.appendChild(editor.count);
  body.appendChild(countRow);

  // 8. Color & kind units (one row per umbrella, driven by the count).
  const unitsRow = document.createElement("div");
  unitsRow.className = "editor-row";
  unitsRow.innerHTML = `<span>伞的颜色和种类 Color & kind</span><div class="editor-units"></div>`;
  editor.unitsWrap = unitsRow.querySelector(".editor-units");
  body.appendChild(unitsRow);

  // 9. Status — one multi-select group per umbrella, driven by the count.
  const statusRow = document.createElement("div");
  statusRow.className = "editor-row";
  statusRow.innerHTML = `<span>状态 Status（每把伞一组，可多选；随数量增加）</span><div class="editor-statuses"></div>`;
  editor.statusesWrap = statusRow.querySelector(".editor-statuses");
  body.appendChild(statusRow);

  // 10. Content — ONE combined list of photos (cover + others) and text
  // paragraphs, all reorderable together. The detail page renders the
  // non-cover items in this order.
  const contentRow = document.createElement("div");
  contentRow.className = "editor-row";
  contentRow.innerHTML = `
    <span>内容 Content（图片与段落一起排序，★ 设为封面）</span>
    <div class="editor-flow"></div>
    <div class="editor-flow-actions">
      <button type="button" class="editor-add-para">＋ 加段落</button>
      <label class="editor-upload"><span>＋ 上传图片</span><input type="file" accept="image/*" multiple hidden /></label>
    </div>`;
  body.appendChild(contentRow);
  editor.flowList = contentRow.querySelector(".editor-flow");
  contentRow.querySelector(".editor-add-para").addEventListener("click", () => {
    editor.flow.push({ kind: "text", textJa: "", textEn: "" });
    renderFlow();
  });
  contentRow.querySelector(".editor-upload input").addEventListener("change", onUploadImages);

  // Danger zone: delete the whole record.
  const dangerRow = document.createElement("div");
  dangerRow.className = "editor-row editor-danger";
  dangerRow.innerHTML = `<button type="button" class="editor-delete-record">🗑 删除此标点</button>`;
  body.appendChild(dangerRow);
  dangerRow.querySelector(".editor-delete-record").addEventListener("click", deleteCurrentRecord);

  drawer.querySelector(".editor-close").addEventListener("click", closeEditor);
  drawer.querySelector(".editor-cancel").addEventListener("click", closeEditor);
  drawer.querySelector(".editor-save").addEventListener("click", saveEditor);
  coordRow.querySelector(".editor-coord-reset").addEventListener("click", () => {
    editor.draftCoords = null;
    updateCoordReadout(getRawById(state.editingId));
  });

  // "Add record" button sits next to the edit toggle.
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.id = "editor-add";
  addButton.className = "editor-add";
  addButton.textContent = "＋ 新增标点";
  addButton.addEventListener("click", () => editor.addInput?.click());
  document.body.appendChild(addButton);
  editor.addButton = addButton;

  const addInput = document.createElement("input");
  addInput.type = "file";
  addInput.accept = "image/*";
  addInput.hidden = true;
  addInput.addEventListener("change", onCreateRecord);
  document.body.appendChild(addInput);
  editor.addInput = addInput;

  // Category picker for the next "new point" (sits under the add button).
  const addCategory = document.createElement("select");
  addCategory.className = "editor-add-category";
  addCategory.title = "新增标点时使用的分类";
  addCategory.addEventListener("change", onAddCategoryChange);
  document.body.appendChild(addCategory);
  editor.addCategory = addCategory;
  populateCategorySelects();

  // Live detail-page preview shown on the left while editing.
  const preview = document.createElement("aside");
  preview.className = "editor-preview";
  preview.setAttribute("aria-label", "detail preview");
  preview.innerHTML = `<div class="editor-preview-inner"></div>`;
  document.body.appendChild(preview);
  editor.preview = preview;
  editor.previewInner = preview.querySelector(".editor-preview-inner");
}

// Render the (last saved) detail page of the record being edited, as a
// reference preview on the left.
function renderEditorPreview(id) {
  const item = state.umbrellas.find((entry) => entry.id === id);
  if (!item || !editor.previewInner) {
    return;
  }
  const cover = (item.media || []).find((m) => m.role === "primary") || item.media?.[0];
  editor.previewInner.innerHTML = `
    <header class="focus-header">${renderFocusHeader(item)}</header>
    <div class="editor-preview-cover"><img src="${escapeHtml(cover?.src || item.image)}" alt="" /></div>
    ${renderFocusArticle(item)}`;
}

const MEDIA_ROLE_LABELS = {
  supplement: "补充图片",
  detail: "细节",
  illustration: "插图",
};

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

// ---- Unified content flow: photos (cover + others) + text paragraphs --------

function photoItem(media) {
  return {
    kind: "photo",
    file: media.file || (media.src || "").split("/").pop() || "",
    id: media.id || "",
    role: media.role || "detail",
    title: media.title || "",
    photoTime: media.photoTime || "",
    thumb: media.thumb || media.src || "",
    src: media.src || "",
  };
}

// Build the single ordered flow from a record's media + blocks: cover photo
// first, then the saved block order (text + non-cover photos), then any photos
// not yet placed.
function buildFlow(raw) {
  const media = Array.isArray(raw.media) ? raw.media : [];
  const mediaByFile = {};
  media.forEach((m) => {
    mediaByFile[m.file] = m;
  });
  const flow = [];
  const used = new Set();
  const primary = media.find((m) => m.role === "primary");
  if (primary) {
    flow.push(photoItem(primary));
    used.add(primary.file);
  }
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (blocks.length) {
    blocks.forEach((b) => {
      if (b.type === "text") {
        const t = b.text;
        flow.push({
          kind: "text",
          textJa: t && typeof t === "object" ? t.ja || "" : t || "",
          textEn: t && typeof t === "object" ? t.en || "" : "",
        });
      } else if (b.type === "photo" && mediaByFile[b.file] && !used.has(b.file)) {
        flow.push(photoItem(mediaByFile[b.file]));
        used.add(b.file);
      }
    });
  } else if (raw.story && raw.story.trim()) {
    raw.story
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text) => flow.push({ kind: "text", textJa: text, textEn: "" }));
  }
  media.forEach((m) => {
    if (!used.has(m.file)) {
      flow.push(photoItem(m));
      used.add(m.file);
    }
  });
  editor.flow = flow;
}

function renderFlow() {
  const wrap = editor.flowList;
  if (!wrap) {
    return;
  }
  const flow = editor.flow || [];
  wrap.innerHTML = "";
  if (!flow.length) {
    wrap.innerHTML = `<p class="editor-hint">还没有内容。点「＋ 上传图片」或「＋ 加段落」。</p>`;
    return;
  }
  flow.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = `editor-block editor-block-${item.kind}`;
    const moveButtons = `
      <button type="button" data-fact="up" title="上移" ${index === 0 ? "disabled" : ""}>↑</button>
      <button type="button" data-fact="down" title="下移" ${index === flow.length - 1 ? "disabled" : ""}>↓</button>`;

    if (item.kind === "text") {
      row.innerHTML = `
        <div class="editor-block-langs">
          <textarea class="editor-block-text-ja" rows="2" placeholder="段落（日本語）">${escapeHtml(item.textJa || "")}</textarea>
          <textarea class="editor-block-text-en" rows="2" placeholder="Paragraph (English)">${escapeHtml(item.textEn || "")}</textarea>
        </div>
        <div class="editor-block-buttons">${moveButtons}<button type="button" data-fact="del-text" title="删除段落">✕</button></div>`;
      row.querySelector(".editor-block-text-ja").addEventListener("input", (event) => {
        item.textJa = event.target.value;
      });
      row.querySelector(".editor-block-text-en").addEventListener("input", (event) => {
        item.textEn = event.target.value;
      });
    } else {
      const isPrimary = item.role === "primary";
      const showTitle = !isPrimary;
      const showTime = item.role === "supplement";
      const roleControl = isPrimary
        ? `<span class="editor-media-badge">封面</span>`
        : `<select class="editor-flow-role">
            ${Object.entries(MEDIA_ROLE_LABELS)
              .map(([value, label]) => `<option value="${value}" ${item.role === value ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>`;
      row.innerHTML = `
        <img src="${escapeHtml(item.thumb || item.src || "")}" alt="" loading="lazy" />
        <div class="editor-media-controls">
          <div class="editor-media-top">
            ${roleControl}
            <div class="editor-block-buttons">
              ${isPrimary ? "" : `<button type="button" data-fact="primary" title="设为封面">★</button>`}
              ${moveButtons}
              <button type="button" data-fact="del-photo" title="删除图片">✕</button>
            </div>
          </div>
          ${showTitle ? `<label class="editor-media-field">标题<input class="editor-flow-title" value="${escapeHtml(item.title || "")}" placeholder="默认则空白" /></label>` : ""}
          ${showTime ? `<label class="editor-media-field">时间<input class="editor-flow-time" value="${escapeHtml(item.photoTime || "")}" placeholder="默认用照片时间" /></label>` : ""}
        </div>`;
      row.querySelector(".editor-flow-role")?.addEventListener("change", (event) => {
        item.role = event.target.value;
        renderFlow();
      });
      row.querySelector(".editor-flow-title")?.addEventListener("input", (event) => {
        item.title = event.target.value;
      });
      row.querySelector(".editor-flow-time")?.addEventListener("input", (event) => {
        item.photoTime = event.target.value;
      });
    }

    row.querySelectorAll("[data-fact]").forEach((btn) => {
      btn.addEventListener("click", () => onFlowAction(btn.dataset.fact, index));
    });
    wrap.appendChild(row);
  });
}

function onFlowAction(action, index) {
  const flow = editor.flow || [];
  const item = flow[index];
  if (!item) {
    return;
  }
  if (action === "up" && index > 0) {
    flow.splice(index - 1, 0, flow.splice(index, 1)[0]);
    renderFlow();
  } else if (action === "down" && index < flow.length - 1) {
    flow.splice(index + 1, 0, flow.splice(index, 1)[0]);
    renderFlow();
  } else if (action === "del-text") {
    flow.splice(index, 1);
    renderFlow();
  } else if (action === "primary") {
    flow.forEach((entry) => {
      if (entry.kind === "photo" && entry.role === "primary") {
        entry.role = "detail";
      }
    });
    item.role = "primary";
    renderFlow();
  } else if (action === "del-photo") {
    deleteMediaFile(item.file);
  }
}

// Make the units draft length match the chosen count (1-5). Blank/"unknown"
// leaves it untouched (rendering handles the disabled state).
function syncUnitsToCount() {
  const n = Number(editor.count.value);
  if (!Number.isInteger(n) || n < 1) {
    return;
  }
  const draft = editor.unitsDraft;
  while (draft.length < n) {
    // New umbrellas default to a transparent long umbrella (the common case).
    draft.push({ color: "transparent", colorDetail: "", kind: "long umbrella", status: [], statusOther: "" });
  }
  draft.length = n;
  draft.forEach((unit) => {
    if (!Array.isArray(unit.status)) {
      unit.status = [];
    }
    if (typeof unit.statusOther !== "string") {
      unit.statusOther = "";
    }
  });
}

function renderEditorUnits() {
  const wrap = editor.unitsWrap;
  if (!wrap) {
    return;
  }
  wrap.innerHTML = "";
  const value = editor.count.value;
  if (value === "") {
    wrap.innerHTML = `<p class="editor-hint">先选择数量</p>`;
    return;
  }
  if (value === "unknown") {
    wrap.innerHTML = `<p class="editor-hint">数量未知，暂不可填写颜色/种类</p>`;
    return;
  }
  editor.unitsDraft.forEach((unit) => {
    const row = document.createElement("div");
    row.className = "editor-unit";
    const needDetail = COLOR_NEEDS_DETAIL.has(unit.color);
    row.innerHTML = `
      <select class="unit-color">
        <option value="">颜色（未填）</option>
        ${UMBRELLA_COLOR_OPTIONS.map((o) => `<option value="${o.value}" ${unit.color === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
      <select class="unit-kind">
        <option value="">种类（未填）</option>
        ${UMBRELLA_KIND_OPTIONS.map((o) => `<option value="${o.value}" ${unit.kind === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
      <input class="unit-detail" placeholder="颜色说明（如 blue）" value="${escapeHtml(unit.colorDetail || "")}" ${needDetail ? "" : "hidden"} />`;
    row.querySelector(".unit-color").addEventListener("change", (event) => {
      unit.color = event.target.value;
      renderEditorUnits();
    });
    row.querySelector(".unit-kind").addEventListener("change", (event) => {
      unit.kind = event.target.value;
    });
    row.querySelector(".unit-detail").addEventListener("input", (event) => {
      unit.colorDetail = event.target.value;
    });
    wrap.appendChild(row);
  });
}

function collectUnitsForSave() {
  const n = Number(editor.count.value);
  if (!Number.isInteger(n) || n < 1) {
    return [];
  }
  return editor.unitsDraft.slice(0, n).map((unit) => ({
    color: unit.color || "",
    colorDetail: unit.colorDetail || "",
    kind: unit.kind || "",
    status: Array.isArray(unit.status) ? unit.status : [],
    statusOther: unit.statusOther || "",
  }));
}

// One status group per umbrella (driven by the count), each a multi-select
// where "other" is exclusive + free text.
function renderEditorStatuses() {
  const wrap = editor.statusesWrap;
  if (!wrap) {
    return;
  }
  wrap.innerHTML = "";
  const value = editor.count.value;
  if (value === "") {
    wrap.innerHTML = `<p class="editor-hint">先选择数量</p>`;
    return;
  }
  if (value === "unknown") {
    wrap.innerHTML = `<p class="editor-hint">数量未知，暂不可填写状态</p>`;
    return;
  }
  editor.unitsDraft.forEach((unit, index) => {
    if (!Array.isArray(unit.status)) {
      unit.status = [];
    }
    const otherOn = unit.status.includes("other");
    const group = document.createElement("div");
    group.className = "editor-status-group";
    group.innerHTML = `
      <div class="editor-status-glabel">第 ${index + 1} 把</div>
      <div class="editor-status">
        ${UMBRELLA_STATUS_OPTIONS.map(
          (o) =>
            `<label class="editor-status-item"><input type="checkbox" value="${o.value}" ${unit.status.includes(o.value) ? "checked" : ""} ${otherOn && o.value !== "other" ? "disabled" : ""} /><span>${o.label}</span></label>`,
        ).join("")}
      </div>
      <input class="editor-status-other" placeholder="other 的说明" value="${escapeHtml(unit.statusOther || "")}" ${otherOn ? "" : "hidden"} />`;
    const statusWrap = group.querySelector(".editor-status");
    const otherInput = group.querySelector(".editor-status-other");
    statusWrap.addEventListener("change", (event) => onUnitStatusChange(unit, event, statusWrap, otherInput));
    otherInput.addEventListener("input", (event) => {
      unit.statusOther = event.target.value;
    });
    wrap.appendChild(group);
  });
}

function onUnitStatusChange(unit, event, statusWrap, otherInput) {
  const box = event.target;
  if (box?.value === "other" && box.checked) {
    statusWrap.querySelectorAll('input[type="checkbox"]').forEach((b) => {
      if (b.value !== "other") {
        b.checked = false;
      }
    });
  } else if (box?.checked && box.value !== "other") {
    const otherBox = statusWrap.querySelector('input[value="other"]');
    if (otherBox) {
      otherBox.checked = false;
    }
  }
  const otherOn = !!statusWrap.querySelector('input[value="other"]')?.checked;
  statusWrap.querySelectorAll('input[type="checkbox"]').forEach((b) => {
    if (b.value !== "other") {
      b.disabled = otherOn;
    }
  });
  otherInput.hidden = !otherOn;
  unit.status = Array.from(statusWrap.querySelectorAll('input[type="checkbox"]:checked')).map((b) => b.value);
}

// ---- Cascading Japan address levels ----------------------------------------

function levelLabel(item) {
  return `${item.jp} ${item.en}`;
}

function fillDatalist(datalist, items) {
  datalist.innerHTML = items.map((item) => `<option value="${escapeHtml(levelLabel(item))}"></option>`).join("");
}

async function loadAreas() {
  try {
    const response = await fetch("data/japan-areas.json", { cache: "force-cache" });
    const data = await response.json();
    const all = Array.isArray(data.prefectures) ? data.prefectures : [];
    // Float the most-used prefectures to the top, keep the rest in order.
    const priorityNames = ["Kyoto", "Tokyo", "Chiba", "Osaka"];
    const priority = priorityNames.map((en) => all.find((p) => p.en === en)).filter(Boolean);
    const rest = all.filter((p) => !priorityNames.includes(p.en));
    editor.areas = [...priority, ...rest];
    editor.prefByLabel = {};
    editor.areas.forEach((pref) => {
      editor.prefByLabel[levelLabel(pref)] = pref;
    });
    fillDatalist(editor.dl2, editor.areas);
  } catch (error) {
    console.error("加载日本地址数据失败", error);
    editor.areas = [];
    editor.prefByLabel = {};
  }
}

function onLevel1Change() {
  const mode = editor.lvl1.value;
  editor.lvlOther.hidden = mode !== "other";
  const japan = mode === "japan";
  editor.lvl2.hidden = !japan;
  if (!japan) {
    editor.lvl3.hidden = true;
    editor.lvl4.hidden = true;
    return;
  }
  // Re-show child levels that already have a valid selection.
  const pref = editor.prefByLabel?.[editor.lvl2.value];
  editor.lvl3.hidden = !pref;
  const city = editor.cityByLabel?.[editor.lvl3.value];
  editor.lvl4.hidden = !(city && city.wards.length);
}

function populateCities(pref) {
  editor.cityByLabel = {};
  if (pref) {
    pref.cities.forEach((city) => {
      editor.cityByLabel[levelLabel(city)] = city;
    });
    fillDatalist(editor.dl3, pref.cities);
    editor.lvl3.hidden = false;
  } else {
    editor.dl3.innerHTML = "";
    editor.lvl3.hidden = true;
  }
}

function populateWards(city) {
  editor.wardByLabel = {};
  if (city && city.wards.length) {
    city.wards.forEach((ward) => {
      editor.wardByLabel[levelLabel(ward)] = ward;
    });
    fillDatalist(editor.dl4, city.wards);
    editor.lvl4.hidden = false;
  } else {
    editor.dl4.innerHTML = "";
    editor.lvl4.hidden = true;
  }
}

// Picking a prefecture auto-selects the first city (and its first ward).
function onLevel2Change() {
  const pref = editor.prefByLabel?.[editor.lvl2.value];
  editor.lvl3.value = "";
  editor.lvl4.value = "";
  populateCities(pref);
  if (pref && pref.cities.length) {
    const firstCity = pref.cities[0];
    editor.lvl3.value = levelLabel(firstCity);
    populateWards(firstCity);
    if (firstCity.wards.length) {
      editor.lvl4.value = levelLabel(firstCity.wards[0]);
    }
  } else {
    populateWards(null);
  }
}

// Picking a city auto-selects its first ward.
function onLevel3Change() {
  const city = editor.cityByLabel?.[editor.lvl3.value];
  editor.lvl4.value = "";
  populateWards(city);
  if (city && city.wards.length) {
    editor.lvl4.value = levelLabel(city.wards[0]);
  }
}

// Populate the level controls from a record's stored locationLevels (romaji).
function hydrateLevels(raw) {
  const levels = Array.isArray(raw.locationLevels) ? raw.locationLevels : [];
  editor.lvl2.value = "";
  editor.lvl3.value = "";
  editor.lvl4.value = "";
  editor.lvlOther.value = "";

  const pref = (editor.areas || []).find((p) => p.en === levels[0]);
  if (levels.length === 1 && String(levels[0]).toLowerCase() === "unknown") {
    editor.lvl1.value = "unknown";
  } else if (pref) {
    editor.lvl1.value = "japan";
    editor.lvl2.value = levelLabel(pref);
    onLevel2Change();
    const city = pref.cities.find((c) => c.en === levels[1]);
    if (city) {
      editor.lvl3.value = levelLabel(city);
      onLevel3Change();
      const ward = city.wards.find((w) => w.en === levels[2]);
      if (ward) {
        editor.lvl4.value = levelLabel(ward);
      }
    }
  } else if (levels.length) {
    // Old / unmatched data → keep it as free "other" text.
    editor.lvl1.value = "other";
    editor.lvlOther.value = levels.join(", ");
  } else {
    editor.lvl1.value = "japan";
  }
  onLevel1Change();
}

function collectLevelsForSave() {
  const mode = editor.lvl1.value;
  if (mode === "unknown") {
    return ["unknown"];
  }
  if (mode === "other") {
    const text = editor.lvlOther.value.trim();
    return text ? [text] : [];
  }
  const out = [];
  const pref = editor.prefByLabel?.[editor.lvl2.value];
  if (pref) {
    out.push(pref.en);
    const city = editor.cityByLabel?.[editor.lvl3.value];
    if (city) {
      out.push(city.en);
      const ward = editor.wardByLabel?.[editor.lvl4.value];
      if (ward) {
        out.push(ward.en);
      }
    }
  }
  return out;
}

function toggleEditMode() {
  state.editMode = !state.editMode;
  document.body.classList.toggle("edit-mode", state.editMode);
  editor.toggle.textContent = state.editMode ? "✓ 退出编辑" : "✎ 编辑模式";
  editor.toggle.classList.toggle("is-active", state.editMode);
  if (!state.editMode) {
    closeEditor();
  }
  render();
  // Entering edit mode while a point is open jumps straight into editing it.
  if (state.editMode) {
    const openId = state.selectedId || state.focusMarkerId;
    if (openId) {
      closeFocusMode();
      openEditor(openId);
    }
  }
}

// ---- 文案編集: edit the bilingual UI copy in data/texts.json (item 12) -------
// Local-only. Edits existing copy only (no "add paragraph" — paragraphs are kept
// in sync with what's already there, separated by a blank line in the textareas).

const textsEditor = { overlay: null };

function setupTextsEditor() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "texts-toggle";
  // Reuse .editor-toggle so it's the exact same size/style as the 编辑模式 button.
  btn.className = "editor-toggle texts-toggle";
  btn.textContent = "文 文案編集";
  btn.title = "编辑类型说明文 / 统计页说明文（日英双语，存到 data/texts.json）";
  btn.addEventListener("click", openTextsEditor);
  (editor.toolbar || document.body).appendChild(btn);
}

// Paragraph array <-> textarea: paragraphs are separated by a blank line.
function parasToText(value) {
  return (Array.isArray(value) ? value : []).join("\n\n");
}
function textToParas(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function openTextsEditor() {
  if (!textsEditor.overlay) {
    buildTextsEditor();
  }
  fillTextsEditor();
  textsEditor.overlay.hidden = false;
}

function closeTextsEditor() {
  if (textsEditor.overlay) {
    textsEditor.overlay.hidden = true;
  }
}

function buildTextsEditor() {
  const overlay = document.createElement("div");
  overlay.className = "texts-editor-overlay";
  overlay.hidden = true;

  // The type sections, in the same order as the stats cross-tab.
  const typeSections = STATS_TYPE_ORDER.map(
    (key) => `
      <fieldset class="texts-section" data-texts-type="${escapeHtml(key)}">
        <legend>${escapeHtml(key)}</legend>
        <label>日本語<textarea data-texts-field="type-ja" rows="4"></textarea></label>
        <label>English<textarea data-texts-field="type-en" rows="4"></textarea></label>
      </fieldset>`,
  ).join("");

  overlay.innerHTML = `
    <div class="texts-editor" role="dialog" aria-label="文案編集">
      <header class="texts-editor-head">
        <strong>文案編集 — 类型说明文 / 统计页说明文</strong>
        <button type="button" class="texts-editor-close" aria-label="close">×</button>
      </header>
      <p class="texts-editor-hint">只能修改现有文案；多个段落之间用一个空行分隔。保存后写入 data/texts.json，线上看到的也会更新。</p>
      <div class="texts-editor-body">
        <fieldset class="texts-section" data-texts-stats>
          <legend>统计页 说明文 (stats intro)</legend>
          <label>日本語<textarea data-texts-field="stats-ja" rows="4"></textarea></label>
          <label>English<textarea data-texts-field="stats-en" rows="4"></textarea></label>
        </fieldset>
        ${typeSections}
      </div>
      <footer class="texts-editor-actions">
        <button type="button" class="texts-editor-save">保存</button>
        <button type="button" class="texts-editor-cancel">取消</button>
      </footer>
    </div>`;

  document.body.appendChild(overlay);
  textsEditor.overlay = overlay;

  overlay.querySelector(".texts-editor-close").addEventListener("click", closeTextsEditor);
  overlay.querySelector(".texts-editor-cancel").addEventListener("click", closeTextsEditor);
  overlay.querySelector(".texts-editor-save").addEventListener("click", saveTextsEditor);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeTextsEditor();
    }
  });
}

function fillTextsEditor() {
  const overlay = textsEditor.overlay;
  overlay.querySelector('[data-texts-field="stats-ja"]').value = TEXTS.statsIntro.ja || "";
  overlay.querySelector('[data-texts-field="stats-en"]').value = TEXTS.statsIntro.en || "";
  overlay.querySelectorAll("[data-texts-type]").forEach((section) => {
    const key = section.dataset.textsType;
    const desc = TEXTS.typeDescriptions[key] || {};
    section.querySelector('[data-texts-field="type-ja"]').value = parasToText(desc.ja);
    section.querySelector('[data-texts-field="type-en"]').value = parasToText(desc.en);
  });
}

async function saveTextsEditor() {
  const overlay = textsEditor.overlay;
  const payload = {
    statsIntro: {
      ja: overlay.querySelector('[data-texts-field="stats-ja"]').value.trim(),
      en: overlay.querySelector('[data-texts-field="stats-en"]').value.trim(),
    },
    typeDescriptions: {},
  };
  overlay.querySelectorAll("[data-texts-type]").forEach((section) => {
    const key = section.dataset.textsType;
    payload.typeDescriptions[key] = {
      ja: textToParas(section.querySelector('[data-texts-field="type-ja"]').value),
      en: textToParas(section.querySelector('[data-texts-field="type-en"]').value),
    };
  });

  showEditorToast("保存中…");
  try {
    await apiPost("/api/save-texts", payload);
    TEXTS = payload;
    render();
    closeTextsEditor();
    showEditorToast("文案已保存 ✓");
  } catch (error) {
    showEditorToast(`保存失败：${error.message}`, true);
  }
}

function getRawById(id) {
  return state.rawById?.get(id) || null;
}

function openEditor(id) {
  const raw = getRawById(id);
  if (!raw) {
    return;
  }
  state.editingId = id;
  editor.draftCoords = state.pendingCoords[id] || raw.locationCoordinates || null;
  if (editor.titleEl) {
    editor.titleEl.textContent = `编辑：${id}`;
  }
  editor.idEl.value = id;
  populateCategorySelects();
  editor.category.value = categoryFolderOf(raw);
  syncFlagButtons(raw.editFlag || "");
  PLAIN_FIELD_KEYS.forEach((key) => {
    editor.fields[key].value = raw[key] || "";
  });
  // Bilingual title: existing single-language titles land in the 日本語 box.
  const rawTitle = raw.title;
  editor.titleJa.value = rawTitle && typeof rawTitle === "object" ? rawTitle.ja || "" : rawTitle || "";
  editor.titleEn.value = rawTitle && typeof rawTitle === "object" ? rawTitle.en || "" : "";
  // Smart-default placeholders (what the public site falls back to when blank).
  editor.fields.time.placeholder = raw.photoTime || "默认用照片时间";
  editor.fields.locationText.placeholder = formatLocationLevels(raw.locationLevels) || "默认用下面的地址层级";

  hydrateLevels(raw);

  // Count + per-umbrella units (colour/kind + status), default 1 when not set.
  editor.count.value = raw.umbrellaCount || "1";
  editor.unitsDraft = (Array.isArray(raw.umbrellaUnits) ? raw.umbrellaUnits : []).map((unit) => ({
    color: unit.color || "",
    colorDetail: unit.colorDetail || "",
    kind: unit.kind || "",
    status: Array.isArray(unit.status) ? unit.status.slice() : [],
    statusOther: unit.statusOther || "",
  }));
  syncUnitsToCount();
  renderEditorUnits();
  renderEditorStatuses();
  buildFlow(raw);
  renderFlow();
  updateCoordReadout(raw);
  renderEditorPreview(id);
  editor.preview?.classList.add("is-open");
  editor.root.classList.add("is-open");
  // Lets the Archive page reserve space for the side panels (see #15) so cards
  // stay visible and clickable instead of being hidden under them.
  document.body.classList.add("editor-open");
}

function closeEditor() {
  state.editingId = null;
  editor.root?.classList.remove("is-open");
  editor.preview?.classList.remove("is-open");
  document.body.classList.remove("editor-open");
}

function updateCoordReadout(raw) {
  if (!editor.coordReadout) {
    return;
  }
  const coords = editor.draftCoords || raw?.photoCoordinates || null;
  const source = editor.draftCoords ? "手动" : "照片";
  editor.coordReadout.textContent = coords
    ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}（${source}）`
    : "—";
}

function onMarkerDragged(id, coords) {
  // Store the dragged position durably so any re-open of the editor (e.g. a
  // trailing click) can't lose it. openEditor reads this back.
  state.pendingCoords[id] = coords;
  if (state.editingId !== id) {
    openEditor(id);
  }
  editor.draftCoords = coords;
  updateCoordReadout(getRawById(id));
  showEditorToast(`坐标已更新（${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}），记得点保存`);
}

// Put a record that has no coordinates onto the map at the current map center,
// so a draggable marker appears. The position is a draft until you click 保存.
function placeOnMapCenter() {
  const id = state.editingId;
  if (!id) {
    return;
  }
  if (!state.googleReady || !state.map?.getCenter) {
    showEditorToast("地图还没准备好，请稍候", true);
    return;
  }
  switchToMapView();
  const center = state.map.getCenter();
  const coords = { lat: center.lat(), lng: center.lng() };
  editor.draftCoords = coords;
  state.pendingCoords[id] = coords;
  // Reflect on the in-memory item right away so the marker shows up before save.
  const item = state.umbrellas.find((entry) => entry.id === id);
  if (item) {
    item.coordinates = coords;
    item.locationCoordinates = coords;
  }
  updateCoordReadout(getRawById(id));
  render();
  showEditorToast("已放到地图中心，请拖动标记到准确位置后点保存");
}

async function saveEditor() {
  const id = state.editingId;
  if (!id) {
    return;
  }
  const payload = { id, locationCoordinates: editor.draftCoords };
  PLAIN_FIELD_KEYS.forEach((key) => {
    payload[key] = editor.fields[key].value;
  });
  payload.title = { ja: editor.titleJa.value.trim(), en: editor.titleEn.value.trim() };
  payload.locationLevels = collectLevelsForSave();
  payload.umbrellaCount = editor.count.value;
  payload.umbrellaUnits = collectUnitsForSave();
  const photos = (editor.flow || []).filter((i) => i.kind === "photo");
  payload.media = photos.map((p) => ({
    file: p.file,
    id: p.id,
    role: p.role,
    title: p.title,
    photoTime: p.photoTime,
  }));
  payload.blocks = (editor.flow || [])
    .filter((i) => i.kind === "text" || (i.kind === "photo" && i.role !== "primary"))
    .map((i) =>
      i.kind === "text"
        ? { type: "text", text: { ja: (i.textJa || "").trim(), en: (i.textEn || "").trim() } }
        : { type: "photo", file: i.file },
    )
    .filter((b) => b.type !== "text" || b.text.ja || b.text.en);
  // story is the card-preview fallback; keep it as the Japanese paragraphs joined.
  payload.story = (editor.flow || [])
    .filter((i) => i.kind === "text" && (i.textJa || "").trim())
    .map((i) => i.textJa.trim())
    .join("\n");

  const saveButton = editor.root.querySelector(".editor-save");
  saveButton.disabled = true;
  saveButton.textContent = "保存中…";
  try {
    const response = await fetch("/api/save-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `保存失败（${response.status}）`);
    }
    // The dragged position is now persisted; drop the pending copy.
    delete state.pendingCoords[id];
    // Reload the freshly-rebuilt database and re-render with edit mode intact.
    state.umbrellas = await loadUmbrellaData();
    render();
    showEditorToast("已保存 ✓");
    openEditor(id);
  } catch (error) {
    showEditorToast(`保存失败：${error.message}`, true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "保存";
  }
}

async function apiPost(pathname, payload) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `请求失败（${response.status}）`);
  }
  return result;
}

// Upload one or more images into the currently-open record's folder.
async function onUploadImages(event) {
  const id = state.editingId;
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!id || !files.length) {
    return;
  }
  showEditorToast("上传中…");
  try {
    for (const file of files) {
      const dataBase64 = await readFileAsDataUrl(file);
      await apiPost("/api/upload-image", { id, filename: file.name, dataBase64 });
    }
    state.umbrellas = await loadUmbrellaData();
    render();
    openEditor(id);
    showEditorToast("已上传 ✓");
  } catch (error) {
    showEditorToast(`上传失败：${error.message}`, true);
  }
}

async function deleteMediaFile(file) {
  const id = state.editingId;
  if (!id || !file) {
    return;
  }
  if (!window.confirm(`确定删除图片 ${file}？`)) {
    return;
  }
  try {
    await apiPost("/api/delete-image", { id, file });
    state.umbrellas = await loadUmbrellaData();
    render();
    openEditor(id);
    showEditorToast("已删除图片 ✓");
  } catch (error) {
    showEditorToast(`删除失败：${error.message}`, true);
  }
}

// Create a new record from a chosen image, placed at the current map center.
async function onCreateRecord(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) {
    return;
  }
  showEditorToast("新增中…");
  try {
    const dataBase64 = await readFileAsDataUrl(file);
    const center = state.map?.getCenter?.();
    const coordinates = center ? { lat: center.lat(), lng: center.lng() } : null;
    const category = editor.addCategory?.value || "unknown";
    const result = await apiPost("/api/create-record", { filename: file.name, dataBase64, coordinates, category });
    state.umbrellas = await loadUmbrellaData();
    if (!state.editMode) {
      toggleEditMode();
    } else {
      render();
    }
    openEditor(result.id);
    // If the photo carried GPS, the point landed at its real spot — fly there.
    if (result.coordinates && state.googleReady && state.map) {
      switchToMapView();
      state.map.panTo(result.coordinates);
      state.map.setZoom(Math.max(state.map.getZoom(), DEFAULT_MAP_ZOOM));
    }
    showEditorToast(
      result.fromExif
        ? "已新增标点 ✓ 照片自带定位，已落到真实位置"
        : "已新增标点 ✓，请拖动标记到准确位置",
    );
  } catch (error) {
    showEditorToast(`新增失败：${error.message}`, true);
  }
}

// ---- Categories (the whole folder name = the type tag) ---------------------

function categoryFolderOf(item) {
  if (!item) {
    return "unknown";
  }
  return item.categoryGroup ? `${item.category}(${item.categoryGroup})` : item.category || "unknown";
}

function listCategories() {
  const set = new Set(["unknown"]);
  (state.umbrellas || []).forEach((item) => set.add(categoryFolderOf(item)));
  return [...set].sort();
}

function populateCategorySelects() {
  const options =
    listCategories()
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("") + `<option value="__new__">＋ 新建分类…</option>`;
  if (editor.category) {
    editor.category.innerHTML = options;
  }
  if (editor.addCategory) {
    const prev = editor.addCategory.value;
    editor.addCategory.innerHTML = options;
    if (prev && [...editor.addCategory.options].some((o) => o.value === prev)) {
      editor.addCategory.value = prev;
    }
  }
}

function promptNewCategory() {
  const value = window.prompt("输入新分类（整串作为一个类型），例如 hookable(affordance) 或 unknown：");
  return value ? value.trim() : "";
}

function onAddCategoryChange(event) {
  if (event.target.value !== "__new__") {
    return;
  }
  const created = promptNewCategory();
  if (created) {
    const option = document.createElement("option");
    option.value = created;
    option.textContent = created;
    event.target.insertBefore(option, event.target.lastElementChild);
    event.target.value = created;
  } else {
    event.target.value = "unknown";
  }
}

async function onCategoryChange(event) {
  const id = state.editingId;
  if (!id) {
    return;
  }
  let category = event.target.value;
  if (category === "__new__") {
    category = promptNewCategory();
    if (!category) {
      editor.category.value = categoryFolderOf(getRawById(id));
      return;
    }
  }
  try {
    await apiPost("/api/move-record", { id, category });
    state.umbrellas = await loadUmbrellaData();
    render();
    openEditor(id);
    showEditorToast("已移动分类 ✓");
  } catch (error) {
    showEditorToast(`移动失败：${error.message}`, true);
    editor.category.value = categoryFolderOf(getRawById(id));
  }
}

function syncFlagButtons(active) {
  editor.flagRow?.querySelectorAll("[data-flag]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.flag === (active || ""));
  });
}

// Marker flag saves immediately and recolours the map without a full reload.
async function onFlagButton(color) {
  const id = state.editingId;
  if (!id) {
    return;
  }
  try {
    await apiPost("/api/save-record", { id, editFlag: color });
    const raw = getRawById(id);
    if (raw) {
      raw.editFlag = color;
    }
    const item = state.umbrellas.find((entry) => entry.id === id);
    if (item) {
      item.editFlag = color;
    }
    renderMapMarkers(filteredUmbrellas());
    syncFlagButtons(color);
    showEditorToast(color ? "已标记 ✓" : "已清除标记");
  } catch (error) {
    showEditorToast(`标记失败：${error.message}`, true);
  }
}

async function deleteCurrentRecord() {
  const id = state.editingId;
  if (!id) {
    return;
  }
  if (!window.confirm(`确定删除整条标点「${id}」？此操作会删除它的文件夹和所有图片，无法撤销。`)) {
    return;
  }
  try {
    await apiPost("/api/delete-record", { id });
    closeEditor();
    state.umbrellas = await loadUmbrellaData();
    render();
    showEditorToast("已删除标点 ✓");
  } catch (error) {
    showEditorToast(`删除失败：${error.message}`, true);
  }
}

function showEditorToast(message, isError = false) {
  let toast = document.querySelector(".editor-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "editor-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(showEditorToast.timer);
  showEditorToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

const mapStyles = [
  {
    featureType: "all",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4d5a56" }],
  },
  {
    featureType: "all",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#f4f3ed" }, { weight: 2 }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#e5e7dd" }],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#cbd1ca" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#b8c2bc" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#93aaa7" }],
  },
];

// Applied on satellite / hybrid. We always hide the road line geometry (the
// white lines over the imagery). POI labels (restaurants, parking, …) are
// hidden until you zoom in close, then shown faded.
//
// To tune: POI_REVEAL_ZOOM is the threshold (focus-after-click zoom is 18, the
// default city view is 14). Flip POI_SHOW_WHEN_ZOOMED_IN to invert the rule
// (show POI when zoomed OUT instead).
const POI_REVEAL_ZOOM = 17;
const POI_SHOW_WHEN_ZOOMED_IN = true;

const ROAD_GEOMETRY_OFF = { featureType: "road", elementType: "geometry", stylers: [{ visibility: "off" }] };
const POI_OFF = { featureType: "poi", stylers: [{ visibility: "off" }] };
// Google map styles can't set true label opacity, so "faded" = a softer colour
// with a dark outline so the text stays readable over the satellite imagery.
const POI_FADED = [
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#eef2f0" }] },
  { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#26302c" }, { weight: 2 }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ saturation: -30 }, { lightness: 5 }] },
];

const SATELLITE_STYLES_FAR = [ROAD_GEOMETRY_OFF, POI_OFF];
const SATELLITE_STYLES_NEAR = [ROAD_GEOMETRY_OFF, ...POI_FADED];

function satelliteStylesForZoom(zoom) {
  const zoomedIn = zoom >= POI_REVEAL_ZOOM;
  const showPoi = POI_SHOW_WHEN_ZOOMED_IN ? zoomedIn : !zoomedIn;
  return showPoi ? SATELLITE_STYLES_NEAR : SATELLITE_STYLES_FAR;
}
