const UMBRELLA_DATA = [
  {
    id: "kanda-blue",
    title: "Blue umbrella outside the konbini",
    location: "Tokyo, Kanda",
    type: "type1",
    prefecture: "Tokyo",
    adminArea: "Tokyo, Chiyoda, Kanda",
    time: "2026-04-13T17:42:00+09:00",
    weather: "\u96e8\u540e",
    material: "Nylon / metal frame",
    coordinates: { lat: 35.69172, lng: 139.77092 },
    image: "assets/photos/umbrella-kanda.svg",
    note: "Left beside the sliding door after the rain stopped.",
  },
  {
    id: "ginza-clear",
    title: "Clear umbrella at the Ginza crossing",
    location: "Tokyo, Ginza",
    type: "type2",
    prefecture: "Tokyo",
    adminArea: "Tokyo, Chuo, Ginza",
    time: "2026-05-02T20:16:00+09:00",
    weather: "\u591c\u96e8",
    material: "Clear plastic / white handle",
    coordinates: { lat: 35.67193, lng: 139.76502 },
    image: "assets/photos/umbrella-ginza.svg",
    note: "Almost disappeared into the reflections on the wet street.",
  },
  {
    id: "yanaka-black",
    title: "Black umbrella by the old wall",
    location: "Tokyo, Yanaka",
    type: "type3",
    prefecture: "Tokyo",
    adminArea: "Tokyo, Taito, Yanaka",
    time: "2026-05-19T15:28:00+09:00",
    weather: "\u9634\u5929",
    material: "Black cloth / curved wood handle",
    coordinates: { lat: 35.72564, lng: 139.76649 },
    image: "assets/photos/umbrella-yanaka.svg",
    note: "Hung carefully rather than dropped.",
  },
  {
    id: "shibuya-red",
    title: "Red umbrella at the end of the crossing",
    location: "Tokyo, Shibuya",
    type: "type4",
    prefecture: "Tokyo",
    adminArea: "Tokyo, Shibuya",
    time: "2026-06-04T18:07:00+09:00",
    weather: "\u96e8\u540e",
    material: "Red polyester / black handle",
    coordinates: { lat: 35.65803, lng: 139.70164 },
    image: "assets/photos/umbrella-shibuya.svg",
    note: "A bright red pause in a dense stream of people.",
  },
  {
    id: "osaka-nakanoshima",
    title: "Gray umbrella on the riverside path",
    location: "Osaka, Nakanoshima",
    type: "type5",
    prefecture: "Osaka",
    adminArea: "Osaka, Kita, Nakanoshima",
    time: "2026-03-21T08:35:00+09:00",
    weather: "\u9634\u5929",
    material: "Polyester / aluminum frame",
    coordinates: { lat: 34.69125, lng: 135.49584 },
    image: "assets/photos/umbrella-placeholder-1.svg",
    note: "Pressed between a bench and the rail before the commute fully started.",
  },
  {
    id: "kyoto-gion",
    title: "Paper-toned umbrella near Gion",
    location: "Kyoto, Gion",
    type: "type6",
    prefecture: "Kyoto",
    adminArea: "Kyoto, Higashiyama, Gion",
    time: "2026-03-29T19:18:00+09:00",
    weather: "\u591c\u96e8",
    material: "Light fabric / wood handle",
    coordinates: { lat: 35.00368, lng: 135.77855 },
    image: "assets/photos/umbrella-placeholder-2.svg",
    note: "Still glowing against the wet stone street after the rain line passed.",
  },
  {
    id: "sapporo-odori",
    title: "White umbrella at Odori Park",
    location: "Sapporo, Odori",
    type: "type1",
    prefecture: "Hokkaido",
    adminArea: "Hokkaido, Sapporo, Chuo",
    time: "2026-04-05T10:12:00+09:00",
    weather: "\u9634\u5929",
    material: "Waterproof cloth / slim shaft",
    coordinates: { lat: 43.06076, lng: 141.35536 },
    image: "assets/photos/umbrella-placeholder-3.svg",
    note: "A colder trace of rain stayed on the edge.",
  },
  {
    id: "fukuoka-ohori",
    title: "Dark green fold umbrella by the lake steps",
    location: "Fukuoka, Ohori Park",
    type: "type2",
    prefecture: "Fukuoka",
    adminArea: "Fukuoka, Chuo, Ohori Park",
    time: "2026-04-17T16:40:00+09:00",
    weather: "\u96e8\u540e",
    material: "Coated nylon / dark grip",
    coordinates: { lat: 33.58537, lng: 130.37655 },
    image: "assets/photos/umbrella-placeholder-4.svg",
    note: "A short gap between the umbrella and the bench felt like an interrupted talk.",
  },
  {
    id: "nagoya-sakae",
    title: "Blue-gray umbrella at the underground entry",
    location: "Nagoya, Sakae",
    type: "type3",
    prefecture: "Aichi",
    adminArea: "Aichi, Nagoya, Naka",
    time: "2026-04-30T21:03:00+09:00",
    weather: "\u591c\u96e8",
    material: "Water-repellent cloth / straight handle",
    coordinates: { lat: 35.16858, lng: 136.90862 },
    image: "assets/photos/umbrella-placeholder-1.svg",
    note: "Temporarily stored in a crack of the city while the crowd moved below.",
  },
  {
    id: "kobe-harborland",
    title: "Clear umbrella caught in the harbor rail",
    location: "Kobe, Harborland",
    type: "type4",
    prefecture: "Hyogo",
    adminArea: "Hyogo, Kobe, Chuo",
    time: "2026-05-08T18:54:00+09:00",
    weather: "\u96e8\u540e",
    material: "Clear plastic / translucent handle",
    coordinates: { lat: 34.68239, lng: 135.18311 },
    image: "assets/photos/umbrella-placeholder-2.svg",
    note: "More like docking than being forgotten.",
  },
  {
    id: "sendai-jozenji",
    title: "Deep blue umbrella under the trees",
    location: "Sendai, Jozenji-dori",
    type: "type5",
    prefecture: "Miyagi",
    adminArea: "Miyagi, Sendai, Aoba",
    time: "2026-05-14T11:26:00+09:00",
    weather: "\u9634\u5929",
    material: "Blue cloth / black handle",
    coordinates: { lat: 38.26482, lng: 140.86939 },
    image: "assets/photos/umbrella-placeholder-3.svg",
    note: "Placed by the flowerbed under a quieter light.",
  },
  {
    id: "hiroshima-peace",
    title: "Beige umbrella at the river bridge entrance",
    location: "Hiroshima, Peace Park",
    type: "type6",
    prefecture: "Hiroshima",
    adminArea: "Hiroshima, Naka, Peace Park",
    time: "2026-05-24T09:42:00+09:00",
    weather: "\u96e8\u540e",
    material: "Beige cloth / wood handle",
    coordinates: { lat: 34.39552, lng: 132.45362 },
    image: "assets/photos/umbrella-placeholder-4.svg",
    note: "Tilted slightly toward the bridge as if still waiting to be picked up.",
  },
  {
    id: "kanazawa-higashi",
    title: "Crimson umbrella under the tea-house window",
    location: "Kanazawa, Higashi Chaya",
    type: "type1",
    prefecture: "Ishikawa",
    adminArea: "Ishikawa, Kanazawa, Higashi Chaya",
    time: "2026-06-01T14:14:00+09:00",
    weather: "\u9634\u5929",
    material: "Brown-red cloth / wood shaft",
    coordinates: { lat: 36.57216, lng: 136.66377 },
    image: "assets/photos/umbrella-placeholder-1.svg",
    note: "The street seemed to absorb part of its color.",
  },
  {
    id: "naha-kokusai",
    title: "Light gray umbrella at Kokusai-dori",
    location: "Naha, Kokusai-dori",
    type: "type2",
    prefecture: "Okinawa",
    adminArea: "Okinawa, Naha, Kokusai-dori",
    time: "2026-06-09T13:09:00+09:00",
    weather: "\u96e8\u540e",
    material: "Light gray coated cloth / plastic handle",
    coordinates: { lat: 26.21452, lng: 127.68093 },
    image: "assets/photos/umbrella-placeholder-2.svg",
    note: "The sun was already back but the droplets had not left yet.",
  },
];

const state = {
  umbrellas: [],
  selectedId: null,
  weather: "all",
  query: "",
  map: null,
  markers: new Map(),
  googleReady: false,
  googleMapsApiKey: "",
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
  mapType: "roadmap",
  isFocusCameraAnimating: false,
  userMapInteractionPrimed: false,
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
  chips: document.querySelectorAll(".chip"),
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
  state.umbrellas = UMBRELLA_DATA;
  state.selectedId = null;

  initWelcomeTitleLayout();
  bindEvents();
  render();
  state.googleMapsApiKey = await loadGoogleMapsApiKey();
  await initGoogleMap();
  render();
  registerServiceWorker();
}

async function loadGoogleMapsApiKey() {
  try {
    const localConfig = await import("./config.local.js");
    return localConfig.GOOGLE_MAPS_API_KEY;
  } catch (error) {
    const publicConfig = await import("./config.js");
    return publicConfig.GOOGLE_MAPS_API_KEY;
  }
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
      state.weather = chip.dataset.weather;
      els.chips.forEach((item) => item.classList.toggle("is-active", item === chip));
      render();
    });
  });

  els.resetMap?.addEventListener("click", () => {
    state.weather = "all";
    state.query = "";
    state.selectedId = null;
    state.focusMarkerId = null;
    state.focusPositionedId = null;
    closeFocusMode();

    if (els.search) {
      els.search.value = "";
    }

    els.chips.forEach((chip) => chip.classList.toggle("is-active", chip.dataset.weather === "all"));
    render();
    fitMapToItems(filteredUmbrellas());
  });

  els.toggleList?.addEventListener("click", togglePanel);
  els.focusClose?.addEventListener("click", () => closeFocusMode({ resetZoom: true }));

  els.searchToggle?.addEventListener("click", () => {
    state.searchOpen = !state.searchOpen;
    syncSearchBox();
  });

  els.mapTypeToggle?.addEventListener("click", toggleMapType);

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
      const item = state.umbrellas.find((entry) => entry.title === markerElement?.getAttribute("title"));
      if (item) {
        selectUmbrella(item.id, { focus: true });
      }
    },
    true,
  );
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

    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=zh-CN&region=JP&loading=async&callback=${callbackName}`;
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
    const matchesWeather = state.weather === "all" || item.weather === state.weather;
    const haystack = [item.title, item.location, item.time, item.weather, item.material, item.note]
      .join(" ")
      .toLowerCase();
    return matchesWeather && haystack.includes(state.query);
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

  els.list.innerHTML = items
    .map(
      (item) => `
        <button class="location-button ${item.id === state.selectedId ? "is-active" : ""}" data-id="${item.id}" type="button">
          <img src="${item.image}" alt="${item.title}" />
          <span>
            <strong>${item.title}</strong>
            <span>${item.location}</span>
            <span>${formatListDate(item.time)} / ${item.weather}</span>
          </span>
        </button>
      `,
    )
    .join("");

  els.list.querySelectorAll(".location-button").forEach((button) => {
    button.addEventListener("click", () => selectUmbrella(button.dataset.id, { panMap: true }));
  });
}

function renderMapMarkers(items) {
  if (!state.googleReady) {
    return;
  }

  state.markers.forEach((marker) => marker.setMap(null));
  state.markers.clear();

  items.forEach((item) => {
    const marker = new google.maps.Marker({
      map: state.map,
      position: item.coordinates,
      title: item.title,
      icon: markerIcon(item.id === state.focusMarkerId),
    });

    marker.addListener("click", () => selectUmbrella(item.id, { focus: true }));
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

  els.focusImage.src = item.image;
  els.focusImage.alt = item.title;
  els.focusCaption.textContent = `${item.title} / ${item.location} / ${formatDateTime(item.time)}`;
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
      <img src="${item.image}" alt="${item.title}" />
      <div>
        <h3>${item.title}</h3>
        <p>${item.location}</p>
        <p>${formatDateTime(item.time)}</p>
      </div>
    </article>
  `;
}

function sortByTime(items, order) {
  return [...items].sort((a, b) => {
    const delta = new Date(a.time).getTime() - new Date(b.time).getTime();
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
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: formatter.format(date),
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
      } else {
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
  state.userMapInteractionPrimed = false;
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
  if (options.resetZoom && state.googleReady && item) {
    zoomToDefaultAroundMarker(item);
  }

  state.focusPositionedId = null;
  state.focusMarkerId = null;
  state.userMapInteractionPrimed = false;
  updateMarkerIcons();
  els.mapView.classList.remove("is-focus-mode");
  els.focusPanel?.setAttribute("aria-hidden", "true");
}

function dismissFocusAfterUserMapInteraction() {
  if (!els.mapView.classList.contains("is-focus-mode") || state.isFocusCameraAnimating) {
    return;
  }

  if (!state.userMapInteractionPrimed) {
    state.userMapInteractionPrimed = true;
    return;
  }

  closeFocusMode({ preserveCamera: true });
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
        state.userMapInteractionPrimed = true;
      }, 80);
    }
  };

  state.isFocusCameraAnimating = true;
  state.cameraAnimationFrame = requestAnimationFrame(step);
}

function getMarkerButtonScreenPoint(item) {
  if (!item?.title) {
    return null;
  }

  const escapedTitle = window.CSS?.escape ? CSS.escape(item.title) : item.title.replace(/"/g, '\\"');
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

function getFocusTargetScreenPoint() {
  const isMobile = window.matchMedia("(max-width: 820px)").matches;
  return {
    x: Math.round(window.innerWidth * (isMobile ? FOCUS_MARKER_SCREEN.xMobile : FOCUS_MARKER_SCREEN.xDesktop)),
    y: Math.round(window.innerHeight * (isMobile ? FOCUS_MARKER_SCREEN.yMobile : FOCUS_MARKER_SCREEN.yDesktop)),
  };
}

function fitMapToItems(items) {
  if (!state.googleReady || items.length === 0) {
    return;
  }

  if (items.length === 1) {
    state.map.setCenter(items[0].coordinates);
    state.map.setZoom(15);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  items.forEach((item) => bounds.extend(item.coordinates));
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
    fillColor: isActive ? "#2d6b68" : "#c54f35",
    fillOpacity: 1,
    strokeWeight: 0,
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
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js");
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
