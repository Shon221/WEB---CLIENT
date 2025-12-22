// ===============================
// 1) CONFIG - PUT YOUR API KEY
// ===============================
const YT_API_KEY = "PUT_YOUR_YOUTUBE_API_KEY_HERE";

// ===============================
// 2) STORAGE HELPERS
// ===============================
function getCurrentUser() {
    // Must be set by login.html on success
    // Example structure: { username, firstName, imgUrl }
    const raw = sessionStorage.getItem("currentUser");
    return raw ? JSON.parse(raw) : null;
}

function logout() {
    sessionStorage.removeItem("currentUser");
    window.location.href = "login.html";
}

function getUserPlaylistsKey(username) {
    return `playlists_${username}`;
}

function loadUserPlaylists(username) {
    const raw = localStorage.getItem(getUserPlaylistsKey(username));
    // playlists structure:
    // [{ id, name, createdAt, videos: [{ videoId, title, thumbnail, channelTitle, publishedAt }] }]
    return raw ? JSON.parse(raw) : [];
}

function isVideoSavedInAnyPlaylist(username, videoId) {
    const pls = loadUserPlaylists(username);
    return pls.some(p => (p.videos || []).some(v => v.videoId === videoId));
}

// ===============================
// 3) URL (QUERYSTRING) HELPERS
// ===============================
function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name) || "";
}

function setQueryParam(name, value) {
    const url = new URL(window.location.href);
    if (!value) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
    history.replaceState(null, "", url.toString());
}

// ===============================
// 4) YOUTUBE API
// ===============================
async function searchYouTube(query) {
    // Using search endpoint (snippet)
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("key", YT_API_KEY);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "12");
    url.searchParams.set("q", query);

    const res = await fetch(url.toString());
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`YouTube API error: ${res.status} ${txt}`);
    }
    const data = await res.json();
    return data.items || [];
}

// Optional: if you want duration/views accurately, you'd call videos endpoint with ids.
// For now we show publishedAt & channel; duration/views can be added next step.
async function getVideoDetails(videoIds) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("key", YT_API_KEY);
    url.searchParams.set("part", "contentDetails,statistics");
    url.searchParams.set("id", videoIds.join(","));

    const res = await fetch(url.toString());
    if (!res.ok) return {};
    const data = await res.json();

    const map = {};
    for (const item of (data.items || [])) {
        map[item.id] = {
            durationISO: item.contentDetails?.duration || "",
            views: item.statistics?.viewCount || ""
        };
    }
    return map;
}

// Convert ISO 8601 duration (PT#M#S) to mm:ss / hh:mm:ss
function isoDurationToHms(iso) {
    // Basic parser
    // Examples: PT3M21S, PT1H2M10S
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "";
    const h = parseInt(match[1] || "0", 10);
    const m = parseInt(match[2] || "0", 10);
    const s = parseInt(match[3] || "0", 10);

    const pad = (n) => String(n).padStart(2, "0");
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
}

function formatViews(nStr) {
    const n = Number(nStr);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString();
}

// ===============================
// 5) UI RENDER
// ===============================
function setStatus(type, message) {
    const box = document.getElementById("statusBox");
    if (!message) {
        box.innerHTML = "";
        return;
    }
    box.innerHTML = `
    <div class="alert alert-${type} py-2 mb-0" role="alert">
      ${message}
    </div>
  `;
}

function renderResults(items, detailsMap, currentUser) {
    const grid = document.getElementById("resultsGrid");
    const count = document.getElementById("resultsCount");

    grid.innerHTML = "";
    count.textContent = `${items.length}`;

    if (items.length === 0) {
        grid.innerHTML = `<div class="col-12"><div class="alert alert-secondary">No results.</div></div>`;
        return;
    }

    for (const it of items) {
        const videoId = it.id?.videoId;
        const sn = it.snippet || {};
        const title = sn.title || "Untitled";
        const channelTitle = sn.channelTitle || "";
        const publishedAt = sn.publishedAt ? new Date(sn.publishedAt).toLocaleDateString() : "";
        const thumb = sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || "";

        const saved = videoId ? isVideoSavedInAnyPlaylist(currentUser.username, videoId) : false;

        const d = detailsMap?.[videoId] || {};
        const duration = d.durationISO ? isoDurationToHms(d.durationISO) : "";
        const views = d.views ? formatViews(d.views) : "";

        grid.insertAdjacentHTML("beforeend", `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card h-100 shadow-sm">
          <img src="${thumb}" class="card-img-top" alt="Thumbnail" style="cursor:pointer;object-fit:cover;max-height:190px"
               data-action="play" data-video-id="${videoId}" data-title="${escapeHtml(title)}">

          <div class="card-body d-flex flex-column">
            <div class="d-flex align-items-start justify-content-between gap-2">
              <h6 class="card-title mb-1" style="max-width: calc(100% - 30px);">
                <span class="d-inline-block text-truncate" style="max-width: 100%;"
                      title="${escapeHtml(title)}"
                      data-action="play" data-video-id="${videoId}" data-title="${escapeHtml(title)}"
                      role="button">
                  ${escapeHtml(title)}
                </span>
              </h6>
              ${saved ? `<span class="badge text-bg-success">✔ Saved</span>` : ``}
            </div>

            <div class="small text-muted mb-2">
              <div>${escapeHtml(channelTitle)}</div>
              <div>Published: ${publishedAt}</div>
              ${(duration || views) ? `<div>${duration ? `Duration: ${duration}` : ``}${duration && views ? ` • ` : ``}${views ? `Views: ${views}` : ``}</div>` : ``}
            </div>

            <div class="mt-auto d-flex gap-2">
              <button class="btn btn-primary btn-sm w-50"
                      data-action="play" data-video-id="${videoId}" data-title="${escapeHtml(title)}">
                Play
              </button>

              <button class="btn btn-sm w-50 ${saved ? "btn-secondary" : "btn-outline-success"}"
                      data-action="favorite" data-video-id="${videoId}"
                      ${saved ? "disabled" : ""}>
                Add to Favorites
              </button>
            </div>
          </div>
        </div>
      </div>
    `);
    }
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// ===============================
// 6) PLAYER MODAL
// ===============================
let playerModal;

function openPlayer(videoId, title) {
    const frame = document.getElementById("playerFrame");
    const modalTitle = document.getElementById("playerTitle");
    const meta = document.getElementById("playerMeta");
    const openBtn = document.getElementById("openOnYouTube");

    modalTitle.textContent = title || "Now Playing";
    meta.textContent = videoId ? `Video ID: ${videoId}` : "";

    const src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    frame.src = src;

    openBtn.href = `https://www.youtube.com/watch?v=${videoId}`;

    playerModal.show();
}

function stopPlayer() {
    const frame = document.getElementById("playerFrame");
    frame.src = "";
}

// ===============================
// 7) FAVORITES (PLACEHOLDER FOR NEXT SECTION)
// ===============================
function handleAddToFavorites(videoId) {
    // סעיף הבא: לפתוח Modal לבחור פלייליסט או ליצור חדש ואז לשמור
    // כרגע: רק הודעה כדי שתדע שהכפתור מחובר
    alert(`Next step: choose/create a playlist for video: ${videoId}`);
}

// ===============================
// 8) INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    // Auth guard
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = "login.html";
        return;
    }

    // Fill header user
    document.getElementById("userName").textContent = currentUser.firstName
        ? `${currentUser.firstName} (@${currentUser.username})`
        : `@${currentUser.username}`;

    document.getElementById("userImg").src = currentUser.imgUrl || "https://via.placeholder.com/150";

    document.getElementById("btnLogout").addEventListener("click", logout);

    // Modal
    const modalEl = document.getElementById("playerModal");
    playerModal = new bootstrap.Modal(modalEl);

    modalEl.addEventListener("hidden.bs.modal", stopPlayer);

    // Submit search
    const form = document.getElementById("searchForm");
    const input = document.getElementById("qInput");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const q = input.value.trim();
        setQueryParam("q", q);
        await doSearch(q, currentUser);
    });

    // Click handlers (play / favorite)
    document.body.addEventListener("click", (e) => {
        const el = e.target.closest("[data-action]");
        if (!el) return;

        const action = el.getAttribute("data-action");
        const videoId = el.getAttribute("data-video-id");
        const title = el.getAttribute("data-title") || "Now Playing";

        if (action === "play" && videoId) {
            openPlayer(videoId, title);
        }

        if (action === "favorite" && videoId) {
            handleAddToFavorites(videoId);
        }
    });

    // Initial load from querystring
    const qFromUrl = getQueryParam("q");
    if (qFromUrl) {
        input.value = qFromUrl;
        await doSearch(qFromUrl, currentUser);
    } else {
        // show empty state
        setStatus("info", "Type a query and click Search.");
        document.getElementById("resultsCount").textContent = "0";
    }
});

async function doSearch(query, currentUser) {
    if (!query) {
        setStatus("warning", "Please type a search query.");
        document.getElementById("resultsGrid").innerHTML = "";
        document.getElementById("resultsCount").textContent = "0";
        return;
    }

    if (!YT_API_KEY || YT_API_KEY.includes("PUT_YOUR")) {
        setStatus("danger", "Missing YouTube API Key. Please set YT_API_KEY in search.js");
        return;
    }

    try {
        setStatus("info", "Searching YouTube...");
        const items = await searchYouTube(query);

        // Fetch duration/views for the shown items
        const ids = items.map(x => x.id?.videoId).filter(Boolean);
        const detailsMap = ids.length ? await getVideoDetails(ids) : {};

        setStatus("success", `Showing results for: <b>${escapeHtml(query)}</b>`);
        renderResults(items, detailsMap, currentUser);
    } catch (err) {
        console.error(err);
        setStatus("danger", escapeHtml(err.message || "Search failed."));
    }
}
