const timelineNode = document.getElementById("timeline");
const postTemplate = document.getElementById("post-template");
const composerInput = document.getElementById("composerInput");
const publishBtn = document.getElementById("publishBtn");
const charCount = document.getElementById("charCount");
const communitySearch = document.getElementById("communitySearch");
const newPostBtn = document.getElementById("newPostBtn");
const latestTab = document.getElementById("latestTab");
const topTab = document.getElementById("topTab");
const communityState = document.getElementById("communityState");

const MAX_LENGTH = 280;
const STORAGE_POSTS_KEY = "alohomora-community-user-posts";
const STORAGE_LIKES_KEY = "alohomora-community-liked";
const STORAGE_DELTAS_KEY = "alohomora-community-metric-deltas";

let likedPostIds = loadJson(STORAGE_LIKES_KEY, []);
let metricDeltas = loadJson(STORAGE_DELTAS_KEY, {});
let userPosts = loadJson(STORAGE_POSTS_KEY, []).map(normalizePost);
let remotePosts = [];
let sortMode = "latest";

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? parsed : fallback;
    }
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizePost(post) {
  return {
    id: String(post.id || `user-${Date.now()}`),
    author: post.author || "Unknown",
    handle: post.handle || "@unknown",
    body: String(post.body || "").trim(),
    createdAt: post.createdAt || new Date().toISOString(),
    likes: Number(post.likes || 0),
    replies: Number(post.replies || 0),
    reposts: Number(post.reposts || 0),
    source: post.source || "local",
    sourceUrl: post.sourceUrl || null
  };
}

function getDelta(postId, metric) {
  return Number(metricDeltas?.[postId]?.[metric] || 0);
}

function getMetricCount(post, metric) {
  return Math.max(0, Number(post[metric] || 0) + getDelta(post.id, metric));
}

function getPosts() {
  const posts = [...remotePosts, ...userPosts].map(normalizePost);

  if (sortMode === "top") {
    return posts.sort((a, b) => score(b) - score(a));
  }

  return posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function score(post) {
  return getMetricCount(post, "likes") * 1 + getMetricCount(post, "replies") * 2 + getMetricCount(post, "reposts") * 1.6;
}

function formatRelativeTime(dateString) {
  const timestamp = new Date(dateString).getTime();
  if (!Number.isFinite(timestamp)) return "now";

  const deltaSeconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s`;
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatSyncTime(dateString) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function markupText(text) {
  const escaped = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/(^|\s)(@[a-zA-Z0-9_]+)/g, '$1<span class="mention">$2</span>')
    .replace(/(^|\s)(#[a-zA-Z0-9_]+)/g, '$1<span class="tag">$2</span>');
}

function renderEmptyTimeline(message) {
  timelineNode.innerHTML = `<article class="post"><div class="post-main"><p class="post-body">${message}</p></div></article>`;
}

function renderTimeline() {
  const query = communitySearch.value.trim().toLowerCase();
  const posts = getPosts().filter((post) => {
    if (!query) return true;
    const text = `${post.author} ${post.handle} ${post.body}`.toLowerCase();
    return text.includes(query);
  });

  timelineNode.innerHTML = "";

  if (!posts.length) {
    renderEmptyTimeline(query ? "No posts match your search." : "No community posts available yet.");
    return;
  }

  for (const post of posts) {
    const clone = postTemplate.content.cloneNode(true);
    const article = clone.querySelector(".post");
    const likeBtn = clone.querySelector(".like-btn");
    const replyBtn = clone.querySelector(".reply-btn");
    const repostBtn = clone.querySelector(".repost-btn");
    const sourceLink = clone.querySelector(".source-link");

    article.dataset.id = post.id;
    clone.querySelector(".avatar").textContent = post.author.slice(0, 1).toUpperCase();
    clone.querySelector(".author").textContent = post.author;
    clone.querySelector(".handle").textContent = post.handle;
    clone.querySelector(".time").textContent = formatRelativeTime(post.createdAt);
    clone.querySelector(".post-body").innerHTML = markupText(post.body);

    replyBtn.querySelector(".count").textContent = getMetricCount(post, "replies");
    repostBtn.querySelector(".count").textContent = getMetricCount(post, "reposts");
    likeBtn.querySelector(".count").textContent = getMetricCount(post, "likes");

    if (likedPostIds.includes(post.id)) {
      likeBtn.classList.add("is-liked");
    }

    if (post.sourceUrl) {
      sourceLink.hidden = false;
      sourceLink.href = post.sourceUrl;
    } else {
      sourceLink.hidden = true;
      sourceLink.removeAttribute("href");
    }

    timelineNode.appendChild(clone);
  }
}

function updateComposerState() {
  const text = composerInput.value;
  const length = text.length;
  charCount.textContent = `${length}/${MAX_LENGTH}`;
  publishBtn.disabled = length === 0 || length > MAX_LENGTH;
}

function createPost() {
  const body = composerInput.value.trim();
  if (!body || body.length > MAX_LENGTH) return;

  const newPost = normalizePost({
    id: `user-${Date.now()}`,
    author: "Ryan",
    handle: "@ryan",
    body,
    createdAt: new Date().toISOString(),
    likes: 0,
    replies: 0,
    reposts: 0,
    source: "local"
  });

  userPosts = [newPost, ...userPosts];
  saveJson(STORAGE_POSTS_KEY, userPosts);
  composerInput.value = "";
  updateComposerState();
  renderTimeline();
}

function ensureDeltaBucket(postId) {
  if (!metricDeltas[postId]) {
    metricDeltas[postId] = { likes: 0, replies: 0, reposts: 0 };
  }
  return metricDeltas[postId];
}

function toggleLike(postId) {
  const bucket = ensureDeltaBucket(postId);
  const liked = likedPostIds.includes(postId);

  if (liked) {
    likedPostIds = likedPostIds.filter((id) => id !== postId);
    bucket.likes -= 1;
  } else {
    likedPostIds = [...likedPostIds, postId];
    bucket.likes += 1;
  }

  saveJson(STORAGE_LIKES_KEY, likedPostIds);
  saveJson(STORAGE_DELTAS_KEY, metricDeltas);
  renderTimeline();
}

function incrementCount(postId, key) {
  const bucket = ensureDeltaBucket(postId);
  bucket[key] += 1;
  saveJson(STORAGE_DELTAS_KEY, metricDeltas);
  renderTimeline();
}

async function loadCommunityFeed(forceRefresh = false) {
  communityState.textContent = "Syncing X hashtag feed...";

  try {
    const response = await fetch(`/api/community?limit=80${forceRefresh ? "&refresh=1" : ""}`);
    if (!response.ok) throw new Error("Community feed request failed.");

    const data = await response.json();
    remotePosts = (data.items || []).map(normalizePost);

    if (data.warning) {
      communityState.textContent = data.warning;
    } else {
      communityState.textContent = `Synced ${formatSyncTime(data.generatedAt)} • ${data.count} live posts`;
    }

    renderTimeline();
  } catch (error) {
    communityState.textContent = "Live X feed unavailable right now.";
    renderTimeline();
  }
}

composerInput.addEventListener("input", updateComposerState);
publishBtn.addEventListener("click", createPost);
newPostBtn.addEventListener("click", () => composerInput.focus());
communitySearch.addEventListener("input", renderTimeline);

timelineNode.addEventListener("click", (event) => {
  const post = event.target.closest(".post");
  if (!post) return;
  const id = post.dataset.id;

  if (event.target.closest(".like-btn")) {
    toggleLike(id);
    return;
  }

  if (event.target.closest(".reply-btn")) {
    const found = getPosts().find((entry) => entry.id === id);
    if (!found) return;
    composerInput.value = `${found.handle} `;
    updateComposerState();
    composerInput.focus();
    incrementCount(id, "replies");
    return;
  }

  if (event.target.closest(".repost-btn")) {
    incrementCount(id, "reposts");
  }
});

latestTab.addEventListener("click", () => {
  sortMode = "latest";
  latestTab.classList.add("is-active");
  topTab.classList.remove("is-active");
  renderTimeline();
});

topTab.addEventListener("click", () => {
  sortMode = "top";
  topTab.classList.add("is-active");
  latestTab.classList.remove("is-active");
  renderTimeline();
});

updateComposerState();
renderTimeline();
loadCommunityFeed();
setInterval(() => loadCommunityFeed(true), 1000 * 60 * 2);
