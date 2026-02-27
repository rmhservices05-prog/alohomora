const path = require("path");
const express = require("express");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "alohomora/1.0"
  }
});
const PORT = process.env.PORT || 3000;

const FEEDS = [
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
  { name: "SecurityWeek", url: "https://www.securityweek.com/feed/" },
  { name: "Dark Reading", url: "https://www.darkreading.com/rss.xml" },
  { name: "CISA Alerts", url: "https://www.cisa.gov/cybersecurity-advisories/all.xml" }
];

const categoryRules = [
  { key: "Ransomware", words: ["ransomware", "extortion", "locker"] },
  { key: "Vulnerability", words: ["cve-", "vulnerability", "zero-day", "patch", "exploit"] },
  { key: "Breach", words: ["breach", "data leak", "stolen data", "database exposed"] },
  { key: "Malware", words: ["malware", "trojan", "botnet", "spyware", "wiper"] },
  { key: "Nation-State", words: ["apt", "nation-state", "espionage"] },
  { key: "Cloud", words: ["aws", "azure", "gcp", "cloud"] },
  { key: "AI Security", words: ["llm", "ai model", "prompt injection", "ai security"] }
];

const severityRules = [
  { level: "Critical", words: ["critical", "zero-day", "actively exploited", "wormable"] },
  { level: "High", words: ["ransomware", "breach", "botnet", "exploit"] },
  { level: "Medium", words: ["vulnerability", "patch", "phishing", "malware"] }
];

const locationRules = [
  { label: "United States", lat: 38.9072, lng: -77.0369, words: [" united states ", " u.s. ", " usa ", " washington ", " america "] },
  { label: "United Kingdom", lat: 51.5072, lng: -0.1276, words: [" united kingdom ", " uk ", " britain ", " london "] },
  { label: "France", lat: 48.8566, lng: 2.3522, words: [" france ", " paris "] },
  { label: "Germany", lat: 52.52, lng: 13.405, words: [" germany ", " berlin "] },
  { label: "Netherlands", lat: 52.3676, lng: 4.9041, words: [" netherlands ", " amsterdam ", " dutch "] },
  { label: "Belgium", lat: 50.8503, lng: 4.3517, words: [" belgium ", " brussels "] },
  { label: "Ukraine", lat: 50.4501, lng: 30.5234, words: [" ukraine ", " kyiv "] },
  { label: "Russia", lat: 55.7558, lng: 37.6173, words: [" russia ", " moscow ", " kremlin "] },
  { label: "Israel", lat: 32.0853, lng: 34.7818, words: [" israel ", " tel aviv "] },
  { label: "Turkey", lat: 41.0082, lng: 28.9784, words: [" turkey ", " istanbul ", " ankara "] },
  { label: "Iran", lat: 35.6892, lng: 51.389, words: [" iran ", " tehran "] },
  { label: "India", lat: 28.6139, lng: 77.209, words: [" india ", " delhi ", " mumbai ", " bengaluru ", " bangalore "] },
  { label: "China", lat: 39.9042, lng: 116.4074, words: [" china ", " beijing ", " shanghai "] },
  { label: "Taiwan", lat: 25.033, lng: 121.5654, words: [" taiwan ", " taipei "] },
  { label: "Japan", lat: 35.6762, lng: 139.6503, words: [" japan ", " tokyo "] },
  { label: "South Korea", lat: 37.5665, lng: 126.978, words: [" south korea ", " seoul ", " korea "] },
  { label: "Singapore", lat: 1.3521, lng: 103.8198, words: [" singapore "] },
  { label: "Australia", lat: -33.8688, lng: 151.2093, words: [" australia ", " sydney ", " melbourne "] },
  { label: "Brazil", lat: -23.5505, lng: -46.6333, words: [" brazil ", " sao paulo ", " rio de janeiro "] },
  { label: "Mexico", lat: 19.4326, lng: -99.1332, words: [" mexico ", " mexico city "] },
  { label: "Canada", lat: 45.4215, lng: -75.6972, words: [" canada ", " ottawa ", " toronto ", " vancouver "] },
  { label: "UAE", lat: 25.2048, lng: 55.2708, words: [" uae ", " united arab emirates ", " dubai ", " abu dhabi "] },
  { label: "Saudi Arabia", lat: 24.7136, lng: 46.6753, words: [" saudi arabia ", " riyadh "] },
  { label: "South Africa", lat: -26.2041, lng: 28.0473, words: [" south africa ", " johannesburg ", " cape town "] }
];

function scoreByKeyword(text, rules) {
  const lower = (text || "").toLowerCase();
  return rules.find((rule) => rule.words.some((word) => lower.includes(word))) || null;
}

function classifyItem(title, summary = "", categories = []) {
  const text = `${title || ""} ${summary || ""} ${(categories || []).join(" ")}`;
  const matchedCategory = scoreByKeyword(text, categoryRules);
  const matchedSeverity = scoreByKeyword(text, severityRules);

  return {
    category: matchedCategory ? matchedCategory.key : "General",
    severity: matchedSeverity ? matchedSeverity.level : "Low"
  };
}

function inferLocation(title, summary = "", categories = []) {
  const text = ` ${`${title || ""} ${summary || ""} ${(categories || []).join(" ")}`.toLowerCase()} `;
  const location = locationRules.find((rule) => rule.words.some((word) => text.includes(word)));

  if (!location) return null;

  return {
    label: location.label,
    lat: location.lat,
    lng: location.lng
  };
}

function normalizeItem(item, source) {
  const title = item.title || "Untitled";
  const summary = item.contentSnippet || item.content || "";
  const rawDate = item.isoDate || item.pubDate || item.published || null;
  const publishedAt = rawDate ? new Date(rawDate).toISOString() : null;
  const categories = Array.isArray(item.categories) ? item.categories : [];
  const { category, severity } = classifyItem(title, summary, categories);
  const location = inferLocation(title, summary, categories);

  return {
    id: `${source.name}:${item.guid || item.link || title}`.replace(/\s+/g, "_"),
    title,
    link: item.link || null,
    source: source.name,
    publishedAt,
    summary: summary.slice(0, 360),
    categories,
    category,
    severity,
    location
  };
}

async function loadFeed(source) {
  try {
    const feed = await parser.parseURL(source.url);
    return (feed.items || []).map((item) => normalizeItem(item, source));
  } catch (error) {
    return [];
  }
}

async function loadAllFeeds() {
  const results = await Promise.all(FEEDS.map(loadFeed));
  const merged = results.flat();
  const deduped = new Map();

  for (const item of merged) {
    if (!item.link) continue;
    if (!deduped.has(item.link)) {
      deduped.set(item.link, item);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", service: "alohomora" });
});

app.get("/api/news", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 80);
    const feed = await loadAllFeeds();
    res.json({
      generatedAt: new Date().toISOString(),
      count: Math.min(limit, feed.length),
      items: feed.slice(0, limit)
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load news feed." });
  }
});

app.listen(PORT, () => {
  console.log(`Alohomora running at http://localhost:${PORT}`);
});
