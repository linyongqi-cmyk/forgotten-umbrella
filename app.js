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
  // Zoom the entry animation should settle on (usually DEFAULT_MAP_ZOOM, but the
  // 用户 task 2 fallback lands wider at CLUSTER_FALLBACK_ZOOM).
  entryTargetZoom: null,
  cameraAnimationFrame: null,
  projectionOverlay: null,
  archiveMode: "time",
  // Archive page has two scopes toggled from the big heading: own (Fieldwork) or
  // contributed. Replaces the old separate "Archive (contributed)" nav tab.
  archiveScope: "own",
  // Map sidebar list also has a Fieldwork/Contributed scope toggle (item 17).
  listScope: "own",
  archiveSubfilter: "all",
  archiveOrder: "desc",
  archiveCollapsedGroups: new Set(),
  // 統計 cross-tab: which dimension on each axis (#5). Default type × object (#3).
  statsX: "type",
  statsY: "object",
  statsScope: "own",
  // Contributed Archive (item 3): grid sort mode (submission/photo/location) or
  // the stats overview, plus the overview's own sort key/dir.
  contributedMode: "photo",
  contributedOrder: "desc",
  contribOverviewSortKey: "submitter",
  contribOverviewSortDir: "asc",
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
  // Map marker filter (item 6/15/16): which of the 4 colour categories show.
  markerFilter: { "own-title": true, own: true, "contrib-story": true, contrib: true },
  markerFilterOpen: false,
  // Map layers (T8): whole-category label/line on/off switches for the plain map.
  mapLayersOpen: false,
  mapCategoryState: null, // filled from defaults + localStorage on init (T8 dev tuning)
  // 模糊度 adjuster (v122 T1): live focus-blur params + panel state.
  blurAdjustOpen: false,
  blurSettings: null, // filled from defaults + localStorage lazily
  blurPreviewKind: null, // "normal" | "approx" while previewing, else null
  focusApproxLabelText: "",
  // Zoom the map had before the current focus opened — restored on exit (item 6).
  preFocusZoom: null,
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
  focusImageReadyFrame: 0,
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
const DEFAULT_MAP_ZOOM = 15;
// 用户 task 2: when the user is in Japan but their default-zoom screen shows no
// markers, we drop to this wider zoom over the nearest cluster of ≥3 markers.
const CLUSTER_FALLBACK_ZOOM = 11;
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
  contributedHeading: { ja: "アーカイブ（投稿）", en: "Archive (contributed)" },
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
  // Contributed-umbrella detail-page bits (投稿の傘の詳細ページ用).
  contributedBadge: { ja: "投稿", en: "Contributed" },
  submitterCredit: { ja: "投稿者", en: "Contributed by" },
  approxPrefix: { ja: "約 ", en: "approx. " },
  statsScopeOwn: { ja: "フィールド", en: "Fieldwork" },
  statsScopeContributed: { ja: "投稿", en: "Contributed" },
  // Submit 标签的 hover 提示（用户 4，日英双语）。
  submitTooltip: { ja: "Googleフォームから投稿", en: "Submit via Google Form" },
};

// 点 Submit 直接新标签打开的 Google 表单（用户 4：不再走内嵌页）。
const SUBMIT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdca3Q8kyjlI849oubzUUFnoco6Om5eX0stZW--pUDeH51VKw/viewform";

// Static UI labels in the HTML carry a data-i18n="key" attribute; applyLanguage
// swaps their text by language. Add a key here + the attribute in index.html.
const I18N = {
  sortBy: { ja: "並び替え", en: "Sort by" },
  sortTime: { ja: "時間", en: "Time" },
  sortType: { ja: "タイプ", en: "Type" },
  sortPlace: { ja: "場所", en: "Place" },
  statsTab: { ja: "統計", en: "Stats" },
  aboutStatLocations: { ja: "記録された地点", en: "Recorded locations" },
  aboutStatFieldwork: { ja: "フィールド数", en: "Fieldwork" },
  aboutStatSubmissions: { ja: "投稿数", en: "Submissions" },
  aboutStatSince: { ja: "記録開始", en: "Recording since" },
};

function applyLanguage() {
  document.documentElement.lang = state.lang;
  renderAbout();
  // Map sidebar list scope tabs (item 17): Fieldwork / Contributed.
  document.querySelectorAll("[data-list-scope] h2").forEach((heading) => {
    const tab = heading.closest("[data-list-scope]");
    heading.textContent =
      tab.dataset.listScope === "contributed"
        ? UI_TEXT.statsScopeContributed[state.lang]
        : UI_TEXT.statsScopeOwn[state.lang];
  });
  // Archive heading "Archive ( Fieldwork / Contributed )": only the two scope
  // words are clickable, the rest is fixed text (item 2).
  const prefix = document.querySelector(".archive-scope-prefix");
  const suffix = document.querySelector(".archive-scope-suffix");
  if (prefix) {
    prefix.textContent = state.lang === "ja" ? "アーカイブ（" : "Archive (";
  }
  if (suffix) {
    suffix.textContent = state.lang === "ja" ? "）" : ")";
  }
  document.querySelectorAll("[data-archive-scope]").forEach((tab) => {
    tab.textContent =
      tab.dataset.archiveScope === "contributed"
        ? UI_TEXT.statsScopeContributed[state.lang]
        : UI_TEXT.statsScopeOwn[state.lang];
  });
  // Swap every static labelled element (sidebar chips, archive controls, about
  // stats) to the current language.
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const entry = I18N[el.dataset.i18n];
    if (entry) {
      el.textContent = entry[state.lang] || entry.ja;
    }
  });
  // Submit 标签 hover 提示随语言切换（用户 4）。
  const submitTab = document.querySelector(".tab-submit");
  if (submitTab) {
    submitTab.title = UI_TEXT.submitTooltip[state.lang] || UI_TEXT.submitTooltip.ja;
  }
  // The map base / label toggle buttons set their own text — refresh it too.
  syncMapTypeButton();
  // Re-render everything that contains per-record bilingual text.
  render();
}

// Render the About page's two sections from data/texts.json (editable copy).
// Japanese justifies both edges; English stays left-aligned ([[text-justify-rule]]).
function renderAbout() {
  const root = document.getElementById("about-copy");
  if (!root) {
    return;
  }
  const about = TEXTS.about || {};
  const lang = state.lang;
  const justify = lang === "ja" ? " is-justify" : "";
  // 用户 5：把「記録の作法」(section2) 放到「観察のきっかけ」(section1) 前面。
  const sections = [about.section2, about.section1].filter(Boolean);
  root.innerHTML = sections
    .map((sec) => {
      const title = (lang === "ja" ? sec.titleJa : sec.titleEn) || sec.titleJa || "";
      const bodyArr = lang === "ja" ? sec.bodyJa : sec.bodyEn?.length ? sec.bodyEn : sec.bodyJa;
      const bodyHtml = (bodyArr || [])
        .map((p) => String(p).trim())
        .filter(Boolean)
        .map((p) => `<p class="about-para${justify}">${escapeHtml(p)}</p>`)
        .join("");
      return `<section class="about-section">
          ${title ? `<h3 class="about-section-title">${escapeHtml(title)}</h3>` : ""}
          ${bodyHtml}
        </section>`;
    })
    .join("");
  renderLegend();
}

// Map legend on the About page: the 4 marker colours + their meaning (item 15).
// Labels are always English to match the rest of the legend/overview (item 9).
function renderLegend() {
  const root = document.getElementById("about-legend");
  if (!root) {
    return;
  }
  const heading = state.lang === "ja" ? "地図の凡例" : "Map legend";
  root.innerHTML =
    `<h3 class="about-legend-title">${heading}</h3>` +
    MARKER_CATEGORIES.map(
      (cat) =>
        `<div class="about-legend-row"><span class="about-legend-swatch" style="background:${MARKER_COLORS[cat]}"></span><span>${escapeHtml(markerLabel(cat))}</span></div>`,
    ).join("");
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
  focusApproxLabel: document.querySelector("#focus-approx-label"),
  focusPanel: document.querySelector("#focus-image-panel"),
  focusImage: document.querySelector("#focus-image"),
  focusExpandedVideo: document.querySelector("#focus-expanded-video"),
  focusScroll: document.querySelector("#focus-scroll"),
  focusScrollHint: document.querySelector("#focus-scroll-hint"),
  focusZoomHint: document.querySelector("#focus-zoom-hint"),
  focusCaption: document.querySelector("#focus-caption"),
  focusInfoBlock: document.querySelector("#focus-info-block"),
  focusHeader: document.querySelector("#focus-header"),
  focusClose: document.querySelector("#focus-close"),
  focusThumbs: document.querySelector("#focus-thumbs"),
  focusExpandedCaption: document.querySelector("#focus-expanded-caption"),
  focusHiresBar: document.querySelector("#focus-hires-bar"),
  focusLink: document.querySelector("#focus-link"),
  archiveContent: document.querySelector("#archive-content"),
  contributedContent: document.querySelector("#contributed-content"),
  archiveOwnToolbar: document.querySelector("#archive-own-toolbar"),
  archiveScopeTabs: document.querySelectorAll("[data-archive-scope]"),
  listScopeTabs: document.querySelectorAll("[data-list-scope]"),
  resultCount: document.querySelector("#result-count"),
  resetMap: document.querySelector("#reset-map"),
  mapTypeToggle: document.querySelector("#map-type-toggle"),
  mapTypeIco: document.querySelector(".map-type-ico"),
  locateMe: document.querySelector("#locate-me"),
  mapFilter: document.querySelector("#map-filter"),
  mapFilterToggle: document.querySelector("#map-filter-toggle"),
  mapFilterPanel: document.querySelector("#map-filter-panel"),
  mapLayers: document.querySelector("#map-layers"),
  mapLayersToggle: document.querySelector("#map-layers-toggle"),
  mapLayersPanel: document.querySelector("#map-layers-panel"),
  blurAdjustToggle: document.querySelector("#blur-adjust-toggle"),
  blurAdjustPanel: document.querySelector("#blur-adjust-panel"),
  statCount: document.querySelector("#stat-count"),
  statFieldwork: document.querySelector("#stat-fieldwork"),
  statSubmissions: document.querySelector("#stat-submissions"),
  mapView: document.querySelector("#map-view"),
  toggleList: document.querySelector("#toggle-list"),
  archiveModeControls: document.querySelectorAll("[data-archive-mode]"),
  archiveSecondary: document.querySelector("#archive-secondary-row"),
  archiveOrderToggle: document.querySelector("#archive-order-toggle"),
  languageSwitcher: document.querySelector(".language-switcher"),
  languageToggle: document.querySelector("#language-toggle"),
  languageMenu: document.querySelector("#language-menu"),
  topbar: document.querySelector(".topbar"),
  navToggle: document.querySelector("#nav-toggle"),
};

// The editor only ever exists on the local machine. On the published
// (GitHub Pages) site this is false, so none of the editor UI is created and
// visitors never see an entry point.
const IS_LOCAL = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname);

init();

async function init() {
  state.lang = getStoredLang();
  // Must run after an await so the MAP_LAYER_CATEGORIES const (defined lower in
  // the module) is past its temporal dead zone.
  state.umbrellas = await loadUmbrellaData();
  SITE_SETTINGS = await loadSiteSettings();
  state.mapCategoryState = loadMapCategoryState();
  TEXTS = await loadTexts();
  THEME = await loadTheme();
  applyTheme(THEME);
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
// The About page's two editable sections (titles + body paragraphs, bilingual).
function emptyAboutSection() {
  return { titleJa: "", titleEn: "", bodyJa: [], bodyEn: [] };
}
function emptyAbout() {
  return { section1: emptyAboutSection(), section2: emptyAboutSection() };
}
function normalizeAboutSection(raw) {
  return {
    titleJa: String(raw?.titleJa || ""),
    titleEn: String(raw?.titleEn || ""),
    bodyJa: Array.isArray(raw?.bodyJa) ? raw.bodyJa.map((p) => String(p || "")) : [],
    bodyEn: Array.isArray(raw?.bodyEn) ? raw.bodyEn.map((p) => String(p || "")) : [],
  };
}

let TEXTS = { statsIntro: { ja: "", en: "" }, typeDescriptions: {}, about: emptyAbout() };

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
      about: {
        section1: normalizeAboutSection(raw?.about?.section1),
        section2: normalizeAboutSection(raw?.about?.section2),
      },
    };
  } catch (error) {
    console.error(error);
    return { statsIntro: { ja: "", en: "" }, typeDescriptions: {}, about: emptyAbout() };
  }
}

// 可调设定的「真源」（data/site-settings.json）：聚焦模糊参数 + 三张地图的文字筛选。
// 前端启动读它当默认值（线上/别人打开就是这套）；本机在面板上调完会自动写回这个文件
// （见 persistSiteSettings），所以调完 push 就上线，不用再手动导 localStorage。
// null = 还没加载/加载失败，此时回退到代码里写死的 def（BLUR_PARAMS.def / hard*Set）。
let SITE_SETTINGS = null;

async function loadSiteSettings() {
  try {
    const response = await fetch("data/site-settings.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load data/site-settings.json: ${response.status}`);
    }
    const raw = await response.json();
    const blur = raw && typeof raw.blur === "object" ? raw.blur : null;
    const mapLayers = raw && typeof raw.mapLayers === "object" ? raw.mapLayers : null;
    return { blur, mapLayers };
  } catch (error) {
    console.error(error);
    return null;
  }
}

// 视觉主题设定（data/theme.json）：图标线宽 + 详情页正文字号/行距。前端启动读它当默认
// （线上/别人打开就是这套）；本机在「视觉设定」面板调完写回该文件，push 就上线。
// 只 3 个数值，带范围钳制，避免面板传来异常值把界面调坏。
// v154：详情页正文按 4 类分别调（字号/行距/字重）+ 图标线宽。旧的 detailBodySize/Line
// 已拆成 overlay/dialogue/para 三套；ID 单独一套。旧字段若还留在 theme.json 里会被忽略。
const THEME_DEFAULTS = {
  iconStroke: 1.8,
  overlaySize: 13, overlayLine: 1.45, overlayWeight: 400,
  dialogueSize: 13, dialogueLine: 1.45, dialogueWeight: 400,
  paraSize: 13, paraLine: 1.45, paraWeight: 400,
  idSize: 20, idLine: 1.2, idWeight: 600,
};
const SIZE_RANGE = { min: 10, max: 24, step: 1 };
const LINE_RANGE = { min: 1, max: 2.2, step: 0.05 };
const WEIGHT_RANGE = { min: 300, max: 700, step: 100 };
const THEME_RANGES = {
  iconStroke: { min: 1, max: 3, step: 0.1 },
  overlaySize: SIZE_RANGE, overlayLine: LINE_RANGE, overlayWeight: WEIGHT_RANGE,
  dialogueSize: SIZE_RANGE, dialogueLine: LINE_RANGE, dialogueWeight: WEIGHT_RANGE,
  paraSize: SIZE_RANGE, paraLine: LINE_RANGE, paraWeight: WEIGHT_RANGE,
  idSize: { min: 12, max: 32, step: 1 }, idLine: LINE_RANGE, idWeight: { min: 300, max: 800, step: 100 },
};
let THEME = { ...THEME_DEFAULTS };

function clampThemeValue(key, value) {
  const r = THEME_RANGES[key];
  const n = Number(value);
  if (!r || !Number.isFinite(n)) {
    return THEME_DEFAULTS[key];
  }
  return Math.min(Math.max(n, r.min), r.max);
}

function sanitizeTheme(raw) {
  const out = { ...THEME_DEFAULTS };
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(THEME_DEFAULTS)) {
      if (raw[key] !== undefined) {
        out[key] = clampThemeValue(key, raw[key]);
      }
    }
  }
  return out;
}

async function loadTheme() {
  try {
    const response = await fetch("data/theme.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load data/theme.json: ${response.status}`);
    }
    return sanitizeTheme(await response.json());
  } catch (error) {
    console.error(error);
    return { ...THEME_DEFAULTS };
  }
}

// 把主题写进 :root 的 CSS 变量（全站图标线宽 + 详情页正文字号/行距实时生效）。
function applyTheme(theme) {
  const t = sanitizeTheme(theme);
  const root = document.documentElement.style;
  root.setProperty("--icon-stroke", String(t.iconStroke));
  root.setProperty("--detail-overlay-size", `${t.overlaySize}px`);
  root.setProperty("--detail-overlay-line", String(t.overlayLine));
  root.setProperty("--detail-overlay-weight", String(t.overlayWeight));
  root.setProperty("--detail-dialogue-size", `${t.dialogueSize}px`);
  root.setProperty("--detail-dialogue-line", String(t.dialogueLine));
  root.setProperty("--detail-dialogue-weight", String(t.dialogueWeight));
  root.setProperty("--detail-para-size", `${t.paraSize}px`);
  root.setProperty("--detail-para-line", String(t.paraLine));
  root.setProperty("--detail-para-weight", String(t.paraWeight));
  root.setProperty("--detail-id-size", `${t.idSize}px`);
  root.setProperty("--detail-id-line", String(t.idLine));
  root.setProperty("--detail-id-weight", String(t.idWeight));
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
      // Count=unknown: we can't describe individual umbrellas. The object/state
      // ROWS are hidden entirely on the detail page (用户要求：数量 unknown 时详情页
      // 不显示 object/state) by leaving their line arrays empty; the *Text values
      // stay "unknown" so search still matches. Otherwise build from units.
      const objectText = umbrellaCount === "unknown" ? "unknown" : buildObjectText(umbrellaCount, umbrellaUnits);
      const objectLines = umbrellaCount === "unknown" ? [] : buildObjectGroups(umbrellaCount, umbrellaUnits);
      const statusText = umbrellaCount === "unknown" ? "unknown" : statusTextFromUnits(umbrellaUnits);
      const statusLines = umbrellaCount === "unknown" ? [] : statusLinesFromUnits(umbrellaUnits);
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
          original: item.imageOriginal || item.image,
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
    // 原图（放大后渐进式加载替换 src）。缺失则退回 src（视频/无生成物时）。
    original: entry.original || item.imageOriginal || entry.src || item.image,
    role: entry.role || (index === 0 ? "primary" : "detail"),
    title: entry.title || "",
    photoTime: entry.photoTime || "",
    story: entry.story || "",
    // 用户 #8: carry the non-destructive crop through so the public detail page,
    // the cover and the lightbox can all show the cropped region (was dropped here,
    // which is why crop only ever showed in the editor's live preview).
    crop: entry.crop || null,
    // 每张图的天气 + 是否显示（否则前端拿不到，主图横轴/补充图单图例都出不来）。
    weather: entry.weather || null,
    showWeather:
      typeof entry.showWeather === "boolean"
        ? entry.showWeather
        : (entry.role || (index === 0 ? "primary" : "detail")) === "primary",
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
  // Default landing view is the map (see #map-view.is-active in markup).
  document.body.classList.add("view-map");
  initWelcomeCrosshair();
  syncPanelToggleLabels();
  syncArchiveControls();
  syncListControls(filteredUmbrellas());
  syncSearchBox();

  // 手机汉堡菜单：开/关顶栏 view-tabs 面板（桌面 .nav-toggle 不显示，这段等于没用）。
  const closeNavMenu = () => {
    if (!els.topbar?.classList.contains("is-nav-open")) {
      return;
    }
    els.topbar.classList.remove("is-nav-open");
    els.navToggle?.setAttribute("aria-expanded", "false");
  };
  els.navToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !els.topbar.classList.contains("is-nav-open");
    els.topbar.classList.toggle("is-nav-open", open);
    els.navToggle.setAttribute("aria-expanded", String(open));
  });
  // 点菜单外面收起（选了 tab / 语言由各自的 click 收起）。
  document.addEventListener("click", (event) => {
    if (els.topbar?.classList.contains("is-nav-open") && !els.topbar.contains(event.target)) {
      closeNavMenu();
    }
  });
  // Esc 收起。
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeNavMenu();
    }
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // 选了入口就收起汉堡菜单（Submit 会开新标签，也一样收起）。
      closeNavMenu();
      const view = tab.dataset.view;
      if (!view) {
        return;
      }

      // Submit 不是一个页面：直接新标签打开 Google 表单，不切换当前视图（用户 4）。
      if (view === "submit") {
        window.open(SUBMIT_FORM_URL, "_blank", "noopener");
        return;
      }

      // Switching views from an open detail page closes it first (#4).
      if (els.mapView?.classList.contains("is-focus-mode")) {
        closeFocusMode({ resetZoom: false });
      }

      els.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      els.views.forEach((section) => section.classList.toggle("is-active", section.id === `${view}-view`));
      document.body.classList.toggle("view-map", view === "map");

      if (view === "map" && state.googleReady) {
        setTimeout(() => google.maps.event.trigger(state.map, "resize"), 80);
      }
    });
  });

  // Archive page heading toggle: switch between own (Fieldwork) and contributed
  // overviews in place — same page, same look (item 2).
  els.archiveScopeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.archiveScope = tab.dataset.archiveScope === "contributed" ? "contributed" : "own";
      syncArchiveScope();
      render();
    });
  });

  // Map sidebar list scope toggle (item 17): Fieldwork / Contributed.
  els.listScopeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.listScope = tab.dataset.listScope === "contributed" ? "contributed" : "own";
      render();
    });
  });

  // Map marker filter (item 6/15/16): one button expands a panel of 4 colour
  // toggles that show/hide each marker category on the map.
  els.mapFilterToggle?.addEventListener("click", () => {
    state.markerFilterOpen = !state.markerFilterOpen;
    syncMarkerFilter();
  });
  els.mapFilterPanel?.addEventListener("click", (event) => {
    const row = event.target.closest?.("[data-marker-cat]");
    if (!row) {
      return;
    }
    const cat = row.dataset.markerCat;
    state.markerFilter[cat] = !state.markerFilter[cat];
    syncMarkerFilter();
    renderMapMarkers(filteredUmbrellas());
  });
  syncMarkerFilter();

  // Map layers (T8 dev tuning): one button (edit mode only) expands a panel of
  // per-category 自動/表示/淡化/隠す cycle + zoom threshold, for both maps.
  els.mapLayersToggle?.addEventListener("click", () => {
    state.mapLayersOpen = !state.mapLayersOpen;
    syncMapLayers();
  });
  // 用户 T7: pick a category's visibility from a row of 4 single-select buttons
  // (自動/表示/淡化/隠す) instead of cycling one button.
  els.mapLayersPanel?.addEventListener("click", (event) => {
    const seg = event.target.closest?.("[data-map-set]");
    if (!seg) {
      return;
    }
    const key = seg.dataset.mapSet;
    const vis = seg.dataset.mapVis;
    if (!MAP_VIS_CYCLE.includes(vis)) {
      return;
    }
    const set = activeMapCategoryState();
    const cur = set[key] || { vis: "auto", zoom: "" };
    set[key] = { ...cur, vis };
    saveMapCategoryState();
    syncMapLayers();
    applyMapCategoryStyles();
  });
  // Per-category zoom threshold inputs (用户 #4: min = show from this zoom, max =
  // hide again past this zoom; blank = no limit on that side).
  els.mapLayersPanel?.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-map-zoom], [data-map-zoom-max]");
    if (!input) {
      return;
    }
    const isMax = input.dataset.mapZoomMax != null;
    const key = isMax ? input.dataset.mapZoomMax : input.dataset.mapZoom;
    const set = activeMapCategoryState();
    const cur = set[key] || { vis: "auto", zoom: "", zoomMax: "" };
    const v = input.value.trim();
    const num = v === "" ? "" : Number(v);
    set[key] = isMax ? { ...cur, zoomMax: num } : { ...cur, zoom: num };
    saveMapCategoryState();
    applyMapCategoryStyles();
  });
  syncMapLayers();

  // 用户 T1 (v123): a 模糊度 adjuster that is available outside edit mode too.
  // Opening the panel shows a live preview immediately; when a detail point is
  // already open the sliders tune the real focus overlay in place.
  els.blurAdjustToggle?.addEventListener("click", () => {
    state.blurAdjustOpen = !state.blurAdjustOpen;
    if (!state.blurAdjustOpen) {
      stopBlurPreview();
    }
    syncBlurAdjust();
  });
  els.blurAdjustPanel?.addEventListener("input", (event) => {
    const slider = event.target.closest?.("[data-blur-key]");
    if (!slider) {
      return;
    }
    const key = slider.dataset.blurKey;
    state.blurSettings[key] = Number(slider.value);
    if (!els.mapView?.classList.contains("is-focus-mode")) {
      const param = BLUR_PARAM_BY_KEY[key];
      startBlurPreview(param?.group === "normal" ? "normal" : "approx");
    }
    applyBlurSettings();
    saveBlurSettings();
    const out = els.blurAdjustPanel.querySelector(`[data-blur-out="${key}"]`);
    if (out) {
      out.textContent = formatBlurValue(key, Number(slider.value));
    }
  });
  els.blurAdjustPanel?.addEventListener("click", (event) => {
    const preview = event.target.closest?.("[data-blur-preview]");
    if (preview) {
      if (els.mapView?.classList.contains("is-focus-mode")) {
        return;
      }
      startBlurPreview(preview.dataset.blurPreview);
      return;
    }
    if (event.target.closest?.("[data-blur-stop]")) {
      stopBlurPreview();
      return;
    }
    if (event.target.closest?.("[data-blur-reset]")) {
      resetBlurSettings();
    }
  });
  applyBlurSettings();
  syncBlurAdjust();

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
  // Magnifier hint (用户 #5): same action as clicking the photo — enlarge it.
  els.focusZoomHint?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!state.imageExpanded) {
      openExpandedImage();
    }
  });
  els.focusImage?.addEventListener("load", () => {
    if (state.imageExpanded) {
      setExpandedImageFrame();
      updateExpandedImageTransform();
    } else {
      finalizeFocusImageLoad();
    }
  });
  // Keep the scroll hint in sync as the user scrolls the detail content (#5).
  els.focusScroll?.addEventListener("scroll", updateFocusScrollHint, { passive: true });
  // #9: once the enlarged video knows its dimensions, size the lightbox box to it.
  els.focusExpandedVideo?.addEventListener("loadedmetadata", () => {
    if (state.imageExpanded && !els.focusExpandedVideo.hidden) {
      setExpandedImageFrame();
      els.focusPanel?.classList.remove("is-media-sizing"); // #3: reveal once sized
    }
  });
  els.focusImage?.addEventListener("pointerdown", startExpandedImageDrag);
  document.addEventListener("pointermove", dragExpandedImage);
  document.addEventListener("pointerup", stopExpandedImageDrag);
  els.focusPanel?.addEventListener("click", (event) => event.stopPropagation());
  els.focusClose?.addEventListener("click", () => closeFocusMode({ resetZoom: true }));
  els.focusLink?.addEventListener("click", (event) => {
    const anchor = event.target.closest?.("[data-link-id]");
    if (!anchor) {
      return;
    }
    event.preventDefault();
    const targetId = anchor.dataset.linkId;
    if (targetId) {
      selectUmbrella(targetId, { focus: true });
    }
  });
  els.focusBlur?.addEventListener("click", () => {
    // A swipe just switched images — don't also treat it as a close click.
    if (state.blurSwiped) {
      state.blurSwiped = false;
      return;
    }
    if (state.imageExpanded) {
      closeExpandedImage(true);
    }
  });
  els.focusPanel?.addEventListener("wheel", handleExpandedImageWheel, { passive: false });
  // Click a supplement/detail photo (or its magnifier hint) in the article to
  // enlarge it (#1/#12); click a video's big play button to start it muted (#7).
  els.focusCaption?.addEventListener("click", (event) => {
    const playBtn = event.target.closest?.(".focus-video-play");
    if (playBtn) {
      const fig = playBtn.closest(".focus-video-fig");
      const video = fig?.querySelector("video");
      if (video) {
        // Other videos stop; this one plays (muted — user unmutes via controls #7).
        pauseFocusVideos();
        fig.classList.add("is-playing");
        video.controls = true;
        video.play?.();
      }
      return;
    }
    const zoomTarget = event.target.closest?.("img[data-expandable], .focus-photo-zoom");
    if (!zoomTarget) {
      return;
    }
    const file = zoomTarget.getAttribute("data-media-file");
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

  els.mapTypeToggle?.addEventListener("click", cycleMapType);
  els.locateMe?.addEventListener("click", goToMyLocation);

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
    // 統計 scope toggle: 自己拍的 / 投稿 — switch which stat set is shown.
    const scopeBtn = event.target.closest?.("[data-stats-scope]");
    if (scopeBtn) {
      state.statsScope = scopeBtn.dataset.statsScope === "contributed" ? "contributed" : "own";
      state.overviewMenuOpen = null;
      renderArchive();
      return;
    }
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

  // Contributed Archive (item 3): toolbar switches grid sort mode / stats; the
  // overview headers sort (contributor = reset to default); ✎ opens the editor;
  // double-clicking a card or a contributor cell jumps to the map detail.
  els.contributedContent?.addEventListener("click", (event) => {
    const modeBtn = event.target.closest?.("[data-contrib-mode]");
    if (modeBtn) {
      const m = modeBtn.dataset.contribMode;
      if (m === state.contributedMode && m !== "stats") {
        state.contributedOrder = state.contributedOrder === "asc" ? "desc" : "asc";
      } else {
        state.contributedMode = m;
        if (m !== "stats") {
          state.contributedOrder = m === "location" ? "asc" : "desc";
        }
      }
      renderContributedArchive();
      return;
    }
    const ovSort = event.target.closest?.("[data-contrib-overview-sort]");
    if (ovSort) {
      const k = ovSort.dataset.contribOverviewSort;
      // Every header (contributor included) toggles direction when already
      // active, so contributor can be reversed too (item 3).
      if (state.contribOverviewSortKey === k) {
        state.contribOverviewSortDir = state.contribOverviewSortDir === "asc" ? "desc" : "asc";
      } else {
        state.contribOverviewSortKey = k;
        state.contribOverviewSortDir = "asc";
      }
      renderContributedArchive();
      return;
    }
    const editBtn = event.target.closest?.("[data-card-edit]");
    if (editBtn) {
      event.stopPropagation();
      const card = editBtn.closest(".photo-card");
      if (card?.dataset.id && IS_LOCAL && typeof editor !== "undefined" && editor.root) {
        openEditor(card.dataset.id);
      }
    }
  });
  els.contributedContent?.addEventListener("dblclick", (event) => {
    const card = event.target.closest?.(".photo-card");
    if (card?.dataset.id) {
      jumpToMapLocation(card.dataset.id);
      return;
    }
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
      closeExpandedImage(true);
      return;
    }

    // Local editor (item 7): ESC peels back one layer at a time —
    // create popup → open record editor (with unsaved-changes prompt) → edit
    // mode. So ESC inside a record editor only closes that record; press again
    // to leave edit mode.
    if (IS_LOCAL && typeof editor !== "undefined" && editor.root) {
      if (editor.createDialog && !editor.createDialog.hidden) {
        closeCreateDialog();
        return;
      }
      if (state.editingId) {
        closeEditor();
        return;
      }
      if (state.editMode) {
        toggleEditMode();
        return;
      }
    }

    if (els.mapView.classList.contains("is-focus-mode")) {
      closeFocusMode({ resetZoom: true });
      return;
    }

    // ESC also closes the expanded map sidebar list (item 17).
    if (els.mapView && !els.mapView.classList.contains("is-list-collapsed")) {
      collapseListPanel();
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

// Show the own (Fieldwork) toolbar + grid for scope "own", or the contributed
// overview table for scope "contributed". Same Archive page, toggled by heading.
function syncArchiveScope() {
  const contributed = state.archiveScope === "contributed";
  els.archiveScopeTabs.forEach((tab) => {
    tab.classList.toggle("is-active", (tab.dataset.archiveScope === "contributed") === contributed);
  });
  if (els.archiveOwnToolbar) {
    els.archiveOwnToolbar.hidden = contributed;
  }
  if (els.archiveContent) {
    els.archiveContent.hidden = contributed;
  }
  if (els.contributedContent) {
    els.contributedContent.hidden = !contributed;
  }
}

// Render the marker-filter panel (4 colour rows, each a show/hide toggle) and
// open/close it (item 6/15/16).
function syncMarkerFilter() {
  if (els.mapFilterToggle) {
    els.mapFilterToggle.setAttribute("aria-expanded", String(state.markerFilterOpen));
    els.mapFilterToggle.classList.toggle("is-active", state.markerFilterOpen);
  }
  if (!els.mapFilterPanel) {
    return;
  }
  els.mapFilterPanel.hidden = !state.markerFilterOpen;
  els.mapFilterPanel.innerHTML = MARKER_CATEGORIES.map((cat) => {
    const on = state.markerFilter[cat] !== false;
    return `<button type="button" class="map-filter-row${on ? " is-on" : ""}" data-marker-cat="${cat}">
        <span class="map-filter-swatch" style="background:${MARKER_COLORS[cat]}"></span>
        <span class="map-filter-label">${escapeHtml(markerLabel(cat))}</span>
      </button>`;
  }).join("");
}

// Render the map-layers panel (T8): a per-category 自動/表示/淡化/隠す cycle + zoom
// threshold. Available on both maps in edit mode; it edits the set for whichever map
// is currently showing (普通/卫星 分开两套), shown in the panel header.
function syncMapLayers() {
  const show = Boolean(state.editMode);
  if (els.mapLayers) {
    els.mapLayers.hidden = !show;
  }
  if (!show) {
    state.mapLayersOpen = false;
  }
  if (els.mapLayersToggle) {
    els.mapLayersToggle.setAttribute("aria-expanded", String(state.mapLayersOpen));
    els.mapLayersToggle.classList.toggle("is-active", state.mapLayersOpen);
    const hint = state.lang === "ja" ? "地図の表示調整（編集用）" : "Map style tuning (edit)";
    els.mapLayersToggle.setAttribute("aria-label", hint);
    els.mapLayersToggle.setAttribute("title", hint);
  }
  if (!els.mapLayersPanel) {
    return;
  }
  els.mapLayersPanel.hidden = !state.mapLayersOpen;
  if (!state.mapLayersOpen || !state.mapCategoryState) {
    return;
  }
  const set = activeMapCategoryState();
  // Header tells you WHICH set you're editing — 普通/卫星1(文字なし)/卫星2(文字あり) —
  // since all three are independent (用户 T6/T7).
  const key = activeMapBaseKey();
  const mapName = {
    roadmap: state.lang === "ja" ? "普通地図" : "Plain map",
    sat1: state.lang === "ja" ? "衛星①（文字なし）" : "Satellite 1 (no labels)",
    sat2: state.lang === "ja" ? "衛星②（文字あり）" : "Satellite 2 (labels)",
  }[key];
  const heading = state.lang === "ja" ? `表示調整：${mapName}` : `Tuning: ${mapName}`;
  const headerHtml = `<div class="map-layer-head">${escapeHtml(heading)}</div>`;
  // 用户 #4: TWO zoom thresholds per category — visible from `zoom` (ズーム≥min で
  // 表示) up to `zoomMax` (max を超えたら再び非表示). Blank = no limit on that side.
  const zMinPlaceholder = state.lang === "ja" ? "から" : "min";
  const zMaxPlaceholder = state.lang === "ja" ? "まで" : "max";
  const zMinHint = state.lang === "ja" ? "このズーム以上で表示（空欄=制限なし）" : "Visible from this zoom (blank = no limit)";
  const zMaxHint = state.lang === "ja" ? "このズームを超えたら隠す（空欄=制限なし）" : "Hidden past this zoom (blank = no limit)";
  // 用户 T7: each category shows a ROW of 4 single-select buttons (自動/表示/淡化/隠す)
  // instead of one cycling button.
  els.mapLayersPanel.innerHTML = headerHtml + MAP_LAYER_CATEGORIES.map((c) => {
    const s = set[c.key] || { vis: "auto", zoom: "", zoomMax: "" };
    const label = c.labels[state.lang] || c.labels.en;
    const segs = MAP_VIS_CYCLE.map((v) => {
      const vLabel = (MAP_VIS_LABELS[v] || MAP_VIS_LABELS.auto)[state.lang];
      const active = s.vis === v ? " is-active" : "";
      return `<button type="button" class="map-layer-seg${active}" data-map-set="${c.key}" data-map-vis="${v}">${escapeHtml(vLabel)}</button>`;
    }).join("");
    const zVal = (z) => (z === "" || z == null ? "" : z);
    return `<div class="map-layer-row" data-vis="${s.vis}">
        <span class="map-layer-name">${escapeHtml(label)}</span>
        <div class="map-layer-segs">${segs}</div>
        <input type="number" class="map-layer-zoom" data-map-zoom="${c.key}" min="1" max="22" step="1" placeholder="${zMinPlaceholder}" title="${zMinHint}" value="${zVal(s.zoom)}" />
        <input type="number" class="map-layer-zoom" data-map-zoom-max="${c.key}" min="1" max="22" step="1" placeholder="${zMaxPlaceholder}" title="${zMaxHint}" value="${zVal(s.zoomMax)}" />
      </div>`;
  }).join("");
}

// ---- 模糊度 adjuster (v122 用户 T1) ------------------------------------------
// Live sliders (edit mode) for the focus-blur of both marker kinds. Each slider
// writes a CSS variable on :root; the .focus-blur overlay reads them, so the change
// is instant. Values persist in localStorage. A 预览 button flips the overlay on
// (without opening a detail page) so the user can watch while dragging.
const BLUR_SETTINGS_KEY = "fu-blur-settings";
const BLUR_PARAMS = [
  // def 值 = 用户 2026-07-03 本机调好后固化上线的默认（原型期本地调、读出来写进代码）。
  { key: "blurN", cssVar: "--fb-blur-n", group: "normal", label: "模糊强度", min: 0, max: 16, step: 0.5, unit: "px", def: 6 },
  { key: "radiusN", cssVar: "--fb-radius-n", group: "normal", label: "清晰圈半径", min: 40, max: 420, step: 2, unit: "px", def: 136 },
  { key: "featherN", cssVar: "--fb-feather-n", group: "normal", label: "边缘羽化", min: 0, max: 140, step: 2, unit: "px", def: 36 },
  { key: "blurA", cssVar: "--fb-blur-a", group: "approx", label: "模糊强度", min: 0, max: 16, step: 0.5, unit: "px", def: 6 },
  { key: "radiusA", cssVar: "--fb-radius-a", group: "approx", label: "白雾圈半径", min: 40, max: 420, step: 2, unit: "px", def: 126 },
  { key: "featherA", cssVar: "--fb-feather-a", group: "approx", label: "边缘羽化", min: 0, max: 180, step: 2, unit: "px", def: 138 },
  { key: "veilA", cssVar: "--fb-veil-a", group: "approx", label: "中心白雾浓度", min: 0, max: 0.8, step: 0.02, unit: "", def: 0.3 },
  { key: "labelDistanceA", cssVar: "--fb-label-distance-a", group: "label", label: "文字距离中心", min: -600, max: 600, step: 5, unit: "px", def: 260 },
  { key: "labelRotateA", cssVar: "--fb-label-rotate-a", group: "label", label: "文字旋转角度", min: -180, max: 180, step: 1, unit: "deg", def: -135 },
];
const BLUR_PARAM_BY_KEY = Object.fromEntries(BLUR_PARAMS.map((p) => [p.key, p]));

function defaultBlurSettings() {
  const out = {};
  BLUR_PARAMS.forEach((p) => {
    // data/site-settings.json 里的值优先（本机调完写回的线上默认）；没有才用代码 def。
    const fromFile = SITE_SETTINGS?.blur?.[p.key];
    out[p.key] = Number.isFinite(Number(fromFile)) ? Number(fromFile) : p.def;
  });
  return out;
}

function loadBlurSettings() {
  const out = defaultBlurSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(BLUR_SETTINGS_KEY) || "{}");
    BLUR_PARAMS.forEach((p) => {
      if (Number.isFinite(Number(saved[p.key]))) {
        out[p.key] = Number(saved[p.key]);
      }
    });
  } catch {
    /* ignore corrupt storage */
  }
  return out;
}

function saveBlurSettings() {
  try {
    localStorage.setItem(BLUR_SETTINGS_KEY, JSON.stringify(state.blurSettings));
  } catch {
    /* ignore */
  }
  persistSiteSettings();
}

// 把当前「模糊参数 + 三张地图文字筛选」防抖写回 data/site-settings.json（真源），这样
// 本机在面板上调完就自动进文件、push 即上线。只在本机 + 后端可用时生效；线上没有 /api，
// 会自动跳过（面板本来就只在本机出现）。防抖 600ms，避免拖滑块时每一帧都写盘。
let siteSettingsSaveTimer = null;
function persistSiteSettings() {
  if (!IS_LOCAL) {
    return;
  }
  clearTimeout(siteSettingsSaveTimer);
  siteSettingsSaveTimer = setTimeout(() => {
    const payload = {
      blur: state.blurSettings || defaultBlurSettings(),
      mapLayers: state.mapCategoryState || undefined,
    };
    apiPost("/api/save-site-settings", payload).catch((error) => {
      console.error("save-site-settings failed", error);
    });
  }, 600);
}

function formatBlurValue(key, value) {
  const p = BLUR_PARAM_BY_KEY[key];
  return p && p.unit ? `${value}${p.unit}` : String(value);
}

// Push the current settings onto :root as CSS variables (so .focus-blur updates).
function applyBlurSettings() {
  if (!state.blurSettings) {
    state.blurSettings = loadBlurSettings();
  }
  BLUR_PARAMS.forEach((p) => {
    const v = state.blurSettings[p.key];
    document.documentElement.style.setProperty(p.cssVar, p.unit ? `${v}${p.unit}` : String(v));
  });
  updateFocusApproxLabelGeometry();
}

function resetBlurSettings() {
  state.blurSettings = defaultBlurSettings();
  applyBlurSettings();
  saveBlurSettings();
  renderBlurAdjust();
}

function focusApproxLabelTextForPreview() {
  return state.lang === "ja" ? "模糊標点" : "blur marker";
}

function renderFocusApproxLabel(text, { pending = false, preview = false } = {}) {
  if (!els.focusApproxLabel) {
    return;
  }
  const label = String(text || "").trim();
  state.focusApproxLabelText = label;
  if (!label) {
    els.focusApproxLabel.hidden = true;
    els.focusApproxLabel.innerHTML = "";
    return;
  }
  els.focusApproxLabel.hidden = false;
  els.focusApproxLabel.classList.toggle("is-pending", Boolean(pending));
  els.focusApproxLabel.classList.toggle("is-preview", Boolean(preview));
  els.focusApproxLabel.innerHTML = `
    <svg class="focus-approx-label-svg" viewBox="-640 -640 1280 1280" aria-hidden="true" focusable="false">
      <defs><path id="focus-approx-label-path" /></defs>
      <text class="focus-approx-label-text">
        <textPath href="#focus-approx-label-path" startOffset="50%">◌ ${escapeHtml(label)}</textPath>
      </text>
    </svg>`;
  updateFocusApproxLabelGeometry();
}

function updateFocusApproxLabelGeometry() {
  if (!els.focusApproxLabel || els.focusApproxLabel.hidden) {
    return;
  }
  const settings = state.blurSettings || defaultBlurSettings();
  const distance = Number(settings.labelDistanceA);
  const rotation = Number(settings.labelRotateA);
  const radius = Math.max(1, Math.abs(Number.isFinite(distance) ? distance : 245));
  const extraRotation = distance < 0 ? 180 : 0;
  const path = els.focusApproxLabel.querySelector("#focus-approx-label-path");
  if (path) {
    path.setAttribute("d", `M ${radius} 0 A ${radius} ${radius} 0 1 0 ${-radius} 0 A ${radius} ${radius} 0 1 0 ${radius} 0`);
  }
  els.focusApproxLabel.style.setProperty("--label-rotate", `${(Number.isFinite(rotation) ? rotation : 0) + extraRotation}deg`);
}

// Show the blur overlay (a chosen kind) WITHOUT opening a detail page, centred a bit
// right of the toolbar so both the sliders and the clear/white circle are visible.
function startBlurPreview(kind) {
  state.blurPreviewKind = kind === "approx" ? "approx" : "normal";
  els.mapView?.classList.add("is-blur-preview");
  els.mapView?.classList.toggle("is-blur-approx", state.blurPreviewKind === "approx");
  if (els.focusBlur) {
    els.focusBlur.style.setProperty("--focus-x", "58vw");
    els.focusBlur.style.setProperty("--focus-y", "46vh");
  }
  if (state.blurPreviewKind === "approx") {
    renderFocusApproxLabel(focusApproxLabelTextForPreview(), { preview: true });
    if (els.focusApproxLabel) {
      els.focusApproxLabel.style.left = "58vw";
      els.focusApproxLabel.style.top = "46vh";
    }
  } else if (!els.mapView?.classList.contains("is-focus-mode")) {
    renderFocusApproxLabel("");
  }
  renderBlurAdjust();
}

function stopBlurPreview() {
  if (!state.blurPreviewKind) {
    return;
  }
  state.blurPreviewKind = null;
  // Only drop the preview classes if a real focus isn't running.
  if (!els.mapView?.classList.contains("is-focus-mode")) {
    els.mapView?.classList.remove("is-blur-approx");
    renderFocusApproxLabel("");
  }
  els.mapView?.classList.remove("is-blur-preview");
  renderBlurAdjust();
}

function syncBlurAdjust() {
  if (!state.blurSettings) {
    state.blurSettings = loadBlurSettings();
  }
  // 编辑用模糊度按钮：只在本机出现，上线后隐藏（用户 #3）。
  const show = IS_LOCAL;
  const wrap = document.querySelector("#blur-adjust");
  if (wrap) {
    wrap.hidden = !show;
  }
  if (!show) {
    state.blurAdjustOpen = false;
    stopBlurPreview();
  }
  if (els.blurAdjustToggle) {
    els.blurAdjustToggle.setAttribute("aria-expanded", String(state.blurAdjustOpen));
    els.blurAdjustToggle.classList.toggle("is-active", state.blurAdjustOpen);
    els.blurAdjustToggle.setAttribute("aria-label", "聚焦模糊度实时调整");
    els.blurAdjustToggle.setAttribute("title", "聚焦模糊度实时调整");
  }
  if (els.blurAdjustPanel) {
    els.blurAdjustPanel.hidden = !state.blurAdjustOpen;
  }
  if (state.blurAdjustOpen) {
    if (!els.mapView?.classList.contains("is-focus-mode") && !state.blurPreviewKind) {
      startBlurPreview("approx");
      return;
    }
    renderBlurAdjust();
  }
}

function renderBlurAdjust() {
  if (!els.blurAdjustPanel || !state.blurAdjustOpen) {
    return;
  }
  const rows = (group) =>
    BLUR_PARAMS.filter((p) => p.group === group)
      .map((p) => {
        const v = state.blurSettings[p.key];
        return `<label class="blur-adjust-row">
            <span class="blur-adjust-name">${p.label}</span>
            <input type="range" class="blur-adjust-slider" data-blur-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}" />
            <output class="blur-adjust-out" data-blur-out="${p.key}">${formatBlurValue(p.key, v)}</output>
          </label>`;
      })
      .join("");
  const previewing = state.blurPreviewKind;
  const inFocus = els.mapView?.classList.contains("is-focus-mode");
  const previewButton = (kind) =>
    inFocus
      ? ""
      : `<button type="button" class="blur-adjust-preview${previewing === kind ? " is-on" : ""}" data-blur-preview="${kind}">查看</button>`;
  els.blurAdjustPanel.innerHTML = `
    <div class="blur-adjust-head">聚焦模糊度</div>
    <div class="blur-adjust-group">
      <div class="blur-adjust-grouphead">
        <span>普通标点</span>
        ${previewButton("normal")}
      </div>
      ${rows("normal")}
    </div>
    <div class="blur-adjust-group">
      <div class="blur-adjust-grouphead">
        <span>模糊标点</span>
        ${previewButton("approx")}
      </div>
      ${rows("approx")}
    </div>
    <div class="blur-adjust-group">
      <div class="blur-adjust-grouphead"><span>圆形环绕文字</span></div>
      ${rows("label")}
    </div>
    <div class="blur-adjust-foot">
      <span class="blur-adjust-hint">${inFocus ? "当前标点实时生效" : "打开后实时预览"}</span>
      <button type="button" class="blur-adjust-btn2" data-blur-reset>恢复默认</button>
    </div>`;
}

// ---- Resizable editor panels (v122 用户 T4) ---------------------------------
// Three drag handles let the user resize the left column (preview + history) width,
// the split between preview (top) and history (bottom), and the editor drawer width
// — like desktop windows. Sizes persist in localStorage and are restored on load.
const PANEL_SIZE_KEY = "fu-panel-sizes";

function loadPanelSizes() {
  try {
    const s = JSON.parse(localStorage.getItem(PANEL_SIZE_KEY) || "{}");
    return s && typeof s === "object" ? s : {};
  } catch {
    return {};
  }
}

function applyPanelSizes() {
  const s = loadPanelSizes();
  const root = document.documentElement.style;
  if (Number.isFinite(Number(s.previewW))) {
    root.setProperty("--preview-w", `${s.previewW}px`);
  }
  if (Number.isFinite(Number(s.previewSplit))) {
    root.setProperty("--preview-split", `${s.previewSplit}px`);
  }
  if (Number.isFinite(Number(s.editorW))) {
    root.setProperty("--editor-w", `${s.editorW}px`);
  }
}

function savePanelSize(key, value) {
  const s = loadPanelSizes();
  s[key] = value;
  try {
    localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function setupPanelResizers() {
  applyPanelSizes();
  const make = (cls) => {
    const el = document.createElement("div");
    el.className = `panel-resizer ${cls}`;
    document.body.appendChild(el);
    return el;
  };
  const colHandle = make("resizer-col"); // left-column width
  const splitHandle = make("resizer-split"); // preview/history split
  const editorHandle = make("resizer-editor"); // editor drawer width
  const root = document.documentElement.style;

  const drag = (handle, onMove) => {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* setPointerCapture can throw for synthetic pointers; drag still works */
      }
      handle.classList.add("is-dragging");
      const move = (e) => onMove(e);
      const up = (e) => {
        handle.releasePointerCapture?.(e.pointerId);
        handle.classList.remove("is-dragging");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  };

  drag(colHandle, (e) => {
    const w = Math.max(220, Math.min(640, e.clientX));
    root.setProperty("--preview-w", `${w}px`);
    savePanelSize("previewW", w);
  });
  drag(splitHandle, (e) => {
    const h = Math.max(120, Math.min(window.innerHeight - 140, e.clientY));
    root.setProperty("--preview-split", `${h}px`);
    savePanelSize("previewSplit", h);
  });
  drag(editorHandle, (e) => {
    const w = Math.max(360, Math.min(window.innerWidth * 0.75, window.innerWidth - e.clientX));
    root.setProperty("--editor-w", `${w}px`);
    savePanelSize("editorW", w);
  });
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
    // 用户 T11: mark the current language so you can tell which one is active.
    els.languageMenu.querySelectorAll("[data-lang]").forEach((btn) => {
      const isActive = btn.dataset.lang.startsWith("en") ? state.lang === "en" : state.lang === "ja";
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-current", isActive ? "true" : "false");
    });
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
  const endZoom = Number.isFinite(state.entryTargetZoom) ? state.entryTargetZoom : DEFAULT_MAP_ZOOM;
  const startTime = performance.now();
  // The map already sits at ENTRY_START_ZOOM from init, so we animate straight
  // up to the resolved target zoom without snapping (no flash of the default view).
  const step = (now) => {
    const t = Math.min((now - startTime) / ENTRY_ZOOM_ANIMATION_MS, 1);
    const eased = easeInOutCubic(t);
    setMapCamera(targetCenter, lerp(ENTRY_START_ZOOM, endZoom, eased));
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      setMapCamera(targetCenter, endZoom);
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
    styles: currentMapStyles(),
  });

  state.projectionOverlay = new google.maps.OverlayView();
  state.projectionOverlay.onAdd = () => {};
  state.projectionOverlay.draw = () => {};
  state.projectionOverlay.onRemove = () => {};
  state.projectionOverlay.setMap(state.map);

  state.map.addListener("dragstart", dismissFocusAfterUserMapInteraction);
  state.map.addListener("zoom_changed", dismissFocusAfterUserMapInteraction);
  state.map.addListener("zoom_changed", refreshSatellitePoi);

  const initialView = await getInitialMapCenter();
  state.map.setCenter(initialView.center);
  state.entryTargetZoom = initialView.zoom;
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

// Web Mercator world coordinates in a 256px tile at zoom 0 (multiply by 2^zoom
// for pixels). Lets us test "would this marker be on screen" purely from math,
// without waiting for a live map to become idle.
function latLngToWorldPoint(lat, lng) {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: 256 * (0.5 + lng / 360),
    y: 256 * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

// How many of `items` fall inside a canvasW×canvasH-pixel screen centred on
// `center` at `zoom`. 用户 task 2: counts ALL points (筛选隐藏的也算).
function countMarkersOnScreen(center, zoom, items, canvasW, canvasH) {
  const scale = Math.pow(2, zoom);
  const c = latLngToWorldPoint(center.lat, center.lng);
  const halfW = canvasW / 2 / scale;
  const halfH = canvasH / 2 / scale;
  let count = 0;
  for (const it of items) {
    const w = latLngToWorldPoint(it.coordinates.lat, it.coordinates.lng);
    if (Math.abs(w.x - c.x) <= halfW && Math.abs(w.y - c.y) <= halfH) {
      count += 1;
    }
  }
  return count;
}

// 用户 task 2「聚集判定」: the user is in Japan but their default-zoom screen shows
// no markers. Find the NEAREST spot whose CLUSTER_FALLBACK_ZOOM screen holds ≥3
// markers — try each marker as a candidate centre, keep those seeing ≥3, then
// pick the one closest to the user. Returns null if no such cluster exists.
function findNearestClusterCenter(userLoc, items, zoom, canvasW, canvasH) {
  let best = null;
  let bestDist = Infinity;
  for (const cand of items) {
    if (countMarkersOnScreen(cand.coordinates, zoom, items, canvasW, canvasH) >= 3) {
      const dLat = cand.coordinates.lat - userLoc.lat;
      const dLng = cand.coordinates.lng - userLoc.lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < bestDist) {
        bestDist = dist;
        best = cand.coordinates;
      }
    }
  }
  return best;
}

// User is confirmed inside Japan. Default view = their spot at DEFAULT_MAP_ZOOM.
// But if that screen shows no markers, drop to CLUSTER_FALLBACK_ZOOM over the
// nearest ≥3-marker cluster (用户 task 2). Falls back to Tokyo if no cluster.
function resolveInJapanView(here) {
  const items = state.umbrellas.filter(hasCoordinates);
  const canvas = els.mapCanvas;
  const canvasW = canvas?.clientWidth || window.innerWidth || 1280;
  const canvasH = canvas?.clientHeight || window.innerHeight || 800;
  if (countMarkersOnScreen(here, DEFAULT_MAP_ZOOM, items, canvasW, canvasH) > 0) {
    return { center: here, zoom: DEFAULT_MAP_ZOOM };
  }
  const cluster = findNearestClusterCenter(here, items, CLUSTER_FALLBACK_ZOOM, canvasW, canvasH);
  if (cluster) {
    return { center: cluster, zoom: CLUSTER_FALLBACK_ZOOM };
  }
  return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
}

// Resolves to { center, zoom }. Rules: (1) default Tokyo at DEFAULT_MAP_ZOOM;
// (2) geolocation granted & inside Japan → their spot (with the task-2 fallback
// above); (3) outside Japan / denied / timeout → Tokyo.
function getInitialMapCenter() {
  const fallback = { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
  if (!navigator.geolocation) {
    return Promise.resolve(fallback);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const timeoutId = window.setTimeout(() => finish(fallback), GEOLOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeoutId);
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        // Only jump to the user's real position when they are inside Japan;
        // outside Japan we treat it like "no location" and fall back to Tokyo.
        finish(isInsideJapan(here) ? resolveInJapanView(here) : fallback);
      },
      () => {
        window.clearTimeout(timeoutId);
        finish(fallback);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: GEOLOCATION_TIMEOUT_MS,
      },
    );
  });
}

// 定位按钮：把地图移到用户当前位置（用户 2026-07-05 要求）。用浏览器地理定位，
// 拿到坐标后 panTo 过去并适当放大；失败/拒绝就安静收回按钮状态（不打扰）。
function goToMyLocation() {
  if (!state.googleReady || !navigator.geolocation) {
    return;
  }
  els.locateMe?.classList.add("is-locating");
  const done = () => els.locateMe?.classList.remove("is-locating");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      done();
      const here = { lat: position.coords.latitude, lng: position.coords.longitude };
      state.map.panTo(here);
      const z = state.map.getZoom() || DEFAULT_MAP_ZOOM;
      state.map.setZoom(Math.max(z, 14));
    },
    done,
    { enableHighAccuracy: true, maximumAge: 60000, timeout: GEOLOCATION_TIMEOUT_MS },
  );
}

// 一个按钮循环三种地图（用户要求）：卫星1(无字) → 卫星2(有字) → 普通 → 卫星1…
// 对应 state：卫星1 = satellite+labels off；卫星2 = satellite+labels on；普通 = roadmap。
function cycleMapType() {
  if (!state.googleReady) {
    return;
  }
  if (state.mapBase === "satellite" && !state.mapLabels) {
    state.mapLabels = true; // 卫星1 → 卫星2
  } else if (state.mapBase === "satellite" && state.mapLabels) {
    state.mapBase = "roadmap"; // 卫星2 → 普通
  } else {
    state.mapBase = "satellite"; // 普通 → 卫星1
    state.mapLabels = false;
  }
  applyMapType();
  syncMapTypeButton();
  syncMapLayers(); // 编辑面板跟着切到当前那套（仅本地）
}

// 切换地图按钮的三个图标（用户手绘，基于 Lucide map）：一张地图折成三格，
// 斜线画在第 1/2/3 格里，表示当前是哪张地图（卫星1/卫星2/普通）。不再用数字角标。
const MAP_SWITCH_OUTLINE =
  '<path d="M14.1,5.6c0.6,0.3,1.2,0.3,1.8,0l3.7-1.8c0.5-0.2,1.1,0,1.3,0.4C21,4.3,21,4.5,21,4.6v12.8c0,0.4-0.2,0.7-0.6,0.9l-4.6,2.3c-0.6,0.3-1.2,0.3-1.8,0l-4.2-2.1c-0.6-0.3-1.2-0.3-1.8,0l-3.7,1.8c-0.5,0.2-1.1,0-1.3-0.4C3,19.7,3,19.5,3,19.4V6.6c0-0.4,0.2-0.7,0.6-0.9l4.6-2.3c0.6-0.3,1.2-0.3,1.8,0L14.1,5.6z"/><path d="M15,5.8v15"/><path d="M9,3.2v15"/>';
const MAP_SWITCH_HATCH = [
  '<path d="M3,13.5l6-3"/><path d="M3,17.4l6-3"/><path d="M3,9.6l6-3"/>', // 左格
  '<path d="M9,10.5l6,3"/><path d="M9,14.4l6,3"/><path d="M9,6.6l6,3"/>', // 中格
  '<path d="M15,13.5l6-3"/><path d="M15,17.4l6-3"/><path d="M15,9.6l6-3"/>', // 右格
];
function mapSwitchIconSvg(num) {
  const hatch = MAP_SWITCH_HATCH[Math.min(Math.max(num, 1), 3) - 1];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${MAP_SWITCH_OUTLINE}${hatch}</svg>`;
}

// 当前地图对应的图标数字：卫星1=1、卫星2=2、普通=3。
function mapTypeNumber() {
  if (state.mapBase === "roadmap") {
    return 3;
  }
  return state.mapLabels ? 2 : 1;
}

// The actual Google map type id. 用户 T6: satellite always uses "hybrid" so the label
// layer EXISTS and can be shown/hidden per-category by the filter (the plain
// "satellite" type has no label layer, so 卫星1 could never reveal text). The clean
// look of 卫星1 comes from the base style hiding all labels, not from the map type.
function effectiveMapTypeId() {
  if (state.mapBase === "roadmap") {
    return "roadmap";
  }
  return "hybrid";
}

// Base styles for the active map + the per-set category overrides. 用户 T5: the
// satellite base hides EVERY label (and the road lines) so nothing leaks through when
// all filters are off; the category set then layers specific labels back on top.
function currentMapStyles() {
  const base = state.mapBase === "roadmap" ? mapStyles : SATELLITE_BASE_STYLES;
  return [...base, ...categoryStyleRules()];
}

// Re-push styles to the live map (after a tuning change or threshold-crossing zoom).
function applyMapCategoryStyles() {
  if (state.googleReady) {
    state.map.setOptions({ styles: currentMapStyles() });
  }
}

function applyMapType() {
  if (state.googleReady) {
    state.map.setMapTypeId(effectiveMapTypeId());
    state.map.setOptions({ styles: currentMapStyles() });
  }
}

// Re-apply styles as the zoom changes, but only when the active set actually uses a
// per-category zoom threshold (so we don't call setOptions on every zoom frame).
function refreshSatellitePoi() {
  if (!state.googleReady) {
    return;
  }
  if (anyCategoryHasThreshold()) {
    applyMapCategoryStyles();
  }
}

function syncMapTypeButton() {
  const onSatellite = state.mapBase === "satellite";
  const lang = state.lang;
  // Normal (roadmap) map has light tiles, so the top-right nav switches to black
  // (only takes visible effect on the map view — see CSS `.view-map.is-roadmap`).
  document.body.classList.toggle("is-roadmap", !onSatellite);
  if (els.mapTypeToggle) {
    // 一个按钮循环三态；图标中间显示当前地图编号（1/2/3），tooltip 说下一张。
    const num = mapTypeNumber();
    const nextHint =
      num === 1
        ? { ja: "衛星2（文字）へ", en: "To satellite 2 (labels)" }
        : num === 2
          ? { ja: "普通地図へ", en: "To normal map" }
          : { ja: "衛星1へ", en: "To satellite 1" };
    els.mapTypeToggle.setAttribute("aria-label", nextHint[lang] || nextHint.ja);
    els.mapTypeToggle.setAttribute("title", nextHint[lang] || nextHint.ja);
    if (els.mapTypeIco) {
      els.mapTypeIco.innerHTML = mapSwitchIconSvg(num);
    }
  }
  // The map-layers switches only apply to the plain map (hidden on satellite).
  syncMapLayers();
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
      item.displayId, // 对外显示名：设了就能按它搜（真实文件名 item.id 也照样能搜）
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
  renderContributedArchive();
  syncArchiveScope();

  if (els.resultCount) {
    els.resultCount.textContent = `${items.length} item`;
  }
  if (els.statCount) {
    els.statCount.textContent = String(state.umbrellas.length);
  }
  const contributedCount = state.umbrellas.filter((item) => item.submissionType === "contributed").length;
  // フィールド数 = my own (Fieldwork) records = total minus contributions (item 10).
  if (els.statFieldwork) {
    els.statFieldwork.textContent = String(state.umbrellas.length - contributedCount);
  }
  // 投稿数 = how many points came from outside contributions.
  if (els.statSubmissions) {
    els.statSubmissions.textContent = String(contributedCount);
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

  // Scope the sidebar list to Fieldwork (own) or Contributed (item 17); the map
  // markers still show everything.
  const scoped = items.filter((it) =>
    state.listScope === "contributed" ? it.submissionType === "contributed" : it.submissionType !== "contributed",
  );
  els.listScopeTabs?.forEach((tab) => {
    tab.classList.toggle("is-active", (tab.dataset.listScope === "contributed") === (state.listScope === "contributed"));
  });
  syncListControls(scoped);
  const sortedItems = sortListItems(filterListItems(scoped));

  els.list.innerHTML = sortedItems
    .map(
      (item) => `
        <button class="location-button ${item.id === state.selectedId ? "is-active" : ""}" data-id="${item.id}" type="button">
          <img src="${item.thumb}" alt="${escapeHtml(displayUmbrellaId(item))}" loading="lazy" decoding="async" />
          <span class="location-copy">
            <span class="location-idrow">
              <strong>${escapeHtml(displayUmbrellaId(item))}</strong>
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

  // Hide categories switched off in the map filter (item 6/15/16). 用户 #3: the
  // filter now applies in edit mode too, so you can narrow the map while editing.
  const visible = items
    .filter(hasCoordinates)
    .filter((item) => state.markerFilter[markerCategory(item)] !== false);
  const visibleIds = new Set(visible.map((item) => item.id));

  // Markers are UPDATED in place, never torn down + recreated wholesale: a full
  // rebuild blanked every pin for a frame, so clicking a pin made it blink/jump
  // right as the focus animation started (用户 T1/T3). Only pins that actually
  // disappeared (filtered out / deleted) are removed.
  state.markers.forEach((marker, id) => {
    if (!visibleIds.has(id)) {
      marker.setMap(null);
      state.markers.delete(id);
    }
  });

  visible.forEach((item) => {
    const icon = markerIcon(item.id === state.focusMarkerId, flagColorFor(item), markerCategory(item));
    const existing = state.markers.get(item.id);
    if (existing) {
      const pos = existing.getPosition();
      if (!pos || pos.lat() !== item.coordinates.lat || pos.lng() !== item.coordinates.lng) {
        existing.setPosition(item.coordinates);
      }
      existing.setIcon(icon);
      existing.setZIndex(markerZIndex(item));
      if (existing.getDraggable() !== state.editMode) {
        existing.setDraggable(state.editMode);
      }
      return;
    }

    const id = item.id;
    const marker = new google.maps.Marker({
      map: state.map,
      position: item.coordinates,
      title: id,
      icon,
      // Explicit, latitude-based z-order: overlapping pins (e.g. 8680 / aaa(1))
      // must never swap front-to-back while zooming — with a DISTINCT zIndex per pin
      // the canvas renderer draws them in a fixed order, so close pairs never flicker.
      zIndex: markerZIndex(item),
      draggable: state.editMode,
      // 用户 T3 (v122): OPTIMIZED markers (the default) are painted on the map's own
      // canvas, so during the focus zoom-in animation they move in perfect lockstep
      // with the tiles. `optimized:false` DOM markers lagged the camera by a frame
      // (Google re-projects their left/top out of sync with the tile transform),
      // which is what made a pin visibly "drop" then settle when opened (8665/8755/
      // 8766). The distinct zIndex above keeps the canvas order stable = no flicker.
    });

    // Handlers look the item up fresh by id — the marker now outlives data edits
    // (in-place updates above), so a captured `item` object could go stale.
    const liveItem = () => state.umbrellas.find((entry) => entry.id === id);
    marker.addListener("click", (event) => {
      event.domEvent?.stopPropagation?.();
      // A drag often fires a trailing click — ignore it so it can't reopen the
      // editor and wipe the just-dragged coordinates.
      if (performance.now() < (state.suppressMarkerClickUntil || 0)) {
        return;
      }
      if (state.editMode) {
        openEditor(id);
        return;
      }
      state.ignoreFocusCloseUntil = performance.now() + 180;
      // #5: clicking the already-focused marker again (after panning/zooming it
      // out of the clear circle) re-centres it instead of doing nothing.
      if (state.focusMarkerId === id) {
        state.focusPositionedId = null;
      }
      selectUmbrella(id, { focus: true });
    });
    marker.addListener("dragend", (event) => {
      state.suppressMarkerClickUntil = performance.now() + 500;
      const lat = event.latLng?.lat();
      const lng = event.latLng?.lng();
      if (typeof lat === "number" && typeof lng === "number") {
        onMarkerDragged(id, { lat, lng });
      }
    });
    marker.addListener("mouseover", () => {
      const it = liveItem();
      if (it) {
        marker.setIcon(hoverMarkerIcon(id === state.focusMarkerId, flagColorFor(it), markerCategory(it)));
      }
    });
    marker.addListener("mouseout", () => {
      const it = liveItem();
      if (it) {
        marker.setIcon(markerIcon(id === state.focusMarkerId, flagColorFor(it), markerCategory(it)));
      }
    });
    state.markers.set(id, marker);
  });

  if (state.suppressNextFit) {
    state.suppressNextFit = false;
  }
}

// A media file is a (playable) video when its extension is a known video type.
// Videos render as a <video> player; they are never the cover and can't enlarge.
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)$/i;
function isVideoFile(file) {
  return VIDEO_EXT_RE.test(String(file || ""));
}

const focusImageAspectCache = new Map();

function reserveFocusCoverFrame(media) {
  const frame = els.focusImageFrame;
  if (!frame) {
    return;
  }
  const cropAr = cropAspectRatioNumber(media?.crop);
  const cachedAr = media?.src ? focusImageAspectCache.get(media.src) : null;
  const ar = cropAr || cachedAr || 4 / 3;
  frame.style.setProperty("--focus-cover-ar", String(ar));
  frame.classList.toggle("is-cover-reserved", !cropAr);
}

function finalizeFocusImageLoad() {
  if (els.focusImage?.naturalWidth > 0 && els.focusImage?.naturalHeight > 0 && els.focusImage.src) {
    focusImageAspectCache.set(els.focusImage.src, els.focusImage.naturalWidth / els.focusImage.naturalHeight);
  }
  if (!state.imageExpanded) {
    els.focusImageFrame?.classList.remove("is-cover-reserved");
    if (state.focusImageReadyFrame) {
      cancelAnimationFrame(state.focusImageReadyFrame);
    }
    state.focusImageReadyFrame = requestAnimationFrame(() => {
      state.focusImageReadyFrame = requestAnimationFrame(() => {
        state.focusImageReadyFrame = 0;
        els.focusPanel?.classList.remove("is-loading");
      });
    });
  }
  updateFocusScrollHint();
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
  reserveFocusCoverFrame(cover);
  els.focusImage.src = cover?.src || item.image;
  els.focusImage.alt = localize(item.title) || item.id;
  // 用户 #8: the cover shows its cropped region too (was only in the editor preview).
  applyFocusCrop(cover?.crop);
  if (els.focusHeader) {
    els.focusHeader.innerHTML = renderFocusHeader(item);
  }
  // Single-column detail (v109): A1 (id/title) floats top-left over the cover, the
  // merged A2+C info block floats over it too; below the image flows D1+D2 in their
  // original on-disk order (用户要求 #4/#5).
  if (els.focusInfoBlock) {
    // 主图天气横轴（用户 2.4）现在由 renderFocusInfo 直接拼在覆盖信息块底部（图片之上）。
    els.focusInfoBlock.innerHTML = renderFocusInfo(item);
  }
  els.focusCaption.innerHTML = renderFocusArticle(item);
  renderFocusLink(item);
  if (els.focusImage.complete && els.focusImage.naturalWidth > 0) {
    finalizeFocusImageLoad();
  }
  closeExpandedImage();
  // Defer one frame so the new content has laid out before measuring overflow (#5).
  requestAnimationFrame(updateFocusScrollHint);
}

// #5: show the "Scroll for more" hint only when the detail content overflows the
// scroll area AND the user hasn't reached the bottom yet. Hidden in the lightbox.
function updateFocusScrollHint() {
  const scroll = els.focusScroll;
  const hint = els.focusScrollHint;
  if (!scroll || !hint) {
    return;
  }
  const overflowing = scroll.scrollHeight - scroll.clientHeight > 8;
  const atBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 8;
  const expanded = els.focusPanel?.classList.contains("is-expanded");
  hint.hidden = !overflowing || atBottom || Boolean(expanded);
  // 用户 🅐 方案A：短内容（不溢出）时给面板 is-focus-short —— CSS 用 flex auto 外边距把
  //「滚动区(=内容高) + Back to map」当一个整体在固定高面板里垂直居中，footer 自然贴内容正下方。
  // 长内容（溢出）去掉这个类：滚动区压到剩余高、内部滚动，footer 固定面板底部不随滚动。
  els.focusPanel?.classList.toggle("is-focus-short", !overflowing && !expanded);
}

// Blue underlined link under the cover image, jumping to the linked point.
// Hidden when there is no (valid) link; hidden while the image is enlarged (CSS).
function renderFocusLink(item) {
  if (!els.focusLink) {
    return;
  }
  const target = item.linkedId
    ? state.umbrellas.find((entry) => entry.id === item.linkedId)
    : null;
  if (!target) {
    els.focusLink.hidden = true;
    els.focusLink.innerHTML = "";
    return;
  }
  const t = localize(target.title);
  const targetId = displayUmbrellaId(target);
  const label = t ? `${targetId}（${t}）` : targetId;
  // 用户 #6: a horizontal chain-link icon (same stroke weight as back-to-map),
  // not an arrow; the text is a brighter, more legible blue (see .focus-link-a).
  els.focusLink.hidden = false;
  els.focusLink.innerHTML = `<a href="#" class="focus-link-a" data-link-id="${escapeHtml(target.id)}"><svg class="focus-link-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg><span>${escapeHtml(label)}</span></a>`;
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

// A long address wraps onto new lines ONLY at commas — never mid-word or at a
// plain space (用户要求). Spaces become non-breaking; a <wbr> after each comma is
// the sole break opportunity. Combined with a max-width in CSS (≤70% of width).
function formatAddressBreaks(text) {
  return escapeHtml(text)
    .replace(/ /g, " ")
    .replace(/, ?/g, (m) => `${m}<wbr>`);
}

// One line per speaker: "編者：…" → speaker cell (left) + body cell (right).
// Lines with no colon render as a plain body line. Used by dialogue blocks (item 12).
function renderDialogueLines(text) {
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([^：:]{1,12})[：:]\s*(.*)$/);
      if (m) {
        // Re-add the colon (full-width for CJK speakers, half-width otherwise);
        // a fixed-width speaker cell (CSS) keeps every body left-aligned (item 8).
        const speaker = m[1];
        const colon = /[぀-ヿ㐀-鿿]/.test(speaker) ? "：" : ":";
        return `<p class="focus-dialogue-line"><span class="focus-dialogue-speaker">${escapeHtml(speaker)}${colon}</span><span class="focus-dialogue-body">${escapeHtml(m[2])}</span></p>`;
      }
      return `<p class="focus-dialogue-line focus-dialogue-cont"><span class="focus-dialogue-body">${escapeHtml(line)}</span></p>`;
    })
    .join("");
}

// Person-name contributed ids are stored with underscores (folder names) but read
// with spaces — show "ZHANG ZHONGPU", not "ZHANG_ZHONGPU" (item 2). Own (IMG_xxxx)
// ids AND rednote handles (rednote_kankan) keep their underscores — those are real
// filenames/handles, not names where the underscore replaced a space (item 1).
function displayUmbrellaId(item) {
  // 对外显示名（record.displayId）：填了就完全替换页面上显示的 ID，
  // 但内部匹配/文件夹/linkedId 依旧用真实 item.id，不受影响。
  const custom = (item?.displayId || "").trim();
  if (custom) {
    return custom;
  }
  const id = item?.id || "";
  if (item?.submissionType !== "contributed" || /^rednote/i.test(id)) {
    return id;
  }
  return id.replace(/_/g, " ");
}

// A1 (v109): just id(title) + the contributed badge. Floats at the TOP-LEFT over
// the cover image (用户要求 #5). Place / time / submitter moved into the merged
// A2+C info block (renderFocusInfo).
function renderFocusHeader(item) {
  const title = localize(item.title);
  const idText = displayUmbrellaId(item);
  const focusTitle = title ? `${idText}(${title})` : idText;
  // 用户: mark a contributed umbrella with a small stroked "download-into-envelope"
  // icon (a received submission — arrow dropping into an envelope), placed to the
  // LEFT of the id. Same line style as the magnifier / back-to-map controls.
  const isContributed = item.submissionType === "contributed";
  const badge = isContributed
    ? `<span class="focus-badge" role="img" aria-label="contributed"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg></span>`
    : "";
  return `<h3 class="focus-title">${badge}${escapeHtml(focusTitle)}</h3>`;
}

// The INFORMATION grid (type / object / state). Lives in the left aside next to
// the cover image (方案 B). Contributed umbrellas don't show it (their category
// is "submission(pending)" and umbrella details are usually unknown) — they rely
// on the submitter credit + note instead (用户要求).
// A2 + C merged (v109): place / time (+ submitter for contributed) then
// type / object / state, all in ONE label:value grid with the same alignment
// (用户要求 #5). Labels are always English. Floats over the cover image. Each
// row's `lines` are already safe HTML (place/time carry approx prefix + address
// <wbr>); type/object/state values are escaped here.
// --- 天气联动 (用户 T3) --------------------------------------------------------
// WMO 天气代码 → 我们用的粗分类（决定显示哪个极简线条图标）。
function weatherCategory(code) {
  if (code === null || code === undefined || !Number.isFinite(Number(code))) {
    return null;
  }
  const c = Number(code);
  if (c === 0) return "clear"; // 晴
  if (c === 1 || c === 2) return "partly"; // 多云间晴
  if (c === 3 || c === 45 || c === 48) return "cloudy"; // 阴（雾也归这里，用户定）
  // 雨四级（按 WMO 标准重新分级，用户 2026-07-05 定）：
  //   小雨 = 毛毛雨(51/53/55) + 小雨(61) + 小阵雨(80) → cloud-hail
  if (c === 51 || c === 53 || c === 55 || c === 61 || c === 80) return "light-rain";
  //   中雨 = 中雨(63) + 中阵雨(81) → cloud-rain
  if (c === 63 || c === 81) return "rain";
  //   大雨 = 大雨(65) + 强阵雨(82) → cloud-rain-wind
  if (c === 65 || c === 82) return "heavy-rain";
  //   暴雨 = 雷暴(95/96/99) → cloud-lightning
  if (c === 95 || c === 96 || c === 99) return "thunder";
  // 小雪（云+雪花）：含雨夹雪(56/57/66/67)、小雪(71)、中雪(73，用户定归入小雪)、雪粒(77)、小阵雪(85)
  if (c === 56 || c === 57 || c === 66 || c === 67 || c === 71 || c === 73 || c === 77 || c === 85) return "light-snow";
  if (c === 75 || c === 86) return "snow"; // 大雪（只雪花）：大雪(75)、强阵雪(86)
  return "cloudy";
}

// 夜里判断：时间字符串「YYYY-MM-DDTHH:00」取小时，18:00~翌6:00 算夜。用户定：只有
// 晴/多云间晴分昼夜（换成月亮版），其他天气不分。日本日落随季节有出入，这是近似值。
function isNightHour(timeStr) {
  const m = /T(\d{2}):/.exec(String(timeStr || ""));
  if (!m) return false;
  const h = Number(m[1]);
  return h >= 18 || h < 6;
}

// 结合时间的分类：晴/多云间晴在夜里返回 -night 变体，其余原样。
function weatherCategoryAt(code, timeStr) {
  const base = weatherCategory(code);
  if ((base === "clear" || base === "partly") && isNightHour(timeStr)) {
    return `${base}-night`;
  }
  return base;
}

// 极简线条图标（stroke=currentColor，无填充）。天气图标统一采用 Lucide 线条图标
// （ISC 许可，直接内嵌，不走 CDN 以保证 PWA 离线可用）；小雪是用户手绘的 7 点版。
// Lucide 官方路径，viewBox 24、stroke=currentColor。
const WEATHER_ICON_INNER = {
  // 晴·昼 = sun，晴·夜 = moon
  clear: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
  "clear-night": `<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>`,
  // 多云间晴·昼 = cloud-sun，多云间晴·夜 = cloud-moon
  partly: `<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>`,
  "partly-night": `<path d="M13 16a3 3 0 0 1 0 6H7a5 5 0 1 1 4.9-6z"/><path d="M18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36"/>`,
  // 阴 = cloud
  cloudy: `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>`,
  // 雨四级：小雨 cloud-hail / 中雨 cloud-rain / 大雨 cloud-rain-wind / 暴雨 cloud-lightning
  "light-rain": `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v2"/><path d="M8 14v2"/><path d="M16 20h.01"/><path d="M8 20h.01"/><path d="M12 16v2"/><path d="M12 22h.01"/>`,
  rain: `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>`,
  "heavy-rain": `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m9.2 22 3-7"/><path d="m9 13-3 7"/><path d="m17 13-3 7"/>`,
  thunder: `<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>`,
  // 小雪：用户手绘 = 云 + 6 点围一圈 + 中心 1 点；大雪 = snowflake
  "light-snow": `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 13h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/><path d="M16 15h.01"/><path d="M16 19h.01"/>`,
  snow: `<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>`,
};
function weatherIconSvg(category) {
  const inner = WEATHER_ICON_INNER[category];
  if (!inner) {
    return "";
  }
  const open = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;
  return `${open}${inner}</svg>`;
}

// 把逐时天气压成「只留头、尾、和每次变化点」（用户 2.5：中间只放变化点图例）。
// 例：-24h晴…-11h多云…-3h雨…0h → 只 4 个点。
function weatherChangePoints(hourly) {
  if (!Array.isArray(hourly) || !hourly.length) {
    return [];
  }
  const last = hourly.length - 1;
  const pts = [];
  let prevCat = Symbol("none");
  hourly.forEach((h, i) => {
    // 用户定：晴/多云间晴的「夜间版」只在 now 出现，中间不因昼夜切换分段——所以这里用不带
    // 昼夜的基础分类 weatherCategory 划分变化段；now 点的月亮版在渲染时(renderFocusWeatherAxis)单独处理。
    const cat = weatherCategory(h.code);
    const isEdge = i === 0 || i === last;
    if (isEdge || cat !== prevCat) {
      pts.push({ index: i, cat, code: h.code, offset: -(last - i) });
    }
    prevCat = cat;
  });
  const deduped = pts.filter((p, i) => i === 0 || p.index !== pts[i - 1].index);
  // 合并相邻同类：当最后一小时(now)的天气恰好和上一个变化点相同时，强制加进来的「尾点」
  // 会和它前面的点撞成相邻重复（IMG_8508 的 rain@16→rain@17）。这里把连续同类并成一段，
  // 并保留后一个的 index/code/time，让这段一直延伸到 now，尾标签仍锚在真正的最后一点。
  const merged = [];
  for (const p of deduped) {
    const prev = merged[merged.length - 1];
    if (prev && prev.cat === p.cat) {
      prev.index = p.index;
      prev.code = p.code;
      prev.offset = p.offset;
    } else {
      merged.push({ ...p });
    }
  }
  return merged;
}

// 用户定：除头尾外，中间图例最多 3 个（24h 变化太频繁时图例太多很丑）。
// 取舍规则：反复找「持续时间最短」的中间那段天气(=最不有代表性)删掉，删完若相邻两段变成同一类
// 就合并；直到中间 ≤ maxMiddle。头(−24h)和尾(now)永远保留、位置不动。
// points 每个点的「这段持续时长」= 下一个点的 index − 自己的 index。
function reduceWeatherPoints(points, hourlyLen, maxMiddle) {
  let pts = points.map((p) => ({ ...p }));
  const collapse = (arr) => {
    const out = [];
    for (const p of arr) {
      const prev = out[out.length - 1];
      if (prev && prev.cat === p.cat) {
        // 相邻同类合并：默认保留前一个（含头 index 0）；若后一个是尾(now)，把尾的 index 接过来，
        // 让这段延伸到 now、尾标签仍锚在最后一点。
        if (p.index === hourlyLen - 1) {
          prev.index = p.index;
          prev.code = p.code;
          prev.offset = p.offset;
        }
      } else {
        out.push(p);
      }
    }
    return out;
  };
  pts = collapse(pts);
  while (pts.length - 2 > maxMiddle) {
    let minI = -1;
    let minLen = Infinity;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const len = pts[i + 1].index - pts[i].index; // 这段天气持续多少小时
      if (len < minLen) {
        minLen = len;
        minI = i;
      }
    }
    if (minI < 0) break;
    pts.splice(minI, 1);
    pts = collapse(pts);
  }
  return pts;
}

// 主图天气横轴（用户 2.3/2.5/2.6/2.7）：拍摄前 24 小时，只在变化点+头尾放极简线条图标。
// - 位置按真实时间百分比放，但强制最小间距，挨太近就往两边推开（2.3）；实在放不下就退化成等距。
// - 不显示温度；时间只在两端显示「-24」和「now」，中间只有图例（2.5）。
// - 图例之间用一条「和图例同样粗」的线段连接，线段只在图例之间的空隙里（图例处断开=遮挡关系，
//   镂空图例中间不会有线穿过）（2.6）。整块放在主图下方（2.7，由 #focus-weather 承载）。
function renderFocusWeatherAxis(weather) {
  const hourly = weather?.hourly;
  if (!Array.isArray(hourly) || !hourly.some((h) => h && h.code !== null)) {
    return "";
  }
  const rawPoints = weatherChangePoints(hourly).filter((p) => p.cat);
  if (!rawPoints.length) {
    return "";
  }
  const last = hourly.length - 1;
  // 用户定：除头尾外中间最多 3 个图例（删最短的中间段，见 reduceWeatherPoints）。
  const points = reduceWeatherPoints(rawPoints, hourly.length, 3);
  // 24h 天气完全没变时（如 IMG_0101 全程阴），合并/collapse 逻辑会把头尾两点并成一个点，
  // 结果 -24h 和 now 两个时间标签叠在同一位置（右端 94%）→ 文字重影发糊。这里保底：
  // 只剩 1 个点就补回头尾两个端点（同一天气），让两端标签各归各位。
  if (points.length === 1) {
    const only = points[0];
    points.length = 0;
    points.push({ ...only, index: 0, offset: -last });
    points.push({ ...only, index: last, offset: 0 });
  }

  // 1) 真实时间 → [6,94] 的百分比（两端留 6% 边距，图标 translateX(-50%) 不出血）。
  const LO = 6;
  const HI = 94;
  const spanW = HI - LO;
  const MIN_GAP = 13; // 百分比；两个图例中心至少差 13% 才不挤（图标约占 5–8%）。
  const tOf = (p) => (last > 0 ? LO + (p.index / last) * spanW : (LO + HI) / 2);

  // 2) 用户「问题X」方案：不丢点。所有变化点（`weatherChangePoints` 保证相邻天气一定不同）
  //    全保留，只把挨太近的整体往两边推开，留出最小间距；位置不再精准=真实时间，但保证不重叠、
  //    也不会出现相邻同图标。这样修掉了老算法「丢中间点→前后两个相同类相邻重复」的 bug。
  const chosen = points;
  const raw = chosen.map(tOf);
  const n = raw.length;
  const pos = raw.slice();
  // 从左往右：把每个点顶到「上一个 + MIN_GAP」以外。
  for (let i = 1; i < n; i += 1) {
    if (pos[i] < pos[i - 1] + MIN_GAP) pos[i] = pos[i - 1] + MIN_GAP;
  }
  // 若右端顶出去了：把最后一点（now）钉回真实位置(=HI)，再从右往左回推，保证 now 始终在最右端。
  if (n > 0 && pos[n - 1] > HI) {
    pos[n - 1] = raw[n - 1];
    for (let i = n - 2; i >= 0; i -= 1) {
      if (pos[i] > pos[i + 1] - MIN_GAP) pos[i] = pos[i + 1] - MIN_GAP;
    }
  }
  // 极端保险：变化太多，推开后仍越过左端 → 退化成等距（依旧保留所有点，只是位置全变均匀）。
  if (n > 0 && pos[0] < LO) {
    const step = n > 1 ? (HI - LO) / (n - 1) : 0;
    for (let i = 0; i < n; i += 1) pos[i] = LO + step * i;
  }

  // 线段：只画在相邻图例之间的空隙里，各让开 20px（图标半宽约 14px + 约 6px 空隙），
  // 让图标和线段之间有明显间隙、不会几乎连在一起（用户 item4）。
  const segs = [];
  for (let i = 1; i < pos.length; i += 1) {
    const wPct = pos[i] - pos[i - 1];
    segs.push(
      `<span class="fw-seg" style="left:calc(${pos[i - 1].toFixed(2)}% + 20px);width:calc(${wPct.toFixed(2)}% - 40px)"></span>`,
    );
  }

  const marks = chosen
    .map((p, i) => {
      const isNow = p.index === last;
      // 用户定：晴/多云间晴的夜间版（月亮）只在 now 出现——只有最后一点按拍摄当时的钟点判昼夜，
      // 其余点一律用白天版（基础分类）。
      const cat = isNow ? weatherCategoryAt(hourly[last].code, hourly[last].time) : p.cat;
      return `<div class="fw-mark${isNow ? " is-now" : ""}" style="left:${pos[i].toFixed(2)}%">
          <span class="fw-icon">${weatherIconSvg(cat)}</span>
        </div>`;
    })
    .join("");

  // 两端时间标签（用户 2.2）：各自对齐到端点图例的正下方（不再贴容器最左/最右）。
  // -24 改成 -24h；用第一个/最后一个图例的百分比定位，translateX(-50%) 居中在图例下。
  const startPct = pos[0];
  const nowPct = pos[pos.length - 1];
  return `<div class="fw-track">${segs.join("")}${marks}</div>
      <div class="fw-axis"><span class="fw-axis-start" style="left:${startPct.toFixed(2)}%">-24h</span><span class="fw-axis-now" style="left:${nowPct.toFixed(2)}%">now</span></div>`;
}

// 补充/细节图的单个天气图例（用户 2.4）：这张图「拍摄当时」那一点的天气，一个图标。
// media.weather.hourly 最后一点 = 拍摄当时。没抓到或没勾「显示天气」则返回空。
function singleWeatherIconFor(media) {
  const hourly = media?.weather?.hourly;
  if (!Array.isArray(hourly) || !hourly.length) {
    return "";
  }
  const last = hourly[hourly.length - 1];
  const cat = weatherCategoryAt(last?.code, last?.time);
  return cat ? weatherIconSvg(cat) : "";
}

function renderFocusInfo(item) {
  const isContributed = item.submissionType === "contributed";
  const approx = (flag) => (flag ? escapeHtml(UI_TEXT.approxPrefix.en) : "");
  const rows = [];
  // Fixed priority order (用户 #4, works for both own & contributed; missing rows
  // are skipped): time → type → object → state → place → submitted → by.
  // Contributed times are rough/free-text → loose-date format; own times ISO.
  const timeText = isContributed ? formatLooseDate(item.time) : formatDateTime(item.time);
  if (timeText) {
    rows.push({ label: "time", lines: [`${approx(item.timeApprox)}${escapeHtml(timeText)}`] });
  }
  if (!isContributed) {
    const typeValue = formatInformationType(item);
    if (typeValue) {
      rows.push({ label: "type", lines: [escapeHtml(typeValue)] });
    }
    if (item.objectLines?.length) {
      rows.push({ label: "object", lines: item.objectLines.map((l) => escapeHtml(l)) });
    }
    if (item.statusLines?.length) {
      rows.push({ label: "state", lines: item.statusLines.map((l) => escapeHtml(l)) });
    }
  }
  if (item.location) {
    rows.push({ label: "place", lines: [`${approx(item.locationApprox)}${formatAddressBreaks(item.location)}`] });
  }
  // Submission time (用户 #4: previously not shown, sits just before "by").
  // English label "submitted".
  const submittedText = formatLooseDate(item.submissionTime);
  if (submittedText) {
    rows.push({ label: "submitted", lines: [escapeHtml(submittedText)] });
  }
  if (isContributed) {
    // 投稿者留空默认显示 Anonymous（英文，用户 2）。
    rows.push({ label: "by", lines: [escapeHtml((item.submitter || "").trim() || "Anonymous")] });
  }
  // 主图天气横轴（用户 2.4）：放回覆盖信息块底部——即「图片之上」，和 v128 前的位置一样。
  // 因为它在 .focus-overlay-info 里，放大灯箱时会随整块覆盖信息一起隐藏（顺带满足 2.1）。
  const cover = (item.media || []).find((m) => m.role === "primary") || item.media?.[0];
  const axis =
    cover && cover.showWeather !== false && cover.weather ? renderFocusWeatherAxis(cover.weather) : "";
  const weatherHtml = axis ? `<div class="focus-weather">${axis}</div>` : "";
  if (!rows.length && !weatherHtml) {
    return "";
  }
  return `<div class="focus-info">
        ${rows
          .map(
            (row) => `<div class="focus-info-row">
              <span class="focus-info-label">${row.label}:</span>
              <div class="focus-info-value">${row.lines.map((line) => `<p>${line}</p>`).join("")}</div>
            </div>`,
          )
          .join("")}
      </div>${weatherHtml}`;
}

// Non-destructive crop (用户 #8): a media's `crop` = { aspect, scale, posX, posY }
// (or null = original). Returns inline styles to display just the cropped region —
// pure CSS, so the original file is never touched. Fixed aspect = aspect-ratio box +
// object-fit:cover; "free" keeps the natural aspect and just zooms/pans. null = none.
function cropStyles(crop) {
  if (!crop || typeof crop !== "object") {
    return null;
  }
  const scale = Number.isFinite(crop.scale) ? crop.scale : 1;
  const posX = Number.isFinite(crop.posX) ? crop.posX : 50;
  const posY = Number.isFinite(crop.posY) ? crop.posY : 50;
  const origin = `${posX}% ${posY}%`;
  // The crop box aspect: a fixed "w:h", or (for "free") the stored natural ratio ar.
  let arCss = null;
  if (crop.aspect && crop.aspect !== "free" && /^\d+:\d+$/.test(crop.aspect)) {
    const [w, h] = crop.aspect.split(":");
    arCss = `${w}/${h}`;
  } else if (Number.isFinite(crop.ar) && crop.ar > 0) {
    arCss = String(crop.ar);
  }
  if (arCss) {
    return {
      wrap: `aspect-ratio:${arCss};`,
      img: `width:100%;height:100%;object-fit:cover;object-position:${posX}% ${posY}%;transform:scale(${scale});transform-origin:${origin};`,
    };
  }
  return { wrap: "", img: `width:100%;height:auto;transform:scale(${scale});transform-origin:${origin};` };
}

// The crop box's numeric aspect ratio (w/h) for a FIXED-aspect crop or a "自由/custom"
// crop (its chosen ratio is stored in `ar`), else null ("free"=原图 keeps the image's
// own aspect). Used to size the enlarged lightbox box to the cropped shape (用户 #8/T4).
function cropAspectRatioNumber(crop) {
  if (!crop || typeof crop !== "object") {
    return null;
  }
  if (crop.aspect && crop.aspect !== "free" && /^\d+:\d+$/.test(crop.aspect)) {
    const [w, h] = crop.aspect.split(":");
    return Number(w) / Number(h);
  }
  // 用户 T4: 自由比例 stores its box ratio in `ar` (aspect === "custom").
  if (crop.aspect === "custom" && Number.isFinite(crop.ar) && crop.ar > 0) {
    return crop.ar;
  }
  return null;
}

// Apply (or clear) a non-destructive crop on the SHARED #focus-image element — used
// for both the detail-page cover and the lightbox, which reuse the same <img> (用户
// #8). Unlike the article photos (which wrap the img in their own .media-crop box),
// here we crop by turning the frame into the crop's aspect box + object-fit:cover on
// the img, and folding the crop's own zoom into the --crop-scale var (so the
// lightbox's pan/zoom still multiplies cleanly on top).
function applyFocusCrop(crop) {
  const frame = els.focusImageFrame;
  const img = els.focusImage;
  if (!frame || !img) {
    return;
  }
  if (!crop || typeof crop !== "object") {
    frame.classList.remove("is-cropped", "is-crop-free");
    frame.style.removeProperty("--crop-ar");
    img.style.removeProperty("--crop-x");
    img.style.removeProperty("--crop-y");
    img.style.setProperty("--crop-scale", "1");
    return;
  }
  const posX = Number.isFinite(crop.posX) ? crop.posX : 50;
  const posY = Number.isFinite(crop.posY) ? crop.posY : 50;
  const scale = Number.isFinite(crop.scale) ? crop.scale : 1;
  const ar = cropAspectRatioNumber(crop);
  frame.classList.add("is-cropped");
  frame.classList.toggle("is-crop-free", ar === null);
  if (ar !== null) {
    frame.style.setProperty("--crop-ar", String(ar));
  } else {
    frame.style.removeProperty("--crop-ar");
  }
  img.style.setProperty("--crop-x", `${posX}%`);
  img.style.setProperty("--crop-y", `${posY}%`);
  img.style.setProperty("--crop-scale", String(scale));
}

// HTML for one content block (paragraph / dialogue / photo / video). Returns ""
// for empty or unresolved blocks.
function renderFocusBlockHtml(block, mediaByFile, opts = {}) {
  if (block.type === "dialogue") {
    // Speaker on the left, line on the right, italic + left rule (item 12).
    const text = localize(block.text);
    if (!text) {
      return "";
    }
    return `<blockquote class="focus-dialogue">${renderDialogueLines(text)}</blockquote>`;
  }
  if (block.type === "text") {
    const text = localize(block.text);
    if (!text) {
      return "";
    }
    // Each "\n" in the stored text is a paragraph break; render one <p> per
    // paragraph so the line breaks actually show. Japanese justifies both
    // edges, English stays left-aligned ([[text-justify-rule]]).
    const justify = state.lang === "ja" ? " is-justify" : "";
    const paras = text
      .split("\n")
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p class="item-story${justify}">${escapeHtml(para)}</p>`)
      .join("");
    // 用户 #7: paragraphs get a white left rule, like the dialogue block.
    return `<div class="focus-text-block">${paras}</div>`;
  }
  const media = mediaByFile[block.file];
  if (!media) {
    return "";
  }
  // Caption "title, ID, time" (title omitted when empty), small + right-aligned.
  // Per role (item 8): 插图 shows nothing; 细节 shows title (if any) + id, no
  // time; 补充 shows title + id + time. 用户 #12: a CONTRIBUTED umbrella hides the
  // id (filename) on 补充/细节 (own umbrellas keep it as before).
  const showId = !opts.isContributed;
  const idPart = showId ? media.id : null;
  const caption =
    media.role === "illustration"
      ? ""
      : media.role === "detail"
        ? [media.title, idPart].filter(Boolean).join(", ")
        : [media.title, idPart, formatMediaCaptionTime(media)].filter(Boolean).join(", ");
  // Videos render as an inline player. 用户 #7: muted by default with a big centre
  // play button (native controls only appear once playing, so #13's persistent
  // progress bar no longer overlaps the caption). #9: also enlargeable.
  if (isVideoFile(media.file)) {
    return `<figure class="focus-photo focus-video-fig">
        <div class="focus-video-wrap">
          <video class="focus-video" muted playsinline preload="metadata" data-media-file="${escapeHtml(media.file)}" src="${escapeHtml(media.src)}"></video>
          <button class="focus-video-play" type="button" aria-label="play video">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z"/></svg>
          </button>
          <button class="focus-photo-zoom" type="button" aria-label="enlarge video" data-media-file="${escapeHtml(media.file)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg></button>
        </div>
        ${caption ? `<figcaption class="focus-video-cap">${escapeHtml(caption)}</figcaption>` : ""}
      </figure>`;
  }
  // Supplement/detail photos can be enlarged; illustrations cannot (#12).
  const expandable = media.role !== "illustration";
  const expandAttrs = expandable ? ` data-expandable="1" data-media-file="${escapeHtml(media.file)}"` : "";
  // Illustrations are often transparent PNGs — drop the drop-shadow so it
  // doesn't draw a rectangular halo around the transparent edges (用户要求).
  const figClass = media.role === "illustration" ? "focus-photo is-illustration" : "focus-photo";
  // 用户 #1: a magnifier hint (same style as the cover's) on enlargeable photos.
  const zoomBtn = expandable
    ? `<button class="focus-photo-zoom" type="button" aria-label="enlarge image" data-media-file="${escapeHtml(media.file)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg></button>`
    : "";
  // 用户 #8: show the (non-destructive) cropped region if this media has a crop.
  const cs = cropStyles(media.crop);
  const imgTag = `<img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.title || media.id || "")}" loading="lazy" decoding="async" style="${cs ? cs.img : ""}"${expandAttrs} />`;
  const mediaHtml = cs ? `<div class="media-crop" style="${cs.wrap}">${imgTag}</div>` : imgTag;
  // 用户 2.3：补充/细节图勾了「显示天气」时，详情页图注左边也放一个「拍摄当时」的天气图例
  // （和放大灯箱角标题里一样，之前只在放大时出现）。插图不显示。
  const wIcon = media.role !== "illustration" && media.showWeather ? singleWeatherIconFor(media) : "";
  const capInner = `${wIcon ? `<span class="fw-single">${wIcon}</span>` : ""}${caption ? `<span class="fw-cap-text">${escapeHtml(caption)}</span>` : ""}`;
  return `<figure class="${figClass}">
      ${mediaHtml}
      ${zoomBtn}
      ${wIcon || caption ? `<figcaption>${capInner}</figcaption>` : ""}
    </figure>`;
}

// Editor live-preview only: a single-column render of all content blocks in their
// on-disk order (the two-column split is for the real detail page).
function renderFocusArticle(item) {
  const mediaByFile = {};
  (item.media || []).forEach((m) => {
    mediaByFile[m.file] = m;
  });
  const opts = { isContributed: item.submissionType === "contributed" };
  const blocksHtml = effectiveBlocks(item)
    .filter((block) => block.type !== "photo" || mediaByFile[block.file]?.role !== "primary")
    .map((block) => renderFocusBlockHtml(block, mediaByFile, opts))
    .filter(Boolean)
    .join("");
  return `
    <div class="focus-caption-inner">
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
// Items belonging to a stats scope: own (作者自己拍的) vs contributed (投稿).
function statsScopeItems(scope) {
  return state.umbrellas.filter((item) =>
    scope === "contributed" ? item.submissionType === "contributed" : item.submissionType !== "contributed",
  );
}

function buildStatsUnits(items) {
  const units = [];
  (items || state.umbrellas).forEach((item) => {
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
        object: statsObjectCategory(u),
        state: status,
        month,
        place,
      });
    });
  });
  return units;
}

// `object` = colour + kind, merged into one descriptor. Two granularities:
//
// • statsObjectValue — the SPECIFIC value, shown in the overview table cells.
//   colored / patterned / other carry the free-text shade (e.g. "blue long
//   umbrella", "black long umbrella", "floral folding umbrella").
// • statsObjectCategory — the CATEGORY value, used by the cross-tab matrix (#4)
//   and the overview's object dropdown filter (#3). colored / patterned / other
//   collapse back to the category word ("colored long umbrella"), so a category
//   acts as a bucket that contains the specific shades beneath it.
//
// Long vs folding are always kept apart.
function objectKindWord(u) {
  return u.kind === "folding" ? "folding umbrella" : u.kind === "long umbrella" ? "long umbrella" : "unknown";
}

function statsObjectValue(u) {
  let color = u.color || "unknown";
  if (COLOR_NEEDS_DETAIL.has(u.color)) {
    color = String(u.colorDetail || "").trim() || u.color;
  }
  return `${color} ${objectKindWord(u)}`;
}

function statsObjectCategory(u) {
  return `${u.color || "unknown"} ${objectKindWord(u)}`;
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
  // The main Archive stats now cover the author's own (Original) umbrellas only;
  // contributed umbrellas have their own "Archive (contributed)" view.
  const ownItems = statsScopeItems("own");
  els.archiveContent.innerHTML = `
    <p class="stats-intro${introJustify}">${escapeHtml(intro)}</p>
    ${renderStatsPivot(buildStatsUnits(ownItems))}
    ${renderStatsOverview(ownItems)}
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
  // object = specific value shown in the cell; objectCategory = bucket used by
  // the dropdown filter (#3).
  const single = (object, objectCategory, stateValues) => ({
    ...base,
    idLabel: displayUmbrellaId(item),
    object,
    objectCategory,
    stateValues,
    stateText: stateValues.join(", "),
  });
  if (item.umbrellaCount === "unknown") {
    return [single("unknown", "unknown", ["unknown"])];
  }
  const raw = Array.isArray(item.umbrellaUnits) ? item.umbrellaUnits : [];
  const n = Number(item.umbrellaCount);
  if (!(Number.isInteger(n) && n >= 1)) {
    return [single(statsObjectValue(raw[0] || {}), statsObjectCategory(raw[0] || {}), normalizeStateValues(raw[0]))];
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
      idLabel: n >= 2 ? `${displayUmbrellaId(item)}(${i + 1})` : displayUmbrellaId(item),
      object: statsObjectValue(u),
      objectCategory: statsObjectCategory(u),
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
function renderStatsOverview(items) {
  const allRows = (items || state.umbrellas).flatMap(overviewRowsForItem);

  const filters = state.overviewFilters;
  const filtered = allRows.filter(
    (r) =>
      (filters.object === "all" || r.objectCategory === filters.object) &&
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

  const objectValues = [...new Set(allRows.map((r) => r.objectCategory))].sort((a, b) => a.localeCompare(b));
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
              <th class="overview-sort" data-overview-sort="img" title="按 IMG 排（默认）">IMG${overviewSortArrow("img")}</th>
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

// Parse a loose date string (ISO, "2026.04.23 22:36", "2024.10",
// "2026.04.23, around 18:00", …) into its parts. Used for both display and sort.
function parseLooseDateParts(value) {
  const m = String(value || "").match(/(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?(?:[^\d]+(\d{1,2}):(\d{2}))?/);
  if (!m) {
    return null;
  }
  const [, y, mo, da, hh, mm] = m;
  return { y: Number(y), mo: Number(mo), da: da ? Number(da) : 0, hh: hh != null ? Number(hh) : null, mm: mm != null ? Number(mm) : 0 };
}

// Display a loose date with "/" separators; drop a meaningless 00:00 and any
// "around"/text noise (用户要求：投稿伞时间统一格式). Falls back to the raw text.
function formatLooseDate(value) {
  const parts = parseLooseDateParts(value);
  if (!parts) {
    return String(value || "").trim();
  }
  const p = (n) => String(n).padStart(2, "0");
  let out = `${parts.y}/${p(parts.mo)}`;
  if (parts.da) {
    out += `/${p(parts.da)}`;
  }
  if (parts.hh != null && !(parts.hh === 0 && parts.mm === 0)) {
    out += ` ${p(parts.hh)}:${p(parts.mm)}`;
  }
  return out;
}

// Year/month/day only — drop any hour:minute (item 8, 投稿时间). Falls back to
// the raw trimmed text if it can't be parsed.
function formatDateOnly(value) {
  const parts = parseLooseDateParts(value);
  if (!parts) {
    return String(value || "").trim();
  }
  const p = (n) => String(n).padStart(2, "0");
  return parts.da ? `${parts.y}/${p(parts.mo)}/${p(parts.da)}` : `${parts.y}/${p(parts.mo)}`;
}

// A sortable numeric key from a loose date string (earlier = smaller).
function looseDateKey(value) {
  const parts = parseLooseDateParts(value);
  if (!parts) {
    return 0;
  }
  return parts.y * 1e8 + parts.mo * 1e6 + parts.da * 1e4 + (parts.hh || 0) * 100 + parts.mm;
}

// Build "Name" / "Name（k）" labels for contributed records — same submitter with
// multiple submissions gets a numbered suffix (item 3). Numbered by submission
// time then id for stability.
function contributedSubmitterLabels(items) {
  const byName = {};
  items.forEach((it) => {
    const n = it.submitter || "(unknown)";
    (byName[n] = byName[n] || []).push(it);
  });
  const labels = new Map();
  Object.entries(byName).forEach(([name, list]) => {
    list.sort((a, b) => looseDateKey(a.submissionTime) - looseDateKey(b.submissionTime) || String(a.id).localeCompare(b.id));
    list.forEach((it, i) => labels.set(it.id, list.length > 1 ? `${name}(${i + 1})` : name));
  });
  return labels;
}

// Contributed photo time → month group (precise to month, item 10). Loose dates
// (dots/commas) are parsed with parseLooseDateParts so they group correctly.
function groupContributedByMonth(items) {
  const groups = new Map();
  items.forEach((it) => {
    const parts = parseLooseDateParts(it.time || it.photoTime);
    const key = parts ? `${parts.y}-${String(parts.mo).padStart(2, "0")}` : "0000-no";
    const label = parts ? `${parts.y}/${String(parts.mo).padStart(2, "0")}` : state.lang === "ja" ? "時間不明" : "time needed";
    if (!groups.has(key)) {
      groups.set(key, { key: `m-${key}`, label, items: [] });
    }
    groups.get(key).items.push(it);
  });
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, g]) => g);
}

// The 47 Japanese prefectures (romaji, as stored in locationLevels[0]); anything
// else (China, unknown, …) groups as 海外 / Overseas (item 10).
const JAPAN_PREFECTURES = new Set([
  "Hokkaido", "Aomori", "Iwate", "Miyagi", "Akita", "Yamagata", "Fukushima",
  "Ibaraki", "Tochigi", "Gunma", "Saitama", "Chiba", "Tokyo", "Kanagawa",
  "Niigata", "Toyama", "Ishikawa", "Fukui", "Yamanashi", "Nagano", "Gifu",
  "Shizuoka", "Aichi", "Mie", "Shiga", "Kyoto", "Osaka", "Hyogo", "Nara",
  "Wakayama", "Tottori", "Shimane", "Okayama", "Hiroshima", "Yamaguchi",
  "Tokushima", "Kagawa", "Ehime", "Kochi", "Fukuoka", "Saga", "Nagasaki",
  "Kumamoto", "Oita", "Miyazaki", "Kagoshima", "Okinawa",
]);

// Contributed place → prefecture group; non-Japan → 海外 (item 10).
function groupContributedByCity(items) {
  const groups = new Map();
  items.forEach((it) => {
    const levels = Array.isArray(it.locationLevels) ? it.locationLevels : [];
    const pref = levels[0];
    // Non-Japan always groups as English "Overseas", even in 日本語 (用户要求 item 1).
    const label = JAPAN_PREFECTURES.has(pref) ? pref : "Overseas";
    if (!groups.has(label)) {
      groups.set(label, { key: `c-${label}`, label, items: [] });
    }
    groups.get(label).items.push(it);
  });
  return Array.from(groups.values()).sort(
    (a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label),
  );
}

// The contributed Archive scope (item 3/10): a sort toolbar (撮影時間/場所, both
// grouped like Fieldwork) over a photo-card grid, plus a 統計 overview table.
function renderContributedArchive() {
  if (!els.contributedContent) {
    return;
  }
  const items = state.umbrellas.filter((item) => item.submissionType === "contributed");
  const ja = state.lang === "ja";
  const mode = state.contributedMode || "photo";

  const arrow = (key) =>
    `<span class="sort-arrow" aria-hidden="true">${
      mode === key ? (state.contributedOrder === "asc" ? " ↑" : " ↓") : ""
    }</span>`;
  const btn = (key, label, withArrow = true) =>
    `<button type="button" class="archive-control${mode === key ? " is-active" : ""}" data-contrib-mode="${key}">${label}${withArrow ? arrow(key) : ""}</button>`;
  const toolbar = `
    <div class="archive-toolbar" aria-label="contributed sort controls">
      <p data-i18n="sortBy">${ja ? "並び替え" : "Sort by"}</p>
      <div class="archive-primary-row">
        <div class="archive-toolbar-group" role="group" aria-label="sort mode">
          ${btn("photo", ja ? "撮影日時" : "Taken")}
          ${btn("location", ja ? "場所" : "Location")}
          ${btn("stats", ja ? "統計" : "Stats", false)}
        </div>
      </div>
    </div>`;

  if (mode === "stats") {
    els.contributedContent.innerHTML = toolbar + renderContributedOverview(items);
    return;
  }

  // Grouped grid (撮影時間 → by month, 場所 → by city) like Fieldwork (item 10).
  let groups = mode === "location" ? groupContributedByCity(items) : groupContributedByMonth(items);
  if (mode === "photo" && state.contributedOrder === "asc") {
    groups = groups.slice().reverse();
  }
  els.contributedContent.innerHTML = toolbar + groups.map((group) => renderArchiveGroup(group)).join("");
  els.contributedContent.querySelectorAll("[data-group-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.groupToggle;
      if (state.archiveCollapsedGroups.has(key)) {
        state.archiveCollapsedGroups.delete(key);
      } else {
        state.archiveCollapsedGroups.add(key);
      }
      renderContributedArchive();
    });
  });
}

// Contributed stats overview: contributor / submitted / taken / place. English
// labels regardless of site language (item 3/9). Default order = contributor
// alphabetical; submitted/taken/place toggle direction; contributor resets.
function renderContributedOverview(items) {
  const labels = contributedSubmitterLabels(items);
  const key = state.contribOverviewSortKey || "submitter";
  const dir = state.contribOverviewSortDir === "desc" ? -1 : 1;
  const keyFns = {
    submitter: (it) => labels.get(it.id) || "",
    submitted: (it) => looseDateKey(it.submissionTime),
    taken: (it) => looseDateKey(it.time || it.photoTime),
    place: (it) => (it.location || "").toLowerCase(),
  };
  const kf = keyFns[key] || keyFns.submitter;
  const sorted = items.slice().sort((a, b) => {
    const ka = kf(a);
    const kb = kf(b);
    let d = 0;
    if (typeof ka === "number") {
      d = ka - kb;
    } else {
      d = String(ka).localeCompare(String(kb));
    }
    return (d || String(labels.get(a.id)).localeCompare(String(labels.get(b.id)))) * dir;
  });
  // Same arrow glyphs as the Fieldwork overview (item 9).
  const arrow = (k) => (key === k ? (dir === 1 ? " ↑" : " ↓") : "");
  const head = (k, label) => `<th class="overview-sort" data-contrib-overview-sort="${k}">${label}${arrow(k)}</th>`;
  const rows = sorted
    .map(
      (it) =>
        `<tr>` +
        `<td class="overview-id" data-overview-id="${escapeHtml(it.id)}">${escapeHtml(labels.get(it.id) || "")}</td>` +
        `<td>${escapeHtml(formatDateOnly(it.submissionTime))}</td>` +
        `<td>${escapeHtml(formatLooseDate(it.time || it.photoTime))}</td>` +
        `<td>${escapeHtml(it.location || "")}</td>` +
        `</tr>`,
    )
    .join("");
  return `
    <section class="stats-block">
      <h3 class="stats-heading">${state.lang === "ja" ? "総覧" : "overview"} (${sorted.length})</h3>
      <div class="stats-table-wrap">
        <table class="stats-table stats-overview">
          <thead><tr>
            ${head("submitter", "contributor")}
            ${head("submitted", "submitted")}
            ${head("taken", "taken")}
            ${head("place", "place")}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderArchive() {
  if (!els.archiveContent) {
    return;
  }

  // The Archive page is independent of the map sidebar search (state.query): it
  // has its own chips/sub-filters. Start from the author's own (Original) records
  // only — contributed umbrellas live in the "Archive (contributed)" view.
  const items = state.umbrellas.filter((item) => item.submissionType !== "contributed");

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
          <svg viewBox="0 0 24 14" aria-hidden="true" focusable="false"><path d="${collapsed ? "M4 4l8 6 8-6" : "M4 10l8-6 8 6"}" /></svg>
        </button>
      </div>
      <div class="archive-group-body">
        ${group.children ? group.children.map((child) => renderArchiveGroup(child)).join("") : `<div class="photo-grid">${group.items.map((item) => renderPhotoCard(item)).join("")}</div>`}
      </div>
    </section>
  `;
}

// Small inline logos shown on the corner of an archive card.
// 卡片角标图标（Lucide）：多图 images / 插图 pencil-sparkles / 有文本 letter-text / 有视频 video。
const CARD_ICON_MULTI =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16"/><path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/><circle cx="13" cy="7" r="1" fill="currentColor"/><rect x="8" y="2" width="14" height="14" rx="2"/></svg>';
const CARD_ICON_ILLUSTRATION =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3H8"/><path d="m15.007 5.008 3.987 3.986"/><path d="M20 15v4"/><path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="M22 17h-4"/><path d="M4 5v4"/><path d="M6 7H2"/><path d="M9 2v2"/></svg>';
const CARD_ICON_TEXT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5h6"/><path d="M15 12h6"/><path d="M3 19h18"/><path d="m3 12 3.553-7.724a.5.5 0 0 1 .894 0L11 12"/><path d="M3.92 10h6.16"/></svg>';
// 用户: shown on a card's bottom-right corner when the record has a video.
const CARD_ICON_VIDEO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';

// A record "has text" if any of its content blocks is a non-empty paragraph
// (blocks store {ja,en}); fall back to the legacy joined story string.
function recordHasText(item) {
  const blocks = Array.isArray(item.blocks) ? item.blocks : [];
  const hasBlockText = blocks.some((b) => {
    if (b.type !== "text") {
      return false;
    }
    return typeof b.text === "object" ? Boolean(b.text?.ja || b.text?.en) : Boolean(String(b.text || "").trim());
  });
  return hasBlockText || Boolean((item.story || "").trim());
}

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
  if (recordHasText(item)) {
    badges.push(`<span class="card-badge" title="有文本">${CARD_ICON_TEXT}</span>`);
  }
  // 用户: a video logo when the record carries a video clip.
  if (media.some((m) => isVideoFile(m.file))) {
    badges.push(`<span class="card-badge" title="有视频">${CARD_ICON_VIDEO}</span>`);
  }

  const cardTitle = localize(item.title);
  const titleHtml = cardTitle ? `<span class="card-title">${escapeHtml(cardTitle)}</span>` : "";
  // 用户 T5 (v122): a red dot on cards flagged 待改 (editFlag). Internal reminder, so
  // it only shows in edit mode — the same rule as the map markers' 待改 colouring.
  const flagDot = state.editMode && item.editFlag ? `<span class="card-flag-dot" title="待改（这个标点后续需要修改）"></span>` : "";

  return `
    <article class="photo-card" data-id="${escapeHtml(item.id)}">
      <div class="card-photo">
        <img src="${item.thumb}" alt="${escapeHtml(displayUmbrellaId(item))}" loading="lazy" decoding="async" />
        ${flagDot}
        ${badges.length ? `<div class="card-badges">${badges.join("")}</div>` : ""}
        <button type="button" class="card-edit" data-card-edit aria-label="编辑此记录" title="编辑此记录">✎</button>
      </div>
      <div class="card-bar">
        <span class="card-id">${escapeHtml(displayUmbrellaId(item))}</span>
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
  const title = displayUmbrellaId(item);
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
  // "unknown" 是保存值（"这级已知、下面不确定"），照常存进 record；但对外**不显示**。
  // 这里是所有展示用地址的正规化入口，直接把 unknown 过滤掉（编辑器复原读的是 raw，不受影响）。
  return Array.isArray(levels)
    ? levels
        .map((level) => String(level || "").trim())
        .filter((level) => level && level.toLowerCase() !== "unknown")
        .slice(0, 3)
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
  const groups = new Map();

  items.forEach((item) => {
    const date = new Date(item.time);
    const hasTime = Number.isFinite(date.getTime());
    // Always "YYYY/MM" regardless of site language (item 3) — no "2026年5月".
    const yyyymm = hasTime ? `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}` : "";
    const key = hasTime ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "no-time";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: hasTime ? yyyymm : "time needed",
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
  document.body.classList.add("view-map");
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

  // 用户 bug 修复：已经在某标点的详情页时，再次点击同一个标点（不论是否平移/缩放过地图），
  // 应该只「重新聚焦地图 + 恢复模糊」，而**详情页保持原样不动**（不回顶部、不重渲染、不重置
  // 放大/图片索引）。之前会走下面的 render()+openFocusMode()→scrollTo(top:0)，把详情页拽回主图。
  const reFocusingSame =
    options.focus &&
    state.selectedId === id &&
    els.mapView?.classList.contains("is-focus-mode");
  if (reFocusingSame) {
    state.focusMarkerId = id;
    state.suppressNextFit = true;
    if (state.googleReady) {
      const item = state.umbrellas.find((entry) => entry.id === id);
      if (item) {
        focusUmbrellaOnMap(item, id);
      }
    }
    setFocusBlurSuppressed(false); // 平移/缩放后模糊被抑制过，这里恢复
    return;
  }

  state.selectedId = id;
  state.focusMediaIndex = 0;

  if (options.focus) {
    // Remember the zoom from BEFORE this focus so we can restore it on exit
    // (item 6) — only when entering focus fresh, not re-clicking the focused one.
    const wasFocused = els.mapView?.classList.contains("is-focus-mode");
    if (!wasFocused && state.googleReady && state.map?.getZoom) {
      state.preFocusZoom = Math.round(state.map.getZoom());
    }
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
  // v122 用户 T1/T2: 普通标点 and 模糊标点 now share ONE blur — the full-screen
  // `.focus-blur` overlay (see CSS). We only toggle the mode class; the overlay's
  // radius / white veil / blur strength swap via CSS variables, and it animates
  // smoothly (opacity + registered @property). No floatPane layer, no replica pin
  // (that caused the instant look + the hover-through-the-replica bug).
  els.mapView?.classList.toggle("is-blur-approx", Boolean(item.blurApprox));
  // Turn the focused pin blue (it sits in the clear/veiled circle, sharp; the
  // overlay softens every other pin behind it).
  updateMarkerIcons();
  // Under-pin label (item 3): custom text, or the display address as fallback.
  // It starts hidden (is-pending = opacity 0) and only fades in once the map has
  // finished animating to the point and settled (revealApproxLabel) — so the text
  // never appears mid-pan/zoom (用户要求 #3).
  if (els.focusApproxLabel) {
    const labelText = item.blurApprox ? item.blurLabel || item.location || "" : "";
    renderFocusApproxLabel(labelText, { pending: Boolean(labelText) });
  }
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
  // 用户: opening a marker's detail always starts at the top (main image) — never
  // carry over the scroll position from a previously-viewed detail page.
  els.focusScroll?.scrollTo({ top: 0 });
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
  pauseFocusVideos(); // #10: leaving the detail page stops any playing video.
  closeExpandedImage();
  els.mapView.classList.remove("is-focus-mode");
  els.mapView.classList.remove("is-blur-approx");
  // Restore the just-unfocused pin to its normal (non-blue) icon.
  updateMarkerIcons();
  if (els.focusApproxLabel) {
    renderFocusApproxLabel("");
  }
  els.focusPanel?.setAttribute("aria-hidden", "true");
  els.focusPanel?.classList.remove("is-loading");
  if (state.focusImageReadyFrame) {
    cancelAnimationFrame(state.focusImageReadyFrame);
    state.focusImageReadyFrame = 0;
  }
  els.focusImageFrame?.classList.remove("is-cover-reserved");
}

// #10: pause + reset any playing inline video in the detail panel. Called when the
// detail page closes or when an image is enlarged, so a video never keeps playing
// (with sound) behind the scenes.
function pauseFocusVideos() {
  // Only the INLINE article videos (.focus-video) — NOT the enlarged lightbox video
  // (#focus-expanded-video). It used to grab every <video> in the panel and strip its
  // controls, which left the just-enlarged video with no controls to play (用户 bug).
  els.focusPanel?.querySelectorAll("video.focus-video").forEach((video) => {
    if (!video.paused) {
      video.pause();
    }
    // Drop the native controls + restore the big play button overlay.
    video.controls = false;
    video.closest(".focus-video-fig")?.classList.remove("is-playing");
  });
}

// Media that can be enlarged: cover + supplement + detail (photos AND videos, 用户
// #9), but never illustrations.
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
  // #10: enlarging an image should stop any inline video that was playing.
  pauseFocusVideos();
  // 若上一次退出的淡出还没结束，取消它并清掉淡出态，避免新放大带着 .is-collapsing 半透明。
  if (state.collapseTimer) {
    window.clearTimeout(state.collapseTimer);
    state.collapseTimer = null;
  }
  els.focusPanel.classList.remove("is-collapsing");
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
    if (m.src && !isVideoFile(m.file)) {
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

// Swap the enlarged media to the current expandedIndex (used on open + switch).
// 用户 #9: the enlarged media can be a VIDEO (shown in a <video controls>, sized by
// its own dimensions, no pan/zoom) as well as a photo.
function loadExpandedImage() {
  const media = (state.focusMediaList || [])[state.expandedIndex];
  if (!media) {
    return;
  }
  state.imageZoom = 1;
  state.imagePanX = 0;
  state.imagePanY = 0;
  const isVideo = isVideoFile(media.file);
  els.focusPanel?.classList.toggle("is-video-expanded", isVideo);
  if (isVideo && els.focusExpandedVideo) {
    applyFocusCrop(null); // videos aren't cropped — reset the frame/img crop styles.
    if (els.focusImage) {
      els.focusImage.hidden = true;
    }
    els.focusExpandedVideo.hidden = false;
    els.focusExpandedVideo.controls = true; // ensure it's playable (用户 bug fix).
    if (els.focusExpandedVideo.getAttribute("src") !== media.src) {
      els.focusExpandedVideo.src = media.src;
    }
    updateExpandedCaption(media);
    // 用户 #3: don't reveal the box until we know the video's size, otherwise it
    // flashes at the wrong (stale) size/position for ~0.5s before metadata loads.
    if (els.focusExpandedVideo.videoWidth > 0) {
      els.focusPanel?.classList.remove("is-media-sizing");
      setExpandedImageFrame();
    } else {
      els.focusPanel?.classList.add("is-media-sizing");
    }
    return;
  }
  els.focusPanel?.classList.remove("is-media-sizing");
  if (els.focusExpandedVideo) {
    els.focusExpandedVideo.pause?.();
    els.focusExpandedVideo.hidden = true;
    els.focusExpandedVideo.removeAttribute("src");
  }
  if (!els.focusImage) {
    return;
  }
  els.focusImage.hidden = false;
  // 先显示 1280 网页版（详情页多半已缓存，秒开），随后后台下原图渐进式替换。
  cancelHiresUpgrade();
  els.focusImage.src = media.src;
  // 用户 #8: enlarge the CROPPED region, not the full original (the box is sized to
  // the crop's aspect in setExpandedImageFrame; pan/zoom multiplies on --crop-scale).
  applyFocusCrop(media.crop);
  updateExpandedCaption(media);
  // If the image is already cached the "load" listener won't fire, so size now.
  if (els.focusImage.complete && els.focusImage.naturalWidth > 0) {
    setExpandedImageFrame();
    updateExpandedImageTransform();
  }
  upgradeExpandedToOriginal(media);
}

// 渐进式高清：放大后先显示网页版(src)，后台用 XHR 下原图(original)，边下边走左下角
// 胶囊进度条；下完淡入替换。用户 2026-07-03 定的四条：中断/静默失败/跳过近同尺寸/最短显示。
function upgradeExpandedToOriginal(media) {
  cancelHiresUpgrade();
  const img = els.focusImage;
  const bar = els.focusHiresBar;
  if (!img || !media || isVideoFile(media.file)) {
    return;
  }
  const original = media.original;
  // 细节3：原图就是网页版 / 没有原图 → 不用升级。
  if (!original || original === media.src) {
    return;
  }
  const token = (state.hiresToken = (state.hiresToken || 0) + 1);
  const startedAt = performance.now();
  if (bar) {
    bar.classList.remove("is-done");
    bar.classList.add("is-active");
    setHiresProgress(0);
  }
  const xhr = new XMLHttpRequest();
  state.hiresXhr = xhr;
  xhr.open("GET", original, true);
  xhr.responseType = "blob";
  xhr.onprogress = (e) => {
    if (token === state.hiresToken && e.lengthComputable) {
      setHiresProgress(e.loaded / e.total);
    }
  };
  xhr.onload = () => {
    if (token !== state.hiresToken) {
      return;
    }
    state.hiresXhr = null;
    if (xhr.status < 200 || xhr.status >= 300 || !xhr.response) {
      finishHiresBar(bar, false); // 细节2：静默失败，继续显示网页版
      return;
    }
    setHiresProgress(1);
    const url = URL.createObjectURL(xhr.response);
    const pre = new Image();
    pre.onload = () => {
      if (token !== state.hiresToken) {
        URL.revokeObjectURL(url);
        return;
      }
      // 细节4：即使秒到 100%（缓存命中），也让胶囊至少显示 ~320ms 再淡出、再换图。
      const wait = Math.max(0, 320 - (performance.now() - startedAt));
      state.hiresTimer = window.setTimeout(() => {
        state.hiresTimer = null;
        if (token !== state.hiresToken) {
          URL.revokeObjectURL(url);
          return;
        }
        // 换成已解码好的原图 → 无空帧；再补一个轻淡入表示「变清晰了」。
        img.src = url;
        img.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 320, easing: "ease-out" });
        if (state.hiresObjectUrl) {
          URL.revokeObjectURL(state.hiresObjectUrl);
        }
        state.hiresObjectUrl = url;
        finishHiresBar(bar, true);
      }, wait);
    };
    pre.onerror = () => {
      URL.revokeObjectURL(url);
      finishHiresBar(bar, false);
    };
    pre.src = url;
  };
  xhr.onerror = () => {
    if (token === state.hiresToken) {
      state.hiresXhr = null;
      finishHiresBar(bar, false);
    }
  };
  xhr.send();
}

function setHiresProgress(ratio) {
  const clamped = Math.max(0, Math.min(1, ratio));
  els.focusHiresBar?.style.setProperty("--hires-progress", String(clamped));
}

// 进度条收尾：done=true 走满再淡出；done=false（失败）直接淡出。
function finishHiresBar(bar, done) {
  if (!bar) {
    return;
  }
  if (done) {
    setHiresProgress(1);
  }
  bar.classList.remove("is-active");
  bar.classList.toggle("is-done", Boolean(done));
}

// 取消/清理正在进行的高清升级（切图、关闭、重开时调用）。递增 token 让回调作废。
function cancelHiresUpgrade() {
  state.hiresToken = (state.hiresToken || 0) + 1;
  if (state.hiresXhr) {
    state.hiresXhr.abort(); // 细节1：切图/关闭立刻中断下载，不浪费流量
    state.hiresXhr = null;
  }
  if (state.hiresTimer) {
    window.clearTimeout(state.hiresTimer);
    state.hiresTimer = null;
  }
  if (state.hiresObjectUrl) {
    URL.revokeObjectURL(state.hiresObjectUrl);
    state.hiresObjectUrl = null;
  }
  if (els.focusHiresBar) {
    els.focusHiresBar.classList.remove("is-active", "is-done");
    setHiresProgress(0);
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

// A media caption time with a stray midnight clock removed (用户: date-only times
// were showing a wrong "00:00"). Real clock times are kept.
function formatMediaCaptionTime(media) {
  return String(formatDateTime(mediaDisplayTime(media))).replace(/\s+0?0:00(?::00)?$/, "");
}

// Corner caption on the enlarged photo: "title, id, time" — same content/style
// as a detail-page photo caption; shown for every photo incl. the cover (#3).
// 用户 #2: a CONTRIBUTED umbrella hides the filename (id) here too (same rule as the
// article photos), and the stray "00:00" is stripped.
function updateExpandedCaption(media) {
  if (!els.focusExpandedCaption) {
    return;
  }
  const item = state.umbrellas.find((entry) => entry.id === state.selectedId);
  const idPart = item?.submissionType === "contributed" ? null : media.id;
  const text = [media.title, idPart, formatMediaCaptionTime(media)].filter(Boolean).join(", ");
  // 用户 2.4：勾了「显示天气」的补充/细节图，在【标题/文件名/时间】信息左边放一个「拍摄当时」的天气图例。
  const icon = media.showWeather ? singleWeatherIconFor(media) : "";
  els.focusExpandedCaption.innerHTML = `${icon ? `<span class="fw-single">${icon}</span>` : ""}${text ? `<span class="fw-cap-text">${escapeHtml(text)}</span>` : ""}`;
  els.focusExpandedCaption.hidden = !text && !icon;
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
    .map((m, i) => {
      // 用户 #2: a video thumb ALWAYS uses a muted <video> (an <img> can't show an
      // mp4 — a stale/invalid thumb made it render a broken image). "#t=0.1" seeks a
      // first frame so the poster isn't black. A small play badge sits on top.
      const inner = isVideoFile(m.file)
        ? `<video src="${escapeHtml(m.src)}#t=0.1" muted preload="metadata" playsinline disablepictureinpicture></video><span class="focus-thumb-play" aria-hidden="true"></span>`
        : `<img src="${escapeHtml(m.thumb || m.src)}" alt="" loading="lazy" decoding="async" />`;
      return `<button type="button" class="focus-thumb ${i === state.expandedIndex ? "is-active" : ""}" data-thumb-index="${i}" aria-label="media ${i + 1}">${inner}</button>`;
    })
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
  // 用户 T1: use the projection (consistent bulb-centre convention) rather than the
  // marker's DOM rect. The DOM rect used a different vertical convention, so its start
  // point didn't match getCenterForMarkerScreenPoint — the first animation frame
  // placed the pin low, then it "snapped" back. Projection = no jump.
  const markerScreen = getLatLngScreenPoint(markerLatLng);
  const target = getFocusTargetScreenPoint();
  const drift = Math.hypot(markerScreen.x - target.x, markerScreen.y - target.y);
  if (drift > 24) {
    animateMarkerToFocus(item);
  }
}

// 用户 🅑：退出放大先淡出再收起。
// - animate=true（点遮罩/按 Esc 关闭）：先加 .is-collapsing 让大图原地 opacity→0，~200ms 后
//   再真正收回（finalizeCloseExpanded）。这样能看到淡出，而不是瞬间跳回详情页。
// - animate=false（切换标点、离开详情页等程序性拆除）：立即收起，不留 200ms 延迟。
function closeExpandedImage(animate = false) {
  const panel = els.focusPanel;
  const wasExpanded = state.imageExpanded;
  const viewedMedia = (state.focusMediaList || [])[state.expandedIndex];
  if (animate && wasExpanded && panel?.classList.contains("is-expanded")) {
    if (state.collapseTimer) return; // 已在淡出中，忽略重复触发
    state.imageExpanded = false; // 立刻挡住滑动/再次点击的处理
    panel.classList.add("is-collapsing");
    state.collapseTimer = window.setTimeout(() => {
      state.collapseTimer = null;
      finalizeCloseExpanded(true, viewedMedia);
    }, 200);
    return;
  }
  if (state.collapseTimer) {
    window.clearTimeout(state.collapseTimer);
    state.collapseTimer = null;
  }
  finalizeCloseExpanded(wasExpanded, viewedMedia);
}

function finalizeCloseExpanded(wasExpanded, viewedMedia) {
  cancelHiresUpgrade(); // 中断没下完的原图 + 撤销 blob（下方会把封面 src 还原成网页版）
  state.imageExpanded = false;
  state.imageZoom = 1;
  state.imagePanX = 0;
  state.imagePanY = 0;
  state.imageFrameWidth = 0;
  state.imageFrameHeight = 0;
  state.imageDragStart = null;
  state.flipResize = false;
  els.focusPanel?.classList.remove("is-expanded");
  els.focusPanel?.classList.remove("is-collapsing");
  els.focusPanel?.classList.remove("is-video-expanded");
  els.focusPanel?.classList.remove("is-media-sizing");
  els.mapView?.classList.remove("is-image-expanded");
  document.body.classList.remove("is-image-expanded");
  // #9: leaving the lightbox stops + hides the enlarged video, restores the image.
  if (els.focusExpandedVideo) {
    els.focusExpandedVideo.pause?.();
    els.focusExpandedVideo.hidden = true;
    els.focusExpandedVideo.removeAttribute("src");
  }
  if (els.focusImage) {
    els.focusImage.hidden = false;
  }
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
  // 用户 #8: restore the cover's crop (the lightbox may have shown a differently-
  // cropped supplement/detail photo or a video).
  applyFocusCrop(cover?.crop);
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
  // #9: no pan/zoom for an enlarged video (it fits the box + uses its own controls).
  if (els.focusExpandedVideo && !els.focusExpandedVideo.hidden) {
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

  // 用户 #9: size the box from whichever media is enlarged (video → its own dims).
  const isVideo = els.focusExpandedVideo && !els.focusExpandedVideo.hidden;
  const naturalWidth = isVideo
    ? els.focusExpandedVideo.videoWidth || 16
    : els.focusImage.naturalWidth || els.focusImage.width || 1;
  const naturalHeight = isVideo
    ? els.focusExpandedVideo.videoHeight || 9
    : els.focusImage.naturalHeight || els.focusImage.height || 1;
  // 用户 #8: a fixed-aspect crop makes the enlarged box the CROPPED shape (object-fit
  // cover then shows the cropped region); "free"/no crop keeps the file's own shape.
  const cropAr = isVideo
    ? null
    : cropAspectRatioNumber((state.focusMediaList || [])[state.expandedIndex]?.crop);
  const ratio = cropAr || naturalWidth / naturalHeight;
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
  // 用户 1.1：放大居中在 v127 已改成 inset:0 + margin:auto（不再靠 translate(-50%,-50%)）。
  // 这里的 FLIP 若还带 translate(-50%,-50%) 就会把面板整体挪到左上再缩回——切换不同比例
  // 图片时那个「跳一下再缩回」的怪动画就是它。改成纯 scale（默认 transform-origin 是中心，
  // margin:auto 已居中，从中心缩放不会偏移）。
  panel.style.transition = "none";
  panel.style.transform = `scale(${sx}, ${sy})`;
  panel.getBoundingClientRect(); // commit the inverted state
  panel.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
  panel.style.transform = "scale(1, 1)";
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
  // Restore the zoom the map had BEFORE the point was clicked (item 6), rounded
  // to an integer, instead of always snapping back to DEFAULT_MAP_ZOOM.
  const targetZoom = Number.isFinite(state.preFocusZoom) ? state.preFocusZoom : DEFAULT_MAP_ZOOM;
  const markerLatLng = new google.maps.LatLng(item.coordinates.lat, item.coordinates.lng);
  // 用户 T1: use the projection (consistent bulb-centre convention) rather than the
  // marker's DOM rect. The DOM rect used a different vertical convention, so its start
  // point didn't match getCenterForMarkerScreenPoint — the first animation frame
  // placed the pin low, then it "snapped" back. Projection = no jump.
  const markerScreen = getLatLngScreenPoint(markerLatLng);
  const startZoom = state.map.getZoom();
  // Already at the target zoom (e.g. 模糊地址 with approxZoom = current zoom) —
  // skip the re-centre animation so the map doesn't jitter on exit (item 5).
  if (Math.round(startZoom) === targetZoom) {
    return;
  }
  const startTime = performance.now();

  state.isFocusCameraAnimating = true;

  const step = (now) => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / RESET_ZOOM_ANIMATION_MS, 1);
    const eased = easeInOutCubic(t);
    const zoom = lerp(startZoom, targetZoom, eased);
    const center = getCenterForMarkerScreenPoint(markerLatLng, zoom, markerScreen);

    setMapCamera(center, zoom);

    if (t < 1) {
      state.cameraAnimationFrame = requestAnimationFrame(step);
    } else {
      state.cameraAnimationFrame = null;
      setMapCamera(getCenterForMarkerScreenPoint(markerLatLng, targetZoom, markerScreen), targetZoom);
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
  // Park the under-pin approx label just below the marker (item 3).
  if (els.focusApproxLabel) {
    els.focusApproxLabel.style.left = `${target.x}px`;
    els.focusApproxLabel.style.top = `${target.y}px`;
  }
  updateFocusApproxLabelGeometry();
}

function animateMarkerToFocus(item) {
  if (!hasCoordinates(item)) {
    return;
  }

  const projection = getWorldProjection();
  if (!projection || !state.map.getCenter()) {
    state.map.panTo(item.coordinates);
    const fallbackZoom = item.blurApprox && Number.isFinite(item.approxZoom) ? item.approxZoom : Math.max(state.map.getZoom(), FOCUS_MAP_ZOOM);
    state.map.setZoom(fallbackZoom);
    revealApproxLabel();
    return;
  }

  if (state.cameraAnimationFrame) {
    cancelAnimationFrame(state.cameraAnimationFrame);
    state.cameraAnimationFrame = null;
  }

  const markerLatLng = new google.maps.LatLng(item.coordinates.lat, item.coordinates.lng);
  const startZoom = state.map.getZoom();
  // T7: a 模糊地址 point can pin a specific (usually lower) focus zoom so the
  // location stays vague; otherwise zoom in to at least FOCUS_MAP_ZOOM.
  const approxZoom = item.blurApprox && Number.isFinite(item.approxZoom) ? item.approxZoom : null;
  const endZoom = approxZoom !== null ? approxZoom : Math.max(startZoom, FOCUS_MAP_ZOOM);
  const startScreen = getLatLngScreenPoint(markerLatLng, startZoom); // 用户 T1: see recenter note
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
      // Map has settled on the point — now fade the under-pin label in (item 3).
      revealApproxLabel();
      window.setTimeout(() => {
        state.isFocusCameraAnimating = false;
      }, 80);
    }
  };

  state.isFocusCameraAnimating = true;
  state.cameraAnimationFrame = requestAnimationFrame(step);
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

// Item 3: fade the under-pin 模糊地址 label in only after the map has settled on
// the point (called from the camera animation's completion). Until then the label
// carries `is-pending` (opacity 0) so it never flashes mid-pan/zoom.
function revealApproxLabel() {
  els.focusApproxLabel?.classList.remove("is-pending");
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

// Contributed (投稿) umbrellas get a green pin on the public map so they stand
// out from the author's own (red) points.
function isContributedItem(item) {
  return item?.submissionType === "contributed";
}

// Four marker categories, each its own pin colour + legend entry (items 6/15/16):
//   own-title (深红) / own (红) / contrib-story (深绿) / contrib (绿)
// A contributed point counts as "story" once it carries narrative text (its
// submitter note is migrated into a content paragraph → item.story, item 8/15).
const MARKER_COLORS = {
  "own-title": "#8f2310",
  own: "#c54f35",
  "contrib-story": "#1f6b3a",
  contrib: "#2e9e5b",
};
// Order for the legend + filter (用户 #5): Fieldwork, Fieldwork·titled, Contributed,
// Contributed·story.
const MARKER_CATEGORIES = ["own", "own-title", "contrib", "contrib-story"];
// Bilingual labels (用户 #5: Japanese in a Japanese system) for the map filter +
// About legend.
const MARKER_LABELS = {
  own: { en: "Fieldwork", ja: "フィールド" },
  "own-title": { en: "Fieldwork · titled", ja: "フィールド・題名あり" },
  contrib: { en: "Contributed", ja: "投稿" },
  "contrib-story": { en: "Contributed · story", ja: "投稿・物語" },
};
function markerLabel(cat) {
  return localize(MARKER_LABELS[cat]);
}

function itemHasStory(item) {
  return Boolean(item?.story && String(item.story).trim());
}

function markerCategory(item) {
  if (isContributedItem(item)) {
    return itemHasStory(item) ? "contrib-story" : "contrib";
  }
  return itemHasTitle(item) ? "own-title" : "own";
}

// A point has a title if either language is filled (title may be {ja,en} or a
// legacy string). Titled points get a deeper red pin (用户要求).
function itemHasTitle(item) {
  const title = item?.title;
  if (!title) {
    return false;
  }
  return typeof title === "object" ? Boolean(title.ja || title.en) : Boolean(String(title).trim());
}

function updateMarkerIcons() {
  state.markers.forEach((marker, id) => {
    const item = state.umbrellas.find((entry) => entry.id === id);
    marker.setIcon(markerIcon(id === state.focusMarkerId, flagColorFor(item), markerCategory(item)));
    marker.setZIndex(markerZIndex(item));
  });
}

// Explicit, stable z-order for every pin: south pins in front (Google's own
// convention), the focused pin above everything. With NO explicit zIndex the
// renderer re-derives stacking while zooming, so overlapping pins (8680 / aaa(1))
// flickered front-to-back (用户 T3). A fixed number per pin can never swap.
function markerZIndex(item) {
  if (!item || !hasCoordinates(item)) {
    return 1;
  }
  if (item.id === state.focusMarkerId) {
    return 10000000;
  }
  return Math.max(1, Math.round((90 - item.coordinates.lat) * 100000));
}

function markerIcon(isActive, flagColor, category) {
  // Colour by the 4-way category (own-title / own / contrib-story / contrib).
  const base = MARKER_COLORS[category] || MARKER_COLORS.own;
  return {
    path: "M12 2C7.03 2 3 6.03 3 11c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9Z",
    fillColor: flagColor || (isActive ? "#1f8bb8" : base),
    fillOpacity: 1,
    strokeColor: flagColor === "#ffffff" ? "#1a1a1a" : "#ffffff",
    strokeOpacity: 1,
    strokeWeight: 2.1,
    scale: 1.55,
    anchor: new google.maps.Point(12, 26),
  };
}

function hoverMarkerIcon(isActive, flagColor, category) {
  return {
    ...markerIcon(isActive, flagColor, category),
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
    // Not a parseable date (e.g. a contributed umbrella's rough "2024.10" or
    // "around 18:00") — show the raw text rather than hiding it. Empty stays empty.
    return typeof value === "string" ? value.trim() : "";
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
    navigator.serviceWorker.register("sw.js?v=154", { updateViaCache: "none" });
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

// Icon-only logos for the bottom-right toolbar buttons (item 11).
const EDITOR_ICON_EDIT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M14.5 5.5l4 4"/></svg>';
const EDITOR_ICON_TEXTS =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 10h14M5 14h9M5 18h9"/></svg>';
const EDITOR_ICON_ADD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
// 视觉设定面板按钮图标（Lucide sliders-horizontal）。
const EDITOR_ICON_THEME =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>';
// 收件箱（信封）图标 —— 投稿收件箱按钮。
const EDITOR_ICON_INBOX =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>';

function setupEditor() {
  // The three local-only buttons (edit / 文案 / 新增) live in one fixed toolbar
  // stacked at the bottom-right, just above the globe button (item 11). Icons
  // only — no text. 文案 + 新增 only appear once edit mode is on (CSS).
  const toolbar = document.createElement("div");
  toolbar.className = "editor-toolbar";
  document.body.appendChild(toolbar);
  editor.toolbar = toolbar;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "editor-toggle";
  toggle.className = "editor-toggle";
  toggle.innerHTML = EDITOR_ICON_EDIT;
  toggle.title = "编辑模式";
  toggle.setAttribute("aria-label", "编辑模式");
  toggle.addEventListener("click", toggleEditMode);
  toolbar.appendChild(toggle);
  editor.toggle = toggle;

  setupTextsEditor();
  setupThemeEditor();

  const drawer = document.createElement("aside");
  drawer.className = "editor-drawer";
  drawer.setAttribute("aria-label", "record editor");
  drawer.innerHTML = `
    <header class="editor-head">
      <strong id="editor-title">编辑记录</strong>
      <div class="editor-head-checks">
        <label class="editor-head-check editor-flag-check" title="标记此点后续需要修改（仅编辑模式地图显示）"><span>待改</span><input type="checkbox" id="editor-flag-toggle" /></label>
        <label class="editor-head-check" title="勾选后在下方填写关联标点"><span>关联</span><input type="checkbox" id="editor-linked-toggle" /></label>
        <label class="editor-head-check" title="勾选后在下方填写标题"><span>标题</span><input type="checkbox" id="editor-title-toggle" /></label>
        <label class="editor-head-check" title="勾选后在下方给这个标点起个对外显示名（不改文件夹/文件名）"><span>显示名</span><input type="checkbox" id="editor-displayid-toggle" /></label>
      </div>
      <button type="button" class="editor-close" aria-label="close">×</button>
    </header>
    <div class="editor-body">
      <div class="editor-col editor-col-left"></div>
      <div class="editor-col editor-col-right"></div>
    </div>
    <footer class="editor-actions">
      <button type="button" class="editor-save">保存</button>
      <button type="button" class="editor-cancel">取消</button>
      <button type="button" class="editor-delete-record" title="删除此标点" aria-label="删除此标点"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </footer>`;
  document.body.appendChild(drawer);
  editor.root = drawer;
  editor.titleEl = drawer.querySelector("#editor-title");

  const body = drawer.querySelector(".editor-col-left");
  const rightCol = drawer.querySelector(".editor-col-right");

  const addField = (key, label, { textarea = false, parent = body } = {}) => {
    const row = document.createElement("label");
    row.className = "editor-row";
    const control = textarea ? document.createElement("textarea") : document.createElement("input");
    if (textarea) {
      control.rows = 3;
    }
    row.innerHTML = `<span>${label}</span>`;
    row.appendChild(control);
    parent.appendChild(row);
    editor.fields[key] = control;
    return { row, control };
  };

  // ① 来源 Source: 自己拍的 (own) vs 投稿的伞 (contributed).
  const sourceRow = document.createElement("div");
  sourceRow.className = "editor-row";
  sourceRow.innerHTML = `
    <span>来源 Source</span>
    <div class="editor-source">
      <label><span>自己拍的</span><input type="radio" name="editor-source" value="own" checked /></label>
      <label><span>投稿的伞</span><input type="radio" name="editor-source" value="contributed" /></label>
    </div>`;
  body.appendChild(sourceRow);
  editor.sourceRadios = sourceRow.querySelectorAll('input[name="editor-source"]');

  // ② 类型 / type (the whole folder name) — only shown for 自己拍的; contributed
  // umbrellas don't take part in the type classification (item 6).
  const catRow = document.createElement("label");
  catRow.className = "editor-row editor-type-row";
  catRow.innerHTML = `<span>类型 / type（改这里会移动文件夹）</span>`;
  editor.category = document.createElement("select");
  catRow.appendChild(editor.category);
  body.appendChild(catRow);
  editor.typeRow = catRow;
  editor.category.addEventListener("change", onCategoryChange);

  // ③ 标题 Title — bilingual; gated by the 标题 checkbox in the header (item 8).
  const titleRow = document.createElement("div");
  titleRow.className = "editor-row editor-title-row";
  titleRow.hidden = true;
  titleRow.innerHTML = `
    <span>标题 Title（日本語 / English）</span>
    <input class="editor-title-ja" placeholder="日本語タイトル（默认空白）" />
    <input class="editor-title-en" placeholder="English title（可留空，英文系统会回退日文）" />`;
  body.appendChild(titleRow);
  editor.titleRow = titleRow;
  editor.titleJa = titleRow.querySelector(".editor-title-ja");
  editor.titleEn = titleRow.querySelector(".editor-title-en");

  // ③b 显示名 Display name — 替换页面上显示的 ID，但不改文件夹/文件名。
  // 行内始终显示「原文件：真实 ID」作为提醒，避免忘了底层文件叫什么。
  const displayIdRow = document.createElement("div");
  displayIdRow.className = "editor-row editor-displayid-row";
  displayIdRow.hidden = true;
  displayIdRow.innerHTML = `
    <span>显示名 Display name（替换对外显示的 ID；不改文件夹/文件名）</span>
    <input class="editor-displayid-input" placeholder="留空则显示原文件名" />
    <small class="editor-displayid-hint">原文件（真实文件夹/文件名，不会变）：<code>—</code></small>`;
  body.appendChild(displayIdRow);
  editor.displayIdRow = displayIdRow;
  editor.displayIdInput = displayIdRow.querySelector(".editor-displayid-input");
  editor.displayIdHint = displayIdRow.querySelector(".editor-displayid-hint code");

  // ④ 关联标点 Linked point — gated by the 关联 checkbox in the header (item 7).
  const linkRow = document.createElement("label");
  linkRow.className = "editor-row editor-linked-row";
  linkRow.hidden = true;
  linkRow.innerHTML = `<span>关联标点 Linked point（详情页主图右下角显示，可跳转）</span>`;
  editor.linkedId = document.createElement("select");
  linkRow.appendChild(editor.linkedId);
  body.appendChild(linkRow);
  editor.linkedRow = linkRow;

  // Header checkboxes: 待改 flag (saves immediately), 关联/标题 reveal their rows.
  editor.flagToggle = drawer.querySelector("#editor-flag-toggle");
  editor.flagToggle.addEventListener("change", onFlagToggle);
  editor.linkedToggle = drawer.querySelector("#editor-linked-toggle");
  editor.titleToggle = drawer.querySelector("#editor-title-toggle");
  editor.linkedToggle.addEventListener("change", () => {
    linkRow.hidden = !editor.linkedToggle.checked;
  });
  editor.titleToggle.addEventListener("change", () => {
    titleRow.hidden = !editor.titleToggle.checked;
  });
  editor.displayIdToggle = drawer.querySelector("#editor-displayid-toggle");
  editor.displayIdToggle.addEventListener("change", () => {
    displayIdRow.hidden = !editor.displayIdToggle.checked;
  });

  // ⑤ Coordinates (用户要求：放在显示地址前面).
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

  // ⑥ Display address + 「大概」checkbox to the RIGHT of the input (item 3).
  const locRow = document.createElement("div");
  locRow.className = "editor-row";
  locRow.innerHTML = `
    <span>显示地址 Location</span>
    <div class="editor-field-approx">
      <textarea class="editor-loc-input" rows="1"></textarea>
      <label class="editor-mini-check" title="地点只是大概（详情页地点前加「约」）"><span>大概</span><input type="checkbox" class="editor-loc-approx" /></label>
    </div>`;
  body.appendChild(locRow);
  editor.fields.locationText = locRow.querySelector(".editor-loc-input");
  editor.locApprox = locRow.querySelector(".editor-loc-approx");

  // ⑦ Location levels — cascading dropdowns built from data/japan-areas.json.
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

  // ⑧ 拍摄时间 Time + 「大概」checkbox to the RIGHT of the input (item 3).
  const timeRow = document.createElement("div");
  timeRow.className = "editor-row";
  timeRow.innerHTML = `
    <span>拍摄时间(覆盖) Time</span>
    <div class="editor-field-approx">
      <input class="editor-time-input" />
      <label class="editor-mini-check" title="时间只是大概（详情页时间前加「约」）"><span>大概</span><input type="checkbox" class="editor-time-approx" /></label>
    </div>`;
  body.appendChild(timeRow);
  editor.fields.time = timeRow.querySelector(".editor-time-input");
  editor.timeApprox = timeRow.querySelector(".editor-time-approx");

  // ⑨ 投稿信息 Submission — only shown for 投稿的伞 (item 3). The approx flags
  // moved out (now sit next to the address/time fields above).
  const contribRow = document.createElement("div");
  contribRow.className = "editor-row editor-contrib";
  contribRow.hidden = true;
  contribRow.innerHTML = `
    <span>投稿信息 Submission（仅投稿伞）</span>
    <input class="editor-submitter" placeholder="投稿者署名（详情页致谢显示，可留空）" />
    <label class="editor-sub-field"><span class="editor-sub-note">投稿时间 Submitted（只到年月日，如 2026/05/03）</span><input class="editor-submission-time" placeholder="只到年月日，如 2026/05/03" /></label>
    <div class="editor-sub-field editor-blur-field">
      <label class="editor-head-check editor-blur-check" title="聚焦时用白色模糊、清晰圈更大，让位置更含糊"><span>模糊地址</span><input type="checkbox" class="editor-blur-approx" /></label>
      <div class="editor-blur-extra" hidden>
        <label class="editor-sub-inline"><span class="editor-sub-note">聚焦缩放（留空=默认18，越小越含糊；可看右上角数字）</span><input class="editor-approx-zoom" type="number" min="3" max="21" step="1" placeholder="留空=18" /></label>
        <label class="editor-sub-inline"><span class="editor-sub-note">标点下文字（留空=用显示地址）</span><input class="editor-blur-label" type="text" placeholder="显示地址" /></label>
      </div>
    </div>`;
  body.appendChild(contribRow);
  editor.contribRow = contribRow;
  editor.submitter = contribRow.querySelector(".editor-submitter");
  editor.submissionTime = contribRow.querySelector(".editor-submission-time");
  editor.blurApprox = contribRow.querySelector(".editor-blur-approx");
  editor.approxZoom = contribRow.querySelector(".editor-approx-zoom");
  editor.blurLabel = contribRow.querySelector(".editor-blur-label");
  editor.blurExtra = contribRow.querySelector(".editor-blur-extra");
  // The zoom/label extras only show once 模糊地址 is ticked (item 3).
  editor.blurApprox.addEventListener("change", () => {
    editor.blurExtra.hidden = !editor.blurApprox.checked;
  });
  // Source toggle reveals/hides 投稿信息 and the 类型 row (contributed = no type).
  editor.sourceRadios.forEach((radio) => {
    radio.addEventListener("change", syncSourceVisibility);
  });

  // ⑩ Umbrella attributes (count + colour/kind + status), one collapsible block.
  const umbSection = document.createElement("div");
  umbSection.className = "editor-row editor-umbrella-section";
  umbSection.innerHTML = `
    <label class="editor-umbrella-toggle"><span>伞的属性</span><input type="checkbox" class="editor-umbrella-check" /></label>
    <div class="editor-umbrella-body"></div>`;
  body.appendChild(umbSection);
  editor.umbrellaCheck = umbSection.querySelector(".editor-umbrella-check");
  const umbBody = umbSection.querySelector(".editor-umbrella-body");
  editor.umbrellaBody = umbBody;
  editor.umbrellaCheck.addEventListener("change", () => {
    umbBody.hidden = !editor.umbrellaCheck.checked;
  });

  const countRow = document.createElement("label");
  countRow.className = "editor-row";
  countRow.innerHTML = `<span>数量</span>`;
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
  umbBody.appendChild(countRow);

  const unitsRow = document.createElement("div");
  unitsRow.className = "editor-row";
  unitsRow.innerHTML = `<span>颜色 / 种类</span><div class="editor-units"></div>`;
  editor.unitsWrap = unitsRow.querySelector(".editor-units");
  umbBody.appendChild(unitsRow);

  const statusRow = document.createElement("div");
  statusRow.className = "editor-row";
  statusRow.innerHTML = `<span>状态</span><div class="editor-statuses"></div>`;
  editor.statusesWrap = statusRow.querySelector(".editor-statuses");
  umbBody.appendChild(statusRow);

  // 备注 Remarks — internal note, sits above 内容 in the right column (item 1).
  const remarksRow = document.createElement("label");
  remarksRow.className = "editor-row";
  remarksRow.innerHTML = `<span>备注 Remarks（仅内部，不公开展示）</span><textarea class="editor-remarks" rows="2" placeholder="内部备注，可留空"></textarea>`;
  remarksRow.hidden = true; // only shown when 待改 is checked (item 13)
  rightCol.appendChild(remarksRow);
  editor.remarksRow = remarksRow;
  editor.remarks = remarksRow.querySelector(".editor-remarks");

  // 内容 Content — its own column on the right (item 9). Photos (cover + others)
  // and text paragraphs reorder together.
  const contentRow = document.createElement("div");
  contentRow.className = "editor-row editor-content-row";
  contentRow.innerHTML = `
    <span>内容 Content（图片与段落一起排序，★ 设为封面）</span>
    <div class="editor-flow"></div>
    <div class="editor-flow-actions">
      <button type="button" class="editor-add-para">＋ 加段落</button>
      <button type="button" class="editor-add-dialogue">＋ 对话</button>
      <label class="editor-upload"><span>＋ 上传图片/视频</span><input type="file" accept="${UPLOAD_ACCEPT}" multiple hidden /></label>
    </div>`;
  rightCol.appendChild(contentRow);
  editor.flowList = contentRow.querySelector(".editor-flow");
  contentRow.querySelector(".editor-add-para").addEventListener("click", () => {
    editor.flow.push({ kind: "text", textJa: "", textEn: "" });
    renderFlow();
    markEditorDirty();
  });
  contentRow.querySelector(".editor-add-dialogue").addEventListener("click", () => {
    // A new dialogue starts with one line defaulting to 投稿者 (item 9).
    editor.flow.push({ kind: "dialogue", lines: [{ speaker: "sender", ja: "", en: "" }] });
    renderFlow();
    markEditorDirty();
  });
  contentRow.querySelector(".editor-upload input").addEventListener("change", onUploadImages);

  drawer.querySelector(".editor-close").addEventListener("click", () => closeEditor());
  drawer.querySelector(".editor-cancel").addEventListener("click", () => closeEditor());
  drawer.querySelector(".editor-save").addEventListener("click", saveEditor);
  drawer.querySelector(".editor-delete-record").addEventListener("click", deleteCurrentRecord);
  coordRow.querySelector(".editor-coord-reset").addEventListener("click", () => {
    editor.draftCoords = null;
    updateCoordReadout(getRawById(state.editingId));
  });

  // Any input/change inside the drawer marks it dirty (item 13) and live-updates
  // the left preview (item 10).
  drawer.addEventListener("input", onEditorInput);
  drawer.addEventListener("change", onEditorInput);

  // 新增 button → opens a small popup to pick 来源 + 类型 before choosing a photo
  // (item 12).
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.id = "editor-add";
  addButton.className = "editor-add";
  addButton.innerHTML = EDITOR_ICON_ADD;
  addButton.title = "新增标点";
  addButton.setAttribute("aria-label", "新增标点");
  addButton.addEventListener("click", openCreateDialog);
  toolbar.appendChild(addButton);
  editor.addButton = addButton;

  const addInput = document.createElement("input");
  addInput.type = "file";
  addInput.accept = CREATE_ACCEPT;
  addInput.hidden = true;
  addInput.addEventListener("change", onCreateRecord);
  document.body.appendChild(addInput);
  editor.addInput = addInput;

  // 收件箱按钮：投稿收件箱（拉 Google 表单投稿 → 审核/定坐标 → 增加为标点）。
  // 放在「新增」正下方（column-reverse 里 DOM 排在 add 之前 = 视觉在其下）。仅编辑模式显示。
  const inboxButton = document.createElement("button");
  inboxButton.type = "button";
  inboxButton.id = "editor-inbox-btn";
  inboxButton.className = "editor-inbox-btn";
  inboxButton.innerHTML = EDITOR_ICON_INBOX;
  inboxButton.title = "投稿收件箱";
  inboxButton.setAttribute("aria-label", "投稿收件箱");
  inboxButton.addEventListener("click", openInbox);
  toolbar.insertBefore(inboxButton, addButton);
  editor.inboxButton = inboxButton;

  buildCreateDialog();
  populateCategorySelects();

  // Live detail-page preview shown on the left while editing. Its height was
  // reduced to ~40vh (用户) so the 修改记录 (edit-history) panel can sit below it.
  const preview = document.createElement("aside");
  preview.className = "editor-preview";
  preview.setAttribute("aria-label", "detail preview");
  preview.innerHTML = `<div class="editor-preview-inner"></div>`;
  document.body.appendChild(preview);
  editor.preview = preview;
  editor.previewInner = preview.querySelector(".editor-preview-inner");

  // 用户「修改记录」: a per-marker edit-history panel BELOW the preview. Visible in
  // edit mode; lists the last 50 markers you created / modified / deleted, each with
  // a 撤回 (undo all of that marker's changes) button; clicking a row re-opens that
  // marker for editing (or restores it if it was deleted).
  const history = document.createElement("aside");
  history.className = "editor-history";
  history.setAttribute("aria-label", "edit history");
  history.innerHTML = `
    <div class="editor-history-head">
      <span class="editor-history-title">修改记录</span>
      <button type="button" class="editor-history-clear" title="清空修改记录列表（不影响已保存的数据）">清空</button>
    </div>
    <div class="editor-history-list"></div>`;
  document.body.appendChild(history);
  editor.history = history;
  editor.historyList = history.querySelector(".editor-history-list");
  history.querySelector(".editor-history-clear").addEventListener("click", clearEditHistory);
  editor.historyList.addEventListener("click", onEditHistoryClick);
  syncEditHistory();

  setupPanelResizers();

  // Local-only zoom readout, top-right edge (item 6) — never on the live site
  // since setupEditor only runs when IS_LOCAL.
  const scale = document.createElement("div");
  scale.className = "map-scale-readout";
  scale.id = "scale-readout";
  document.body.appendChild(scale);
  editor.scaleReadout = scale;
  editor.updateScale = () => {
    if (state.map && editor.scaleReadout) {
      editor.scaleReadout.textContent = `z ${state.map.getZoom()}`;
    }
  };
  if (state.map && window.google?.maps) {
    editor.updateScale();
    google.maps.event.addListener(state.map, "zoom_changed", editor.updateScale);
    google.maps.event.addListener(state.map, "idle", editor.updateScale);
  }
}

// Show/hide the contributed-only block and the type row based on 来源 (item 3/6).
function syncSourceVisibility() {
  const contributed = getEditorSource() === "contributed";
  if (editor.contribRow) {
    editor.contribRow.hidden = !contributed;
  }
  if (editor.typeRow) {
    editor.typeRow.hidden = contributed;
  }
}

// The "新增" popup: pick 来源 + 类型 first; 投稿 hides the type select (item 12).
function buildCreateDialog() {
  const dialog = document.createElement("div");
  dialog.className = "editor-create-dialog";
  dialog.hidden = true;
  dialog.innerHTML = `
    <div class="editor-create-card" role="dialog" aria-label="新增标点">
      <strong>新增标点</strong>
      <div class="editor-row">
        <span>来源 Source</span>
        <div class="editor-source">
          <label><span>自己拍的</span><input type="radio" name="editor-create-source" value="own" checked /></label>
          <label><span>投稿的伞</span><input type="radio" name="editor-create-source" value="contributed" /></label>
        </div>
      </div>
      <div class="editor-row editor-create-type-row">
        <span>类型 / type</span>
        <select class="editor-create-type"></select>
      </div>
      <div class="editor-create-actions">
        <button type="button" class="editor-create-pick">选择照片</button>
        <button type="button" class="editor-create-cancel">取消</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  editor.createDialog = dialog;
  editor.createSourceRadios = dialog.querySelectorAll('input[name="editor-create-source"]');
  editor.createType = dialog.querySelector(".editor-create-type");
  editor.createTypeRow = dialog.querySelector(".editor-create-type-row");
  editor.createSourceRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const contributed = getCreateSource() === "contributed";
      editor.createTypeRow.hidden = contributed;
    });
  });
  // "＋ 新建分类…" prompts for a new type and inserts it (same as the editor select).
  editor.createType.addEventListener("change", (event) => {
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
  });
  dialog.querySelector(".editor-create-cancel").addEventListener("click", closeCreateDialog);
  dialog.querySelector(".editor-create-pick").addEventListener("click", () => {
    editor.pendingCreate = {
      source: getCreateSource(),
      category: getCreateSource() === "contributed" ? "submission(pending)" : editor.createType.value || "unknown",
    };
    closeCreateDialog();
    editor.addInput?.click();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeCreateDialog();
    }
  });
}

function getCreateSource() {
  const checked = Array.from(editor.createSourceRadios || []).find((radio) => radio.checked);
  return checked ? checked.value : "own";
}

function openCreateDialog() {
  if (!editor.createDialog) {
    return;
  }
  // Reset to 自己拍的 + first type each time.
  editor.createSourceRadios.forEach((radio) => {
    radio.checked = radio.value === "own";
  });
  editor.createTypeRow.hidden = false;
  editor.createDialog.hidden = false;
}

function closeCreateDialog() {
  if (editor.createDialog) {
    editor.createDialog.hidden = true;
  }
}

// Render the (last saved) detail page of the record being edited, as a
// reference preview on the left.
// Build a draft item from the editor's CURRENT (unsaved) field values so the
// preview reflects edits live (item 10). Overlays the editable fields onto the
// last-saved record; object/state info lines stay as last saved (they only
// recompute on save).
function buildPreviewDraft() {
  const id = state.editingId;
  const saved = state.umbrellas.find((entry) => entry.id === id) || {};
  const flow = editor.flow || [];
  const photos = flow.filter((i) => i.kind === "photo");
  const media = photos.map((p) => ({
    file: p.file,
    id: p.id,
    role: p.role,
    title: p.title,
    photoTime: p.timeOverride && p.timeOverride.trim() ? p.timeOverride.trim() : p.photoTime,
    src: p.src || p.thumb || "",
    crop: p.crop || null, // 用户 #8: live-preview the crop.
    showWeather: Boolean(p.showWeather),
    weather: p.weather || null,
  }));
  const isTextLike = (i) => i.kind === "text" || i.kind === "dialogue";
  const blocks = flow
    .filter((i) => isTextLike(i) || (i.kind === "photo" && i.role !== "primary"))
    .map((i) =>
      isTextLike(i)
        ? { type: i.kind, text: flowTextLike(i) }
        : { type: "photo", file: i.file },
    );
  const submissionType = getEditorSource();
  const title = editor.titleToggle?.checked
    ? { ja: editor.titleJa.value.trim(), en: editor.titleEn.value.trim() }
    : { ja: "", en: "" };
  const location =
    editor.fields.locationText.value.trim() ||
    formatLocationLevels(collectLevelsForSave()) ||
    saved.location ||
    "";
  return {
    ...saved,
    id,
    title,
    location,
    time: editor.fields.time.value.trim() || saved.time || "",
    submissionType,
    submitter: editor.submitter.value.trim(),
    submitterNote: "",
    locationApprox: editor.locApprox.checked,
    timeApprox: editor.timeApprox.checked,
    media,
    blocks,
  };
}

function renderEditorPreview() {
  if (!state.editingId || !editor.previewInner) {
    return;
  }
  const item = buildPreviewDraft();
  const cover = (item.media || []).find((m) => m.role === "primary") || item.media?.[0];
  editor.previewInner.innerHTML = `
    <header class="focus-header">${renderFocusHeader(item)}</header>
    ${cover ? `<div class="editor-preview-cover"><img src="${escapeHtml(cover.src || item.image || "")}" alt="" /></div>` : ""}
    ${renderFocusInfo(item)}
    ${renderFocusArticle(item)}`;
}

const MEDIA_ROLE_LABELS = {
  supplement: "补充",
  detail: "细节",
  illustration: "插图",
};

// ---- Dialogue blocks (item 9 / T10) -----------------------------------------
// In the editor a dialogue is edited as a list of lines, each with a speaker
// (投稿者 / 編者, plus a "none" marker line like a date divider) and a bilingual
// ja/en body. On disk it stays the SAME text format as before — ja/en multiline
// strings with "投稿者：…" / "Sender: …" prefixes — so the detail page renderer
// (renderDialogueLines) and the build/api code don't change. We only parse on
// load and re-serialize on save.
const DIALOGUE_SPEAKERS = {
  sender: { ja: "投稿者", en: "Sender" },
  editor: { ja: "編者", en: "Editor" },
};

function dialogueSpeakerFromLabel(label) {
  const s = String(label || "").trim();
  if (/編|编|editor/i.test(s)) return "editor";
  if (/投稿|sender/i.test(s)) return "sender";
  return null;
}

// Split one language's multiline text into classified lines: speaker-prefixed
// lines become {speaker, body}; everything else (e.g. a "[2026.04.24]" marker)
// becomes a {speaker:"none", body} line.
function splitDialogueRaw(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([^：:]{1,12})[：:]\s*(.*)$/);
      if (m) {
        const sp = dialogueSpeakerFromLabel(m[1]);
        if (sp) return { speaker: sp, body: m[2] };
      }
      return { speaker: "none", body: line };
    });
}

// Pair the ja and en lines into structured {speaker, ja, en} entries. They are
// normally 1:1 in order, but one language can carry an extra marker line (the
// ja-only "[date]" divider) — a "none" line consumes only its own language so
// the rest stays aligned.
function parseDialogueLines(textJa, textEn) {
  const ja = splitDialogueRaw(textJa);
  const en = splitDialogueRaw(textEn);
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < ja.length || j < en.length) {
    const a = ja[i];
    const b = en[j];
    if (a && a.speaker === "none" && (!b || b.speaker !== "none")) {
      lines.push({ speaker: "none", ja: a.body, en: "" });
      i += 1;
    } else if (b && b.speaker === "none" && (!a || a.speaker !== "none")) {
      lines.push({ speaker: "none", ja: "", en: b.body });
      j += 1;
    } else if (a && b) {
      lines.push({ speaker: a.speaker !== "none" ? a.speaker : b.speaker, ja: a.body, en: b.body });
      i += 1;
      j += 1;
    } else if (a) {
      lines.push({ speaker: a.speaker, ja: a.body, en: "" });
      i += 1;
    } else {
      lines.push({ speaker: b.speaker, ja: "", en: b.body });
      j += 1;
    }
  }
  if (!lines.length) {
    lines.push({ speaker: "sender", ja: "", en: "" });
  }
  return lines;
}

// Structured lines → the on-disk {ja, en} text (with speaker prefixes).
function serializeDialogueLines(lines) {
  const jaParts = [];
  const enParts = [];
  (lines || []).forEach((ln) => {
    const ja = (ln.ja || "").trim();
    const en = (ln.en || "").trim();
    if (ln.speaker === "none") {
      if (ja) jaParts.push(ja);
      if (en) enParts.push(en);
    } else {
      const lbl = DIALOGUE_SPEAKERS[ln.speaker] || DIALOGUE_SPEAKERS.sender;
      if (ja) jaParts.push(`${lbl.ja}：${ja}`);
      if (en) enParts.push(`${lbl.en}: ${en}`);
    }
  });
  return { ja: jaParts.join("\n"), en: enParts.join("\n") };
}

// The {ja, en} text for any text-like flow item (paragraph or dialogue).
function flowTextLike(item) {
  if (item.kind === "dialogue") {
    return serializeDialogueLines(item.lines);
  }
  return { ja: (item.textJa || "").trim(), en: (item.textEn || "").trim() };
}

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
    // photoTime = the stored/EXIF time (shown as placeholder); timeOverride is
    // what the user types to replace it (item 15). Blank override keeps photoTime.
    photoTime: media.photoTime || "",
    timeOverride: "",
    thumb: media.thumb || media.src || "",
    src: media.src || "",
    crop: media.crop || null, // 用户 #8: non-destructive crop.
    // 每张图自己的天气 + 是否显示（主图默认显示，补充/细节默认不显示）。
    weather: media.weather || null,
    showWeather:
      typeof media.showWeather === "boolean" ? media.showWeather : (media.role || "detail") === "primary",
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
      if (b.type === "dialogue") {
        const t = b.text;
        const ja = t && typeof t === "object" ? t.ja || "" : t || "";
        const en = t && typeof t === "object" ? t.en || "" : "";
        flow.push({ kind: "dialogue", lines: parseDialogueLines(ja, en) });
      } else if (b.type === "text") {
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
      // Paragraph — bilingual auto-height textareas; a ▾/▸ button folds long ones.
      const collapsed = item.collapsed ? " is-collapsed" : "";
      const foldGlyph = item.collapsed ? "▸" : "▾";
      row.innerHTML = `
        <div class="editor-block-langs">
          <textarea class="editor-block-text-ja${collapsed}" placeholder="段落（日本語）">${escapeHtml(item.textJa || "")}</textarea>
          <textarea class="editor-block-text-en${collapsed}" placeholder="Paragraph (English)">${escapeHtml(item.textEn || "")}</textarea>
        </div>
        <div class="editor-block-buttons editor-block-buttons-vertical">
          <button type="button" data-fact="fold-text" title="折叠/展开">${foldGlyph}</button>
          ${moveButtons}
          <button type="button" data-fact="del-text" title="删除">✕</button>
        </div>`;
      row.querySelector(".editor-block-text-ja").addEventListener("input", (event) => {
        item.textJa = event.target.value;
      });
      row.querySelector(".editor-block-text-en").addEventListener("input", (event) => {
        item.textEn = event.target.value;
      });
    } else if (item.kind === "dialogue") {
      // Dialogue (item 9): a list of lines, each = speaker selector (投稿者/編者)
      // + a bilingual ja/en body. Lines can be added/removed; renders specially
      // on the detail page (renderDialogueLines).
      if (!Array.isArray(item.lines) || !item.lines.length) {
        item.lines = [{ speaker: "sender", ja: "", en: "" }];
      }
      const speakerSelect = (sp) => `
        <select class="editor-dlg-speaker">
          <option value="sender" ${sp === "sender" ? "selected" : ""}>投稿者</option>
          <option value="editor" ${sp === "editor" ? "selected" : ""}>編者</option>
          <option value="none" ${sp === "none" ? "selected" : ""}>—（旁白）</option>
        </select>`;
      const linesHtml = item.lines
        .map(
          (ln, li) => `
        <div class="editor-dlg-line" data-li="${li}">
          <div class="editor-dlg-line-tools">
            ${item.lines.length > 1 ? `<button type="button" class="editor-dlg-del" data-li="${li}" title="删除这句">✕</button>` : ""}
            <button type="button" class="editor-dlg-up" data-li="${li}" title="上移这句" ${li === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="editor-dlg-down" data-li="${li}" title="下移这句" ${li === item.lines.length - 1 ? "disabled" : ""}>↓</button>
          </div>
          <div class="editor-dlg-line-head">
            ${speakerSelect(ln.speaker)}
          </div>
          <textarea class="editor-dlg-ja" placeholder="日本語">${escapeHtml(ln.ja || "")}</textarea>
          <textarea class="editor-dlg-en" placeholder="English">${escapeHtml(ln.en || "")}</textarea>
        </div>`,
        )
        .join("");
      // 用户 #6: the 「对话」 tag sits on TOP (above the lines), not down the left
      // side. 用户 #5: a ▾/▸ fold button (like paragraphs) collapses the whole block.
      const dlgFoldGlyph = item.collapsed ? "▸" : "▾";
      row.innerHTML = `
        <div class="editor-dlg-col">
          <span class="editor-block-tag">对话</span>
          <div class="editor-dlg${item.collapsed ? " is-collapsed" : ""}">
            ${linesHtml}
            <button type="button" class="editor-dlg-add">＋ 添加一句</button>
            ${item.collapsed ? `<div class="editor-dlg-folded">（已折叠 ${item.lines.length} 句）</div>` : ""}
          </div>
        </div>
        <div class="editor-block-buttons editor-block-buttons-vertical">
          <button type="button" data-fact="fold-text" title="折叠/展开">${dlgFoldGlyph}</button>
          ${moveButtons}
          <button type="button" data-fact="del-text" title="删除整段">✕</button>
        </div>`;
      row.querySelectorAll(".editor-dlg-line").forEach((lineEl, li) => {
        const ln = item.lines[li];
        lineEl.querySelector(".editor-dlg-speaker").addEventListener("change", (event) => {
          ln.speaker = event.target.value;
        });
        lineEl.querySelector(".editor-dlg-ja").addEventListener("input", (event) => {
          ln.ja = event.target.value;
        });
        lineEl.querySelector(".editor-dlg-en").addEventListener("input", (event) => {
          ln.en = event.target.value;
        });
        lineEl.querySelector(".editor-dlg-del")?.addEventListener("click", () => {
          if (item.lines.length > 1) {
            item.lines.splice(li, 1);
            afterFlowEdit();
          }
        });
        // 用户 #4: reorder a single line up/down (was append-only).
        lineEl.querySelector(".editor-dlg-up")?.addEventListener("click", () => {
          if (li > 0) {
            [item.lines[li - 1], item.lines[li]] = [item.lines[li], item.lines[li - 1]];
            afterFlowEdit();
          }
        });
        lineEl.querySelector(".editor-dlg-down")?.addEventListener("click", () => {
          if (li < item.lines.length - 1) {
            [item.lines[li + 1], item.lines[li]] = [item.lines[li], item.lines[li + 1]];
            afterFlowEdit();
          }
        });
      });
      row.querySelector(".editor-dlg-add").addEventListener("click", () => {
        // New line follows the previous one's speaker, alternating 投稿者↔編者
        // (item 9). A "none" marker line defaults the next back to 投稿者.
        const lastReal = [...item.lines].reverse().find((l) => l.speaker !== "none");
        const next = lastReal && lastReal.speaker === "sender" ? "editor" : "sender";
        item.lines.push({ speaker: next, ja: "", en: "" });
        afterFlowEdit();
      });
    } else {
      // Photo block. Cover (primary): just thumbnail + 封面 badge + filename, no
      // edit fields and no action buttons (item 5). Other roles get a round
      // delete button floating on the thumbnail (item 6), a role dropdown the
      // same width as the thumbnail (item 7), and role-driven title/time fields
      // (item 8): 补充 shows title+time, 细节 shows title only, 插图 shows nothing.
      const isPrimary = item.role === "primary";
      const isIllustration = item.role === "illustration";
      const showFile = !isIllustration;
      const showTitle = !isPrimary && !isIllustration;
      const showTime = item.role === "supplement";
      // 用户 #8 (fig5): a bare <video> thumbnail shows the browser's picture-in-picture
      // / play overlay on hover, which covered the crop/delete buttons. disable PiP +
      // remote playback, and CSS makes the thumbnail video non-interactive.
      // 用户 #8: show the current crop on the thumbnail (image files only; video crop
      // isn't offered). The crop button (⤢) floats on the thumbnail's bottom-left.
      const isImg = !isVideoFile(item.file);
      // 用户 2.2/2.4：每张图（主图/补充/细节，插图除外）都有「获取天气」按钮 +「显示天气」勾选框。
      const hasWeather = Boolean(item.weather && item.weather.hourly && item.weather.hourly.length);
      const weatherControls = isIllustration || isVideoFile(item.file)
        ? ""
        : `<div class="editor-media-weather">
            <button type="button" class="editor-media-weather-btn${hasWeather ? " has-weather" : ""}" data-fact="weather" title="${hasWeather ? "已获取，点可重抓（先保存后抓）" : "按坐标+这张图时间抓取天气（会先保存）"}">☁ ${hasWeather ? "天气 ✓" : "获取天气"}</button>
            <label class="editor-media-weather-show"><input type="checkbox" class="editor-media-weather-toggle"${item.showWeather ? " checked" : ""} /> 显示天气</label>
          </div>`;
      const c = item.crop;
      const thumbCropStyle = isImg && c
        ? `object-position:${c.posX ?? 50}% ${c.posY ?? 50}%;transform:scale(${c.scale ?? 1});transform-origin:${c.posX ?? 50}% ${c.posY ?? 50}%;`
        : "";
      const mediaPreview = isVideoFile(item.file)
        ? `<video src="${escapeHtml(item.src || "")}" muted preload="metadata" playsinline disablepictureinpicture disableremoteplayback></video>`
        : `<img src="${escapeHtml(item.thumb || item.src || "")}" alt="" loading="lazy" style="${thumbCropStyle}" />`;
      const cropBtn = isImg
        ? `<button type="button" class="editor-media-crop${c ? " is-active" : ""}" data-fact="crop" title="裁剪（不改原文件）"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg></button>`
        : "";
      if (isPrimary) {
        // 封面 badge sits to the LEFT of the filename (not under the thumbnail),
        // so the row doesn't get needlessly tall (item 7).
        row.innerHTML = `
          <div class="editor-media-thumb">
            ${mediaPreview}
            ${cropBtn}
          </div>
          <div class="editor-media-controls">
            <div class="editor-media-top">
              <span class="editor-media-badge">封面</span>
              <span class="editor-media-file" title="${escapeHtml(item.file || "")}">${escapeHtml(item.file || "")}</span>
            </div>
            ${weatherControls}
          </div>`;
      } else {
        const roleSelect = `<select class="editor-flow-role">
            ${Object.entries(MEDIA_ROLE_LABELS)
              .map(([value, label]) => `<option value="${value}" ${item.role === value ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>`;
        row.innerHTML = `
          <div class="editor-media-thumb">
            ${mediaPreview}
            <button type="button" class="editor-media-del" data-fact="del-photo" title="删除图片">✕</button>
            ${cropBtn}
            ${roleSelect}
          </div>
          <div class="editor-media-controls">
            ${showFile ? `<div class="editor-media-top"><span class="editor-media-file" title="${escapeHtml(item.file || "")}">${escapeHtml(item.file || "")}</span></div>` : ""}
            ${showTitle ? `<label class="editor-media-field">标题<input class="editor-flow-title" value="${escapeHtml(item.title || "")}" placeholder="默认则空白" /></label>` : ""}
            ${showTime ? `<label class="editor-media-field">时间<input class="editor-flow-time" value="${escapeHtml(item.timeOverride || "")}" placeholder="${escapeHtml(item.photoTime || "默认用照片EXIF")}" /></label>` : ""}
            ${weatherControls}
          </div>
          <div class="editor-block-buttons editor-block-buttons-vertical">
            <button type="button" data-fact="primary" title="设为封面">★</button>
            ${moveButtons}
          </div>`;
        row.querySelector(".editor-flow-role")?.addEventListener("change", (event) => {
          item.role = event.target.value;
          renderFlow();
        });
        row.querySelector(".editor-flow-title")?.addEventListener("input", (event) => {
          item.title = event.target.value;
        });
        row.querySelector(".editor-flow-time")?.addEventListener("input", (event) => {
          item.timeOverride = event.target.value;
        });
      }
    }

    // 「显示天气」勾选框（每张图各自一个）——切换即改这张图的 showWeather，标脏 + 刷新预览。
    row.querySelector(".editor-media-weather-toggle")?.addEventListener("change", (event) => {
      item.showWeather = event.target.checked;
      markEditorDirty();
      renderEditorPreview();
    });

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
    afterFlowEdit();
  } else if (action === "down" && index < flow.length - 1) {
    flow.splice(index + 1, 0, flow.splice(index, 1)[0]);
    afterFlowEdit();
  } else if (action === "del-text") {
    flow.splice(index, 1);
    afterFlowEdit();
  } else if (action === "fold-text") {
    item.collapsed = !item.collapsed;
    renderFlow(); // local-only fold state; no need to mark dirty / re-preview
  } else if (action === "primary") {
    flow.forEach((entry) => {
      if (entry.kind === "photo" && entry.role === "primary") {
        entry.role = "detail";
      }
    });
    item.role = "primary";
    afterFlowEdit();
  } else if (action === "del-photo") {
    deleteMediaFile(item.file);
  } else if (action === "crop") {
    openCropModal(index);
  } else if (action === "weather") {
    fetchWeatherForMedia(item.id);
  }
}

// 用户 #8: non-destructive crop editor. Pick an aspect (原图/free + standard ratios),
// drag to pan, slider to zoom. Saves { aspect, scale, posX, posY, (ar for free) } onto
// the flow item — the original file is never touched; only the site display changes.
const CROP_ASPECT_OPTIONS = [
  ["free", "原图"],
  ["custom", "自由"],
  ["1:1", "1:1"],
  ["4:3", "4:3"],
  ["3:4", "3:4"],
  ["16:9", "16:9"],
  ["9:16", "9:16"],
];
function openCropModal(index) {
  const item = (editor.flow || [])[index];
  if (!item || isVideoFile(item.file)) {
    return;
  }
  const draft = item.crop
    ? { aspect: item.crop.aspect || "free", scale: item.crop.scale || 1, posX: item.crop.posX ?? 50, posY: item.crop.posY ?? 50 }
    : { aspect: "free", scale: 1, posX: 50, posY: 50 };
  // 用户 T4: 自由比例 remembers its chosen box ratio (w/h) across re-opens.
  let customAR = item.crop && item.crop.aspect === "custom" && Number.isFinite(item.crop.ar) ? item.crop.ar : null;
  const overlay = document.createElement("div");
  overlay.className = "crop-modal";
  overlay.innerHTML = `
    <div class="crop-modal-inner">
      <div class="crop-stage" id="crop-stage">
        <img class="crop-img" id="crop-img" src="${escapeHtml(item.src || item.thumb || "")}" alt="" draggable="false" />
        <span class="crop-resize-handle" id="crop-resize" aria-hidden="true" hidden></span>
      </div>
      <div class="crop-ratios">${CROP_ASPECT_OPTIONS.map(([v, l]) => `<button type="button" data-aspect="${v}">${l}</button>`).join("")}</div>
      <label class="crop-zoom-row">缩放<input type="range" class="crop-zoom" min="1" max="4" step="0.01" value="${draft.scale}"></label>
      <p class="crop-hint">拖动图片调整位置；「自由」比例可拖右下角把手改裁剪框大小。裁剪只影响网站显示，不改本地文件，可随时「还原原图」。</p>
      <div class="crop-actions">
        <button type="button" class="crop-reset">还原原图</button>
        <button type="button" class="crop-cancel">取消</button>
        <button type="button" class="crop-save">保存</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const stage = overlay.querySelector("#crop-stage");
  const img = overlay.querySelector("#crop-img");
  const resizeHandle = overlay.querySelector("#crop-resize");
  let naturalAR = 1;
  let lastMax = { maxW: 360, maxH: 300 }; // remembered for the free-resize handle
  const apply = () => {
    const isCustom = draft.aspect === "custom";
    let arNum;
    if (isCustom) {
      arNum = customAR || naturalAR;
    } else if (draft.aspect !== "free") {
      const [w, h] = draft.aspect.split(":");
      arNum = Number(w) / Number(h);
    } else {
      arNum = naturalAR;
    }
    // Explicit px dims (not aspect-ratio) so a tall/wide crop always fits the box.
    const inner = overlay.querySelector(".crop-modal-inner");
    const maxW = Math.min((inner?.clientWidth || 360) - 32, 360);
    const maxH = window.innerHeight * 0.52;
    lastMax = { maxW, maxH };
    let W = maxW;
    let H = W / arNum;
    if (H > maxH) {
      H = maxH;
      W = H * arNum;
    }
    stage.style.width = `${Math.round(W)}px`;
    stage.style.height = `${Math.round(H)}px`;
    img.style.cssText = `width:100%;height:100%;object-fit:cover;object-position:${draft.posX}% ${draft.posY}%;transform:scale(${draft.scale});transform-origin:${draft.posX}% ${draft.posY}%;`;
    overlay.querySelectorAll("[data-aspect]").forEach((b) => b.classList.toggle("is-active", b.dataset.aspect === draft.aspect));
    // The free-resize corner handle only appears in 自由 mode.
    if (resizeHandle) {
      resizeHandle.hidden = !isCustom;
    }
    stage.classList.toggle("is-custom", isCustom);
  };
  const onReady = () => {
    naturalAR = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    if (!customAR) {
      customAR = naturalAR; // 自由 starts from the image's own ratio
    }
    apply();
  };
  if (img.complete && img.naturalWidth) {
    onReady();
  } else {
    img.onload = onReady;
  }
  overlay.querySelectorAll("[data-aspect]").forEach((b) => b.addEventListener("click", () => {
    draft.aspect = b.dataset.aspect;
    apply();
  }));
  overlay.querySelector(".crop-zoom").addEventListener("input", (e) => {
    draft.scale = parseFloat(e.target.value);
    apply();
  });
  // 用户 T4: 自由 mode — drag the bottom-right handle to set an arbitrary crop-box
  // ratio. The box always refits the available area, so only the SHAPE follows the
  // drag (width vs height), keeping it on-screen.
  let resizing = null;
  resizeHandle?.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    resizing = { left: rect.left, top: rect.top };
    resizeHandle.setPointerCapture(e.pointerId);
  });
  resizeHandle?.addEventListener("pointermove", (e) => {
    if (!resizing) {
      return;
    }
    const W = Math.max(60, Math.min(lastMax.maxW, e.clientX - resizing.left));
    const H = Math.max(60, Math.min(lastMax.maxH, e.clientY - resizing.top));
    customAR = W / H;
    draft.aspect = "custom";
    apply();
  });
  const endResize = (e) => {
    if (resizing) {
      resizing = null;
      resizeHandle.releasePointerCapture?.(e.pointerId);
    }
  };
  resizeHandle?.addEventListener("pointerup", endResize);
  resizeHandle?.addEventListener("pointercancel", endResize);
  let dragging = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target === resizeHandle) {
      return; // the resize handle manages its own drag
    }
    dragging = { x: e.clientX, y: e.clientY, px: draft.posX, py: draft.posY };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) {
      return;
    }
    const r = stage.getBoundingClientRect();
    const dx = ((e.clientX - dragging.x) / r.width) * 100;
    const dy = ((e.clientY - dragging.y) / r.height) * 100;
    draft.posX = Math.min(100, Math.max(0, dragging.px - dx));
    draft.posY = Math.min(100, Math.max(0, dragging.py - dy));
    apply();
  });
  const endDrag = () => {
    dragging = null;
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  const close = () => overlay.remove();
  overlay.querySelector(".crop-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
    }
  });
  overlay.querySelector(".crop-reset").addEventListener("click", () => {
    item.crop = null;
    afterFlowEdit();
    close();
  });
  overlay.querySelector(".crop-save").addEventListener("click", () => {
    if (draft.aspect === "free" && draft.scale === 1 && draft.posX === 50 && draft.posY === 50) {
      item.crop = null;
    } else {
      const out = { aspect: draft.aspect, scale: draft.scale, posX: draft.posX, posY: draft.posY };
      if (draft.aspect === "free") {
        out.ar = naturalAR;
      } else if (draft.aspect === "custom") {
        out.ar = customAR || naturalAR; // 用户 T4: remember the free-form box ratio
      }
      item.crop = out;
    }
    afterFlowEdit();
    close();
  });
}

// Re-render the content list, mark unsaved (item 13) + refresh preview (item 10).
function afterFlowEdit() {
  renderFlow();
  markEditorDirty();
  renderEditorPreview();
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
            `<label class="editor-status-item"><span>${o.label}</span><input type="checkbox" value="${o.value}" ${unit.status.includes(o.value) ? "checked" : ""} ${otherOn && o.value !== "other" ? "disabled" : ""} /></label>`,
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
  // 用户 #2/#3: an "unknown" pick at every level (some contributed umbrellas can't
  // give an exact prefecture/city/ward), listed LAST at the bottom of the dropdown.
  // Picking it just stores "unknown" for that level; it matches no child, so deeper
  // levels stay hidden.
  datalist.innerHTML =
    items.map((item) => `<option value="${escapeHtml(levelLabel(item))}"></option>`).join("") +
    `<option value="unknown"></option>`;
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

// Picking a prefecture opens the city dropdown (empty) for the user to choose — it
// does NOT auto-pick a city. Auto-picking the first one silently fabricated a wrong
// value (e.g. Tokyo → "Chiyoda Ward" the user never chose), which looked like the
// next level was "stuck" and got saved as a wrong city (用户 bug).
function onLevel2Change() {
  const pref = editor.prefByLabel?.[editor.lvl2.value];
  editor.lvl3.value = "";
  editor.lvl4.value = "";
  populateCities(pref); // shows the (empty) city dropdown when a prefecture is set
  populateWards(null); // ward stays hidden until a city that has wards is picked
}

// Picking a city opens the ward dropdown (empty) only if that city has wards — it
// does NOT auto-pick a ward.
function onLevel3Change() {
  const city = editor.cityByLabel?.[editor.lvl3.value];
  editor.lvl4.value = "";
  populateWards(city);
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
    // A stored "unknown" at the city level (Tokyo → unknown) reloads as the literal
    // "unknown" pick; otherwise match the real city/ward.
    if (String(levels[1] || "").toLowerCase() === "unknown") {
      editor.lvl3.value = "unknown";
    } else {
      const city = pref.cities.find((c) => c.en === levels[1]);
      if (city) {
        editor.lvl3.value = levelLabel(city);
        onLevel3Change();
        if (String(levels[2] || "").toLowerCase() === "unknown") {
          editor.lvl4.value = "unknown";
        } else {
          const ward = city.wards.find((w) => w.en === levels[2]);
          if (ward) {
            editor.lvl4.value = levelLabel(ward);
          }
        }
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

// A level input reading literally "unknown" (the last option in every dropdown) is a
// real, saved value meaning "known this far, unsure below" — NOT dropped (用户: unknown
// 要能正常保存). A blank sub-level is simply omitted.
function isUnknownLevel(value) {
  return String(value || "").trim().toLowerCase() === "unknown";
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
  const v2 = editor.lvl2.value.trim();
  const pref = editor.prefByLabel?.[v2];
  if (pref) {
    out.push(pref.en);
    const v3 = editor.lvl3.value.trim();
    const city = editor.cityByLabel?.[v3];
    if (city) {
      out.push(city.en);
      const v4 = editor.lvl4.value.trim();
      const ward = editor.wardByLabel?.[v4];
      if (ward) {
        out.push(ward.en);
      } else if (!editor.lvl4.hidden && isUnknownLevel(v4)) {
        out.push("unknown"); // ward explicitly unknown
      }
    } else if (isUnknownLevel(v3)) {
      out.push("unknown"); // city explicitly unknown
    }
  } else if (isUnknownLevel(v2)) {
    out.push("unknown"); // prefecture explicitly unknown (same as lvl1 = Unknown)
  }
  return out;
}

function toggleEditMode() {
  state.editMode = !state.editMode;
  document.body.classList.toggle("edit-mode", state.editMode);
  editor.toggle.classList.toggle("is-active", state.editMode);
  editor.toggle.title = state.editMode ? "退出编辑" : "编辑模式";
  // The T8 map-style tuning panel only exists in edit mode.
  syncMapLayers();
  syncBlurAdjust(); // 模糊度 adjuster (edit mode only)
  syncEditHistory(); // 用户「修改记录」面板也只在编辑模式显示
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
  // Reuse .editor-toggle so it's the exact same size/style as the 编辑模式 button
  // (icon-only, item 11).
  btn.className = "editor-toggle texts-toggle";
  btn.innerHTML = EDITOR_ICON_TEXTS;
  btn.title = "文案編集（类型说明文 / 统计页说明文，日英双语）";
  btn.setAttribute("aria-label", "文案編集");
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
        <fieldset class="texts-section" data-texts-about="section1">
          <legend>About 第一段（观察のきっかけ）</legend>
          <label>標題 日本語<input type="text" data-texts-field="about-title-ja" /></label>
          <label>Title English<input type="text" data-texts-field="about-title-en" /></label>
          <label>本文 日本語（段落用空行分隔）<textarea data-texts-field="about-body-ja" rows="6"></textarea></label>
          <label>Body English<textarea data-texts-field="about-body-en" rows="6"></textarea></label>
        </fieldset>
        <fieldset class="texts-section" data-texts-about="section2">
          <legend>About 第二段（記録の作法）</legend>
          <label>標題 日本語<input type="text" data-texts-field="about-title-ja" /></label>
          <label>Title English<input type="text" data-texts-field="about-title-en" /></label>
          <label>本文 日本語（段落用空行分隔）<textarea data-texts-field="about-body-ja" rows="6"></textarea></label>
          <label>Body English<textarea data-texts-field="about-body-en" rows="6"></textarea></label>
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
  overlay.querySelectorAll("[data-texts-about]").forEach((section) => {
    const sec = (TEXTS.about || {})[section.dataset.textsAbout] || {};
    section.querySelector('[data-texts-field="about-title-ja"]').value = sec.titleJa || "";
    section.querySelector('[data-texts-field="about-title-en"]').value = sec.titleEn || "";
    section.querySelector('[data-texts-field="about-body-ja"]').value = parasToText(sec.bodyJa);
    section.querySelector('[data-texts-field="about-body-en"]').value = parasToText(sec.bodyEn);
  });
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
    about: {},
    typeDescriptions: {},
  };
  overlay.querySelectorAll("[data-texts-about]").forEach((section) => {
    payload.about[section.dataset.textsAbout] = {
      titleJa: section.querySelector('[data-texts-field="about-title-ja"]').value.trim(),
      titleEn: section.querySelector('[data-texts-field="about-title-en"]').value.trim(),
      bodyJa: textToParas(section.querySelector('[data-texts-field="about-body-ja"]').value),
      bodyEn: textToParas(section.querySelector('[data-texts-field="about-body-en"]').value),
    };
  });
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
    renderAbout();
    render();
    closeTextsEditor();
    showEditorToast("文案已保存 ✓");
  } catch (error) {
    showEditorToast(`保存失败：${error.message}`, true);
  }
}

// ---- 视觉设定: 图标线宽 + 详情页正文字号/行距 (data/theme.json) --------------
// 本机专用。三个滑块，拖动即实时预览（改 :root 变量），保存后写回 data/theme.json，
// 线上/别人打开也吃这套值。范围钳制在 THEME_RANGES 内。
const themeEditor = { overlay: null };

// 面板分组：图标线宽 + 详情页 4 类正文（每类 字号/行距/字重）。字重=CSS font-weight。
const THEME_GROUPS = [
  { title: "图标", fields: [{ key: "iconStroke", label: "图标线宽", unit: "" }] },
  {
    title: "主图浮字（地点 / 时间 / INFORMATION）",
    fields: [
      { key: "overlaySize", label: "字号", unit: "px" },
      { key: "overlayLine", label: "行距", unit: "" },
      { key: "overlayWeight", label: "字重", unit: "" },
    ],
  },
  {
    title: "对话",
    fields: [
      { key: "dialogueSize", label: "字号", unit: "px" },
      { key: "dialogueLine", label: "行距", unit: "" },
      { key: "dialogueWeight", label: "字重", unit: "" },
    ],
  },
  {
    title: "段落",
    fields: [
      { key: "paraSize", label: "字号", unit: "px" },
      { key: "paraLine", label: "行距", unit: "" },
      { key: "paraWeight", label: "字重", unit: "" },
    ],
  },
  {
    title: "ID（主图左上角）",
    fields: [
      { key: "idSize", label: "字号", unit: "px" },
      { key: "idLine", label: "行距", unit: "" },
      { key: "idWeight", label: "字重", unit: "" },
    ],
  },
];
const THEME_FIELDS = THEME_GROUPS.flatMap((g) => g.fields);
const THEME_UNITS = Object.fromEntries(THEME_FIELDS.map((f) => [f.key, f.unit]));

// 数值读数：显示「当前值 / 默认值」（用户 item9，如 1.2/1.8）。
function themeOutText(key, value) {
  const unit = THEME_UNITS[key] || "";
  return `${value}${unit}/${THEME_DEFAULTS[key]}${unit}`;
}

function setupThemeEditor() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "theme-toggle";
  btn.className = "editor-toggle theme-toggle";
  btn.innerHTML = EDITOR_ICON_THEME;
  btn.title = "视觉设定（图标线宽 / 详情正文字号 · 行距）";
  btn.setAttribute("aria-label", "视觉设定");
  btn.addEventListener("click", openThemeEditor);
  (editor.toolbar || document.body).appendChild(btn);
}

function openThemeEditor() {
  if (!themeEditor.overlay) {
    buildThemeEditor();
  }
  fillThemeEditor();
  themeEditor.overlay.hidden = false;
}

function closeThemeEditor() {
  if (themeEditor.overlay) {
    themeEditor.overlay.hidden = true;
  }
}

function buildThemeEditor() {
  const overlay = document.createElement("div");
  overlay.className = "texts-editor-overlay theme-editor-overlay";
  overlay.hidden = true;

  const groupsHtml = THEME_GROUPS.map((g) => {
    const rows = g.fields.map((f) => {
      const r = THEME_RANGES[f.key];
      return `
        <label class="theme-row" data-theme-row="${f.key}">
          <span class="theme-row-name">${f.label}</span>
          <input type="range" data-theme-field="${f.key}" min="${r.min}" max="${r.max}" step="${r.step}" />
          <output data-theme-out="${f.key}"></output>
          <button type="button" class="theme-row-reset" data-theme-reset="${f.key}" title="恢复此项默认" aria-label="恢复默认">↺</button>
        </label>`;
    }).join("");
    return `<div class="theme-group"><div class="theme-group-title">${g.title}</div>${rows}</div>`;
  }).join("");

  overlay.innerHTML = `
    <div class="texts-editor theme-editor" role="dialog" aria-label="视觉设定">
      <header class="texts-editor-head">
        <strong>视觉设定 — 图标线宽 / 详情正文</strong>
        <button type="button" class="texts-editor-close" aria-label="close">×</button>
      </header>
      <p class="texts-editor-hint">拖动即实时预览，数值显示「当前/默认」。保存后写入 data/theme.json，线上看到的也会更新。</p>
      <div class="texts-editor-body theme-editor-body">${groupsHtml}</div>
      <footer class="texts-editor-actions">
        <button type="button" class="texts-editor-save theme-editor-save">保存</button>
        <button type="button" class="texts-editor-reset theme-editor-reset">恢复默认</button>
        <button type="button" class="texts-editor-cancel">取消</button>
      </footer>
    </div>`;

  document.body.appendChild(overlay);
  themeEditor.overlay = overlay;

  // 拖动滑块：实时预览（改 :root）+ 更新数字读数，但先不写文件。
  overlay.querySelectorAll("[data-theme-field]").forEach((input) => {
    input.addEventListener("input", () => {
      applyTheme(readThemeEditor());
      updateThemeOutputs();
    });
  });
  // 单项「恢复默认」小按钮（用户 item9）：只把这一项拨回默认值并实时预览。
  overlay.querySelectorAll("[data-theme-reset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.themeReset;
      const input = overlay.querySelector(`[data-theme-field="${key}"]`);
      if (input) {
        input.value = String(THEME_DEFAULTS[key]);
      }
      applyTheme(readThemeEditor());
      updateThemeOutputs();
    });
  });
  overlay.querySelector(".theme-editor-save").addEventListener("click", saveThemeEditor);
  overlay.querySelector(".theme-editor-reset").addEventListener("click", () => {
    setThemeEditorValues(THEME_DEFAULTS);
    applyTheme(THEME_DEFAULTS);
  });
  // 取消：放弃未保存的预览，还原到已保存的 THEME。
  overlay.querySelector(".texts-editor-cancel").addEventListener("click", () => {
    applyTheme(THEME);
    closeThemeEditor();
  });
  overlay.querySelector(".texts-editor-close").addEventListener("click", () => {
    applyTheme(THEME);
    closeThemeEditor();
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      applyTheme(THEME);
      closeThemeEditor();
    }
  });
}

function setThemeEditorValues(theme) {
  const t = sanitizeTheme(theme);
  themeEditor.overlay.querySelectorAll("[data-theme-field]").forEach((input) => {
    input.value = String(t[input.dataset.themeField]);
  });
  updateThemeOutputs();
}

function fillThemeEditor() {
  setThemeEditorValues(THEME);
}

function readThemeEditor() {
  const out = {};
  themeEditor.overlay.querySelectorAll("[data-theme-field]").forEach((input) => {
    out[input.dataset.themeField] = clampThemeValue(input.dataset.themeField, input.value);
  });
  return out;
}

function updateThemeOutputs() {
  THEME_FIELDS.forEach((f) => {
    const input = themeEditor.overlay.querySelector(`[data-theme-field="${f.key}"]`);
    const out = themeEditor.overlay.querySelector(`[data-theme-out="${f.key}"]`);
    if (input && out) {
      out.textContent = themeOutText(f.key, input.value);
    }
  });
}

async function saveThemeEditor() {
  const payload = readThemeEditor();
  showEditorToast("保存中…");
  try {
    await apiPost("/api/save-theme", payload);
    THEME = sanitizeTheme(payload);
    applyTheme(THEME);
    closeThemeEditor();
    showEditorToast("视觉设定已保存 ✓");
  } catch (error) {
    showEditorToast(`保存失败：${error.message}`, true);
  }
}

function getRawById(id) {
  return state.rawById?.get(id) || null;
}

// Fill the "linked point" dropdown with every other record (id + title),
// preselecting the saved one.
function populateLinkedSelect(currentId, selectedLinkedId) {
  if (!editor.linkedId) {
    return;
  }
  const options = [`<option value="">（无 None）</option>`];
  [...state.umbrellas]
    .filter((entry) => entry.id !== currentId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((entry) => {
      const t = localize(entry.title);
      const dispId = displayUmbrellaId(entry);
      const label = t ? `${dispId}（${t}）` : dispId;
      options.push(`<option value="${escapeHtml(entry.id)}">${escapeHtml(label)}</option>`);
    });
  editor.linkedId.innerHTML = options.join("");
  editor.linkedId.value = selectedLinkedId || "";
}

function getEditorSource() {
  const checked = Array.from(editor.sourceRadios || []).find((radio) => radio.checked);
  return checked ? checked.value : "own";
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
  populateCategorySelects();
  editor.category.value = categoryFolderOf(raw);
  syncFlagCheckbox(raw.editFlag || "");
  PLAIN_FIELD_KEYS.forEach((key) => {
    editor.fields[key].value = raw[key] || "";
  });
  // Bilingual title: existing single-language titles land in the 日本語 box. The
  // 标题 row is gated by the header checkbox — ticked when a title already exists.
  const rawTitle = raw.title;
  const titleJa = rawTitle && typeof rawTitle === "object" ? rawTitle.ja || "" : rawTitle || "";
  const titleEn = rawTitle && typeof rawTitle === "object" ? rawTitle.en || "" : "";
  editor.titleJa.value = titleJa;
  editor.titleEn.value = titleEn;
  editor.titleToggle.checked = Boolean(titleJa || titleEn);
  editor.titleRow.hidden = !editor.titleToggle.checked;
  // 显示名：填了就在页面替换 ID；原文件名（真实 id）作为提醒始终显示在行内。
  const displayId = (raw.displayId || "").trim();
  if (editor.displayIdInput) {
    editor.displayIdInput.value = raw.displayId || "";
    editor.displayIdToggle.checked = Boolean(displayId);
    editor.displayIdRow.hidden = !editor.displayIdToggle.checked;
    if (editor.displayIdHint) {
      editor.displayIdHint.textContent = id;
    }
  }
  // Submission origin + contributed-only fields.
  const submissionType = raw.submissionType === "contributed" ? "contributed" : "own";
  editor.sourceRadios.forEach((radio) => {
    radio.checked = radio.value === submissionType;
  });
  syncSourceVisibility();
  editor.submitter.value = raw.submitter || "";
  editor.submissionTime.value = formatDateOnly(raw.submissionTime) || "";
  // T7 模糊地址 + per-point focus zoom + under-pin label.
  if (editor.blurApprox) {
    editor.blurApprox.checked = Boolean(raw.blurApprox);
  }
  if (editor.approxZoom) {
    editor.approxZoom.value = raw.approxZoom === 0 || raw.approxZoom ? String(raw.approxZoom) : "";
  }
  if (editor.blurLabel) {
    editor.blurLabel.value = raw.blurLabel || "";
    // Placeholder = the display address, so the user sees the default fallback.
    editor.blurLabel.placeholder = raw.locationText || raw.location || "显示地址";
  }
  if (editor.blurExtra) {
    editor.blurExtra.hidden = !Boolean(raw.blurApprox);
  }
  if (editor.remarks) {
    editor.remarks.value = raw.remarks || "";
  }
  editor.locApprox.checked = Boolean(raw.locationApprox);
  editor.timeApprox.checked = Boolean(raw.timeApprox);
  // Linked-point row is gated by the 关联 header checkbox — ticked when set.
  editor.linkedToggle.checked = Boolean(raw.linkedId);
  editor.linkedRow.hidden = !editor.linkedToggle.checked;
  populateLinkedSelect(id, raw.linkedId || "");
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
  // Umbrella-details section: own → on+open by default; contributed → off+closed,
  // unless the record already carries umbrella data (then keep it on).
  const hasUmbrellaData = Boolean(raw.umbrellaCount) || (Array.isArray(raw.umbrellaUnits) && raw.umbrellaUnits.length > 0);
  const showUmbrella = hasUmbrellaData || submissionType !== "contributed";
  editor.umbrellaCheck.checked = showUmbrella;
  editor.umbrellaBody.hidden = !showUmbrella;
  buildFlow(raw);
  renderFlow();
  updateCoordReadout(raw);
  renderEditorPreview();
  editor.preview?.classList.add("is-open");
  editor.root.classList.add("is-open");
  // Lets the Archive page reserve space for the side panels (see #15) so cards
  // stay visible and clickable instead of being hidden under them.
  document.body.classList.add("editor-open");
  syncEditHistory(); // 用户 T4: history panel appears with the drawer + preview
  // Freshly opened = no unsaved edits yet (item 13).
  editor.dirty = false;
}

// Mark the open editor as having unsaved changes (item 13) and refresh the live
// left-side preview (item 10).
function markEditorDirty() {
  editor.dirty = true;
}

function onEditorInput() {
  if (!state.editingId) {
    return;
  }
  editor.dirty = true;
  renderEditorPreview();
}

// closeEditor({ force }) — when there are unsaved edits, ask whether to save
// first (item 13). force skips the prompt (used after a successful save).
function closeEditor({ force = false } = {}) {
  if (!force && state.editingId && editor.dirty) {
    const save = window.confirm("有未保存的修改。\n点「确定」保存后退出，点「取消」放弃修改退出。");
    if (save) {
      // Save, then close once it finishes.
      saveEditor().then(() => closeEditor({ force: true }));
      return;
    }
  }
  state.editingId = null;
  editor.dirty = false;
  editor.root?.classList.remove("is-open");
  editor.preview?.classList.remove("is-open");
  document.body.classList.remove("editor-open");
  syncEditHistory(); // 用户 T4: history panel disappears with the drawer + preview
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
// Centre a coordinate in the *visible* map area between the side panels, not the
// physical screen centre (which the editor drawer covers). Used after creating /
// placing a point so its marker is actually visible (item 3).
function centerInEditorGap(coords) {
  if (!state.map || !coords) {
    return;
  }
  state.map.setCenter(coords);
  if (!document.body.classList.contains("editor-open")) {
    return;
  }
  const vw = window.innerWidth;
  const pw = document.querySelector(".editor-preview")?.getBoundingClientRect().width || 0;
  const dw = document.querySelector(".editor-drawer")?.getBoundingClientRect().width || 0;
  const gapCenter = pw + (vw - pw - dw) / 2;
  const dx = vw / 2 - gapCenter; // shift east so the centred point lands in the gap
  if (Math.abs(dx) > 4) {
    state.map.panBy(dx, 0);
  }
}

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
  // Use the centre of the *visible* gap (not screen centre) so the new marker
  // isn't dropped behind the editor drawer (item 3).
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
  centerInEditorGap(coords);
  showEditorToast("已放到可见地图区，请拖动标记到准确位置后点保存");
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
  // Title/linked rows are gated by their header checkboxes — unchecked = cleared.
  payload.title = editor.titleToggle?.checked
    ? { ja: editor.titleJa.value.trim(), en: editor.titleEn.value.trim() }
    : { ja: "", en: "" };
  payload.linkedId = editor.linkedToggle?.checked && editor.linkedId ? editor.linkedId.value : "";
  payload.displayId = editor.displayIdToggle?.checked ? editor.displayIdInput.value.trim() : "";
  payload.submissionType = getEditorSource();
  payload.submitter = editor.submitter.value;
  // Submission time is stored date-only (年月日), no hour/minute (item 8).
  payload.submissionTime = formatDateOnly(editor.submissionTime.value);
  payload.remarks = editor.remarks ? editor.remarks.value : "";
  // submitterNote is no longer edited here (item 14) — the words live in 内容;
  // don't send it so the stored value is preserved untouched.
  payload.locationApprox = editor.locApprox.checked;
  payload.timeApprox = editor.timeApprox.checked;
  // T7 模糊地址 + per-point focus zoom + under-pin label.
  payload.blurApprox = editor.blurApprox ? editor.blurApprox.checked : false;
  payload.approxZoom = editor.approxZoom && editor.approxZoom.value.trim() !== "" ? Number(editor.approxZoom.value) : "";
  payload.blurLabel = editor.blurLabel ? editor.blurLabel.value.trim() : "";
  payload.locationLevels = collectLevelsForSave();
  // Umbrella details only saved when the section is enabled; otherwise cleared
  // (so contributed umbrellas without details don't show object/state).
  if (editor.umbrellaCheck.checked) {
    payload.umbrellaCount = editor.count.value;
    payload.umbrellaUnits = collectUnitsForSave();
  } else {
    payload.umbrellaCount = "";
    payload.umbrellaUnits = [];
  }
  const photos = (editor.flow || []).filter((i) => i.kind === "photo");
  payload.media = photos.map((p) => ({
    file: p.file,
    id: p.id,
    role: p.role,
    title: p.title,
    // Blank time box keeps the stored/EXIF time; a typed override replaces it (item 15).
    photoTime: p.timeOverride && p.timeOverride.trim() ? p.timeOverride.trim() : p.photoTime,
    crop: p.crop || null, // 用户 #8: non-destructive crop.
    showWeather: Boolean(p.showWeather),
  }));
  const isTextLike = (i) => i.kind === "text" || i.kind === "dialogue";
  payload.blocks = (editor.flow || [])
    .filter((i) => isTextLike(i) || (i.kind === "photo" && i.role !== "primary"))
    .map((i) =>
      isTextLike(i)
        ? { type: i.kind, text: flowTextLike(i) }
        : { type: "photo", file: i.file },
    )
    .filter((b) => b.type === "photo" || b.text.ja || b.text.en);
  // story is the card-preview fallback; keep it as the Japanese paragraphs joined.
  payload.story = (editor.flow || [])
    .filter(isTextLike)
    .map((i) => flowTextLike(i).ja)
    .filter(Boolean)
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
    // 用户「修改记录」: log this edit (keeps the pre-edit snapshot for 撤回).
    recordEditHistory(id, "modify", { previous: result.previous, label: historyLabelFor(id, result.previous) });
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

// 用户 2.2/2.4: 某张图的「获取天气」按钮。先保存（把当前 media/时间/showWeather 落盘），
// 再按后端接口用「记录坐标 + 这张图时间」抓天气（主图 24h 逐时、补充/细节 只拍摄当时1点）
// 写回该 media.weather；抓完重载并重开编辑器。
async function fetchWeatherForMedia(mediaId) {
  const id = state.editingId;
  if (!id || !mediaId) {
    return;
  }
  // 先保存：这样后端读盘拿到最新时间/图片，且不会把用户刚勾的「显示天气」冲掉。
  await saveEditor();
  if (state.editingId !== id) {
    return; // 保存失败或编辑器已关，别继续。
  }
  try {
    const result = await apiPost("/api/fetch-weather", { id, mediaId });
    state.umbrellas = await loadUmbrellaData();
    render();
    openEditor(id);
    const n = result?.weather?.hourly?.filter((h) => h.code !== null).length || 0;
    showEditorToast(`已获取天气 ✓（${n} 点）`);
  } catch (error) {
    showEditorToast(`获取天气失败：${error.message}`, true);
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

// 允许上传的格式（和后端 record-utils / editor-api 保持一致）。HEIC 等浏览器打不开的
// 一律拦下：前端先给友好提示，后端还会再兜底一次。
const ALLOWED_IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const ALLOWED_VIDEO_EXTS = [".mp4", ".mov", ".webm", ".m4v"];
// <input accept> 用的字符串：明确列扩展名，别用 image/*（image/* 会放进 HEIC）。
const CREATE_ACCEPT = ALLOWED_IMAGE_EXTS.join(",");
const UPLOAD_ACCEPT = [...ALLOWED_IMAGE_EXTS, ...ALLOWED_VIDEO_EXTS].join(",");

function fileExt(name) {
  const m = /\.[a-z0-9]+$/i.exec(String(name || ""));
  return m ? m[0].toLowerCase() : "";
}
// 返回 null 表示可以传；否则返回一段中文错误提示。imageOnly=true 时只允许图片（新建主图用）。
function mediaFormatError(file, { imageOnly } = {}) {
  const ext = fileExt(file?.name);
  const ok = imageOnly
    ? ALLOWED_IMAGE_EXTS.includes(ext)
    : ALLOWED_IMAGE_EXTS.includes(ext) || ALLOWED_VIDEO_EXTS.includes(ext);
  if (ok) {
    return null;
  }
  const imgHint = "jpg / png / webp / gif / avif";
  return imageOnly
    ? `不支持的图片格式「${file?.name || ""}」，只能用 ${imgHint}（HEIC 等请先转成 jpg）。`
    : `不支持的格式「${file?.name || ""}」，图片用 ${imgHint}、视频用 mp4/mov/webm/m4v（HEIC 等请先转成 jpg）。`;
}

// Upload one or more images into the currently-open record's folder.
async function onUploadImages(event) {
  const id = state.editingId;
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!id || !files.length) {
    return;
  }
  // 传之前先逐个把关，有一个不合格就整批不传，直接告诉用户是哪个文件。
  for (const file of files) {
    const err = mediaFormatError(file);
    if (err) {
      showEditorToast(err, true);
      return;
    }
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
  // 新建标点的主图必须能在网页显示，先拦下 HEIC 等格式（后端还会再兜底）。
  const formatErr = mediaFormatError(file, { imageOnly: true });
  if (formatErr) {
    showEditorToast(formatErr, true);
    return;
  }
  // 直接用原文件名（含扩展名）作为主图 / 标点 ID。以前这里会弹窗问是否改名——现在
  // 「显示名 displayId」功能已经能改对外显示的 ID，不必再在这一步动真实文件名了。
  const filename = file.name;
  showEditorToast("新增中…");
  try {
    const dataBase64 = await readFileAsDataUrl(file);
    const center = state.map?.getCenter?.();
    const coordinates = center ? { lat: center.lat(), lng: center.lng() } : null;
    // The 新增 popup (item 12) chose the source + category before the file picker.
    const pending = editor.pendingCreate || { source: "own", category: "unknown" };
    editor.pendingCreate = null;
    const source = pending.source === "contributed" ? "contributed" : "own";
    const category = pending.category || (source === "contributed" ? "submission(pending)" : "unknown");
    // Contributed points usually only have a rough location/time, so default
    // both "approximate" flags on (the editor can untick them).
    const createPayload = { filename, dataBase64, coordinates, category };
    if (source === "contributed") {
      createPayload.submissionType = "contributed";
      createPayload.locationApprox = true;
      createPayload.timeApprox = true;
    }
    const result = await apiPost("/api/create-record", createPayload);
    // 用户「修改记录」: log the new marker (撤回 = delete it).
    recordEditHistory(result.id, "create", { label: result.id });
    state.umbrellas = await loadUmbrellaData();
    if (!state.editMode) {
      toggleEditMode();
    } else {
      render();
    }
    openEditor(result.id);
    // Bring the new marker into the visible map gap between the side panels —
    // both the EXIF-GPS spot and the no-GPS map-center one would otherwise sit
    // dead-centre, hidden behind the editor drawer (item 3).
    if (result.coordinates && state.googleReady && state.map) {
      switchToMapView();
      if (result.fromExif) {
        state.map.setZoom(Math.max(state.map.getZoom(), DEFAULT_MAP_ZOOM));
      }
      centerInEditorGap(result.coordinates);
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

// ---- 投稿收件箱（仅本机）：拉 Google 表单投稿 → 审核/改信息/定坐标 → 增加为正式标点 ----

const inboxState = { modal: null, listEl: null, detailEl: null, submissions: [], currentKey: null, collapsed: new Set() };

function buildInboxModal() {
  const modal = document.createElement("div");
  modal.className = "editor-inbox-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="editor-inbox-card" role="dialog" aria-label="投稿收件箱">
      <header class="editor-inbox-head">
        <strong>投稿收件箱</strong>
        <div class="editor-inbox-head-actions">
          <button type="button" class="editor-inbox-refresh">刷新</button>
          <button type="button" class="editor-inbox-close" aria-label="关闭">×</button>
        </div>
      </header>
      <div class="editor-inbox-body">
        <div class="editor-inbox-list"></div>
        <div class="editor-inbox-detail"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  inboxState.modal = modal;
  inboxState.listEl = modal.querySelector(".editor-inbox-list");
  inboxState.detailEl = modal.querySelector(".editor-inbox-detail");
  modal.querySelector(".editor-inbox-close").addEventListener("click", closeInbox);
  modal.querySelector(".editor-inbox-refresh").addEventListener("click", loadInbox);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeInbox();
    }
  });
}

function openInbox() {
  if (!inboxState.modal) {
    buildInboxModal();
  }
  inboxState.modal.hidden = false;
  loadInbox();
}

function closeInbox() {
  if (inboxState.modal) {
    inboxState.modal.hidden = true;
  }
}

async function loadInbox() {
  inboxState.listEl.innerHTML = `<p class="editor-inbox-empty">读取中…</p>`;
  inboxState.detailEl.innerHTML = `<p class="editor-inbox-hint">← 从左边选一条投稿</p>`;
  inboxState.currentKey = null;
  try {
    const res = await apiPost("/api/submissions/list", {});
    inboxState.submissions = res.submissions || [];
    renderInboxList();
  } catch (error) {
    inboxState.listEl.innerHTML = `<p class="editor-inbox-empty">读取失败：${escapeHtml(error.message)}</p>`;
  }
}

// 投稿时间戳 → 年月（分组用）/ 年月日（显示用）。Google 时间戳含「下午」等本地化词，
// new Date 认不了，所以直接正则抽前面的「四位年 + 月 + 日」。都抽不到就回退原文。
function inboxSubmissionDate(sub) {
  const raw = String(sub.timestamp || "").trim();
  const m = raw.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) {
    const mo = String(m[2]).padStart(2, "0");
    const day = String(m[3]).padStart(2, "0");
    return { month: `${m[1]}-${mo}`, ymd: `${m[1]}-${mo}-${day}` };
  }
  return { month: raw || "未知时间", ymd: raw || "?" };
}

function inboxSubmitterName(sub) {
  const s = (sub.submitter || "").trim();
  return s || "Anonymous";
}

function inboxItemHtml(s) {
  const badge = s.imported ? `<span class="editor-inbox-badge">已导入</span>` : "";
  const active = s.rowKey === inboxState.currentKey ? " is-active" : "";
  const done = s.imported ? " is-imported" : "";
  return `<button type="button" class="editor-inbox-item${active}${done}" data-key="${escapeHtml(s.rowKey)}">
      <span class="editor-inbox-item-title">${escapeHtml(s.folderId || "(待定 id)")}${badge}</span>
      <span class="editor-inbox-item-sub">${escapeHtml(inboxSubmitterName(s))} · ${escapeHtml(inboxSubmissionDate(s).ymd)}</span>
    </button>`;
}

function renderInboxList() {
  const subs = inboxState.submissions;
  const listEl = inboxState.listEl;
  if (subs.length === 0) {
    listEl.innerHTML = `<p class="editor-inbox-empty">表单里还没有投稿。</p>`;
    return;
  }
  // 按投稿月份分组（用户 1.2），每组可折叠。
  const groups = new Map();
  subs.forEach((s) => {
    const key = inboxSubmissionDate(s).month;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(s);
  });
  const collapsed = inboxState.collapsed;
  listEl.innerHTML = [...groups.entries()]
    .map(([month, items]) => {
      const isCollapsed = collapsed.has(month);
      return `<div class="editor-inbox-group${isCollapsed ? " is-collapsed" : ""}">
        <button type="button" class="editor-inbox-group-head" data-month="${escapeHtml(month)}">
          <span class="editor-inbox-group-caret">▾</span>
          <span class="editor-inbox-group-title">${escapeHtml(month)}</span>
          <span class="editor-inbox-group-count">${items.length}</span>
        </button>
        <div class="editor-inbox-group-body">${items.map(inboxItemHtml).join("")}</div>
      </div>`;
    })
    .join("");
  listEl.querySelectorAll(".editor-inbox-group-head").forEach((head) => {
    head.addEventListener("click", () => {
      const m = head.dataset.month;
      if (collapsed.has(m)) {
        collapsed.delete(m);
      } else {
        collapsed.add(m);
      }
      renderInboxList();
    });
  });
  listEl.querySelectorAll(".editor-inbox-item").forEach((btn) => {
    btn.addEventListener("click", () => openInboxDetail(btn.dataset.key));
  });
}

// 内容段落默认文字（和后端 buildBlocks 一致：观察/环境/追加メモ + 记忆天气）。
function inboxDefaultBlocksText(sub) {
  const parts = [];
  [sub.observation, sub.surroundings, sub.additionalNotes].forEach((t) => {
    if (t && t.trim()) {
      parts.push(t.trim());
    }
  });
  const w = (sub.weather || "").trim();
  if (w && !/覚えていない|don'?t remember/i.test(w)) {
    parts.push(`（投稿者记忆的天气 / Weather as recalled: ${w}）`);
  }
  return parts.join("\n\n");
}

// 收件箱右侧「只看信息、不编辑」（用户 1.3）。所有修改进编辑器做。
function openInboxDetail(key) {
  const sub = inboxState.submissions.find((s) => s.rowKey === key);
  if (!sub) {
    return;
  }
  inboxState.currentKey = key;
  renderInboxList();
  const d = inboxState.detailEl;
  const content = inboxDefaultBlocksText(sub);
  const row = (label, val) =>
    val ? `<div class="editor-inbox-info-row"><dt>${label}</dt><dd>${escapeHtml(val)}</dd></div>` : "";
  d.innerHTML = `
    <div class="editor-inbox-photos"></div>
    <dl class="editor-inbox-info">
      ${row("文件夹 ID", sub.folderId || "(导入时生成)")}
      ${row("投稿者", inboxSubmitterName(sub))}
      ${row("投稿时间", inboxSubmissionDate(sub).ymd)}
      ${row("发现时间", sub.dateFound)}
      ${row("地点", sub.location)}
    </dl>
    ${
      content
        ? `<div class="editor-inbox-content"><dt>内容</dt><p>${escapeHtml(content).replace(/\n/g, "<br>")}</p></div>`
        : ""
    }
    <div class="editor-inbox-actions">
      <button type="button" class="ib-import">导入并编辑</button>
      <span class="ib-status"></span>
    </div>
    <p class="editor-inbox-hint">这里只看信息。点「导入并编辑」生成待审核（submission pending）草稿并打开编辑器——地址级联、伞的属性、段落图文、四个勾选框、拖动地图定坐标都在编辑器里改。主图若有 GPS 会自动作为初始坐标。</p>`;

  // 主图若有 GPS，记下来当导入时的初始坐标（不再让用户手填）。
  const picked = { coords: null };
  renderInboxPhotos(sub, d.querySelector(".editor-inbox-photos"), (lat, lng) => {
    if (!picked.coords && Number.isFinite(lat) && Number.isFinite(lng)) {
      picked.coords = { lat, lng };
    }
  });

  const importBtn = d.querySelector(".ib-import");
  const status = d.querySelector(".ib-status");
  if (sub.imported) {
    importBtn.disabled = true;
    importBtn.textContent = "已导入";
    status.textContent = "这条已经导入过了。";
  }
  importBtn.addEventListener("click", () => doInboxImport(sub, d, picked));
}

async function renderInboxPhotos(sub, container, onMainCoords) {
  const ids = [...sub.mainPhotoIds, ...sub.additionalPhotoIds];
  container.innerHTML = ids.map(() => `<div class="editor-inbox-photo is-loading">加载中…</div>`).join("");
  const slots = container.querySelectorAll(".editor-inbox-photo");
  ids.forEach(async (fileId, i) => {
    const slot = slots[i];
    if (!slot) {
      return;
    }
    try {
      const res = await apiPost("/api/submissions/photo", { fileId });
      if (res.heic) {
        slot.className = "editor-inbox-photo is-heic";
        slot.innerHTML = `<span>HEIC 照片<br>浏览器打不开<br>EXIF 也读不了<br>导入后请手动转 jpg</span>`;
        return;
      }
      slot.className = "editor-inbox-photo";
      // 照片 + 它的 EXIF（拍摄时间 / GPS 坐标）。读不到就显示「无 EXIF」。
      const exif = res.exif || {};
      const gps = exif.coordinates;
      const hasGps = gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lng);
      const parts = [];
      const inlineIco = (inner) =>
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:1em;height:1em;vertical-align:-0.15em">${inner}</svg>`;
      if (exif.dateTime) {
        parts.push(`${inlineIco('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')} ${escapeHtml(exif.dateTime)}`);
      }
      if (hasGps) {
        parts.push(
          `${inlineIco('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>')} ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`,
        );
      }
      const metaHtml = parts.length
        ? `<div class="editor-inbox-photo-exif">${parts.join(" · ")}</div>`
        : `<div class="editor-inbox-photo-exif is-empty">无 EXIF</div>`;
      slot.innerHTML = `<img src="${res.dataUrl}" alt="" />${metaHtml}`;
      // 主图（第一张）的 GPS 回报给详情，导入时当初始坐标。
      if (hasGps && i === 0 && typeof onMainCoords === "function") {
        onMainCoords(gps.lat, gps.lng);
      }
    } catch {
      slot.className = "editor-inbox-photo is-error";
      slot.textContent = "加载失败";
    }
  });
}

async function doInboxImport(sub, d, picked) {
  const importBtn = d.querySelector(".ib-import");
  const status = d.querySelector(".ib-status");
  const coords = picked && picked.coords ? picked.coords : null;
  importBtn.disabled = true;
  status.textContent = "导入中…";
  try {
    // 只传 rowKey + 主图 GPS（若有）；署名/时间/地点/内容用投稿原值（后端回退），进编辑器再改。
    const res = await apiPost("/api/submissions/import", { rowKey: sub.rowKey, coords });
    sub.imported = true;
    // 刷新数据 → 关收件箱 → 直接打开完整编辑器继续改。
    state.umbrellas = await loadUmbrellaData();
    render();
    closeInbox();
    openEditor(res.id);
    switchToMapView();
    if (coords) {
      centerInEditorGap(coords);
    }
    const heicNote = res.heicCount ? `（${res.heicCount} 张 HEIC 待手动转 jpg）` : "";
    showEditorToast(`已导入草稿 ${res.id}，继续编辑吧 ✓${heicNote}`);
  } catch (error) {
    status.textContent = "导入失败：" + error.message;
    importBtn.disabled = false;
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

// Type selects exclude the "submission" folder — contributed umbrellas don't
// take part in the type classification (item 6).
function listTypeCategories() {
  return listCategories().filter((c) => !c.startsWith("submission"));
}

function populateCategorySelects() {
  const options =
    listTypeCategories()
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("") + `<option value="__new__">＋ 新建分类…</option>`;
  if (editor.category) {
    editor.category.innerHTML = options;
  }
  if (editor.createType) {
    const prev = editor.createType.value;
    editor.createType.innerHTML = options;
    if (prev && [...editor.createType.options].some((o) => o.value === prev)) {
      editor.createType.value = prev;
    }
  }
}

function promptNewCategory() {
  const value = window.prompt("输入新分类（整串作为一个类型），例如 hookable(affordance) 或 unknown：");
  return value ? value.trim() : "";
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

function syncFlagCheckbox(active) {
  if (editor.flagToggle) {
    editor.flagToggle.checked = Boolean(active);
  }
  // 备注 only shows once a point is flagged 待改 (item 13).
  if (editor.remarksRow) {
    editor.remarksRow.hidden = !Boolean(active);
  }
}

// The "待改" checkbox saves immediately and recolours the map without a full
// reload. Checked recolours the pin (用户 #4): 自拍伞 → BLACK, 投稿伞 → WHITE;
// unchecked = no flag.
async function onFlagToggle() {
  const id = state.editingId;
  if (!id) {
    return;
  }
  const item = state.umbrellas.find((entry) => entry.id === id);
  const color = editor.flagToggle?.checked ? (isContributedItem(item) ? "white" : "black") : "";
  if (editor.remarksRow) {
    editor.remarksRow.hidden = !editor.flagToggle?.checked;
  }
  try {
    await apiPost("/api/save-record", { id, editFlag: color });
    const raw = getRawById(id);
    if (raw) {
      raw.editFlag = color;
    }
    if (item) {
      item.editFlag = color;
    }
    renderMapMarkers(filteredUmbrellas());
    showEditorToast(color ? "已标记待改 ✓" : "已清除标记");
  } catch (error) {
    showEditorToast(`标记失败：${error.message}`, true);
  }
}

async function deleteCurrentRecord() {
  const id = state.editingId;
  if (!id) {
    return;
  }
  if (!window.confirm(`确定删除整条标点「${id}」？\n（可在左下角「修改记录」里点「撤回」把它恢复回来。）`)) {
    return;
  }
  try {
    const label = historyLabelFor(id, getRawById(id));
    const result = await apiPost("/api/delete-record", { id });
    // 用户「修改记录」: log the deletion (撤回 = restore from trash via trashKey).
    recordEditHistory(id, "delete", { record: result.record, trashKey: result.trashKey, label });
    closeEditor({ force: true });
    state.umbrellas = await loadUmbrellaData();
    render();
    showEditorToast("已删除标点 ✓（可在「修改记录」撤回）");
  } catch (error) {
    showEditorToast(`删除失败：${error.message}`, true);
  }
}

// ---- 修改记录 / edit history (local-only) -----------------------------------
// Records the last 50 markers the user created / modified / deleted, one entry per
// marker (newest first). Each entry keeps enough to fully UNDO that marker's
// changes: a modify keeps the raw pre-edit record (baseline) to write back; a
// create is undone by deleting the marker; a delete is undone by restoring the
// soft-deleted folder from filebox/.trash (trashKey). Stored in localStorage so it
// survives reloads. 全部只在本机编辑模式出现。
const EDIT_HISTORY_KEY = "fu-edit-history";
const EDIT_HISTORY_MAX = 50;

function loadEditHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(EDIT_HISTORY_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((e) => e && e.id && e.action) : [];
  } catch {
    return [];
  }
}

function persistEditHistory() {
  try {
    localStorage.setItem(EDIT_HISTORY_KEY, JSON.stringify(state.editHistory || []));
  } catch {
    /* ignore storage failure */
  }
}

function historyLabelFor(id, rawOrRecord) {
  const t = rawOrRecord?.title;
  const title = t && typeof t === "object" ? t.ja || t.en : t;
  const dispId = (rawOrRecord?.displayId || "").trim() || id;
  return title ? `${dispId}（${title}）` : dispId;
}

// Push (or update) a marker's history entry. action: "create" | "modify" | "delete".
// extra: { previous } for modify baseline, { record, trashKey } for delete, { label }.
function recordEditHistory(id, action, extra = {}) {
  if (!id) {
    return;
  }
  if (!Array.isArray(state.editHistory)) {
    state.editHistory = loadEditHistory();
  }
  const list = state.editHistory;
  const existing = list.find((e) => e.id === id);
  const label = extra.label || historyLabelFor(id, extra.record || extra.previous) || id;
  const ts = Date.now();

  if (action === "modify") {
    if (existing) {
      // Keep the ORIGINAL pre-modification baseline (so 撤回 reverts every change),
      // and keep a "create" action as create (undo = delete). Just bump the time.
      existing.ts = ts;
      existing.label = label;
      if (existing.action === "modify" && !existing.baseline && extra.previous) {
        existing.baseline = extra.previous;
      }
      moveHistoryEntryToTop(id);
    } else {
      list.unshift({ id, action: "modify", baseline: extra.previous || null, ts, label });
    }
  } else if (action === "create") {
    removeHistoryEntry(id, { silent: true });
    list.unshift({ id, action: "create", baseline: null, ts, label });
  } else if (action === "delete") {
    removeHistoryEntry(id, { silent: true });
    list.unshift({ id, action: "delete", baseline: extra.record || null, trashKey: extra.trashKey || "", ts, label });
  }

  if (list.length > EDIT_HISTORY_MAX) {
    list.length = EDIT_HISTORY_MAX;
  }
  persistEditHistory();
  syncEditHistory();
}

function moveHistoryEntryToTop(id) {
  const list = state.editHistory || [];
  const idx = list.findIndex((e) => e.id === id);
  if (idx > 0) {
    const [entry] = list.splice(idx, 1);
    list.unshift(entry);
  }
}

function removeHistoryEntry(id, { silent = false } = {}) {
  if (!Array.isArray(state.editHistory)) {
    return;
  }
  const idx = state.editHistory.findIndex((e) => e.id === id);
  if (idx >= 0) {
    state.editHistory.splice(idx, 1);
    if (!silent) {
      persistEditHistory();
      syncEditHistory();
    }
  }
}

function clearEditHistory() {
  if (!(state.editHistory || []).length) {
    return;
  }
  if (!window.confirm("清空「修改记录」列表？\n（只是清掉这个列表，不会改动或删除任何已保存的标点数据。）")) {
    return;
  }
  state.editHistory = [];
  persistEditHistory();
  syncEditHistory();
}

const HISTORY_ACTION_LABELS = { create: "新增", modify: "修改", delete: "删除" };

function formatHistoryTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Show/hide (edit mode only) + re-render the history list.
function syncEditHistory() {
  if (!editor.history) {
    return;
  }
  if (!Array.isArray(state.editHistory)) {
    state.editHistory = loadEditHistory();
  }
  // 用户 v122 T4: the 修改记录 panel is bound to the editor drawer + preview — it only
  // shows while a record is open (editingId), and hides the moment the drawer closes,
  // so the three appear/disappear as one unit (no more orphaned history panel).
  const show = Boolean(state.editMode && state.editingId);
  editor.history.hidden = !show;
  if (!show) {
    return;
  }
  renderEditHistory();
}

function renderEditHistory() {
  if (!editor.historyList) {
    return;
  }
  const list = state.editHistory || [];
  if (!list.length) {
    editor.historyList.innerHTML = `<p class="editor-history-empty">还没有修改记录。<br>新增 / 修改 / 删除标点后会出现在这里。</p>`;
    return;
  }
  editor.historyList.innerHTML = list
    .map((e) => {
      const actionCls = `is-${e.action}`;
      const actionLabel = HISTORY_ACTION_LABELS[e.action] || e.action;
      const deleted = e.action === "delete";
      // A modify entry can only be undone if we captured its baseline.
      const canUndo = e.action !== "modify" || e.baseline;
      const rowHint = deleted ? "点击恢复这个被删除的标点" : "点击重新编辑这个标点";
      return `<div class="editor-history-row ${actionCls}" data-history-id="${escapeHtml(e.id)}" title="${rowHint}">
          <span class="editor-history-badge ${actionCls}">${actionLabel}</span>
          <span class="editor-history-label">${escapeHtml(e.label || e.id)}</span>
          <span class="editor-history-time">${formatHistoryTime(e.ts)}</span>
          <button type="button" class="editor-history-undo" data-history-undo="${escapeHtml(e.id)}"${canUndo ? "" : " disabled"}>撤回</button>
        </div>`;
    })
    .join("");
}

function onEditHistoryClick(event) {
  const undoBtn = event.target.closest?.("[data-history-undo]");
  if (undoBtn) {
    event.stopPropagation();
    undoHistoryEntry(undoBtn.dataset.historyUndo);
    return;
  }
  const row = event.target.closest?.("[data-history-id]");
  if (row) {
    reeditHistoryEntry(row.dataset.historyId);
  }
}

// Re-open a marker from its history entry. Deleted markers must be restored first.
async function reeditHistoryEntry(id) {
  const entry = (state.editHistory || []).find((e) => e.id === id);
  if (!entry) {
    return;
  }
  if (entry.action === "delete") {
    await undoHistoryEntry(id); // restore, then it's editable again
    return;
  }
  if (!getRawById(id)) {
    showEditorToast(`标点「${id}」已不存在，无法编辑`, true);
    return;
  }
  closeFocusMode();
  openEditor(id);
  const raw = getRawById(id);
  if (raw && hasCoordinates(raw) && state.googleReady) {
    switchToMapView();
    centerInEditorGap(raw.coordinates);
  }
}

// 撤回 = undo ALL of a marker's recorded changes, then drop the history entry.
async function undoHistoryEntry(id) {
  const entry = (state.editHistory || []).find((e) => e.id === id);
  if (!entry) {
    return;
  }
  const kind = HISTORY_ACTION_LABELS[entry.action] || entry.action;
  if (!window.confirm(`撤回「${entry.label || id}」的${kind}？\n${entry.action === "delete" ? "会把它恢复回地图。" : entry.action === "create" ? "会删除这个新增的标点。" : "会把它还原到修改前的样子。"}`)) {
    return;
  }
  try {
    if (entry.action === "modify") {
      if (!entry.baseline) {
        throw new Error("缺少还原基线，无法撤回");
      }
      await apiPost("/api/restore-record-data", { id, record: entry.baseline });
    } else if (entry.action === "create") {
      // Undo a create = delete it (soft-delete; its own trash entry isn't tracked).
      await apiPost("/api/delete-record", { id });
    } else if (entry.action === "delete") {
      if (!entry.trashKey) {
        throw new Error("缺少回收站标识，无法恢复");
      }
      await apiPost("/api/restore-trashed", { trashKey: entry.trashKey });
    }
    // If the editor is open on this marker, close it (its data just changed underfoot).
    if (state.editingId === id) {
      closeEditor({ force: true });
    }
    removeHistoryEntry(id);
    state.umbrellas = await loadUmbrellaData();
    render();
    showEditorToast(`已撤回：${entry.label || id}`);
  } catch (error) {
    showEditorToast(`撤回失败：${error.message}`, true);
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
  // Default look (what end users see): POI + transit hidden, road names kept.
  // The edit-mode tuning panel (T8) layers overrides on top of this.
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

// T8: an edit-mode-only DEV TUNING tool for whole-category map styling (not shown
// to end users). Google Maps can only style by category (featureType/elementType),
// never one road/shop. Each category can be 自動/显示/淡化/隐藏 (auto = base
// default, fade = lightened) plus an optional zoom threshold (hidden below it).
// The choices persist in localStorage (per-machine) as TWO independent sets — the
// plain map and the satellite map each keep their own (用户); editing the one you're
// looking at never touches the other. End users (no localStorage, no edit mode) just
// get the base look. Tuned values are meant to be read off + baked into mapStyles.
const MAP_LAYER_CATEGORIES = [
  { key: "poiLabels", labels: { ja: "店舗・地点名(POI文字)", en: "POI labels" }, featureType: "poi", elementType: "labels" },
  { key: "poiIcons", labels: { ja: "POIアイコン", en: "POI icons" }, featureType: "poi", elementType: "labels.icon" },
  { key: "poiBusiness", labels: { ja: "店舗", en: "Businesses" }, featureType: "poi.business" },
  { key: "poiPark", labels: { ja: "公園・緑地", en: "Parks" }, featureType: "poi.park" },
  { key: "poiAttraction", labels: { ja: "観光地", en: "Attractions" }, featureType: "poi.attraction" },
  { key: "roadLabels", labels: { ja: "道路名", en: "Road labels" }, featureType: "road", elementType: "labels" },
  { key: "roadGeometry", labels: { ja: "道路の線", en: "Road lines" }, featureType: "road", elementType: "geometry" },
  { key: "highway", labels: { ja: "高速道路", en: "Highways" }, featureType: "road.highway" },
  { key: "transit", labels: { ja: "公共交通", en: "Transit" }, featureType: "transit" },
  { key: "transitLabels", labels: { ja: "駅・バス停名", en: "Transit labels" }, featureType: "transit", elementType: "labels" },
  { key: "administrative", labels: { ja: "行政文字", en: "Admin labels" }, featureType: "administrative", elementType: "labels" },
  { key: "waterLabels", labels: { ja: "水域名", en: "Water labels" }, featureType: "water", elementType: "labels" },
  { key: "landscape", labels: { ja: "地形・建物", en: "Landscape" }, featureType: "landscape", elementType: "geometry" },
];

const MAP_CATEGORY_STORAGE_KEY = "fu-map-layers";
const MAP_VIS_CYCLE = ["auto", "show", "fade", "hide"];
const MAP_VIS_LABELS = {
  auto: { ja: "自動", en: "auto" },
  show: { ja: "表示", en: "show" },
  fade: { ja: "淡化", en: "fade" },
  hide: { ja: "隠す", en: "hide" },
};

// Each category state = { vis: auto|show|fade|hide, zoom: "" | number, zoomMax: ""
// | number } — visible only from `zoom` up to `zoomMax` (either side blank = no
// limit on that side, 用户 #4). The tuning is kept as THREE independent sets (用户
// T6): 普通地图(roadmap) / 卫星1(sat1, 文字なし) / 卫星2(sat2, 文字あり). Editing
// the one you're looking at never touches the others.
function defaultMapCategorySet() {
  const out = {};
  MAP_LAYER_CATEGORIES.forEach((c) => {
    out[c.key] = { vis: "auto", zoom: "", zoomMax: "" };
  });
  return out;
}

// 以下三套 hard*Set = 代码里写死的回退默认值（万一 data/site-settings.json 没加载到）。
// 正常情况下线上默认值来自 site-settings.json（本机面板调完自动写回那个文件），由
// defaultCategorySetFor 叠加在这三套之上。改线上观感应改 site-settings.json，不必改这里。

// 普通地图（roadmap）：只把 POI 文字/图标压到 zoom≥19 才出，其余保持自动。
function hardRoadmapSet() {
  const out = defaultMapCategorySet();
  out.poiLabels = { vis: "auto", zoom: 19, zoomMax: "" };
  out.poiIcons = { vis: "fade", zoom: 19, zoomMax: "" };
  return out;
}

// 卫星1（sat1，文字なし）：几乎全部隐藏，只留行政名/水域名；公共交通只在 zoom 14~17.5 之间露一下。
function hardSat1Set() {
  const out = defaultMapCategorySet();
  [
    "poiLabels",
    "poiIcons",
    "poiBusiness",
    "poiPark",
    "poiAttraction",
    "roadLabels",
    "roadGeometry",
    "highway",
    "transitLabels",
    "landscape",
  ].forEach((k) => {
    if (out[k]) out[k].vis = "hide";
  });
  out.transit = { vis: "hide", zoom: 14, zoomMax: 17.5 };
  ["administrative", "waterLabels"].forEach((k) => {
    if (out[k]) out[k].vis = "show";
  });
  return out;
}

// 卫星2（sat2，文字あり）：卫星底图默认藏掉所有文字，这里把常用文字类重新打开；POI 图标淡化、
// 道路线隐藏、店铺/公园保持自动。
function hardSat2Set() {
  const out = defaultMapCategorySet();
  [
    "poiLabels",
    "poiAttraction",
    "roadLabels",
    "highway",
    "transit",
    "transitLabels",
    "administrative",
    "waterLabels",
    "landscape",
  ].forEach((k) => {
    if (out[k]) out[k].vis = "show";
  });
  out.poiIcons.vis = "fade";
  out.roadGeometry.vis = "hide";
  return out;
}

function mergeMapCategorySet(target, saved) {
  if (!saved || typeof saved !== "object") {
    return target;
  }
  MAP_LAYER_CATEGORIES.forEach((c) => {
    const s = saved[c.key];
    if (s && typeof s === "object") {
      if (MAP_VIS_CYCLE.includes(s.vis)) target[c.key].vis = s.vis;
      if (s.zoom === "" || Number.isFinite(Number(s.zoom))) target[c.key].zoom = s.zoom === "" ? "" : Number(s.zoom);
      if (s.zoomMax === "" || Number.isFinite(Number(s.zoomMax))) target[c.key].zoomMax = s.zoomMax == null || s.zoomMax === "" ? "" : Number(s.zoomMax);
    }
  });
  return target;
}

function loadMapCategoryState() {
  const out = {
    roadmap: defaultCategorySetFor("roadmap"),
    sat1: defaultCategorySetFor("sat1"),
    sat2: defaultCategorySetFor("sat2"),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(MAP_CATEGORY_STORAGE_KEY) || "{}");
    // New format: { roadmap, sat1, sat2 }. Older format: { roadmap, satellite }
    // (satellite tuning was the labels state → migrate onto sat2). Oldest (flat)
    // format: category keys at the top level → migrate onto roadmap + sat2.
    if (saved.sat1 || saved.sat2) {
      mergeMapCategorySet(out.roadmap, saved.roadmap);
      mergeMapCategorySet(out.sat1, saved.sat1);
      mergeMapCategorySet(out.sat2, saved.sat2);
    } else if (saved.roadmap || saved.satellite) {
      mergeMapCategorySet(out.roadmap, saved.roadmap);
      mergeMapCategorySet(out.sat2, saved.satellite);
    } else {
      mergeMapCategorySet(out.roadmap, saved);
      mergeMapCategorySet(out.sat2, saved);
    }
  } catch {
    /* ignore corrupt storage */
  }
  return out;
}

// Which of the three sets is currently active: roadmap, or (on satellite) sat1/sat2
// depending on the 文字 toggle (用户 T6).
function activeMapBaseKey() {
  if (state.mapBase === "roadmap") {
    return "roadmap";
  }
  return state.mapLabels ? "sat2" : "sat1";
}

// The default tuning set for a given map key (roadmap / sat1 / sat2). Starts from
// the hardcoded fallback, then overlays data/site-settings.json (the online default
// that the local panel writes back to) so end-users see the tuned look.
function defaultCategorySetFor(key) {
  const base = key === "sat1" ? hardSat1Set() : key === "sat2" ? hardSat2Set() : hardRoadmapSet();
  const fromFile = SITE_SETTINGS?.mapLayers?.[key];
  return fromFile ? mergeMapCategorySet(base, fromFile) : base;
}

// The tuning set for whichever map is currently showing (edits target this one).
function activeMapCategoryState() {
  const key = activeMapBaseKey();
  if (!state.mapCategoryState) {
    return defaultCategorySetFor(key);
  }
  if (!state.mapCategoryState[key]) {
    state.mapCategoryState[key] = defaultCategorySetFor(key);
  }
  return state.mapCategoryState[key];
}

function saveMapCategoryState() {
  try {
    localStorage.setItem(MAP_CATEGORY_STORAGE_KEY, JSON.stringify(state.mapCategoryState));
  } catch {
    /* ignore storage failure */
  }
  persistSiteSettings();
}

// Build the style override rules from the dev tuning state. Applied on top of the
// base styles for both maps; "auto" categories add nothing (use base) unless a
// zoom threshold forces a hide below that zoom.
function categoryStyleRules() {
  if (!state.mapCategoryState) {
    return [];
  }
  const st = activeMapCategoryState();
  const zoom = state.map?.getZoom?.() ?? DEFAULT_MAP_ZOOM;
  const rules = [];
  const push = (c, stylers) => {
    const rule = { featureType: c.featureType, stylers };
    if (c.elementType) {
      rule.elementType = c.elementType;
    }
    rules.push(rule);
  };
  MAP_LAYER_CATEGORIES.forEach((c) => {
    const s = st[c.key] || { vis: "auto", zoom: "", zoomMax: "" };
    const min = s.zoom !== "" && Number.isFinite(Number(s.zoom)) ? Number(s.zoom) : null;
    const max = s.zoomMax !== "" && s.zoomMax != null && Number.isFinite(Number(s.zoomMax)) ? Number(s.zoomMax) : null;
    let vis = s.vis;
    // Outside the [min, max] zoom window → hidden, whatever the base says (用户 #4:
    // a category can now also DISAPPEAR again past a second, upper threshold).
    if ((min !== null && zoom < min) || (max !== null && zoom > max)) {
      vis = "hide";
    }
    if (vis === "auto") {
      return; // use the base style
    }
    if (vis === "show") {
      push(c, [{ visibility: "on" }]);
    } else if (vis === "fade") {
      push(c, [{ visibility: "on" }, { lightness: 50 }, { gamma: 1.8 }]);
    } else if (vis === "hide") {
      push(c, [{ visibility: "off" }]);
    }
  });
  return rules;
}

// True if any category has a zoom threshold (either bound) set — then styles must
// be re-applied on zoom_changed for both maps.
function anyCategoryHasThreshold() {
  const st = activeMapCategoryState() || {};
  return MAP_LAYER_CATEGORIES.some((c) => {
    const isNum = (z) => z !== "" && z != null && Number.isFinite(Number(z));
    return isNum(st[c.key]?.zoom) || isNum(st[c.key]?.zoomMax);
  });
}

// The satellite base look. 用户 T5/T6: satellite always renders on the "hybrid" type
// (so a label layer exists), and this base turns EVERY label off + hides the road
// lines — a clean, label-free image. Nothing can leak through because the off rule is
// featureType-agnostic (elementType:"labels" with no featureType = all features). The
// per-category filter set (卫星1 / 卫星2) then layers specific labels back ON top.
const SATELLITE_BASE_STYLES = [
  { featureType: "road", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { elementType: "labels", stylers: [{ visibility: "off" }] },
];
