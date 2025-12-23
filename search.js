// ===============================
// 1) CONFIG
// ===============================
const YT_API_KEY = "PUT_YOUR_YOUTUBE_API_KEY_HERE";

// ===============================
// 2) STORAGE & AUTH HELPERS
// ===============================
function getCurrentUser() {
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
    // Structure: [{ id: timestamp, name: string, videos: [ { videoId, title, thumbnail, channelTitle, publishedAt } ] }]
    return raw ? JSON.parse(raw) : [];
}

function saveUserPlaylists(username, playlists) {
    localStorage.setItem(getUserPlaylistsKey(username), JSON.stringify(playlists));
}

function isVideoSavedInAnyPlaylist(username, videoId) {
    const pls = loadUserPlaylists(username);
    return pls.some(p => (p.videos || []).some(v => v.videoId === videoId));
}

// ===============================
// 3) URL HELPERS
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
// 4) YOUTUBE UTILS (Link Parsing)
// ===============================
function isYouTubeUrl(str) {
    try {
        const u = new URL(str);
        const host = u.hostname.replace("www.", "").toLowerCase();
        return (host.includes("youtube.com") || host.includes("youtu.be"));
    } catch { return false; }
}

function extractYouTubeVideoId(input) {
    try {
        const u = new URL(input);
        if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);

        const v = u.searchParams.get("v");
        if (v) return v;

        const parts = u.pathname.split("/");
        if (parts.includes("embed")) return parts[parts.indexOf("embed") + 1];
        if (parts.includes("shorts")) return parts[parts.indexOf("shorts") + 1];

        return "";
    } catch { return ""; }
}

async function fetchYouTubeOEmbed(youtubeUrl) {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("url", youtubeUrl);
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Link not found");
    return await res.json();
}

// ===============================
// 5) API & SEARCH LOGIC
// ===============================
async function searchYouTube(query) {
    if (!YT_API_KEY || YT_API_KEY.includes("PUT_YOUR")) {
        throw new Error("API Key missing. You can still paste direct YouTube links.");
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("key", YT_API_KEY);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "12");
    url.searchParams.set("q", query);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("YouTube API Error");
    const data = await res.json();
    return data.items || [];
}

async function getVideoDetails(videoIds) {
    if (!videoIds.length || !YT_API_KEY || YT_API_KEY.includes("PUT_YOUR")) return {};

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
            duration: isoDurationToHms(item.contentDetails?.duration),
            views: Number(item.statistics?.viewCount).toLocaleString()
        };
    }
    return map;
}

function isoDurationToHms(iso) {
    if (!iso) return "";
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "";
    const h = parseInt(match[1] || 0), m = parseInt(match[2] || 0), s = parseInt(match[3] || 0);
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ===============================
// 6) UI RENDERING
// ===============================
let currentVideoToAdd = null; // Stores video data for the modal
let playerModal, addToPlaylistModal, toastEl;

function setStatus(type, msg) {
    const box = document.getElementById("statusBox");
    box.innerHTML = msg ? `<div class="alert alert-${type}">${msg}</div>` : "";
}

function renderResults(items, detailsMap, currentUser) {
    const grid = document.getElementById("resultsGrid");
    const count = document.getElementById("resultsCount");

    grid.innerHTML = "";
    count.textContent = items.length;

    if (!items.length) {
        grid.innerHTML = `<div class="col-12 text-center text-muted mt-5">No results found.</div>`;
        return;
    }

    items.forEach(item => {
        const videoId = item.id.videoId;
        const snip = item.snippet;
        const title = snip.title;
        const thumb = snip.thumbnails?.medium?.url || snip.thumbnails?.default?.url;
        const channel = snip.channelTitle;
        const published = snip.publishedAt ? new Date(snip.publishedAt).toLocaleDateString() : "";

        const details = detailsMap[videoId] || {};
        const saved = isVideoSavedInAnyPlaylist(currentUser.username, videoId);
        const duration = details.duration || "";
        // Escape helper
        const safeTitle = title.replace(/"/g, "&quot;");
        const safeChannel = channel.replace(/"/g, "&quot;");
        const safeThumb = thumb;

        const html = `
        <div class="col-12 col-md-6 col-lg-4">
            <div class="card h-100 shadow-sm border-0 result-card" id="card-${videoId}">
                <div class="position-relative">
                    <img src="${safeThumb}" class="card-img-top" alt="${safeTitle}" 
                         style="cursor:pointer; height:200px; object-fit:cover;"
                         onclick="openPlayer('${videoId}', '${safeTitle.replace(/'/g, "\\'")}')">
                    <div class="position-absolute bottom-0 end-0 bg-dark text-white px-2 py-1 m-1 rounded small opacity-75">
                        ${details.duration || "Video"}
                    </div>
                </div>
                
                <div class="card-body d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="card-title text-truncate-2-lines mb-0" 
                            title="${safeTitle}" data-bs-toggle="tooltip">
                            ${title}
                        </h6>
                        ${saved ? '<i class="bi bi-check-circle-fill text-success fs-5 ms-2" title="Saved"></i>' : ''}
                    </div>
                    
                    <div class="small text-muted mb-3">
                        <div>${channel}</div>
                        <div>${details.views ? details.views + ' views • ' : ''} ${published}</div>
                    </div>

                    <div class="mt-auto d-flex gap-2">
                        <button class="btn btn-primary flex-grow-1" 
                                onclick="openPlayer('${videoId}', '${safeTitle.replace(/'/g, "\\'")}')">
                            <i class="bi bi-play-fill"></i> Play
                        </button>
                        <button class="btn ${saved ? 'btn-secondary' : 'btn-outline-success'} flex-grow-1 btn-add-fav"
                                data-video-id="${videoId}"
                                data-video-title="${safeTitle}"
                                data-video-thumb="${safeThumb}"
                                data-video-channel="${safeChannel}"
                                data-video-pub="${published}"
                                ${saved ? 'disabled' : ''}
                                onclick="openAddToPlaylistModal(this)">
                            ${saved ? 'Saved' : '<i class="bi bi-plus-lg"></i> Add'}
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        grid.insertAdjacentHTML("beforeend", html);
    });

    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(t => new bootstrap.Tooltip(t));
}

// ===============================
// 7) ACTIONS: PLAYER & FAVORITES
// ===============================
function openPlayer(videoId, title) {
    document.getElementById("playerTitle").textContent = title;
    document.getElementById("playerFrame").src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    document.getElementById("openOnYouTube").href = `https://www.youtube.com/watch?v=${videoId}`;
    document.getElementById("playerMeta").textContent = ""; // Reset meta
    playerModal.show();
}

function openAddToPlaylistModal(btnElement) {
    const user = getCurrentUser();

    // Store video data in global var for later use
    currentVideoToAdd = {
        videoId: btnElement.dataset.videoId,
        title: btnElement.dataset.videoTitle,
        thumbnail: btnElement.dataset.videoThumb,
        channelTitle: btnElement.dataset.videoChannel,
        publishedAt: btnElement.dataset.videoPub,
        duration: btnElement.dataset.videoDuration || ""
    };

    // Populate dropdown
    const playlists = loadUserPlaylists(user.username);
    const select = document.getElementById("playlistSelect");
    const optExisting = document.getElementById("optExisting");
    const optNew = document.getElementById("optNew");
    const inputNew = document.getElementById("newPlaylistName");

    select.innerHTML = "";

    if (playlists.length > 0) {
        playlists.forEach((pl, index) => {
            const opt = document.createElement("option");
            opt.value = index; // using index for simplicity
            opt.textContent = `${pl.name} (${(pl.videos || []).length} videos)`;
            select.appendChild(opt);
        });
        optExisting.checked = true;
        optExisting.disabled = false;
        select.disabled = false;
        inputNew.disabled = true;
    } else {
        // No playlists exist -> force "New"
        const opt = document.createElement("option");
        opt.textContent = "No playlists found";
        select.appendChild(opt);

        optExisting.disabled = true;
        optNew.checked = true;
        select.disabled = true;
        inputNew.disabled = false;
    }

    addToPlaylistModal.show();
}

function confirmAddToPlaylist() {
    if (!currentVideoToAdd) return;

    const user = getCurrentUser();
    const playlists = loadUserPlaylists(user.username);

    const isNew = document.getElementById("optNew").checked;
    let targetPlaylistIndex = -1;

    if (isNew) {
        const name = document.getElementById("newPlaylistName").value.trim();
        if (!name) {
            alert("Please enter a playlist name.");
            return;
        }
        // Create new
        const newPl = {
            id: Date.now(),
            name: name,
            createdAt: new Date().toISOString(),
            videos: []
        };
        playlists.push(newPl);
        targetPlaylistIndex = playlists.length - 1;
    } else {
        targetPlaylistIndex = document.getElementById("playlistSelect").value;
    }

    // Add video to the selected playlist
    if (targetPlaylistIndex > -1 && playlists[targetPlaylistIndex]) {
        // Check duplicate inside this specific playlist (optional logic, but good practice)
        const pl = playlists[targetPlaylistIndex];
        if (!pl.videos) pl.videos = [];

        if (pl.videos.some(v => v.videoId === currentVideoToAdd.videoId)) {
            alert("Video already in this playlist.");
            return; // Don't close modal if duplicate? or just close.
        }

        pl.videos.push(currentVideoToAdd);
        saveUserPlaylists(user.username, playlists);

        // Success UI updates
        addToPlaylistModal.hide();
        showToast();
        updateCardToSavedState(currentVideoToAdd.videoId);

        // Clear input
        document.getElementById("newPlaylistName").value = "";
    }
}

function showToast() {
    const toast = new bootstrap.Toast(document.getElementById("liveToast"));
    toast.show();
}

function updateCardToSavedState(videoId) {
    const card = document.getElementById(`card-${videoId}`);
    if (card) {
        // Find Add button
        const btn = card.querySelector(".btn-add-fav");
        if (btn) {
            btn.className = "btn btn-secondary flex-grow-1 btn-add-fav";
            btn.innerHTML = "Saved";
            btn.disabled = true;
        }
        // Add check icon if missing
        const titleArea = card.querySelector(".card-title").parentNode;
        if (!titleArea.querySelector(".bi-check-circle-fill")) {
            titleArea.insertAdjacentHTML('beforeend', '<i class="bi bi-check-circle-fill text-success fs-5 ms-2" title="Saved"></i>');
        }
    }
}

// ===============================
// 8) MAIN EXECUTION
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Auth Guard
    const user = getCurrentUser();
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    // 2. Setup Header
    document.getElementById("userName").textContent = user.firstName || user.username;
    document.getElementById("userImg").src = user.imgUrl || "https://via.placeholder.com/36";
    document.getElementById("welcomeTitle").textContent = `Welcome, ${user.firstName || user.username}!`;

    document.getElementById("btnLogout").addEventListener("click", logout);

    // 3. Setup Modals
    playerModal = new bootstrap.Modal(document.getElementById("playerModal"));
    document.getElementById("playerModal").addEventListener("hidden.bs.modal", () => {
        document.getElementById("playerFrame").src = "";
    });

    addToPlaylistModal = new bootstrap.Modal(document.getElementById("addToPlaylistModal"));

    // 4. Modal Interactions (Radio buttons toggle input/select)
    document.getElementById("optExisting").addEventListener("change", () => {
        document.getElementById("playlistSelect").disabled = false;
        document.getElementById("newPlaylistName").disabled = true;
    });
    document.getElementById("optNew").addEventListener("change", () => {
        document.getElementById("playlistSelect").disabled = true;
        document.getElementById("newPlaylistName").disabled = false;
    });

    document.getElementById("btnConfirmAdd").addEventListener("click", confirmAddToPlaylist);

    // 5. Search Logic
    const form = document.getElementById("searchForm");
    const input = document.getElementById("qInput");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const q = input.value.trim();
        setQueryParam("q", q);
        await runSearch(q, user);
    });

    // 6. Initial Load
    const initialQ = getQueryParam("q");
    if (initialQ) {
        input.value = initialQ;
        await runSearch(initialQ, user);
    }
});

async function runSearch(query, user) {
    if (!query) return;
    setStatus("", ""); // Clear status
    const grid = document.getElementById("resultsGrid");

    // A) Is it a Direct Link?
    if (isYouTubeUrl(query)) {
        setStatus("info", "Detected YouTube link. Fetching details...");
        const videoId = extractYouTubeVideoId(query);

        if (!videoId) {
            setStatus("danger", "Invalid YouTube link.");
            return;
        }

        try {
            // Try oEmbed for title/image
            let item = {
                id: { videoId },
                snippet: { title: "YouTube Video", thumbnails: { medium: { url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` } } }
            };

            try {
                const oembed = await fetchYouTubeOEmbed(query);
                item.snippet.title = oembed.title;
                item.snippet.channelTitle = oembed.author_name;
                item.snippet.thumbnails.medium.url = oembed.thumbnail_url;
            } catch (e) {
                console.warn("oEmbed failed, using defaults");
            }

            renderResults([item], {}, user);
            setStatus("success", "Video loaded from link.");
        } catch (err) {
            setStatus("danger", "Error loading video from link.");
        }
        return;
    }

    // B) Text Search (Requires API Key)
    try {
        setStatus("info", "Searching...");
        const items = await searchYouTube(query);

        // Fetch extra details (duration/views) if we have items
        const ids = items.map(i => i.id.videoId).filter(Boolean);
        const details = await getVideoDetails(ids);

        renderResults(items, details, user);
        setStatus("", ""); // Clear status on success
    } catch (err) {
        console.error(err);
        grid.innerHTML = "";
        setStatus("danger", err.message);
    }
}