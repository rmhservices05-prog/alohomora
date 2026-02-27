const feedNode = document.getElementById("feed");
const statsNode = document.getElementById("stats");
const lastUpdatedNode = document.getElementById("lastUpdated");
const refreshBtn = document.getElementById("refreshBtn");
const refreshStateNode = document.getElementById("refreshState");
const searchInput = document.getElementById("search");
const locationFilterInput = document.getElementById("locationFilter");
const severityFilter = document.getElementById("severityFilter");
const clearFiltersBtn = document.getElementById("clearFilters");
const incidentCountNode = document.getElementById("incidentCount");
const template = document.getElementById("card-template");
const feedToggle = document.getElementById("feedToggle");
const liveFeedPanel = document.querySelector(".live-feed-panel");
const quickTabs = Array.from(document.querySelectorAll(".quick-tab"));
const detailsPanel = document.getElementById("detailsPanel");
const detailsBody = document.getElementById("detailsBody");
const detailsSourceLink = document.getElementById("detailsSourceLink");
const closeDetailsBtn = document.getElementById("closeDetailsBtn");

let rawItems = [];
let filteredItems = [];
let focusedItemId = null;
let selectedItemId = null;
let map = null;
let markersLayer = null;

const articleMetaCache = new Map();
const severityOrder = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function getMarkerColor(severity) {
  if (severity === "Critical") return "#f3f3f3";
  if (severity === "High") return "#cccccc";
  if (severity === "Medium") return "#a6a6a6";
  return "#0011FF";
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
  const criticalCount = items.filter((item) => item.severity === "Critical").length;

  return [
    { label: "Stories", value: items.length },
    { label: "Mapped", value: mappableCount },
    { label: "Sources", value: sourceCount },
    { label: "Critical", value: criticalCount }
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
        topSeverity: item.severity,
        topItem: item
      });
      continue;
    }

    current.count += 1;
    if ((severityOrder[item.severity] || 0) > (severityOrder[current.topSeverity] || 0)) {
      current.topSeverity = item.severity;
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
      color: getMarkerColor(cluster.topSeverity),
      fillColor: getMarkerColor(cluster.topSeverity),
      fillOpacity: 0.48,
      weight: 1
    });

    marker.bindPopup(
      `<div class="map-popup"><h3>${escapeHtml(cluster.label)}</h3><p>${cluster.count} incident(s) • ${escapeHtml(cluster.topSeverity)}</p></div>`
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
    const severity = (item.severity || "Low").toLowerCase();
    const card = clone.querySelector(".live-item");
    const titleNode = clone.querySelector(".title");

    card.dataset.id = item.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open details for ${item.title}`);
    card.classList.add(`live-${severity}`);

    if (focusedItemId === item.id) {
      card.classList.add("is-focused");
    }

    clone.querySelector(".severity").textContent = `S${severityOrder[item.severity] || 1}`;
    clone.querySelector(".severity").classList.add(`severity-${severity}`);
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
  detailsBody.innerHTML = "<p class='details-empty-text'>Select an incident to open details.</p>";
  detailsSourceLink.hidden = true;
}

function renderDetails(item, meta = null) {
  const severity = (item.severity || "Low").toLowerCase();
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

  detailsBody.innerHTML = `
    <article class="incident-details">
      <div class="incident-tags">
        <span class="badge category">${escapeHtml(item.category || "General")}</span>
        <span class="badge severity severity-${severity}">S${severityOrder[item.severity] || 1}</span>
      </div>
      <h4 class="incident-title">${escapeHtml(item.title)}</h4>
      <div class="incident-meta-row">
        <span>${escapeHtml(timeAgo(item.publishedAt))}</span>
        <span>${escapeHtml(locationLabel)}</span>
      </div>
      ${image ? `<div class="incident-image-wrap"><img src="${escapeHtml(image)}" alt="Incident article visual" class="incident-image" /></div>` : ""}
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
  const severity = severityFilter.value;
  const locationQuery = locationFilterInput.value.trim().toLowerCase();

  filteredItems = rawItems.filter((item) => {
    const matchesSeverity = severity === "ALL" || item.severity === severity;
    const fullText = `${item.title || ""} ${item.summary || ""} ${item.category || ""} ${item.source || ""}`.toLowerCase();
    const locationText = (item.location?.label || "").toLowerCase();
    const matchesQuery = !query || fullText.includes(query);
    const matchesLocation = !locationQuery || locationText.includes(locationQuery);
    return matchesSeverity && matchesQuery && matchesLocation;
  });

  if (selectedItemId && !filteredItems.some((item) => item.id === selectedItemId)) {
    closeDetails();
  }

  if (incidentCountNode) {
    const label = filteredItems.length === 1 ? "live event" : "live events";
    incidentCountNode.textContent = `${filteredItems.length} ${label}`;
  }

  renderStats(filteredItems);
  renderMap(filteredItems);
  renderFeed(filteredItems);

  if (selectedItemId) {
    highlightCard(selectedItemId, false);
  }
}

async function loadNews() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";
  refreshStateNode.textContent = "Refreshing...";

  try {
    const response = await fetch("/api/news?limit=140");
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
severityFilter.addEventListener("change", applyFilters);

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    locationFilterInput.value = "";
    severityFilter.value = "ALL";
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
    if (route === "community") {
      window.location.href = "./community";
      return;
    }

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
setInterval(loadNews, 1000 * 60 * 5);
