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
const DEFAULT_MAP_ZOOM = 14;
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
      const objectText = buildObjectText(umbrellaCount, umbrellaUnits);
      const objectLines = buildObjectGroups(umbrellaCount, umbrellaUnits);
      const statusText = statusTextFromUnits(umbrellaUnits);
      const statusLines = statusLinesFromUnits(umbrellaUnits);
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
      renderArchive(filteredUmbrellas());
    });
  });

  els.archiveSecondary?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-archive-subfilter]");
    if (!button) {
      return;
    }

    state.archiveSubfilter = button.dataset.archiveSubfilter;
    renderArchive(filteredUmbrellas());
  });

  // 統計 cross-tab: changing either axis dropdown re-renders the tables (#5).
  els.archiveContent?.addEventListener("change", (event) => {
    const select = event.target.closest?.("[data-stats-axis]");
    if (!select) {
      return;
    }
    if (select.dataset.statsAxis === "x") {
      state.statsX = select.value;
    } else {
      state.statsY = select.value;
    }
    renderArchive(filteredUmbrellas());
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
  if (els.mapTypeToggle) {
    // Button shows the base you'll switch TO.
    const label = onSatellite ? "地図" : "衛星";
    const hint = onSatellite ? "普通の地図に切り替え" : "衛星写真に切り替え";
    els.mapTypeToggle.textContent = label;
    els.mapTypeToggle.setAttribute("aria-label", hint);
    els.mapTypeToggle.setAttribute("title", hint);
  }
  if (els.mapLabelsToggle) {
    // The labels button only appears while on satellite.
    els.mapLabelsToggle.hidden = !onSatellite;
    const label = state.mapLabels ? "文字オフ" : "文字オン";
    const hint = state.mapLabels ? "衛星写真の文字を非表示" : "衛星写真に文字を表示";
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
  renderArchive(items);

  if (els.resultCount) {
    els.resultCount.textContent = `${items.length} item`;
  }
  if (els.statCount) {
    els.statCount.textContent = String(state.umbrellas.length);
  }
}

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
    button.addEventListener("click", () => selectUmbrella(button.dataset.id, { panMap: true }));
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
        return text ? `<p class="item-story">${escapeHtml(text)}</p>` : "";
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

// Per-type explanatory text (ja/en), shown in Archive 種類 view when a specific
// type is selected (#6). Keyed by the `type` value, e.g. "hookable(affordance)".
const TYPE_DESCRIPTIONS = {
  "hookable(affordance)": {
    "ja": [
      "「引掛け型」は、空間のインターフェースがいかに「遺忘」を誘発するかを考察するタイプである。",
      "駅の手すり、フェンス、階段の欄杆、あるいは商店の陳列棚といった、水平なバーやエッジを持つ施設は、物理的な「アフォーダンス」を提供している。移動の合間にスマートフォンを操作したり、交通カードを探したりするために、持ち主は無意識にこれらの支点を利用して傘を「引掛ける」。傘の柄のカーブと手すりの直線的な構造が物理的に適合しすぎるがゆえに、その「ついで」の行為は、傘を「持ち物」から「環境の一部」へと変容させてしまう。次の動作シーケンスが起動した際、その引掛けられた状態があまりに自然で安定しているため、かえって随身品としての存在感が希薄になり、意識の切り替えと共に置き去りにされるのである。"
    ],
    "en": [
      "The \"Hookable\" type explores how spatial interfaces actively induce \"forgetfulness.\"",
      "Facilities with horizontal bars, edges, or protrusions—such as station handrails, fences, stair railings, or display racks—provide a physical \"affordance\". During transitions in movement, often to free hands for a phone, a transit card, or adjusting clothing, the owner subconsciously utilizes these ready-made fulcrums to hang their umbrella. The physical alignment between the curve of the handle and the linear structure of the rail is so seamless that this \"convenient gesture\" transforms the umbrella from a \"personal belonging\" into \"part of the environment\". When the next sequence of action begins—such as entering a gate, boarding, or stepping into a shop—the very stability and naturalness of this hooked state cause the object to lose its presence as a handheld item, leading to its detachment during the shift in consciousness. It is a silent record woven by urban interfaces and momentary behaviors, reflecting the subtle intervention of spatial functions on human memory。"
    ]
  },
  "drop(behavior)": {
    "ja": [
      "「落下型」は、持ち主が全く無意識のうちに、物理的な要因によって身体や鞄、あるいは不安定な支点から傘が脱落したことで生じる遺留タイプである。",
      "「放置型」とは異なり、このタイプの傘は極めて混乱した、無秩序な姿を晒しているのが特徴だ。歩道の中央や車道の端、階段の下など、建築的な支えから完全に切り離された場所に横たわっていることが多い。この遺留は、例えば腕から滑り落ちたり、鞄の隙間から抜け落ちたりといった「失敗した動作」に起因する。落下という事象が、持ち主の注意を呼び戻すほどのフィードバックを伴わなかったため、持ち主は長時間その紛失に気づかない。これらは、都市のリズムの中で物理的慣性によって生じた「沈黙の断片」であり、身体感覚と持ち物の接続が瞬間的に失効した痕跡である。"
    ],
    "en": [
      "The \"Drop\" type refers to umbrellas left behind when they unintentionally detach from the owner’s body, bag, or an unstable support point due to purely physical factors, without the owner being aware of the event.",
      "Unlike the \"Placement\" type, umbrellas in this category usually exhibit a chaotic and disordered posture: they are often found lying flat in the middle of sidewalks, at the edges of roads, or at the bottom of stairs, completely detached from any architectural support. This form of abandonment typically stems from a \"failed action\"—such as a handle slipping from an arm or an umbrella sliding out of a backpack. Because the act of falling does not provide enough sensory feedback to recapture the owner's attention, the loss often goes unnoticed for a significant period. These are the \"silent fragments\" generated by physical inertia within the urban rhythm, recording a momentary expiration of the connection between bodily awareness and personal belongings."
    ]
  },
  "placement(behavior)": {
    "ja": [
      "「放置型」は、都市空間において「非偶発的な佇まい」を見せる傘のタイプとして定義される。",
      "重力に抗えず地面に倒れ伏す「落下型」とは対照的に、このタイプは空間に対する明確な意志を感じさせる。建築の境界に沿って直立したり、特定の支点に懸架されたり、あるいはベンチや植え込みの上といった地面より高い位置に留まったりと、その姿勢は安定している。",
      "これは、傘が意図せず脱落したのではなく、持ち主が一時的に周囲の環境に預けたことを示している。多くの場合、持ち主は目前の用件を処理するために能動的に傘の状態を変更したのである。次の動作へと意識が切り替わる際、この一時的な保管状態が記憶から切り離されることで遺忘が生じる。能動的な配置から失念へと至る、行動の転換がここに記録されている。"
    ],
    "en": [
      "The \"Placement Type\" is defined by umbrellas that exhibit a non-accidental posture within urban spaces.",
      "In contrast to the \"Drop Type,\" which yields to gravity and lies flat on the ground, this type demonstrates a clear spatial intent. Its posture remains stable—whether standing upright against architectural boundaries, hooked onto a support, or resting on elevated surfaces such as benches or hedges.",
      "This indicates that the umbrella was not lost through an unintentional slip, but was instead temporarily entrusted to the environment. Typically, the owner proactively altered the umbrella's state to attend to an immediate task. When their consciousness shifts to the next sequence of actions, this temporary state of storage is severed from their memory, resulting in its abandonment. Recorded here is the behavioral transition from intentional placement to complete oversight."
    ]
  },
  "disposal(behavior)": {
    "ja": [
      "「廃棄型」は、持ち主が主観的な意志に基づき、物件との関係を終結させることを選択したタイプである。一時的な「放置型」や偶発的な「落下型」とは異なり、この行為は傘が「道具」から「廃棄物」へと完全にアイデンティティが切り替わったことを示している。",
      "多くの場合、傘が機能を喪失した際（骨組みの折れ、布の破れなど）、あるいは持ち主がこれ以上の携行価値がないと判断した際に発生する。物理的な状態において、「廃棄型」にはしばしば「処理された」痕跡が見受けられる。公共のゴミ箱の隙間に押し込まれていたり、雑然とした場所に投げ捨てられていたりするのが特徴だ。そこには「放置型」のように再取得を想定した安定した秩序はなく、むしろ関係の断絶がその佇まいに現れている。これは人と物件との機能的な契約が失効した終着点であり、都市における瞬間的な決断の記録である。"
    ],
    "en": [
      "The \"Disposal Type\" refers to umbrellas left behind based on a conscious decision by the owner to terminate their relationship with the object. Unlike the temporary \"Placement Type\" or the accidental \"Drop Type,\" this behavior marks a complete shift in the umbrella's identity from a \"tool\" to \"waste.\"",
      "In most cases, this occurs when the umbrella has lost its functionality (e.g., broken ribs or torn fabric) or when the owner decides it no longer holds enough value to be carried. Physically, the \"Disposal Type\" often shows clear traces of being \"processed\": they might be shoved into the gaps of public trash bins or discarded in corners where miscellaneous debris accumulates. This posture lacks the stable order characteristic of the \"Placement Type\"—which is intended for later retrieval—and instead conveys a sense of finality. It records the severance of the functional contract between the person and the object, serving as the final point of a momentary decision within the urban environment."
    ]
  },
  "payment(behavior)": {
    "ja": [
      "「支払い型」は、精算機、券売機など、「支払い行為」に関わる場所で発見される傘である。",
      "これらの場面では、カードの取り出しや物探し、スキャンといった操作によって、手と注意が一時的に占有される。その過程で、傘は明確に「置かれる」というよりも、一連の動作の流れの中で自然に脇へと置かれ、台の端や機械の横、足元などに一時的に留まる。そして支払いが終わると、注意は次の行動へと移り、傘はそのまま忘れられることになる。",
      "このタイプは行動の中断と切り替えに由来する点に特徴がある。短時間でありながら高い集中を伴う支払い行為は、傘を手から離れさせ、無意識のうちにその場に留める。そこに残された傘は、都市生活における微細な注意の断絶を記録している。"
    ],
    "en": [
      "The \"payment\" type refers to umbrellas found at settlement machines, ticket machines, or any location involving the act of payment.",
      "In these scenarios, operations such as retrieving cards, searching for items, or scanning barcodes occupy both one’s hands and attention. Rather than being deliberately \"placed,\" the umbrella is naturally set aside within the flow of movement—propped against the edge of a counter, beside a machine, or at one’s feet. Once the payment is complete, attention shifts to the next objective, and the umbrella is left behind.",
      "This type is characterized by the interruption and switching of behavioral sequences. The act of payment, which demands high concentration within a short duration, detaches the umbrella from both hand and consciousness. These abandoned objects serve as records of the minute ruptures in attention that occur within urban life."
    ]
  },
  "restroom(place)": {
    "ja": [
      "「トイレ型」は、トイレという極めて特殊な場所で発見される傘である。",
      "特に男子トイレの小便器の傍らに置き忘れた場合が多い。用を足す間、置き場所に困る長柄の傘は、一時的に手から離される。その後の洗面、退室という一連の無意識な流れの中で、傘の記憶だけが置き去りにされてしまうのである。そのため、ここに残された傘は破損もなく、ほぼ完全な状態で発見されることが多い。それは、機能的な空間が生んだ純粋な「忘却」の形であり、人間の意識の隙間を垣間見るような光景と言えるだろう。"
    ],
    "en": [
      "The \"Restroom\" type refers to umbrellas found in the highly specific environment of the restroom.",
      "They are most frequently found abandoned beside urinals in men's facilities. During the act of relieving oneself, long handled umbrellas—which are awkward to manage in such cramped quarters—are temporarily set aside. In the subsequent, subconscious sequence of washing hands and exiting, the memory of the umbrella is the only thing left behind. As a result, these umbrellas are typically found in nearly pristine condition, free of damage. This represents a pure form of \"forgetting\" generated by a functional space—a scene that offers a glimpse into the subtle fissures of human consciousness."
    ]
  },
  "corner(affordance)": {
    "ja": [
      "「角部型」は、建物の外壁の角、塀と塀の接合部、路地の折れ曲がりといった、空間の“角”に位置する場所で発見される傘である。",
      "これらの場所は、視線や動線がぶつかり、わずかな滞留や躊躇が生じやすい「空間の節点」とも言える。そのため、傘は意図的に置かれたというよりも、身体の動きの流れの中で自然に手から離れ、そのまま角へと収束するように残される。多くの場合、壁に沿うように立てかけられたり、角に差し込まれるように寄りかかっており、完全に無秩序に投げ捨てられているわけではない点が特徴的である。ここでは、手すりのように単に引っ掛けるのではなく、わずかに角度や位置を調整しながら置かれるため、ごく微弱ながらも配置への意識が介在しているとも考えられる。角という場所は、中心でも通過点でもなく、空間の余白でありながら、同時に力が集まる場所でもある。そこに残された傘は、都市の中で見過ごされがちな微細な行動の痕跡を可視化し、無意識と意識のあいだにある曖昧な選択を示している。"
    ],
    "en": [
      "The \"Corner\" type refers to umbrellas found at the \"corners\" of space, such as the exterior corners of buildings, junctions between walls, or the bends in alleys.",
      "These locations can be described as \"spatial nodes,\" where lines of sight and movement converge, often causing brief moments of stagnation or hesitation. Consequently, rather than being deliberately placed, the umbrella naturally leaves the hand within the flow of physical movement, remaining as if it has converged into the corner. A characteristic feature is that they are typically propped along walls or leaned into corners as if inserted, rather than being discarded in total disorder. Unlike simply hooking an umbrella onto a handrail, these are set down with subtle adjustments to angle and position, suggesting that a faint sense of conscious arrangement is present. A corner is neither a center nor a mere transit point; it is a spatial margin where forces simultaneously gather. The umbrellas left in these spots visualize minute traces of behavior often overlooked in the city, illustrating the ambiguous choices made between the unconscious and the conscious."
    ]
  },
  "transit(place)": {
    "ja": [
      "「公共交通型」は、電車やバスといった公共交通機関の車内で発見される傘である。",
      "特に長傘の場合、折りたたみ傘のように容易に収納することができず、乗車中の身体の状態によって扱いが制約される。立っている場合には、傘の先端を床につけ、手元で支えることができるが、着席すると状況は大きく変わる。濡れた傘を手に持ち続けるには、持ち手を腰より高い位置で保持する必要があり、肩や腕に余分な負担がかかる。そのため、多くの場合、傘は手すりや座席の縁などに一時的に掛けられることになる。この「身体的な不快を回避するための一時的な解放」が、そのまま長時間維持されることで、傘は使用者の意識から切り離されていく。移動中という継続的な時間の中で、スマートフォンの操作や休息といった状態が重なると、再び傘を手に取る契機が失われ、そのまま忘却へと移行する。"
    ],
    "en": [
      "The \"Public Transit Type\" refers to umbrellas discovered inside public transportation vehicles, such as trains and buses.",
      "Unlike foldable models, long-handled umbrellas cannot be easily stored, and their handling is heavily constrained by the passenger's physical posture during the journey. While standing, a passenger can rest the tip of the umbrella on the floor and support it by hand; however, the situation changes significantly upon taking a seat. To keep a grip on a wet umbrella while seated, the handle must be held above waist level, imposing a continuous physical burden on the shoulders and arms. Consequently, the umbrella is often temporarily hung on handrails or the edges of seats. This \"temporary release,\" intended to alleviate physical discomfort, is often maintained for an extended period, gradually severing the object from the user’s consciousness. During the continuous duration of the transit, if distractions such as smartphone use or resting overlap with this state, the prompt to retrieve the umbrella is lost, leading directly to its abandonment."
    ]
  },
  "unknown": {
    "ja": [
      "「未知型」は、周辺情報の不足や状態の曖昧さにより、既存のカテゴリーに分類することが困難なタイプを指す。複数の分類の境界に位置するものや、遺失の経緯が全く推測できないものがこれに該当する。観察の論理では捉えきれない例外として、システムにおける「余白」を象徴する存在である。"
    ],
    "en": [
      "The \"Unknown Type\" refers to abandoned umbrellas that are difficult to classify within existing categories due to a lack of contextual information or an ambiguous physical state. These may sit at the intersection of multiple types or involve origins that leave no traceable evidence. They represent the \"gray areas\" within the research system—exceptions that cannot be fully captured by logic."
    ]
  }
};

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
    const month = item.time ? String(item.time).slice(0, 7) : "no-time";
    const place = item.prefecture || "unknown";
    const list = (item.umbrellaUnits || []).length ? item.umbrellaUnits : [{}];
    list.forEach((u) => {
      units.push({
        type: item.type || "unknown",
        object: statsObjectValue(u),
        state: u.status && u.status.length ? u.status.slice() : ["unknown"],
        month,
        place,
      });
    });
  });
  return units;
}

// `object` = colour + kind merged into one descriptor (#3). Colour and kind are
// combined so a "transparent long" and a "transparent folding" are counted
// separately (long vs folding always kept apart).
function statsObjectValue(u) {
  const color = u.color || "unknown";
  const kind = u.kind === "folding" ? "folding" : u.kind === "long umbrella" ? "long" : "unknown";
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

// Intro paragraph shown at the top of the 統計 page (#11). Japanese for now;
// moving this + the type descriptions into an editable bilingual JSON is a
// follow-up (see 交接.md, item 12).
const STATS_INTRO =
  "本ページは、「忘れられた傘」の記録を蓄積したアーカイブである。記録は、時間・種類・場所・type の視点から横断的に閲覧できる。type は、傘がどのような状況や環境の中で残されていたかをもとに分類したものであり、「hookable」「drop」「disposal」など、周囲との関係性によって構成されている。また、統計を通して、傘の種類や状態、繰り返し現れる行動や配置の傾向を観察することができる。";

function renderStats() {
  els.archiveContent.innerHTML = `
    <p class="stats-intro">${escapeHtml(STATS_INTRO)}</p>
    ${renderStatsPivot(buildStatsUnits())}
    ${renderStatsOverview()}
  `;
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

// Flat overview: one row per record (#5, screenshot 1). Sorted by IMG name by
// default (#4); columns IMG / date / type / area / object / state (#8). The IMG
// cell jumps to that record's map detail on double-click (#7).
function renderStatsOverview() {
  const sorted = [...state.umbrellas].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const rows = sorted
    .map((item) => {
      const idCell = `<td class="overview-id" data-overview-id="${escapeHtml(item.id)}">${escapeHtml(item.id)}</td>`;
      const rest = [
        formatDateTime(item.time) || "",
        statsValueLabel("type", item.type || ""),
        item.location || "",
        item.objectText || "",
        item.statusText || "",
      ];
      return `<tr>${idCell}${rest.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `
    <section class="stats-block">
      <h3 class="stats-heading">${state.lang === "ja" ? "総覧" : "overview"} (${state.umbrellas.length})</h3>
      <div class="stats-table-wrap">
        <table class="stats-table stats-overview">
          <thead>
            <tr><th>IMG</th><th>date</th><th>type</th><th>area</th><th>object</th><th>state</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderArchive(items) {
  if (!els.archiveContent) {
    return;
  }

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
      const desc = TYPE_DESCRIPTIONS[state.archiveSubfilter];
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
      renderArchive(filteredUmbrellas());
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
    navigator.serviceWorker.register("sw.js?v=75", { updateViaCache: "none" });
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
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "editor-toggle";
  toggle.className = "editor-toggle";
  toggle.textContent = "✎ 编辑模式";
  toggle.addEventListener("click", toggleEditMode);
  document.body.appendChild(toggle);
  editor.toggle = toggle;

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
