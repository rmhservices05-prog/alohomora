const timelineNode = document.getElementById("timeline");
const postTemplate = document.getElementById("post-template");
const composerInput = document.getElementById("composerInput");
const publishBtn = document.getElementById("publishBtn");
const charCount = document.getElementById("charCount");
const communitySearch = document.getElementById("communitySearch");
const newPostBtn = document.getElementById("newPostBtn");
const latestTab = document.getElementById("latestTab");
const topTab = document.getElementById("topTab");

const MAX_LENGTH = 280;
const STORAGE_POSTS_KEY = "alohomora-community-user-posts";
const STORAGE_LIKES_KEY = "alohomora-community-liked";

const seedPosts = [
  {
    id: "seed-1",
    author: "Maya Chen",
    handle: "@maya_cti",
    body: "Seeing fresh phishing infra mimicking Okta admin prompts. SOC teams should watch abnormal MFA fatigue patterns. #ThreatIntel #SOC",
    createdAt: minutesAgo(6),
    likes: 42,
    replies: 9,
    reposts: 14
  },
  {
    id: "seed-2",
    author: "BlueTeamOps",
    handle: "@blueteamops",
    body: "New edge firewall rules blocked outbound C2 callbacks tied to a Qakbot-like chain. Sharing indicators soon.",
    createdAt: minutesAgo(13),
    likes: 58,
    replies: 17,
    reposts: 22
  },
  {
    id: "seed-3",
    author: "Nadia Iqbal",
    handle: "@nadiasec",
    body: "If you are patching this weekend, prioritize internet-facing auth services first. Most exploit chatter is focused there. #ZeroDay",
    createdAt: minutesAgo(21),
    likes: 90,
    replies: 18,
    reposts: 34
  },
  {
    id: "seed-4",
    author: "Incident Room",
    handle: "@incroom",
    body: "Thread: quick playbook for ransomware triage in the first 30 minutes. 1) isolate, 2) preserve logs, 3) identify blast radius.",
    createdAt: minutesAgo(39),
    likes: 128,
    replies: 29,
    reposts: 51
  }
];

let likedPostIds = loadJson(STORAGE_LIKES_KEY, []);
let userPosts = loadJson(STORAGE_POSTS_KEY, []);
let sortMode = "latest";

function minutesAgo(value) {
  return new Date(Date.now() - value * 60 * 1000).toISOString();
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getPosts() {
  const posts = [...seedPosts, ...userPosts];

  if (sortMode === "top") {
    return posts.sort((a, b) => score(b) - score(a));
  }

  return posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function score(post) {
  return post.likes * 1 + post.replies * 2 + post.reposts * 1.6;
}

function formatRelativeTime(dateString) {
  const deltaSeconds = Math.max(1, Math.floor((Date.now() - new Date(dateString).getTime()) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s`;
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function markupText(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/(^|\s)(@[a-zA-Z0-9_]+)/g, '$1<span class="mention">$2</span>')
    .replace(/(^|\s)(#[a-zA-Z0-9_]+)/g, '$1<span class="tag">$2</span>');
}

function renderTimeline() {
  const query = communitySearch.value.trim().toLowerCase();
  const posts = getPosts().filter((post) => {
    if (!query) return true;
    const text = `${post.author} ${post.handle} ${post.body}`.toLowerCase();
    return text.includes(query);
  });

  timelineNode.innerHTML = "";

  for (const post of posts) {
    const clone = postTemplate.content.cloneNode(true);
    const article = clone.querySelector(".post");
    const likeBtn = clone.querySelector(".like-btn");
    const replyBtn = clone.querySelector(".reply-btn");
    const repostBtn = clone.querySelector(".repost-btn");

    article.dataset.id = post.id;
    clone.querySelector(".avatar").textContent = post.author.slice(0, 1).toUpperCase();
    clone.querySelector(".author").textContent = post.author;
    clone.querySelector(".handle").textContent = post.handle;
    clone.querySelector(".time").textContent = formatRelativeTime(post.createdAt);
    clone.querySelector(".post-body").innerHTML = markupText(post.body);

    replyBtn.querySelector(".count").textContent = post.replies;
    repostBtn.querySelector(".count").textContent = post.reposts;
    likeBtn.querySelector(".count").textContent = post.likes;

    if (likedPostIds.includes(post.id)) {
      likeBtn.classList.add("is-liked");
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

  const newPost = {
    id: `user-${Date.now()}`,
    author: "Ryan",
    handle: "@ryan",
    body,
    createdAt: new Date().toISOString(),
    likes: 0,
    replies: 0,
    reposts: 0
  };

  userPosts = [newPost, ...userPosts];
  saveJson(STORAGE_POSTS_KEY, userPosts);
  composerInput.value = "";
  updateComposerState();
  renderTimeline();
}

function toggleLike(postId) {
  const list = getPosts();
  const post = list.find((entry) => entry.id === postId);
  if (!post) return;

  const liked = likedPostIds.includes(postId);
  if (liked) {
    post.likes = Math.max(0, post.likes - 1);
    likedPostIds = likedPostIds.filter((id) => id !== postId);
  } else {
    post.likes += 1;
    likedPostIds = [...likedPostIds, postId];
  }

  const userMatch = userPosts.find((entry) => entry.id === postId);
  if (userMatch) {
    userMatch.likes = post.likes;
    saveJson(STORAGE_POSTS_KEY, userPosts);
  }

  saveJson(STORAGE_LIKES_KEY, likedPostIds);
  renderTimeline();
}

function incrementCount(postId, key) {
  const userMatch = userPosts.find((entry) => entry.id === postId);
  if (userMatch) {
    userMatch[key] += 1;
    saveJson(STORAGE_POSTS_KEY, userPosts);
    renderTimeline();
    return;
  }

  const seedMatch = seedPosts.find((entry) => entry.id === postId);
  if (seedMatch) {
    seedMatch[key] += 1;
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
