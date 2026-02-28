const feedNode = document.getElementById("feed");
const statsNode = document.getElementById("stats");
const lastUpdatedNode = document.getElementById("lastUpdated");
const refreshBtn = document.getElementById("refreshBtn");
const refreshStateNode = document.getElementById("refreshState");
const searchInput = document.getElementById("search");
const locationFilterInput = document.getElementById("locationFilter");
const impactFilter = document.getElementById("impactFilter");
const clearFiltersBtn = document.getElementById("clearFilters");
const eventCountNode = document.getElementById("eventCount");
const marketsRowsNode = document.getElementById("marketsRows");
const marketsStateNode = document.getElementById("marketsState");
const template = document.getElementById("card-template");
const feedToggle = document.getElementById("feedToggle");
const liveFeedPanel = document.querySelector(".live-feed-panel");
const quickTabs = Array.from(document.querySelectorAll(".quick-tab"));
const detailsPanel = document.getElementById("detailsPanel");
const detailsBody = document.getElementById("detailsBody");
const detailsSourceLink = document.getElementById("detailsSourceLink");
const shareOnXBtn = document.getElementById("shareOnXBtn");
const shareOnLinkedInBtn = document.getElementById("shareOnLinkedInBtn");
const closeDetailsBtn = document.getElementById("closeDetailsBtn");

let rawItems = [];
let filteredItems = [];
let focusedItemId = null;
let selectedItemId = null;
let map = null;
let markersLayer = null;
let marketsGeneratedAt = null;
let marketsWarning = null;
let marketsLoading = false;

const articleMetaCache = new Map();
const impactOrder = { High: 3, Medium: 2, Low: 1 };
const MARKET_SOURCE_LIMIT = 18;
const MARKET_REFRESH_INTERVAL = 1000 * 30;
const MANDATORY_X_HASHTAG = "atrglass";
const X_SHARE_MAX_LENGTH = 280;
const X_SHARE_TITLE_MAX = 110;
const X_SHARE_SUMMARY_MAX = 180;
const X_SHARE_MIN_HASHTAGS = 3;
const X_SHARE_MAX_HASHTAGS = 6;
const X_HASHTAG_KEYWORDS = [
  { pattern: /\b(ai|artificial intelligence|machine learning|llm|copilot|agentic|generative)\b/i, tag: "AI" },
  { pattern: /\b(medtech|healthtech|biotech|clinical|hospital|medical)\b/i, tag: "MedTech" },
  { pattern: /\b(defense|defence|military|drone|satellite)\b/i, tag: "DefenceTech" },
  { pattern: /\b(cyber|ransomware|breach|vulnerability|malware|cve)\b/i, tag: "CyberSecurity" },
  { pattern: /\b(chip|semiconductor|gpu)\b/i, tag: "Semiconductors" },
  { pattern: /\b(cloud|aws|azure|gcp)\b/i, tag: "CloudComputing" },
  { pattern: /\b(robot|autonomous|automation)\b/i, tag: "Robotics" },
  { pattern: /\b(startup|funding|series)\b/i, tag: "Startup" },
  { pattern: /\b(defense|defence)\b/i, tag: "Defense" }
];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value = "", maxLength = 180) {
  const text = normalizeWhitespace(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function toHashtagToken(value = "") {
  const cleaned = normalizeWhitespace(String(value || "").replace(/^#+/, "").replace(/[^A-Za-z0-9 ]+/g, " "));
  if (!cleaned) return "";

  const token = cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");

  return token.slice(0, 20);
}

function collectDerivedHashtags(event = {}) {
  const tags = [];
  const seen = new Set();

  const addTag = (rawTag) => {
    const token = toHashtagToken(rawTag);
    if (!token) return;
    const normalized = token.toLowerCase();
    if (normalized === MANDATORY_X_HASHTAG) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    tags.push(token);
  };

  const preferredTags = [];
  if (Array.isArray(event.tags)) preferredTags.push(...event.tags);
  if (Array.isArray(event.categories)) preferredTags.push(...event.categories);
  if (event.category) preferredTags.push(event.category);

  for (const tag of preferredTags) addTag(tag);

  const content = normalizeWhitespace(`${event.title || ""} ${event.summary || ""} ${event.description || ""}`);
  const existingHashtags = content.match(/#[A-Za-z0-9_]+/g) || [];
  for (const hashtag of existingHashtags) addTag(hashtag);

  const lowerContent = content.toLowerCase();
  for (const rule of X_HASHTAG_KEYWORDS) {
    if (rule.pattern.test(lowerContent)) addTag(rule.tag);
  }

  if (!tags.length && content) {
    addTag("TechNews");
  }

  const fallbackTags = [event.category, event.source, "TechNews", "Innovation", "FutureTech"];
  for (const fallbackTag of fallbackTags) {
    if (tags.length >= X_SHARE_MIN_HASHTAGS) break;
    addTag(fallbackTag);
  }

  return tags.slice(0, X_SHARE_MAX_HASHTAGS);
}

function buildShortShareSummary(event = {}) {
  const candidates = [event.summary, event.description, event.impact];
  const selected = candidates.find((entry) => normalizeWhitespace(entry).length > 0);

  if (selected) {
    return truncateText(selected, X_SHARE_SUMMARY_MAX);
  }

  const fallbackSummary = normalizeWhitespace(
    `${event.impact || "Emerging"} impact ${event.category || "technology"} signal${event.source ? ` from ${event.source}` : ""}.`
  );
  return truncateText(fallbackSummary || "Emerging technology update.", X_SHARE_SUMMARY_MAX);
}

function buildXShareText(event = {}) {
  let title = truncateText(normalizeWhitespace(event.title || event.name || "Technology update"), X_SHARE_TITLE_MAX);
  const baseSummary = buildShortShareSummary(event);
  const derivedHashtags = collectDerivedHashtags(event);
  let hashtagCount = Math.min(derivedHashtags.length, X_SHARE_MAX_HASHTAGS);

  const buildTextForCount = (count) => {
    const hashtagPrefix = count > 0 ? `${derivedHashtags.slice(0, count).map((tag) => `#${tag}`).join(" ")} ` : "";
    const hashtagLine = `${hashtagPrefix}#${MANDATORY_X_HASHTAG}`;
    const availableSummary = Math.max(0, X_SHARE_MAX_LENGTH - title.length - hashtagLine.length - 2);
    const summary = truncateText(baseSummary, Math.min(X_SHARE_SUMMARY_MAX, availableSummary));
    return `${title}\n${summary}\n${hashtagLine}`;
  };

  let composed = buildTextForCount(hashtagCount);

  while (composed.length > X_SHARE_MAX_LENGTH && hashtagCount > 1) {
    hashtagCount -= 1;
    composed = buildTextForCount(hashtagCount);
  }

  if (composed.length > X_SHARE_MAX_LENGTH) {
    const hashtagPrefix = hashtagCount > 0 ? `${derivedHashtags.slice(0, hashtagCount).map((tag) => `#${tag}`).join(" ")} ` : "";
    const hashtagLine = `${hashtagPrefix}#${MANDATORY_X_HASHTAG}`;
    const maxTitle = Math.max(24, X_SHARE_MAX_LENGTH - hashtagLine.length - 2);
    title = truncateText(title, maxTitle);
    composed = buildTextForCount(hashtagCount);
  }

  return composed;
}

function buildXShareUrl(event = {}) {
  const shareText = buildXShareText(event);
  return `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
}

function buildLinkedInShareText(event = {}) {
  return buildXShareText(event);
}

function buildLinkedInShareUrl(event = {}) {
  const shareText = buildLinkedInShareText(event);
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`;
}

async function buildSelectedShareEvent() {
  const selectedItem = selectedItemId ? getItemById(selectedItemId) : null;
  if (!selectedItem) return null;

  let meta = selectedItem.link ? articleMetaCache.get(selectedItem.link) || null : null;
  if (!meta && selectedItem.link) {
    meta = await hydrateDetailsMeta(selectedItem);
  }

  return {
    ...selectedItem,
    summary: normalizeWhitespace(meta?.description || selectedItem.summary || selectedItem.description || ""),
    description: normalizeWhitespace(meta?.description || selectedItem.description || "")
  };
}

async function shareSelectedEventOnX() {
  const shareEvent = await buildSelectedShareEvent();
  if (!shareEvent) return;

  const shareUrl = buildXShareUrl(shareEvent);
  window.open(shareUrl, "_blank", "noopener,noreferrer");
}

async function shareSelectedEventOnLinkedIn() {
  const shareEvent = await buildSelectedShareEvent();
  if (!shareEvent) return;

  const shareUrl = buildLinkedInShareUrl(shareEvent);
  window.open(shareUrl, "_blank", "noopener,noreferrer");
}

function formatTime(dateString) {
  if (!dateString) return "Unknown time";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDayTime(dateString) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function timeAgo(dateString) {
  if (!dateString) return "Unknown";
  const now = Date.now();
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return "Unknown";
  const seconds = Math.max(1, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function shortTimeAgo(dateString) {
  if (!dateString) return "Unknown";
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return "Unknown";
  const seconds = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatMarketPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: numeric < 10 ? 2 : 0,
    maximumFractionDigits: numeric < 10 ? 2 : 2
  }).format(numeric);
}

function formatMarketChange(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(2)}%`;
}

function updateMarketsState() {
  if (!marketsStateNode) return;
  if (!marketsGeneratedAt) {
    marketsStateNode.textContent = "Loading...";
    return;
  }

  const age = shortTimeAgo(marketsGeneratedAt);
  marketsStateNode.textContent = marketsWarning ? `${age} • delayed` : age;
}

function getMarkerColor(impact) {
  if (impact === "High") return "#ff4d4f";
  if (impact === "Medium") return "#f7b731";
  return "#2ecc71";
}

function initMap() {
  if (map) return;

  map = L.map("worldMap", {
    worldCopyJump: true,
    zoomControl: true,
    minZoom: 2,
    maxZoom: 7,
    attributionControl: false
  }).setView([22, 8], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function computeStats(items) {
  const sourceCount = new Set(items.map((item) => item.source)).size;
  const mappableCount = items.filter((item) => item.location).length;
  const highImpactCount = items.filter((item) => item.impact === "High").length;

  return [
    { label: "Stories", value: items.length },
    { label: "Mapped", value: mappableCount },
    { label: "Sources", value: sourceCount },
    { label: "High Impact", value: highImpactCount }
  ];
}

function renderStats(items) {
  if (!statsNode) return;
  statsNode.innerHTML = "";
  const stats = computeStats(items);

  for (const stat of stats) {
    const el = document.createElement("article");
    el.className = "stat";
    el.innerHTML = `<span class="label">${stat.label}</span><span class="value">${stat.value}</span>`;
    statsNode.appendChild(el);
  }
}

function createMapClusters(items) {
  const buckets = new Map();

  for (const item of items) {
    if (!item.location) continue;
    const key = `${item.location.label}:${item.location.lat}:${item.location.lng}`;
    const current = buckets.get(key);

    if (!current) {
      buckets.set(key, {
        ...item.location,
        count: 1,
        topImpact: item.impact,
        topItem: item
      });
      continue;
    }

    current.count += 1;
    if ((impactOrder[item.impact] || 0) > (impactOrder[current.topImpact] || 0)) {
      current.topImpact = item.impact;
      current.topItem = item;
    }
  }

  return Array.from(buckets.values());
}

function getItemById(itemId) {
  return rawItems.find((item) => item.id === itemId) || null;
}

function highlightCard(itemId, scroll = true) {
  focusedItemId = itemId;

  for (const card of feedNode.querySelectorAll(".live-item")) {
    card.classList.remove("is-focused");
  }

  const target = feedNode.querySelector(`.live-item[data-id="${CSS.escape(itemId)}"]`);
  if (!target) return;
  target.classList.add("is-focused");

  if (scroll) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function renderMap(items) {
  initMap();
  markersLayer.clearLayers();

  const clusters = createMapClusters(items);

  for (const cluster of clusters) {
    const marker = L.circleMarker([cluster.lat, cluster.lng], {
      radius: Math.min(12, 4 + cluster.count * 1.05),
      color: getMarkerColor(cluster.topImpact),
      fillColor: getMarkerColor(cluster.topImpact),
      fillOpacity: 0.48,
      weight: 1
    });

    marker.bindPopup(
      `<div class="map-popup"><h3>${escapeHtml(cluster.label)}</h3><p>${cluster.count} event(s) • ${escapeHtml(cluster.topImpact)} impact</p></div>`
    );
    marker.on("click", () => setSelectedIncident(cluster.topItem.id, { scroll: true, flyTo: false }));
    marker.addTo(markersLayer);
  }
}

function renderFeed(items) {
  feedNode.innerHTML = "";

  if (items.length === 0) {
    feedNode.innerHTML = "<p class='feed-empty'>No stories match your filters.</p>";
    return;
  }

  for (const item of items) {
    const clone = template.content.cloneNode(true);
    const impact = (item.impact || "Low").toLowerCase();
    const card = clone.querySelector(".live-item");
    const titleNode = clone.querySelector(".title");

    card.dataset.id = item.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open details for ${item.title}`);
    card.classList.add(`live-${impact}`);

    if (focusedItemId === item.id) {
      card.classList.add("is-focused");
    }

    clone.querySelector(".impact").textContent = item.impact || "Low";
    clone.querySelector(".impact").classList.add(`impact-${impact}`);
    clone.querySelector(".category").textContent = item.category || "General";
    clone.querySelector(".source").textContent = item.source || "Unknown";
    clone.querySelector(".place").textContent = item.location?.label
      ? `${item.location.label}${item.location.type ? ` · ${item.location.type}` : ""}`
      : "Global";
    clone.querySelector(".age").textContent = timeAgo(item.publishedAt);

    titleNode.textContent = item.title;
    titleNode.dataset.id = item.id;

    feedNode.appendChild(clone);
  }
}

function closeDetails() {
  selectedItemId = null;
  detailsPanel.classList.remove("is-open");
  detailsBody.classList.add("is-empty");
  detailsBody.innerHTML = "<p class='details-empty-text'>Select an event to open details.</p>";
  detailsSourceLink.hidden = true;
  if (shareOnXBtn) shareOnXBtn.disabled = true;
  if (shareOnLinkedInBtn) shareOnLinkedInBtn.disabled = true;
}

function renderDetails(item, meta = null) {
  const impact = (item.impact || "Low").toLowerCase();
  const locationLabel = item.location?.label
    ? `${item.location.label}${item.location.type ? ` (${item.location.type})` : ""}`
    : "Global";
  const summary = (meta?.description || item.summary || "No summary available.").trim();
  const image = meta?.image || item.image || null;

  detailsPanel.classList.add("is-open");
  detailsBody.classList.remove("is-empty");

  if (item.link) {
    detailsSourceLink.hidden = false;
    detailsSourceLink.href = item.link;
  } else {
    detailsSourceLink.hidden = true;
    detailsSourceLink.removeAttribute("href");
  }
  if (shareOnXBtn) shareOnXBtn.disabled = false;
  if (shareOnLinkedInBtn) shareOnLinkedInBtn.disabled = false;

  detailsBody.innerHTML = `
    <article class="incident-details">
      <div class="incident-tags">
        <span class="badge category">${escapeHtml(item.category || "General")}</span>
        <span class="badge impact impact-${impact}">${escapeHtml(item.impact || "Low")} Impact</span>
      </div>
      <h4 class="incident-title">${escapeHtml(item.title)}</h4>
      <div class="incident-meta-row">
        <span>${escapeHtml(timeAgo(item.publishedAt))}</span>
        <span>${escapeHtml(locationLabel)}</span>
      </div>
      ${image ? `<div class="incident-image-wrap"><img src="${escapeHtml(image)}" alt="Event article visual" class="incident-image" /></div>` : ""}
      <section class="incident-section">
        <h5>Summary</h5>
        <p>${escapeHtml(summary)}</p>
      </section>
      <section class="incident-section">
        <h5>Signals (1)</h5>
        <div class="signal-card">
          <div class="signal-row">
            <span class="signal-source">${escapeHtml(item.source || "Source")}</span>
            <span class="signal-time">${escapeHtml(formatDayTime(item.publishedAt))}</span>
          </div>
          <p>${escapeHtml(item.title)}</p>
          ${item.link ? `<a class="signal-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">View source</a>` : ""}
        </div>
      </section>
    </article>
  `;
}

async function hydrateDetailsMeta(item) {
  if (!item?.link || articleMetaCache.has(item.link)) {
    return articleMetaCache.get(item?.link) || null;
  }

  try {
    const response = await fetch(`/api/article-meta?url=${encodeURIComponent(item.link)}`);
    if (!response.ok) return null;
    const data = await response.json();
    articleMetaCache.set(item.link, data);
    return data;
  } catch (error) {
    return null;
  }
}

async function setSelectedIncident(itemId, options = {}) {
  const { scroll = true, flyTo = true } = options;
  const item = getItemById(itemId);
  if (!item) return;

  selectedItemId = item.id;
  highlightCard(item.id, scroll);

  if (flyTo && item.location && map) {
    map.flyTo([item.location.lat, item.location.lng], Math.max(map.getZoom(), 4), {
      duration: 0.55
    });
  }

  renderDetails(item, articleMetaCache.get(item.link) || null);
  const meta = await hydrateDetailsMeta(item);

  if (!meta) return;
  if (selectedItemId !== item.id) return;
  renderDetails(item, meta);
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const impact = impactFilter.value;
  const locationQuery = locationFilterInput.value.trim().toLowerCase();

  filteredItems = rawItems.filter((item) => {
    const matchesImpact = impact === "ALL" || item.impact === impact;
    const fullText = `${item.title || ""} ${item.summary || ""} ${item.category || ""} ${item.source || ""}`.toLowerCase();
    const locationText = (item.location?.label || "").toLowerCase();
    const matchesQuery = !query || fullText.includes(query);
    const matchesLocation = !locationQuery || locationText.includes(locationQuery);
    return matchesImpact && matchesQuery && matchesLocation;
  });

  if (selectedItemId && !filteredItems.some((item) => item.id === selectedItemId)) {
    closeDetails();
  }

  if (eventCountNode) {
    const label = filteredItems.length === 1 ? "live event" : "live events";
    eventCountNode.textContent = `${filteredItems.length} ${label}`;
  }

  renderStats(filteredItems);
  renderMap(filteredItems);
  renderFeed(filteredItems);

  if (selectedItemId) {
    highlightCard(selectedItemId, false);
  }
}

function renderMarkets(items = []) {
  if (!marketsRowsNode) return;
  marketsRowsNode.innerHTML = "";
  marketsRowsNode.classList.remove("is-animated");
  marketsRowsNode.style.removeProperty("--marquee-duration");

  if (!items.length) {
    marketsRowsNode.innerHTML = "<div class='markets-empty'>Market data unavailable.</div>";
    return;
  }

  const sorted = [...items].sort((a, b) => {
    const aChange = Number(a.changePercent);
    const bChange = Number(b.changePercent);
    const aScore = Number.isFinite(aChange) ? Math.abs(aChange) : -1;
    const bScore = Number.isFinite(bChange) ? Math.abs(bChange) : -1;
    return bScore - aScore;
  });

  const selected = sorted.slice(0, MARKET_SOURCE_LIMIT);
  const rows = [];

  for (const item of selected) {
    const change = Number(item.changePercent);
    const direction = !Number.isFinite(change) || change === 0 ? "flat" : change > 0 ? "up" : "down";
    const trend = direction === "up" ? "↗" : direction === "down" ? "↘" : "•";

    rows.push(`
      <article class="markets-row">
        <span class="markets-symbol">
          <span class="markets-trend">${trend}</span>
          <span class="markets-ticker">${escapeHtml(item.symbol || "-")}</span>
        </span>
        <span class="markets-price">${escapeHtml(formatMarketPrice(item.price))}</span>
        <span class="markets-change ${direction}">${escapeHtml(formatMarketChange(item.changePercent))}</span>
      </article>
    `);
  }

  if (!rows.length) {
    marketsRowsNode.innerHTML = "<div class='markets-empty'>Market data unavailable.</div>";
    return;
  }

  const shouldAnimate = rows.length > 8;
  marketsRowsNode.innerHTML = shouldAnimate ? `${rows.join("")}${rows.join("")}` : rows.join("");

  if (shouldAnimate) {
    const durationSeconds = Math.max(16, rows.length * 1.8);
    marketsRowsNode.style.setProperty("--marquee-duration", `${durationSeconds}s`);
    marketsRowsNode.classList.add("is-animated");
  }
}

async function loadMarkets(options = {}) {
  if (!marketsRowsNode || !marketsStateNode) return;
  if (marketsLoading) return;

  const { force = false } = options;
  marketsLoading = true;

  try {
    const cacheBuster = Date.now();
    const endpoint = force ? `/api/stocks?refresh=1&t=${cacheBuster}` : `/api/stocks?t=${cacheBuster}`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("Markets request failed.");

    const data = await response.json();
    renderMarkets(data.items || []);
    marketsGeneratedAt = data.generatedAt || new Date().toISOString();
    marketsWarning = data.warning || null;
    updateMarketsState();
  } catch (error) {
    renderMarkets([]);
    marketsGeneratedAt = null;
    marketsWarning = null;
    marketsStateNode.textContent = "Market feed unavailable";
  } finally {
    marketsLoading = false;
  }
}

async function loadNews() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";
  refreshStateNode.textContent = "Refreshing...";

  try {
    const response = await fetch("/api/news");
    if (!response.ok) throw new Error("Feed request failed.");

    const data = await response.json();
    rawItems = data.items || [];

    lastUpdatedNode.textContent = `Updated ${formatTime(data.generatedAt)} • ${data.count} items`;
    refreshStateNode.textContent = `Synced ${formatTime(data.generatedAt)}`;

    applyFilters();

    if (selectedItemId && rawItems.some((item) => item.id === selectedItemId)) {
      setSelectedIncident(selectedItemId, { scroll: false, flyTo: false });
    }
  } catch (error) {
    feedNode.innerHTML = "<p class='feed-empty'>Failed to load feed. Try again in a moment.</p>";
    refreshStateNode.textContent = "Feed unavailable";
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }
}

refreshBtn.addEventListener("click", loadNews);
searchInput.addEventListener("input", applyFilters);
locationFilterInput.addEventListener("input", applyFilters);
impactFilter.addEventListener("change", applyFilters);

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    locationFilterInput.value = "";
    impactFilter.value = "ALL";
    focusedItemId = null;
    selectedItemId = null;
    applyFilters();
    closeDetails();
  });
}

if (feedToggle && liveFeedPanel) {
  feedToggle.addEventListener("click", () => {
    liveFeedPanel.classList.toggle("is-collapsed");
    const collapsed = liveFeedPanel.classList.contains("is-collapsed");
    feedToggle.innerHTML = collapsed ? "&#10095;" : "&#10094;";
    feedToggle.setAttribute("aria-label", collapsed ? "Expand feed" : "Collapse feed");
  });
}

if (closeDetailsBtn) {
  closeDetailsBtn.addEventListener("click", () => {
    closeDetails();
    for (const card of feedNode.querySelectorAll(".live-item")) {
      card.classList.remove("is-focused");
    }
  });
}

if (shareOnXBtn) {
  shareOnXBtn.addEventListener("click", shareSelectedEventOnX);
}

if (shareOnLinkedInBtn) {
  shareOnLinkedInBtn.addEventListener("click", shareSelectedEventOnLinkedIn);
}

feedNode.addEventListener("click", (event) => {
  const card = event.target.closest(".live-item");
  if (!card) return;
  setSelectedIncident(card.dataset.id, { scroll: false, flyTo: true });
});

feedNode.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".live-item");
  if (!card) return;
  event.preventDefault();
  setSelectedIncident(card.dataset.id, { scroll: false, flyTo: true });
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping =
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable);

  if (event.key === "/" && !isTyping) {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }

  if (event.key === "Escape" && detailsPanel.classList.contains("is-open")) {
    closeDetails();
  }
});

quickTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const route = tab.dataset.route;
    if (route === "changelog") {
      window.location.href = "./changelog";
      return;
    }

    for (const node of quickTabs) {
      node.classList.remove("is-active");
    }
    tab.classList.add("is-active");
  });
});

closeDetails();
initMap();
loadNews();
loadMarkets();
setInterval(loadNews, 1000 * 60 * 5);
setInterval(() => loadMarkets({ force: true }), MARKET_REFRESH_INTERVAL);
setInterval(updateMarketsState, 1000);
