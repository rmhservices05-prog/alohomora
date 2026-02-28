const path = require("path");
const { execFile } = require("child_process");
const express = require("express");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "glass/1.0"
  }
});
const PORT = process.env.PORT || 3000;
const NEWS_RETENTION_MS = 1000 * 60 * 60 * 24 * 14;

const FEEDS = [
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/ai/feed/" },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Ars Technica", url: "http://feeds.arstechnica.com/arstechnica/index" },
  { name: "IEEE Spectrum", url: "https://spectrum.ieee.org/rss/fulltext" },
  { name: "Fierce Biotech", url: "https://www.fiercebiotech.com/rss/xml" },
  { name: "Medgadget", url: "https://www.medgadget.com/feed" },
  { name: "MobiHealthNews", url: "https://www.mobihealthnews.com/rss.xml" },
  { name: "Defense One", url: "https://www.defenseone.com/rss/all/" },
  { name: "Defense News", url: "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml" },
  { name: "Breaking Defense", url: "https://breakingdefense.com/feed/" },
  { name: "The Record", url: "https://therecord.media/feed" },
  { name: "SecurityWeek", url: "https://www.securityweek.com/feed/" }
];

const STOCK_SYMBOLS = [
  { symbol: "CRWD", name: "CrowdStrike" },
  { symbol: "PANW", name: "Palo Alto Networks" },
  { symbol: "FTNT", name: "Fortinet" },
  { symbol: "ZS", name: "Zscaler" },
  { symbol: "OKTA", name: "Okta" },
  { symbol: "CYBR", name: "CyberArk" },
  { symbol: "S", name: "SentinelOne" },
  { symbol: "CHKP", name: "Check Point" },
  { symbol: "TENB", name: "Tenable" },
  { symbol: "RPD", name: "Rapid7" },
  { symbol: "VRNS", name: "Varonis" },
  { symbol: "QLYS", name: "Qualys" },
  { symbol: "AKAM", name: "Akamai" },
  { symbol: "FFIV", name: "F5" },
  { symbol: "JNPR", name: "Juniper Networks" },
  { symbol: "GEN", name: "Gen Digital" },
  { symbol: "NET", name: "Cloudflare" },
  { symbol: "RDWR", name: "Radware" },
  { symbol: "CSCO", name: "Cisco" },
  { symbol: "ANET", name: "Arista Networks" },
  { symbol: "AVGO", name: "Broadcom" },
  { symbol: "LDOS", name: "Leidos" },
  { symbol: "BAH", name: "Booz Allen" },
  { symbol: "CACI", name: "CACI" },
  { symbol: "SAIC", name: "SAIC" },
  { symbol: "PLTR", name: "Palantir" },
  { symbol: "BBAI", name: "BigBear.ai" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "META", name: "Meta" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "AMD", name: "AMD" },
  { symbol: "ARM", name: "Arm" },
  { symbol: "SMCI", name: "Super Micro" },
  { symbol: "ORCL", name: "Oracle" },
  { symbol: "NFLX", name: "Netflix" },
  { symbol: "CIBR", name: "CIBR ETF" },
  { symbol: "BUG", name: "BUG ETF" },
  { symbol: "IHAK", name: "IHAK ETF" },
  { symbol: "WCBR", name: "WCBR ETF" },
  { symbol: "HACK", name: "HACK ETF" }
];
const STOCK_CACHE_TTL = 1000 * 20;

const categoryRules = [
  { key: "AI", words: ["artificial intelligence", "machine learning", "llm", "foundation model", "copilot", "agentic", "generative"] },
  { key: "MedTech", words: ["medtech", "medical device", "fda", "clinical", "hospital", "biotech", "healthtech"] },
  { key: "DefenceTech", words: ["defense", "defence", "military", "drone", "missile", "satellite", "battlefield"] },
  { key: "Cybersecurity", words: ["cyber", "ransomware", "breach", "exploit", "vulnerability", "cve-", "malware"] },
  { key: "Cloud", words: ["cloud", "aws", "azure", "gcp", "kubernetes"] },
  { key: "Semiconductors", words: ["chip", "semiconductor", "fab", "gpu", "processor"] },
  { key: "Robotics", words: ["robot", "autonomous", "humanoid", "automation"] }
];

const impactRules = [
  {
    level: "High",
    words: [
      "acquisition",
      "merger",
      "funding round",
      "series ",
      "fda approval",
      "contract award",
      "national",
      "ban",
      "regulation",
      "outage",
      "breach",
      "launches",
      "deploys"
    ]
  },
  {
    level: "Medium",
    words: ["partnership", "pilot", "beta", "update", "release", "roadmap", "trial", "prototype", "research"]
  },
  { level: "Low", words: ["rumor", "preview", "opinion", "event recap"] }
];
const TECH_SIGNAL_WORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "llm",
  "model",
  "chip",
  "semiconductor",
  "gpu",
  "robot",
  "autonomous",
  "medtech",
  "biotech",
  "medical device",
  "healthtech",
  "digital health",
  "defense tech",
  "defence tech",
  "drone",
  "satellite",
  "cyber",
  "cloud",
  "software",
  "hardware",
  "platform",
  "startup",
  "funding",
  "api"
];

const countryLocations = [
  { label: "United States", lat: 38.9072, lng: -77.0369, aliases: ["united states", "u.s.", "usa", "u.s.a", "america"] },
  { label: "United Kingdom", lat: 51.5072, lng: -0.1276, aliases: ["united kingdom", "uk", "britain", "great britain"] },
  { label: "France", lat: 48.8566, lng: 2.3522, aliases: ["france"] },
  { label: "Germany", lat: 52.52, lng: 13.405, aliases: ["germany"] },
  { label: "Netherlands", lat: 52.3676, lng: 4.9041, aliases: ["netherlands", "dutch"] },
  { label: "Belgium", lat: 50.8503, lng: 4.3517, aliases: ["belgium"] },
  { label: "Ukraine", lat: 50.4501, lng: 30.5234, aliases: ["ukraine"] },
  { label: "Russia", lat: 55.7558, lng: 37.6173, aliases: ["russia"] },
  { label: "Israel", lat: 32.0853, lng: 34.7818, aliases: ["israel"] },
  { label: "Turkey", lat: 41.0082, lng: 28.9784, aliases: ["turkey"] },
  { label: "Iran", lat: 35.6892, lng: 51.389, aliases: ["iran"] },
  { label: "India", lat: 28.6139, lng: 77.209, aliases: ["india"] },
  { label: "China", lat: 39.9042, lng: 116.4074, aliases: ["china"] },
  { label: "Taiwan", lat: 25.033, lng: 121.5654, aliases: ["taiwan"] },
  { label: "Japan", lat: 35.6762, lng: 139.6503, aliases: ["japan"] },
  { label: "South Korea", lat: 37.5665, lng: 126.978, aliases: ["south korea", "republic of korea"] },
  { label: "Singapore", lat: 1.3521, lng: 103.8198, aliases: ["singapore"] },
  { label: "Australia", lat: -33.8688, lng: 151.2093, aliases: ["australia"] },
  { label: "Brazil", lat: -23.5505, lng: -46.6333, aliases: ["brazil"] },
  { label: "Mexico", lat: 19.4326, lng: -99.1332, aliases: ["mexico"] },
  { label: "Canada", lat: 45.4215, lng: -75.6972, aliases: ["canada"] },
  { label: "UAE", lat: 25.2048, lng: 55.2708, aliases: ["uae", "united arab emirates"] },
  { label: "Saudi Arabia", lat: 24.7136, lng: 46.6753, aliases: ["saudi arabia"] },
  { label: "South Africa", lat: -26.2041, lng: 28.0473, aliases: ["south africa"] }
];

const usStateLocations = [
  ["Alabama", 32.8067, -86.7911], ["Alaska", 61.3707, -152.4044], ["Arizona", 33.7298, -111.4312],
  ["Arkansas", 34.9697, -92.3731], ["California", 36.1162, -119.6816], ["Colorado", 39.0598, -105.3111],
  ["Connecticut", 41.5978, -72.7554], ["Delaware", 39.3185, -75.5071], ["Florida", 27.7663, -81.6868],
  ["Georgia", 33.0406, -83.6431], ["Hawaii", 21.0943, -157.4983], ["Idaho", 44.2405, -114.4788],
  ["Illinois", 40.3495, -88.9861], ["Indiana", 39.8494, -86.2583], ["Iowa", 42.0115, -93.2105],
  ["Kansas", 38.5266, -96.7265], ["Kentucky", 37.6681, -84.6701], ["Louisiana", 31.1695, -91.8678],
  ["Maine", 44.6940, -69.3819], ["Maryland", 39.0639, -76.8021], ["Massachusetts", 42.2302, -71.5301],
  ["Michigan", 43.3266, -84.5361], ["Minnesota", 45.6945, -93.9002], ["Mississippi", 32.7416, -89.6787],
  ["Missouri", 38.4561, -92.2884], ["Montana", 46.9219, -110.4544], ["Nebraska", 41.1254, -98.2681],
  ["Nevada", 38.3135, -117.0554], ["New Hampshire", 43.4525, -71.5639], ["New Jersey", 40.2989, -74.5210],
  ["New Mexico", 34.8405, -106.2485], ["New York", 42.1657, -74.9481], ["North Carolina", 35.6301, -79.8064],
  ["North Dakota", 47.5289, -99.7840], ["Ohio", 40.3888, -82.7649], ["Oklahoma", 35.5653, -96.9289],
  ["Oregon", 44.5720, -122.0709], ["Pennsylvania", 40.5908, -77.2098], ["Rhode Island", 41.6809, -71.5118],
  ["South Carolina", 33.8569, -80.9450], ["South Dakota", 44.2998, -99.4388], ["Tennessee", 35.7478, -86.6923],
  ["Texas", 31.0545, -97.5635], ["Utah", 40.1500, -111.8624], ["Vermont", 44.0459, -72.7107],
  ["Virginia", 37.7693, -78.1700], ["Washington", 47.4009, -121.4905], ["West Virginia", 38.4912, -80.9545],
  ["Wisconsin", 44.2685, -89.6165], ["Wyoming", 42.7560, -107.3025], ["District of Columbia", 38.9072, -77.0369]
].map(([label, lat, lng]) => ({ label, lat, lng, aliases: [label] }));

const cityLocations = [
  ["Washington, DC", 38.9072, -77.0369, ["washington d.c.", "washington dc"]],
  ["New York City", 40.7128, -74.006, ["new york city", "nyc"]],
  ["Los Angeles", 34.0522, -118.2437, []],
  ["San Francisco", 37.7749, -122.4194, []],
  ["San Jose", 37.3382, -121.8863, []],
  ["San Diego", 32.7157, -117.1611, []],
  ["Seattle", 47.6062, -122.3321, []],
  ["Austin", 30.2672, -97.7431, []],
  ["Dallas", 32.7767, -96.797, []],
  ["Houston", 29.7604, -95.3698, []],
  ["Chicago", 41.8781, -87.6298, []],
  ["Miami", 25.7617, -80.1918, []],
  ["Atlanta", 33.749, -84.388, []],
  ["Denver", 39.7392, -104.9903, []],
  ["Phoenix", 33.4484, -112.074, []],
  ["Las Vegas", 36.1699, -115.1398, []],
  ["Boston", 42.3601, -71.0589, []],
  ["Philadelphia", 39.9526, -75.1652, []],
  ["Portland", 45.5152, -122.6784, []],
  ["Raleigh", 35.7796, -78.6382, []],
  ["Nashville", 36.1627, -86.7816, []],
  ["Detroit", 42.3314, -83.0458, []],
  ["Minneapolis", 44.9778, -93.265, []],
  ["Charlotte", 35.2271, -80.8431, []],
  ["Orlando", 28.5383, -81.3792, []],
  ["Tampa", 27.9506, -82.4572, []],
  ["London", 51.5072, -0.1276, []],
  ["Paris", 48.8566, 2.3522, []],
  ["Berlin", 52.52, 13.405, []],
  ["Brussels", 50.8503, 4.3517, []],
  ["Kyiv", 50.4501, 30.5234, []],
  ["Moscow", 55.7558, 37.6173, []],
  ["Tel Aviv", 32.0853, 34.7818, []],
  ["Tehran", 35.6892, 51.389, []],
  ["Delhi", 28.6139, 77.209, ["new delhi"]],
  ["Mumbai", 19.076, 72.8777, []],
  ["Bengaluru", 12.9716, 77.5946, ["bangalore"]],
  ["Beijing", 39.9042, 116.4074, []],
  ["Shanghai", 31.2304, 121.4737, []],
  ["Taipei", 25.033, 121.5654, []],
  ["Tokyo", 35.6762, 139.6503, []],
  ["Seoul", 37.5665, 126.978, []],
  ["Singapore", 1.3521, 103.8198, []],
  ["Sydney", -33.8688, 151.2093, []],
  ["Melbourne", -37.8136, 144.9631, []],
  ["Sao Paulo", -23.5505, -46.6333, ["são paulo"]],
  ["Rio de Janeiro", -22.9068, -43.1729, []],
  ["Mexico City", 19.4326, -99.1332, []],
  ["Toronto", 43.6532, -79.3832, []],
  ["Vancouver", 49.2827, -123.1207, []],
  ["Dubai", 25.2048, 55.2708, []],
  ["Abu Dhabi", 24.4539, 54.3773, []],
  ["Riyadh", 24.7136, 46.6753, []],
  ["Johannesburg", -26.2041, 28.0473, []],
  ["Cape Town", -33.9249, 18.4241, []]
].map(([label, lat, lng, aliases]) => ({ label, lat, lng, aliases: [label, ...(aliases || [])] }));

const locationRules = [
  ...cityLocations.map((entry) => ({ ...entry, type: "city", score: 300 })),
  ...usStateLocations.map((entry) => ({ ...entry, type: "state", score: 200 })),
  ...countryLocations.map((entry) => ({ ...entry, type: "country", score: 100 }))
];

const articleMetaCache = new Map();
const ARTICLE_META_TTL = 1000 * 60 * 60 * 6;
const stockCache = {
  expiresAt: 0,
  items: [],
  warning: null,
  generatedAt: null
};

function scoreByKeyword(text, rules) {
  const lower = (text || "").toLowerCase();
  return rules.find((rule) => rule.words.some((word) => lower.includes(word))) || null;
}

function classifyItem(title, summary = "", categories = []) {
  const text = `${title || ""} ${summary || ""} ${(categories || []).join(" ")}`;
  const matchedCategory = scoreByKeyword(text, categoryRules);
  const matchedImpact = scoreByKeyword(text, impactRules);

  return {
    category: matchedCategory ? matchedCategory.key : "General",
    impact: matchedImpact ? matchedImpact.level : "Low"
  };
}

function aliasMatch(text, alias) {
  const normalizedAlias = alias.toLowerCase().trim();
  if (!normalizedAlias) return false;

  const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "i");
  return pattern.test(text);
}

function inferLocation(title, summary = "", categories = []) {
  const text = `${title || ""} ${summary || ""} ${(categories || []).join(" ")}`.toLowerCase();
  const matches = [];

  for (const rule of locationRules) {
    let aliasLength = 0;
    let matched = false;

    for (const alias of rule.aliases) {
      if (aliasMatch(text, alias)) {
        matched = true;
        aliasLength = Math.max(aliasLength, alias.length);
      }
    }

    if (!matched) continue;
    matches.push({ ...rule, aliasLength });
  }

  if (!matches.length) return null;

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.aliasLength - a.aliasLength;
  });

  const best = matches[0];

  return {
    label: best.label,
    lat: best.lat,
    lng: best.lng,
    type: best.type
  };
}

function firstImageFromHtml(html = "") {
  const imageMetaPatterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<img[^>]+src=["']([^"']+)["']/i
  ];

  for (const pattern of imageMetaPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) return match[1];
  }

  return null;
}

function pickFeedImage(item) {
  const direct = item?.enclosure?.url;
  if (direct) return direct;

  const mediaContent = item?.["media:content"];
  if (mediaContent?.url) return mediaContent.url;
  if (Array.isArray(mediaContent) && mediaContent[0]?.url) return mediaContent[0].url;

  const mediaThumbnail = item?.["media:thumbnail"];
  if (mediaThumbnail?.url) return mediaThumbnail.url;
  if (Array.isArray(mediaThumbnail) && mediaThumbnail[0]?.url) return mediaThumbnail[0].url;

  const content = `${item?.content || ""}`;
  return firstImageFromHtml(content);
}

function normalizeImageUrl(imageUrl, baseUrl) {
  if (!imageUrl) return null;

  try {
    const normalized = new URL(imageUrl, baseUrl);
    if (!["http:", "https:"].includes(normalized.protocol)) return null;
    return normalized.toString();
  } catch (error) {
    return null;
  }
}

function normalizeItem(item, source) {
  const title = item.title || "Untitled";
  const summary = item.contentSnippet || item.content || "";
  const rawDate = item.isoDate || item.pubDate || item.published || null;
  const publishedAt = rawDate ? new Date(rawDate).toISOString() : null;
  const categories = Array.isArray(item.categories) ? item.categories : [];
  const { category, impact } = classifyItem(title, summary, categories);
  const location = inferLocation(title, summary, categories);
  const image = normalizeImageUrl(pickFeedImage(item), item.link || source.url);

  return {
    id: `${source.name}:${item.guid || item.link || title}`.replace(/\s+/g, "_"),
    title,
    link: item.link || null,
    source: source.name,
    publishedAt,
    summary: summary.slice(0, 360),
    categories,
    category,
    impact,
    location,
    image
  };
}

function isTechItem(item) {
  if (!item) return false;
  if ((item.category || "") !== "General") return true;

  const text = `${item.title || ""} ${item.summary || ""} ${(item.categories || []).join(" ")}`.toLowerCase();
  return TECH_SIGNAL_WORDS.some((word) => text.includes(word));
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
  const techOnly = merged.filter(isTechItem);
  const deduped = new Map();

  for (const item of techOnly) {
    const key = item.link || item.id;
    if (!key) continue;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  const cutoff = Date.now() - NEWS_RETENTION_MS;
  const recentItems = Array.from(deduped.values()).filter((item) => {
    if (!item.publishedAt) return false;
    const publishedTime = new Date(item.publishedAt).getTime();
    return Number.isFinite(publishedTime) && publishedTime >= cutoff;
  });

  return recentItems.sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });
}

function normalizeSourceUrl(input) {
  try {
    const url = new URL(String(input || ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch (error) {
    return null;
  }
}

function cachedArticleMeta(url) {
  const entry = articleMetaCache.get(url);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    articleMetaCache.delete(url);
    return null;
  }
  return entry.value;
}

function setCachedArticleMeta(url, value) {
  articleMetaCache.set(url, {
    value,
    expiresAt: Date.now() + ARTICLE_META_TTL
  });
}

function parseMetaTag(html, key, attribute = "property") {
  const pattern = new RegExp(`<meta[^>]+${attribute}=["']${key}["'][^>]+content=["']([^"']+)["']`, "i");
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${key}["']`, "i");
  const match = html.match(pattern) || html.match(reversePattern);
  return match?.[1] || null;
}

async function fetchArticleMeta(articleUrl) {
  const cached = cachedArticleMeta(articleUrl);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(articleUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "glass/1.0",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      const fallback = { url: articleUrl };
      setCachedArticleMeta(articleUrl, fallback);
      return fallback;
    }

    const html = await response.text();
    const title = parseMetaTag(html, "og:title") || html.match(/<title>([^<]+)<\/title>/i)?.[1] || null;
    const description =
      parseMetaTag(html, "og:description") ||
      parseMetaTag(html, "twitter:description", "name") ||
      parseMetaTag(html, "description", "name") ||
      null;

    const image = normalizeImageUrl(
      parseMetaTag(html, "og:image") || parseMetaTag(html, "twitter:image", "name") || firstImageFromHtml(html),
      articleUrl
    );

    const payload = {
      url: articleUrl,
      title: title ? title.trim() : null,
      description: description ? description.trim() : null,
      image
    };

    setCachedArticleMeta(articleUrl, payload);
    return payload;
  } catch (error) {
    const fallback = { url: articleUrl };
    setCachedArticleMeta(articleUrl, fallback);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

function loadChangelog(limit = 40) {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["log", `-n${Math.max(1, limit)}`, "--date=short", "--pretty=format:%h|%ad|%an|%s"],
      { cwd: __dirname },
      (error, stdout) => {
        if (error || !stdout) {
          resolve([]);
          return;
        }

        const items = stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [hash, date, author, ...messageParts] = line.split("|");
            return {
              hash,
              date,
              author,
              message: messageParts.join("|")
            };
          });

        resolve(items);
      }
    );
  });
}

function mapStockQuotes(payload) {
  const quoteBySymbol = new Map(
    (payload?.quoteResponse?.result || [])
      .filter((quote) => quote && quote.symbol)
      .map((quote) => [String(quote.symbol).toUpperCase(), quote])
  );

  return STOCK_SYMBOLS.map(({ symbol, name }) => {
    const quote = quoteBySymbol.get(symbol) || {};

    return {
      symbol,
      name,
      price: Number.isFinite(Number(quote.regularMarketPrice)) ? Number(quote.regularMarketPrice) : null,
      changePercent: Number.isFinite(Number(quote.regularMarketChangePercent))
        ? Number(quote.regularMarketChangePercent)
        : null
    };
  });
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoney(value) {
  if (value === null || value === undefined) return null;
  return parseNumber(String(value).replace(/[$,%+,]/g, "").trim());
}

function parsePercent(value) {
  if (value === null || value === undefined) return null;
  return parseNumber(String(value).replace(/[%+,]/g, "").trim());
}

function normalizeStooqSymbol(symbol) {
  return `${String(symbol || "").toLowerCase()}.us`;
}

async function fetchNasdaqQuote(symbol) {
  const requestUrl = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=stocks`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json"
      }
    });

    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    const primary = payload?.data?.primaryData || null;
    if (!primary) return null;

    const price = parseMoney(primary.lastSalePrice);
    if (price === null) return null;

    let changePercent = parsePercent(primary.percentageChange);
    if (changePercent === null) {
      const netChange = parseMoney(primary.netChange);
      if (netChange !== null && price !== 0) {
        changePercent = (netChange / (price - netChange)) * 100;
      }
    }

    return {
      symbol,
      price,
      changePercent
    };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNasdaqStockQuotes() {
  const mapped = await Promise.all(
    STOCK_SYMBOLS.map(async ({ symbol, name }) => {
      const quote = await fetchNasdaqQuote(symbol);
      return {
        symbol,
        name,
        price: quote?.price ?? null,
        changePercent: quote?.changePercent ?? null
      };
    })
  );

  return mapped;
}

async function fetchStooqQuote(symbol) {
  const sourceSymbol = normalizeStooqSymbol(symbol);
  const requestUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(sourceSymbol)}&f=sd2t2cp&h&e=csv`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "glass/1.0"
      }
    });

    if (!response.ok) return null;
    const csv = await response.text();
    const lines = String(csv || "")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);

    if (lines.length < 2) return null;

    const values = lines[1].split(",");
    if (values.length < 5) return null;

    const price = parseNumber(values[3]);
    const prev = parseNumber(values[4]);
    if (price === null) return null;

    const changePercent = prev ? ((price - prev) / prev) * 100 : null;

    return {
      symbol,
      price,
      changePercent
    };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchStooqStockQuotes() {
  const mapped = await Promise.all(
    STOCK_SYMBOLS.map(async ({ symbol, name }) => {
      const quote = await fetchStooqQuote(symbol);
      return {
        symbol,
        name,
        price: quote?.price ?? null,
        changePercent: quote?.changePercent ?? null
      };
    })
  );

  return mapped;
}

function emptyStockQuotes() {
  return STOCK_SYMBOLS.map(({ symbol, name }) => ({
    symbol,
    name,
    price: null,
    changePercent: null
  }));
}

async function fetchStockQuotes(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && stockCache.expiresAt > now) {
    return {
      generatedAt: stockCache.generatedAt || new Date().toISOString(),
      items: stockCache.items,
      warning: stockCache.warning
    };
  }

  const symbols = STOCK_SYMBOLS.map((entry) => entry.symbol).join(",");
  const requestUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "glass/1.0"
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.quoteResponse?.error?.description || "Stock quote request failed.");
    }

    const items = mapStockQuotes(payload);
    if (!items.some((item) => item.price !== null)) {
      throw new Error("No quotes returned.");
    }

    stockCache.expiresAt = now + STOCK_CACHE_TTL;
    stockCache.generatedAt = new Date().toISOString();
    stockCache.items = items;
    stockCache.warning = null;

    return {
      generatedAt: stockCache.generatedAt,
      items,
      warning: null
    };
  } catch (error) {
    const nasdaqFallbackItems = await fetchNasdaqStockQuotes();
    if (nasdaqFallbackItems.some((item) => item.price !== null)) {
      stockCache.expiresAt = now + STOCK_CACHE_TTL;
      stockCache.generatedAt = new Date().toISOString();
      stockCache.items = nasdaqFallbackItems;
      stockCache.warning = null;

      return {
        generatedAt: stockCache.generatedAt,
        items: stockCache.items,
        warning: stockCache.warning
      };
    }

    const stooqFallbackItems = await fetchStooqStockQuotes();
    if (stooqFallbackItems.some((item) => item.price !== null)) {
      stockCache.expiresAt = now + STOCK_CACHE_TTL;
      stockCache.generatedAt = new Date().toISOString();
      stockCache.items = stooqFallbackItems;
      stockCache.warning = "Delayed market data (~15m)";

      return {
        generatedAt: stockCache.generatedAt,
        items: stockCache.items,
        warning: stockCache.warning
      };
    }

    const fallbackWarning = "Live market feed unavailable";
    return {
      generatedAt: new Date().toISOString(),
      items: stockCache.items?.length ? stockCache.items : emptyStockQuotes(),
      warning: stockCache.items?.length ? fallbackWarning : `${fallbackWarning}: ${error.message || ""}`.trim()
    };
  } finally {
    clearTimeout(timeout);
  }
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", service: "glass" });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/changelog", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "changelog.html"));
});

app.get("/api/news", async (req, res) => {
  try {
    const feed = await loadAllFeeds();
    res.json({
      generatedAt: new Date().toISOString(),
      count: feed.length,
      items: feed
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load news feed." });
  }
});

app.get("/api/article-meta", async (req, res) => {
  const articleUrl = normalizeSourceUrl(req.query.url);
  if (!articleUrl) {
    res.status(400).json({ error: "Invalid article URL." });
    return;
  }

  const meta = await fetchArticleMeta(articleUrl);
  res.json(meta);
});

app.get("/api/changelog", async (req, res) => {
  const limit = Number(req.query.limit || 40);
  const items = await loadChangelog(limit);
  res.json({
    generatedAt: new Date().toISOString(),
    count: items.length,
    items
  });
});

app.get("/api/stocks", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";
  const result = await fetchStockQuotes(forceRefresh);

  res.json({
    generatedAt: result.generatedAt,
    count: result.items.length,
    warning: result.warning,
    items: result.items
  });
});

app.listen(PORT, () => {
  console.log(`Glass running at http://localhost:${PORT}`);
});
