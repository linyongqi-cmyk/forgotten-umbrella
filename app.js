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

init();

async function init() {
  state.umbrellas = await loadUmbrellaData();
  state.selectedId = null;

  initWelcomeTitleLayout();
  bindEvents();
  render();
  await initGoogleMap();
  render();
  registerServiceWorker();
}

async function loadUmbrellaData() {
  try {
    const response = await fetch("data/umbrellas.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load data/umbrellas.json: ${response.status}`);
    }
    return normalizeUmbrellaData(await response.json());
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
        umbrellaStatus: item.umbrellaStatus || "",
        story: item.story || "",
        media: normalizeMedia(item),
        type: categoryType || "uncategorized",
        prefecture,
        adminArea,
        material: [umbrellaColor, umbrellaType].filter(Boolean).join(" "),
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
          src: item.image,
          thumb: item.thumb || item.image,
          role: "primary",
          photoTime: item.photoTime || "",
          story: item.story || "",
        },
      ];

  const normalized = baseMedia.map((entry, index) => ({
    id: entry.id || `${item.id}-${index + 1}`,
    src: entry.src || item.image,
    thumb: entry.thumb || entry.src || item.thumb || item.image,
    role: entry.role || (index === 0 ? "primary" : "detail"),
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
    });

    marker.addListener("click", (event) => {
      event.domEvent?.stopPropagation?.();
      state.ignoreFocusCloseUntil = performance.now() + 180;
      selectUmbrella(item.id, { focus: true });
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

  const media = item.media?.[state.focusMediaIndex] || item.media?.[0];
  if (!media) {
    return;
  }

  els.focusPanel?.classList.add("is-loading");
  els.focusImage.src = media.src;
  els.focusImage.alt = media.id || item.id;
  els.focusCaption.innerHTML = renderFocusCaption(item, media);
  if (els.focusImage.complete && els.focusImage.naturalWidth > 0) {
    els.focusPanel?.classList.remove("is-loading");
  }
  closeExpandedImage();
}

function renderFocusCaption(item, media) {
  const focusTitle = item.title ? `${item.id}(${item.title})` : item.id;
  const objectLine = [item.umbrellaColor, item.umbrellaType].filter(Boolean).join(" ");
  const infoLines = [
    { label: "type", value: formatInformationType(item) },
    { label: "object", value: objectLine },
    { label: "state", value: item.umbrellaStatus },
  ].filter((entry) => entry.value);
  const mediaNoteLines = item.media.length > 1
    ? [
        media.photoTime && media.photoTime !== item.photoTime ? formatDateTime(media.photoTime) : "",
        media.story || "",
      ].filter(Boolean)
    : [];

  const mediaStrip = item.media.length > 1
    ? `
      <section class="focus-media-strip" aria-label="media list">
        ${item.media
          .map(
            (entry, index) => `
              <button class="focus-media-thumb ${index === state.focusMediaIndex ? "is-active" : ""}" type="button" data-focus-media-index="${index}" aria-label="show ${escapeHtml(entry.id)}">
                <img src="${entry.thumb}" alt="${escapeHtml(entry.id)}" loading="lazy" decoding="async" />
                <span>${escapeHtml(entry.id)}</span>
              </button>
            `,
          )
          .join("")}
      </section>
    `
    : "";

  return `
    <div class="focus-caption-inner">
      <h3 class="focus-title">${escapeHtml(focusTitle)}</h3>
      ${item.location ? `<p class="item-detail">${escapeHtml(item.location)}</p>` : ""}
      ${formatDateTime(item.time) ? `<p class="item-detail">${escapeHtml(formatDateTime(item.time))}</p>` : ""}
      ${infoLines.length ? '<h4 class="focus-info-heading">information</h4>' : ""}
      ${infoLines.map((entry) => `<p class="item-detail">${escapeHtml(`${entry.label}: ${entry.value}`)}</p>`).join("")}
      ${item.story ? `<p class="item-story">${escapeHtml(item.story)}</p>` : ""}
      ${mediaNoteLines.map((detail) => `<p class="item-detail">${escapeHtml(detail)}</p>`).join("")}
      ${mediaStrip}
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
    item.umbrellaStatus,
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
    navigator.serviceWorker.register("sw.js?v=46", { updateViaCache: "none" });
  }
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
