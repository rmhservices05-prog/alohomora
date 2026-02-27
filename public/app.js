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

let rawItems = [];
let filteredItems = [];
let focusedItemId = null;
let map = null;
let markersLayer = null;

const severityOrder = { Critical: 4, High: 3, Medium: 2, Low: 1 };

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
  if (severity === "Critical") return "#ff4d4d";
  if (severity === "High") return "#ffc400";
  if (severity === "Medium") return "#f1df74";
  return "#00d18f";
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
  const stats = computeStats(items);
  statsNode.innerHTML = "";

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

function highlightCard(itemId) {
  if (liveFeedPanel && feedToggle && liveFeedPanel.classList.contains("is-collapsed")) {
    liveFeedPanel.classList.remove("is-collapsed");
    feedToggle.innerHTML = "&#10094;";
  }
  focusedItemId = itemId;
  for (const card of feedNode.querySelectorAll(".live-item")) {
    card.classList.remove("is-focused");
  }
  const target = feedNode.querySelector(`.live-item[data-id="${CSS.escape(itemId)}"]`);
  if (!target) return;
  target.classList.add("is-focused");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
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
      `<div class="map-popup"><h3>${cluster.label}</h3><p>${cluster.count} incident(s) • ${cluster.topSeverity}</p></div>`
    );
    marker.on("click", () => highlightCard(cluster.topItem.id));
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
    const severity = item.severity.toLowerCase();
    const card = clone.querySelector(".live-item");

    card.dataset.id = item.id;
    card.classList.add(`live-${severity}`);
    if (focusedItemId === item.id) {
      card.classList.add("is-focused");
    }

    clone.querySelector(".severity").textContent = `S${severityOrder[item.severity] || 1}`;
    clone.querySelector(".severity").classList.add(`severity-${severity}`);
    clone.querySelector(".category").textContent = item.category;
    clone.querySelector(".source").textContent = item.source;
    clone.querySelector(".place").textContent = item.location?.label || "Global";
    clone.querySelector(".age").textContent = timeAgo(item.publishedAt);
    clone.querySelector(".title").href = item.link;
    clone.querySelector(".title").textContent = item.title;

    feedNode.appendChild(clone);
  }
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const severity = severityFilter.value;
  const locationQuery = locationFilterInput.value.trim().toLowerCase();

  filteredItems = rawItems.filter((item) => {
    const matchesSeverity = severity === "ALL" || item.severity === severity;
    const fullText = `${item.title} ${item.summary} ${item.category} ${item.source}`.toLowerCase();
    const locationText = (item.location?.label || "").toLowerCase();
    const matchesQuery = !query || fullText.includes(query);
    const matchesLocation = !locationQuery || locationText.includes(locationQuery);
    return matchesSeverity && matchesQuery && matchesLocation;
  });

  if (focusedItemId && !filteredItems.some((item) => item.id === focusedItemId)) {
    focusedItemId = null;
  }

  if (incidentCountNode) {
    const label = filteredItems.length === 1 ? "live event" : "live events";
    incidentCountNode.textContent = `${filteredItems.length} ${label}`;
  }

  renderStats(filteredItems);
  renderMap(filteredItems);
  renderFeed(filteredItems);
}

async function loadNews() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";
  refreshStateNode.textContent = "Refreshing...";

  try {
    const res = await fetch("/api/news?limit=140");
    if (!res.ok) throw new Error("Feed request failed.");
    const data = await res.json();
    rawItems = data.items || [];
    lastUpdatedNode.textContent = `Updated ${formatTime(data.generatedAt)} • ${data.count} items`;
    refreshStateNode.textContent = `Synced ${formatTime(data.generatedAt)}`;
    applyFilters();
  } catch (error) {
    feedNode.innerHTML = "<p>Failed to load feed. Try again in a moment.</p>";
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
    applyFilters();
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

feedNode.addEventListener("click", (event) => {
  const card = event.target.closest(".live-item");
  if (!card) return;
  const item = filteredItems.find((entry) => entry.id === card.dataset.id);
  if (!item) return;

  highlightCard(item.id);
  if (item.location && map) {
    map.flyTo([item.location.lat, item.location.lng], Math.max(map.getZoom(), 4), {
      duration: 0.55
    });
  }
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
});

quickTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const route = tab.dataset.route;
    if (route === "community") {
      window.location.href = "./community.html";
      return;
    }

    for (const node of quickTabs) {
      node.classList.remove("is-active");
    }
    tab.classList.add("is-active");
  });
});

initMap();
loadNews();
setInterval(loadNews, 1000 * 60 * 5);
