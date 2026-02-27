const changelogFeed = document.getElementById("changelogFeed");
const changelogState = document.getElementById("changelogState");
const refreshBtn = document.getElementById("changelogRefreshBtn");
const quickTabs = Array.from(document.querySelectorAll(".quick-tab"));

function renderEntries(items) {
  changelogFeed.innerHTML = "";

  if (!items.length) {
    changelogFeed.innerHTML = '<article class="release-entry release-entry--empty">No changelog entries available.</article>';
    return;
  }

  for (const item of items) {
    const entry = document.createElement("article");
    entry.className = "release-entry";

    const title = toReleaseTitle(item.message || "");
    const detail = toReleaseDetail(item.message || "");
    const type = classifyReleaseType(item.message || "");

    entry.innerHTML = `
      <header class="release-head">
        <span class="release-date">${escapeHtml(formatReleaseDate(item.date))}</span>
        <span class="release-type release-type--${type.key}">${escapeHtml(type.label)}</span>
      </header>
      <h3 class="release-title">${escapeHtml(title)}</h3>
      <p class="release-detail">${escapeHtml(detail)}</p>
      <footer class="release-foot">
        <span>Published by Ryan M</span>
      </footer>
    `;

    changelogFeed.appendChild(entry);
  }
}

function toReleaseTitle(message) {
  const clean = normalizeMessage(message);
  if (!clean) return "Platform reliability and user experience updates";

  const sentence = clean.charAt(0).toUpperCase() + clean.slice(1);
  if (sentence.length <= 72) {
    return sentence;
  }

  const cut = sentence.slice(0, 72);
  const end = cut.lastIndexOf(" ");
  return `${(end > 0 ? cut.slice(0, end) : cut).trim()}...`;
}

function toReleaseDetail(message) {
  const clean = normalizeMessage(message);
  if (!clean) return "General platform improvements and reliability enhancements.";

  const sentence = clean.charAt(0).toUpperCase() + clean.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function normalizeMessage(message) {
  return String(message || "")
    .replace(/^(feat|fix|chore|docs|refactor|style|perf|test|build|ci)(\(.+?\))?:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyReleaseType(message) {
  const lower = String(message || "").toLowerCase();

  if (lower.startsWith("fix") || lower.includes("bug") || lower.includes("error")) {
    return { key: "fix", label: "Fix" };
  }

  if (lower.startsWith("feat") || lower.includes("add") || lower.includes("new")) {
    return { key: "feature", label: "Feature" };
  }

  if (lower.includes("security") || lower.includes("auth") || lower.includes("token")) {
    return { key: "security", label: "Security" };
  }

  return { key: "improvement", label: "Improvement" };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(dateString) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatReleaseDate(dateString) {
  if (!dateString) return "Undated";

  const parsed = new Date(dateString);
  if (!Number.isFinite(parsed.getTime())) return dateString;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(parsed);
}

async function loadChangelog() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  try {
    const response = await fetch("/api/changelog?limit=60");
    if (!response.ok) throw new Error("Failed to fetch changelog");

    const data = await response.json();
    renderEntries(data.items || []);
    changelogState.textContent = `Synced ${formatTime(data.generatedAt)} • ${data.count} entries`;
  } catch (error) {
    renderEntries([]);
    changelogState.textContent = "Changelog unavailable";
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }
}

quickTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const route = tab.dataset.route;
    if (route === "live") {
      window.location.href = "./";
      return;
    }

    if (route === "changelog") {
      for (const node of quickTabs) {
        node.classList.remove("is-active");
      }
      tab.classList.add("is-active");
    }
  });
});

refreshBtn.addEventListener("click", loadChangelog);
loadChangelog();
