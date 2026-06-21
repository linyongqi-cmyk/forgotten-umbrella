import { GOOGLE_MAPS_API_KEY } from "./config.js";

const state = {
  umbrellas: [],
  selectedId: null,
  listSort: "default",
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
  archiveMode: "default",
  archiveSubfilter: "all",
  archiveOrder: "desc",
  archiveCollapsedGroups: new Set(),
  searchOpen: false,
  mapType: "satellite",
  imageExpanded: false,
  focusMediaIndex: 0,
  imageZoom: 1,
  imagePanX: 0,
  imagePanY: 0,
  imageFrameWidth: 0,
  imageFrameHeight: 0,
  imageDragStart: null,
  ignoreFocusCloseUntil: 0,
  isFocusCameraAnimating: false,
  languageMenuOpen: false,
  editMode: false,
  editingId: null,
};

const FOCUS_ANIMATION_MS = 900;
const FOCUS_MARKER_SCREEN = {
  xDesktop: 0.23,
  yDesktop: 0.5,
  xMobile: 0.5,
  yMobile: 0.42,
};
const MARKER_VISUAL_CENTER_OFFSET_Y = 20;
const DEFAULT_MAP_CENTER = { lat: 34.98585, lng: 135.75877 };
const DEFAULT_MAP_ZOOM = 14;
const FOCUS_MAP_ZOOM = 18;
const RESET_ZOOM_ANIMATION_MS = 760;
const GEOLOCATION_TIMEOUT_MS = 2500;

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
  { value: "folding", label: "folding 折叠伞" },
  { value: "long umbrella", label: "long umbrella 长柄伞" },
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
  focusClose: document.querySelector("#focus-close"),
  archiveContent: document.querySelector("#archive-content"),
  resultCount: document.querySelector("#result-count"),
  resetMap: document.querySelector("#reset-map"),
  mapTypeToggle: document.querySelector("#map-type-toggle"),
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
  state.umbrellas = await loadUmbrellaData();
  state.selectedId = null;

  initWelcomeTitleLayout();
  bindEvents();
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
      const locationText = item.locationText || formatLocationLevels(locationLevels) || "unknown";
      const umbrellaCount = item.umbrellaCount || "";
      const umbrellaUnits = Array.isArray(item.umbrellaUnits) ? item.umbrellaUnits : [];
      const umbrellaStatus = Array.isArray(item.umbrellaStatus)
        ? item.umbrellaStatus
        : item.umbrellaStatus
          ? [item.umbrellaStatus]
          : [];
      const umbrellaStatusOther = item.umbrellaStatusOther || "";
      const objectText = buildObjectText(umbrellaCount, umbrellaUnits);
      const statusText = buildStatusText(umbrellaStatus, umbrellaStatusOther);
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
        umbrellaStatus,
        umbrellaStatusOther,
        statusText,
        objectText,
        story: item.story || "",
        blocks: Array.isArray(item.blocks) ? item.blocks : [],
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
  els.titleLines.forEach((line) => {
    const text = line.dataset.text ?? "";
    if (text === "FORGOTTEN") {
      line.textContent = text;
      return;
    }

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
      state.listSort = chip.dataset.listSort;
      state.listSubfilter = "all";
      els.chips.forEach((item) => item.classList.toggle("is-active", item === chip));
      syncListControls(filteredUmbrellas());
      render();
    });
  });

  els.resetMap?.addEventListener("click", () => {
    state.listSort = "default";
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

    els.chips.forEach((chip) => chip.classList.toggle("is-active", chip.dataset.listSort === "default"));
    syncListControls(filteredUmbrellas());
    render();
    fitMapToItems(filteredUmbrellas());
  });

  els.toggleList?.addEventListener("click", togglePanel);
  els.focusImage?.addEventListener("click", (event) => {
    event.stopPropagation();
    openExpandedImage(event);
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
    if (state.imageExpanded) {
      closeExpandedImage();
    }
  });
  els.focusPanel?.addEventListener("wheel", handleExpandedImageWheel, { passive: false });
  els.focusCaption?.addEventListener("click", (event) => {
    const mediaButton = event.target.closest?.("[data-focus-media-index]");
    if (!mediaButton) {
      return;
    }

    const index = Number(mediaButton.dataset.focusMediaIndex);
    if (!Number.isInteger(index)) {
      return;
    }

    state.focusMediaIndex = index;
    renderFocusImage();
  });

  els.searchToggle?.addEventListener("click", () => {
    state.searchOpen = !state.searchOpen;
    syncSearchBox();
  });

  els.mapTypeToggle?.addEventListener("click", toggleMapType);

  els.listOrderToggle?.addEventListener("click", () => {
    state.listOrder = state.listOrder === "desc" ? "asc" : "desc";
    syncListControls(filteredUmbrellas());
    render();
  });

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
      state.archiveMode = button.dataset.archiveMode;
      state.archiveSubfilter = "all";
      syncArchiveControls();
      renderArchive(filteredUmbrellas());
    });
  });

  els.archiveOrderToggle?.addEventListener("click", () => {
    state.archiveOrder = state.archiveOrder === "desc" ? "asc" : "desc";
    syncArchiveControls();
    renderArchive(filteredUmbrellas());
  });

  els.archiveSecondary?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-archive-subfilter]");
    if (!button) {
      return;
    }

    state.archiveSubfilter = button.dataset.archiveSubfilter;
    renderArchive(filteredUmbrellas());
  });

  els.languageToggle?.addEventListener("click", () => {
    state.languageMenuOpen = !state.languageMenuOpen;
    syncLanguageMenu();
  });

  els.languageMenu?.addEventListener("click", () => {
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
    "\u6536\u8d77\u5730\u70b9\u5217\u8868",
    "\u5c55\u5f00\u5730\u70b9\u5217\u8868",
  );
}

function syncArchiveControls() {
  els.archiveModeControls.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.archiveMode === state.archiveMode);
  });

  if (els.archiveOrderToggle) {
    els.archiveOrderToggle.hidden = state.archiveMode !== "time";
    els.archiveOrderToggle.classList.toggle("is-asc", state.archiveOrder === "asc");
  }
}

function syncListControls(items) {
  els.chips.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.listSort === state.listSort);
  });

  if (els.listOrderToggle) {
    els.listOrderToggle.hidden = state.listSort !== "time";
    els.listOrderToggle.classList.toggle("is-asc", state.listOrder === "asc");
  }

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
    }, 460);
  }
}

function togglePanel() {
  const className = "is-list-collapsed";
  const expandedLabel = "\u6536\u8d77\u5730\u70b9\u5217\u8868";
  const collapsedLabel = "\u5c55\u5f00\u5730\u70b9\u5217\u8868";

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
    "\u6536\u8d77\u5730\u70b9\u5217\u8868",
    "\u5c55\u5f00\u5730\u70b9\u5217\u8868",
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
        ? `\u5730\u56fe\u52a0\u8f7d\u5931\u8d25\u3002\u8bf7\u4f18\u5148\u68c0\u67e5 Google Cloud \u4e2d\u7684 API key Website restrictions\uff0c\u786e\u8ba4\u5df2\u5141\u8bb8 ${currentOrigin}/*\u3002`
        : "\u8bf7\u5148\u5728 config.js \u4e2d\u586b\u5165 Google Maps API Key\u3002",
    );
    return;
  }

  state.map = new google.maps.Map(els.mapCanvas, {
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
    mapTypeId: state.mapType,
    isFractionalZoomEnabled: true,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    cameraControl: false,
    rotateControl: false,
    zoomControl: false,
    clickableIcons: false,
    gestureHandling: "greedy",
    styles: mapStyles,
  });

  state.projectionOverlay = new google.maps.OverlayView();
  state.projectionOverlay.onAdd = () => {};
  state.projectionOverlay.draw = () => {};
  state.projectionOverlay.onRemove = () => {};
  state.projectionOverlay.setMap(state.map);

  state.map.addListener("dragstart", dismissFocusAfterUserMapInteraction);
  state.map.addListener("zoom_changed", dismissFocusAfterUserMapInteraction);

  const initialCenter = await getInitialMapCenter();
  state.map.setCenter(initialCenter);
  state.map.setZoom(DEFAULT_MAP_ZOOM);
  syncMapTypeButton();

  state.googleReady = true;
  state.suppressNextFit = true;
  if (els.mapMessage) {
    els.mapMessage.hidden = true;
  }
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
        finish({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
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

  state.mapType = state.mapType === "roadmap" ? "satellite" : "roadmap";
  state.map.setMapTypeId(state.mapType);
  syncMapTypeButton();
}

function syncMapTypeButton() {
  if (els.mapTypeToggle) {
    const nextLabel = state.mapType === "roadmap" ? "Satellite" : "Map";
    els.mapTypeToggle.textContent = nextLabel;
    els.mapTypeToggle.setAttribute(
      "aria-label",
      state.mapType === "roadmap" ? "switch to satellite map" : "switch to map",
    );
    els.mapTypeToggle.setAttribute(
      "title",
      state.mapType === "roadmap" ? "switch to satellite map" : "switch to map",
    );
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
      item.umbrellaStatus,
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
            <strong>${item.id}</strong>
            ${item.title ? `<span class="location-title">${escapeHtml(item.title)}</span>` : ""}
            <span class="location-meta">
              <span>${escapeHtml(formatListMeta(item))}</span>
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
      icon: markerIcon(item.id === state.focusMarkerId),
      draggable: state.editMode,
    });

    marker.addListener("click", (event) => {
      event.domEvent?.stopPropagation?.();
      if (state.editMode) {
        openEditor(item.id);
        return;
      }
      state.ignoreFocusCloseUntil = performance.now() + 180;
      selectUmbrella(item.id, { focus: true });
    });
    marker.addListener("dragend", (event) => {
      const lat = event.latLng?.lat();
      const lng = event.latLng?.lng();
      if (typeof lat === "number" && typeof lng === "number") {
        onMarkerDragged(item.id, { lat, lng });
      }
    });
    marker.addListener("mouseover", () => {
      marker.setIcon(hoverMarkerIcon(item.id === state.focusMarkerId));
    });
    marker.addListener("mouseout", () => {
      marker.setIcon(markerIcon(item.id === state.focusMarkerId));
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

  els.focusPanel?.classList.add("is-loading");
  els.focusImage.src = cover?.src || item.image;
  els.focusImage.alt = item.title || item.id;
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

function renderFocusArticle(item) {
  const focusTitle = item.title ? `${item.id}(${item.title})` : item.id;
  const infoLines = [
    { label: "type", value: formatInformationType(item) },
    { label: "object", value: item.objectText },
    { label: "state", value: item.statusText },
  ].filter((entry) => entry.value);

  const mediaByFile = {};
  (item.media || []).forEach((m) => {
    mediaByFile[m.file] = m;
  });

  const blocksHtml = effectiveBlocks(item)
    .map((block) => {
      if (block.type === "text") {
        return `<p class="item-story">${escapeHtml(block.text)}</p>`;
      }
      const media = mediaByFile[block.file];
      if (!media) {
        return "";
      }
      return `<figure class="focus-photo">
          <img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.title || media.id || "")}" loading="lazy" decoding="async" />
          ${media.title ? `<figcaption>${escapeHtml(media.title)}</figcaption>` : ""}
        </figure>`;
    })
    .join("");

  return `
    <div class="focus-caption-inner">
      <h3 class="focus-title">${escapeHtml(focusTitle)}</h3>
      ${item.location ? `<p class="item-detail">${escapeHtml(item.location)}</p>` : ""}
      ${formatDateTime(item.time) ? `<p class="item-detail">${escapeHtml(formatDateTime(item.time))}</p>` : ""}
      ${infoLines.length ? '<h4 class="focus-info-heading">information</h4>' : ""}
      ${infoLines.map((entry) => `<p class="item-detail">${escapeHtml(`${entry.label}: ${entry.value}`)}</p>`).join("")}
      ${blocksHtml}
    </div>
  `;
}

function renderArchive(items) {
  if (!els.archiveContent) {
    return;
  }

  syncArchiveControls();
  renderArchiveSecondary(items);

  const visibleItems = filterArchiveItems(items);
  const sorted = sortArchiveItems(visibleItems);

  if (state.archiveMode === "default" || state.archiveMode === "type") {
    els.archiveContent.innerHTML = `
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

function renderPhotoCard(item) {
  return `
    <article class="photo-card">
      <img src="${item.thumb}" alt="${item.id}" loading="lazy" decoding="async" />
      <div>
        ${renderItemText(item, "card")}
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
  const categoryLabels = {
    transit: "public transit",
  };
  const category = categoryLabels[item.category] || item.category || "";
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
  const list = applyUnitInheritance(count, units);
  if (!list.length) {
    return "";
  }
  const words = list.map(describeUnit);
  const allSame = words.every((word) => word === words[0]);
  if (allSame) {
    const num = COUNT_WORDS[Number(count)] || "";
    return [num, words[0]].filter(Boolean).join(" ").trim();
  }
  return words.map((word) => ["one", word].filter(Boolean).join(" ")).join(", ");
}

function buildStatusText(status, other) {
  const list = Array.isArray(status) ? status : status ? [status] : [];
  return list
    .map((value) => (value === "other" ? String(other || "").trim() || "other" : value))
    .filter(Boolean)
    .join(", ");
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

function groupByPlace(items) {
  const prefectures = new Map();

  items.forEach((item) => {
    if (!prefectures.has(item.prefecture)) {
      prefectures.set(item.prefecture, {
        key: `prefecture-${item.prefecture}`,
        label: item.prefecture,
        items: [],
        childrenMap: new Map(),
      });
    }

    const prefecture = prefectures.get(item.prefecture);
    prefecture.items.push(item);
    if (!prefecture.childrenMap.has(item.adminArea)) {
      prefecture.childrenMap.set(item.adminArea, {
        key: `admin-${item.adminArea}`,
        label: item.adminArea,
        items: [],
      });
    }
    prefecture.childrenMap.get(item.adminArea).items.push(item);
  });

  return Array.from(prefectures.values())
    .sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label))
    .map((group) => ({
      key: group.key,
      label: group.label,
      items: group.items,
      children: Array.from(group.childrenMap.values()).sort(
        (a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label),
      ),
    }));
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

  if (state.focusPositionedId === id) {
    return;
  }

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

function openExpandedImage(event) {
  if (!els.focusPanel || !els.focusImage) {
    return;
  }

  if (state.imageExpanded) {
    return;
  }

  state.imageExpanded = true;
  state.imageZoom = 1;
  state.imagePanX = 0;
  state.imagePanY = 0;
  els.focusPanel.classList.add("is-expanded");
  els.mapView.classList.add("is-image-expanded");
  setExpandedImageFrame();
  updateExpandedImageTransform();
}

function closeExpandedImage() {
  state.imageExpanded = false;
  state.imageZoom = 1;
  state.imagePanX = 0;
  state.imagePanY = 0;
  state.imageFrameWidth = 0;
  state.imageFrameHeight = 0;
  state.imageDragStart = null;
  els.focusPanel?.classList.remove("is-expanded");
  els.mapView?.classList.remove("is-image-expanded");
  els.focusImage?.style.setProperty("--image-zoom", "1");
  els.focusImage?.style.setProperty("--image-pan-x", "0px");
  els.focusImage?.style.setProperty("--image-pan-y", "0px");
  els.focusPanel?.style.removeProperty("--expanded-frame-width");
  els.focusPanel?.style.removeProperty("--expanded-frame-height");
  els.focusImage?.style.setProperty("--image-origin-x", "50%");
  els.focusImage?.style.setProperty("--image-origin-y", "50%");
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

  state.imageFrameWidth = Math.round(width);
  state.imageFrameHeight = Math.round(height);
  els.focusPanel.style.setProperty("--expanded-frame-width", `${state.imageFrameWidth}px`);
  els.focusPanel.style.setProperty("--expanded-frame-height", `${state.imageFrameHeight}px`);
  els.focusImage.style.setProperty("--image-origin-x", "50%");
  els.focusImage.style.setProperty("--image-origin-y", "50%");
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

function updateMarkerIcons() {
  state.markers.forEach((marker, id) => {
    marker.setIcon(markerIcon(id === state.focusMarkerId));
  });
}

function markerIcon(isActive) {
  return {
    path: "M12 2C7.03 2 3 6.03 3 11c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9Z",
    fillColor: isActive ? "#1f8bb8" : "#c54f35",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWeight: 2.1,
    scale: 1.55,
    anchor: new google.maps.Point(12, 26),
  };
}

function hoverMarkerIcon(isActive) {
  return {
    ...markerIcon(isActive),
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
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js?v=51", { updateViaCache: "none" });
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
const PLAIN_FIELD_KEYS = ["title", "time", "locationText", "umbrellaType"];

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

  // 2 title, 3 time, 4 location.
  addField("title", "标题 Title");
  addField("time", "拍摄时间(覆盖) Time");
  addField("locationText", "显示地址 Location");

  // 5. Location levels — cascading dropdowns built from data/japan-areas.json.
  // Level 1 (japan/other/unknown) is not shown publicly; japan reveals the
  // prefecture → city → ward selects (each filterable by typing a keyword).
  const levelsRow = document.createElement("div");
  levelsRow.className = "editor-row editor-levels-row";
  levelsRow.innerHTML = `
    <span>地址 Location（japan 默认不展示）</span>
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
  loadAreas();

  // 6. Type.
  addField("umbrellaType", "伞的类型 Type");

  // 7. Count.
  const countRow = document.createElement("label");
  countRow.className = "editor-row";
  countRow.innerHTML = `<span>伞的数量 Count</span>`;
  editor.count = document.createElement("select");
  editor.count.innerHTML =
    `<option value="">（未填）</option>` +
    UMBRELLA_COUNT_OPTIONS.map((value) => `<option value="${value}">${value}</option>`).join("");
  editor.count.addEventListener("change", () => {
    syncUnitsToCount();
    renderEditorUnits();
  });
  countRow.appendChild(editor.count);
  body.appendChild(countRow);

  // 8. Color & kind units (one row per umbrella, driven by the count).
  const unitsRow = document.createElement("div");
  unitsRow.className = "editor-row";
  unitsRow.innerHTML = `<span>伞的颜色和种类 Color & kind</span><div class="editor-units"></div>`;
  editor.unitsWrap = unitsRow.querySelector(".editor-units");
  body.appendChild(unitsRow);

  // 9. Status (multi-select; "other" is exclusive + free text).
  const statusRow = document.createElement("div");
  statusRow.className = "editor-row";
  statusRow.innerHTML = `<span>状态 Status（可多选）</span>
    <div class="editor-status"></div>
    <input class="editor-status-other" placeholder="other 的说明" hidden />`;
  editor.statusWrap = statusRow.querySelector(".editor-status");
  editor.statusOther = statusRow.querySelector(".editor-status-other");
  UMBRELLA_STATUS_OPTIONS.forEach((option) => {
    const label = document.createElement("label");
    label.className = "editor-status-item";
    label.innerHTML = `<input type="checkbox" value="${option.value}" /><span>${option.label}</span>`;
    editor.statusWrap.appendChild(label);
  });
  editor.statusWrap.addEventListener("change", onStatusChange);
  body.appendChild(statusRow);

  // 10. Content flow — ordered paragraphs interleaved with the non-primary
  // photos. This is what the detail page renders top to bottom.
  const contentRow = document.createElement("div");
  contentRow.className = "editor-row";
  contentRow.innerHTML = `
    <span>正文编排 Content（段落与照片可一起排序，主图只当封面）</span>
    <div class="editor-blocks"></div>
    <button type="button" class="editor-add-para">＋ 加段落</button>`;
  body.appendChild(contentRow);
  editor.blocksList = contentRow.querySelector(".editor-blocks");
  contentRow.querySelector(".editor-add-para").addEventListener("click", () => {
    editor.blocksDraft.push({ type: "text", text: "" });
    renderContentFlow();
  });

  // Coordinate readout + reset.
  const coordRow = document.createElement("div");
  coordRow.className = "editor-row";
  coordRow.innerHTML = `
    <span>坐标 Coordinates（在地图上拖动标记可调整）</span>
    <div class="editor-coord"><code class="editor-coord-readout">—</code>
      <button type="button" class="editor-coord-reset">恢复用照片坐标</button>
    </div>`;
  body.appendChild(coordRow);
  editor.coordReadout = coordRow.querySelector(".editor-coord-readout");

  // Image management section.
  const mediaRow = document.createElement("div");
  mediaRow.className = "editor-row";
  mediaRow.innerHTML = `
    <span>图片 Images（拖按钮排序，可设主图）</span>
    <div class="editor-media-list"></div>
    <label class="editor-upload">
      <span>＋ 上传图片</span>
      <input type="file" accept="image/*" multiple hidden />
    </label>`;
  body.appendChild(mediaRow);
  editor.mediaList = mediaRow.querySelector(".editor-media-list");
  mediaRow.querySelector(".editor-upload input").addEventListener("change", onUploadImages);

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

function renderEditorMedia() {
  if (!editor.mediaList) {
    return;
  }
  const items = editor.mediaDraft || [];
  editor.mediaList.innerHTML = "";
  items.forEach((media, index) => {
    const isPrimary = media.role === "primary";
    const row = document.createElement("div");
    row.className = "editor-media-item";

    const roleControl = isPrimary
      ? `<span class="editor-media-badge">主图</span>`
      : `<select class="editor-media-role">
          ${Object.entries(MEDIA_ROLE_LABELS)
            .map(([value, label]) => `<option value="${value}" ${media.role === value ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>`;

    // Field visibility by role: supplement → id+title+time, detail → id+title,
    // illustration → title only, primary → id only.
    const showId = isPrimary || media.role === "supplement" || media.role === "detail";
    const showTitle = !isPrimary;
    const showTime = media.role === "supplement";

    row.innerHTML = `
      <img src="${escapeHtml(media.thumb || media.src || "")}" alt="" loading="lazy" />
      <div class="editor-media-controls">
        <div class="editor-media-top">
          ${roleControl}
          <div class="editor-media-buttons">
            ${isPrimary ? "" : `<button type="button" data-act="primary" title="设为主图">★</button>`}
            <button type="button" data-act="up" title="上移" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-act="down" title="下移" ${index === items.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-act="delete" title="删除图片">✕</button>
          </div>
        </div>
        ${showId ? `<label class="editor-media-field">ID<input data-field="id" value="${escapeHtml(media.id || "")}" readonly /></label>` : ""}
        ${showTitle ? `<label class="editor-media-field">标题<input data-field="title" value="${escapeHtml(media.title || "")}" placeholder="默认则空白" /></label>` : ""}
        ${showTime ? `<label class="editor-media-field">时间<input data-field="photoTime" value="${escapeHtml(media.photoTime || "")}" placeholder="默认用照片时间" /></label>` : ""}
      </div>`;

    row.querySelector(".editor-media-role")?.addEventListener("change", (event) => {
      media.role = event.target.value;
      renderEditorMedia();
    });
    row.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        media[input.dataset.field] = input.value;
      });
    });
    row.querySelectorAll("[data-act]").forEach((button) => {
      button.addEventListener("click", () => onMediaAction(button.dataset.act, index));
    });

    editor.mediaList.appendChild(row);
  });
}

function onMediaAction(action, index) {
  const items = editor.mediaDraft || [];
  const media = items[index];
  if (!media) {
    return;
  }
  if (action === "up" && index > 0) {
    items.splice(index - 1, 0, items.splice(index, 1)[0]);
    renderEditorMedia();
  } else if (action === "down" && index < items.length - 1) {
    items.splice(index + 1, 0, items.splice(index, 1)[0]);
    renderEditorMedia();
  } else if (action === "primary") {
    items.forEach((entry) => {
      if (entry.role === "primary") {
        entry.role = "detail";
      }
    });
    media.role = "primary";
    renderEditorMedia();
    reconcileBlocks();
    renderContentFlow();
  } else if (action === "delete") {
    deleteMediaFile(media.file);
  }
}

// ---- Detail-page content flow (paragraphs + non-primary photos) ------------

// Make the blocks draft consistent with the current non-primary photos:
// drop photo blocks for images that are gone/now-primary, append new ones.
function reconcileBlocks() {
  const nonPrimary = (editor.mediaDraft || []).filter((m) => m.role !== "primary").map((m) => m.file);
  const npSet = new Set(nonPrimary);
  editor.blocksDraft = (editor.blocksDraft || []).filter((b) => b.type !== "photo" || npSet.has(b.file));
  const present = new Set(editor.blocksDraft.filter((b) => b.type === "photo").map((b) => b.file));
  nonPrimary.forEach((file) => {
    if (!present.has(file)) {
      editor.blocksDraft.push({ type: "photo", file });
    }
  });
}

function buildBlocksDraft(raw) {
  const stored = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (stored.length) {
    editor.blocksDraft = stored.map((b) =>
      b.type === "text" ? { type: "text", text: b.text || "" } : { type: "photo", file: b.file },
    );
  } else {
    editor.blocksDraft = [];
    if (raw.story && raw.story.trim()) {
      raw.story
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((text) => editor.blocksDraft.push({ type: "text", text }));
    }
  }
  reconcileBlocks();
}

function renderContentFlow() {
  const wrap = editor.blocksList;
  if (!wrap) {
    return;
  }
  const blocks = editor.blocksDraft || [];
  const mediaByFile = {};
  (editor.mediaDraft || []).forEach((m) => {
    mediaByFile[m.file] = m;
  });
  wrap.innerHTML = "";
  if (!blocks.length) {
    wrap.innerHTML = `<p class="editor-hint">还没有正文。点「＋ 加段落」或上传图片。</p>`;
    return;
  }
  blocks.forEach((block, index) => {
    const row = document.createElement("div");
    row.className = `editor-block editor-block-${block.type}`;
    const buttons = `<div class="editor-block-buttons">
        <button type="button" data-bact="up" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" data-bact="down" ${index === blocks.length - 1 ? "disabled" : ""}>↓</button>
        ${block.type === "text" ? `<button type="button" data-bact="delete" title="删除段落">✕</button>` : ""}
      </div>`;
    if (block.type === "text") {
      row.innerHTML = `<textarea class="editor-block-text" rows="2" placeholder="段落文字">${escapeHtml(block.text || "")}</textarea>${buttons}`;
      row.querySelector(".editor-block-text").addEventListener("input", (event) => {
        block.text = event.target.value;
      });
    } else {
      const media = mediaByFile[block.file];
      row.innerHTML = `<div class="editor-block-photo"><img src="${escapeHtml(media?.thumb || media?.src || "")}" alt="" /><span>${escapeHtml(block.file)}</span></div>${buttons}`;
    }
    row.querySelectorAll("[data-bact]").forEach((btn) => {
      btn.addEventListener("click", () => onBlockAction(btn.dataset.bact, index));
    });
    wrap.appendChild(row);
  });
}

function onBlockAction(action, index) {
  const blocks = editor.blocksDraft || [];
  if (action === "up" && index > 0) {
    blocks.splice(index - 1, 0, blocks.splice(index, 1)[0]);
    renderContentFlow();
  } else if (action === "down" && index < blocks.length - 1) {
    blocks.splice(index + 1, 0, blocks.splice(index, 1)[0]);
    renderContentFlow();
  } else if (action === "delete") {
    blocks.splice(index, 1);
    renderContentFlow();
  }
}

function collectBlocksForSave() {
  return (editor.blocksDraft || [])
    .map((b) => (b.type === "text" ? { type: "text", text: b.text || "" } : { type: "photo", file: b.file }))
    .filter((b) => b.type !== "text" || b.text.trim());
}

function storyFromBlocks() {
  return (editor.blocksDraft || [])
    .filter((b) => b.type === "text" && b.text.trim())
    .map((b) => b.text.trim())
    .join("\n");
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
    draft.push({ color: "", colorDetail: "", kind: "" });
  }
  draft.length = n;
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
  }));
}

function collectStatusForSave() {
  return Array.from(editor.statusWrap.querySelectorAll('input[type="checkbox"]:checked')).map((box) => box.value);
}

// "other" status is exclusive; selecting it clears the rest and vice versa.
function onStatusChange(event) {
  const box = event.target;
  if (box?.value === "other" && box.checked) {
    editor.statusWrap.querySelectorAll('input[type="checkbox"]').forEach((other) => {
      if (other.value !== "other") {
        other.checked = false;
      }
    });
  } else if (box?.checked && box.value !== "other") {
    const otherBox = editor.statusWrap.querySelector('input[value="other"]');
    if (otherBox) {
      otherBox.checked = false;
    }
  }
  syncStatusUI();
}

function syncStatusUI() {
  const otherBox = editor.statusWrap.querySelector('input[value="other"]');
  const otherOn = !!otherBox?.checked;
  editor.statusWrap.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    if (box.value !== "other") {
      box.disabled = otherOn;
    }
  });
  editor.statusOther.hidden = !otherOn;
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
    editor.areas = Array.isArray(data.prefectures) ? data.prefectures : [];
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

function onLevel2Change() {
  const pref = editor.prefByLabel?.[editor.lvl2.value];
  editor.lvl3.value = "";
  editor.lvl4.value = "";
  editor.cityByLabel = {};
  editor.wardByLabel = {};
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
  editor.dl4.innerHTML = "";
  editor.lvl4.hidden = true;
}

function onLevel3Change() {
  const city = editor.cityByLabel?.[editor.lvl3.value];
  editor.lvl4.value = "";
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
  editor.draftCoords = raw.locationCoordinates || null;
  if (editor.titleEl) {
    editor.titleEl.textContent = `编辑：${id}`;
  }
  editor.idEl.value = id;
  PLAIN_FIELD_KEYS.forEach((key) => {
    editor.fields[key].value = raw[key] || "";
  });
  // Smart-default placeholders (what the public site falls back to when blank).
  editor.fields.title.placeholder = "默认则空白";
  editor.fields.time.placeholder = raw.photoTime || "默认用照片时间";
  editor.fields.locationText.placeholder = formatLocationLevels(raw.locationLevels) || "unknown";
  editor.fields.umbrellaType.placeholder = raw.category || "unknown";

  hydrateLevels(raw);

  // Count + per-umbrella color/kind units.
  editor.count.value = raw.umbrellaCount || "";
  editor.unitsDraft = (Array.isArray(raw.umbrellaUnits) ? raw.umbrellaUnits : []).map((unit) => ({
    color: unit.color || "",
    colorDetail: unit.colorDetail || "",
    kind: unit.kind || "",
  }));
  syncUnitsToCount();
  renderEditorUnits();

  // Status multi-select.
  const statusValues = new Set(Array.isArray(raw.umbrellaStatus) ? raw.umbrellaStatus : []);
  editor.statusWrap.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.checked = statusValues.has(box.value);
  });
  editor.statusOther.value = raw.umbrellaStatusOther || "";
  syncStatusUI();
  // Working copy of the media list (order + roles + per-photo text).
  editor.mediaDraft = (Array.isArray(raw.media) ? raw.media : []).map((media) => ({
    file: media.file || (media.src || "").split("/").pop() || "",
    id: media.id || "",
    role: media.role || "detail",
    title: media.title || "",
    photoTime: media.photoTime || "",
    thumb: media.thumb || media.src || "",
    src: media.src || "",
  }));
  renderEditorMedia();
  buildBlocksDraft(raw);
  renderContentFlow();
  updateCoordReadout(raw);
  editor.root.classList.add("is-open");
}

function closeEditor() {
  state.editingId = null;
  editor.root?.classList.remove("is-open");
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
  editor.draftCoords = coords;
  if (state.editingId !== id) {
    openEditor(id);
  }
  updateCoordReadout(getRawById(id));
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
  payload.locationLevels = collectLevelsForSave();
  payload.umbrellaCount = editor.count.value;
  payload.umbrellaUnits = collectUnitsForSave();
  payload.umbrellaStatus = collectStatusForSave();
  payload.umbrellaStatusOther = editor.statusOther.value;
  payload.blocks = collectBlocksForSave();
  payload.story = storyFromBlocks();
  payload.media = (editor.mediaDraft || []).map((media) => ({
    file: media.file,
    id: media.id,
    role: media.role,
    title: media.title,
    photoTime: media.photoTime,
  }));

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
    const result = await apiPost("/api/create-record", { filename: file.name, dataBase64, coordinates });
    state.umbrellas = await loadUmbrellaData();
    if (!state.editMode) {
      toggleEditMode();
    } else {
      render();
    }
    openEditor(result.id);
    showEditorToast("已新增标点 ✓，请拖动标记到准确位置");
  } catch (error) {
    showEditorToast(`新增失败：${error.message}`, true);
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
