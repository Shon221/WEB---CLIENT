(() => {
    // ---------- Helpers ----------
    const qs = (sel) => document.querySelector(sel);

    function getQueryParam(name) {
        const url = new URL(window.location.href);
        return url.searchParams.get(name);
    }

    function setQueryParam(name, value) {
        const url = new URL(window.location.href);
        if (value === null || value === undefined || value === "") url.searchParams.delete(name);
        else url.searchParams.set(name, value);
        window.history.replaceState({}, "", url.toString());
    }

    function uid() {
        return "pl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // ---------- Auth ----------
    function getCurrentUser() {
        const raw = sessionStorage.getItem("currentUser");
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }

    function requireAuth() {
        const user = getCurrentUser();
        if (!user || !user.username) {
            window.location.href = "login.html";
            return null;
        }
        return user;
    }

    function renderNavUser(user) {
        const nameDisplay = user.firstName || user.username || "User";
        qs("#navUserName").textContent = nameDisplay;

        const img = user.imgUrl || user.imageUrl || user.image || "https://via.placeholder.com/64?text=User";
        qs("#navUserImg").src = img;
    }

    // ---------- Storage Logic (UPDATED TO MATCH SEARCH.JS) ----------

    function getUserPlaylistsKey(username) {
        return `playlists_${username}`;
    }

    function normalizeVideo(v) {
        return {
            videoId: v.videoId || v.id || v.youtubeId,
            title: v.title || v.videoTitle || "Untitled",
            thumbnail: v.thumbnail || v.thumb || v.image || "",
            duration: v.duration || v.videoDuration || "",
            views: v.views || v.viewCount || "",
            addedAt: v.addedAt || Date.now()
        };
    }

    function normalizePlaylist(p) {
        return {
            id: p.id || uid(),
            name: p.name || "Unnamed Playlist",
            createdAt: p.createdAt || Date.now(),
            videos: Array.isArray(p.videos) ? p.videos.map(normalizeVideo) : []
        };
    }

    function loadPlaylistsForUser(username) {
        const key = getUserPlaylistsKey(username);
        const raw = localStorage.getItem(key);

        if (raw) {
            try {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    return { source: "simple_key", data: arr.map(normalizePlaylist) };
                }
            } catch (e) {
                console.error("Error parsing playlists", e);
            }
        }

        const usersRaw = localStorage.getItem("users");
        if (usersRaw) {
            try {
                const usersArr = JSON.parse(usersRaw);
                const u = usersArr.find(x => x.username === username);
                if (u && Array.isArray(u.playlists)) {
                    return { source: "users_array", data: u.playlists.map(normalizePlaylist) };
                }
            } catch { }
        }

        return { source: "simple_key", data: [] };
    }

    function savePlaylistsForUser(username, source, playlistsArr) {
        const clean = playlistsArr.map(normalizePlaylist);

        if (source === "users_array") {
            const usersRaw = localStorage.getItem("users");
            if (usersRaw) {
                const usersArr = JSON.parse(usersRaw);
                const idx = usersArr.findIndex(x => x.username === username);
                if (idx >= 0) {
                    usersArr[idx].playlists = clean;
                    localStorage.setItem("users", JSON.stringify(usersArr));
                    return;
                }
            }
        }

        const key = getUserPlaylistsKey(username);
        localStorage.setItem(key, JSON.stringify(clean));
    }

    // ---------- UI State ----------
    const state = {
        user: null,
        username: "",
        source: "simple_key",
        playlists: [],
        activePlaylistId: null,
        filterText: "",
        sortMode: "az"
    };

    // ---------- Rendering ----------
    function renderSidebar() {
        const list = qs("#playlistsList");
        list.innerHTML = "";

        const empty = qs("#sidebarEmpty");
        if (state.playlists.length === 0) {
            empty.classList.remove("d-none");
            qs("#noSelectionBox").classList.add("d-none");
            setMainNoPlaylists();
            return;
        } else {
            empty.classList.add("d-none");
        }

        state.playlists.forEach(p => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
            if (p.id == state.activePlaylistId) btn.classList.add("active");

            btn.innerHTML = `
                <span class="text-truncate" style="max-width: 180px;">${escapeHtml(p.name)}</span>
                <span class="badge ${p.id == state.activePlaylistId ? 'bg-light text-dark' : 'bg-secondary'} rounded-pill">
                    ${p.videos.length}
                </span>
            `;

            btn.addEventListener("click", () => {
                state.activePlaylistId = p.id;
                setQueryParam("playlistId", p.id);
                renderAll();
            });

            list.appendChild(btn);
        });
    }

    function setMainNoPlaylists() {
        qs("#activePlaylistTitle").textContent = "My Playlists";
        qs("#activePlaylistMeta").textContent = "No playlists found.";
        qs("#btnDeletePlaylist").disabled = true;
        qs("#controlsRow").classList.add("d-none");
        qs("#noSelectionBox").classList.add("d-none");
        qs("#emptyPlaylistBox").classList.add("d-none");
        qs("#videosContainer").innerHTML = `
            <div class="col-12 text-center mt-5">
                <div class="text-muted mb-3">You don't have any playlists yet.</div>
            </div>
        `;
    }

    function setMainNoSelection() {
        qs("#activePlaylistTitle").textContent = "Select a playlist";
        qs("#activePlaylistMeta").textContent = "";
        qs("#btnDeletePlaylist").disabled = true;
        qs("#controlsRow").classList.add("d-none");
        qs("#noSelectionBox").classList.remove("d-none");
        qs("#emptyPlaylistBox").classList.add("d-none");
        qs("#videosContainer").innerHTML = "";
    }

    function getActivePlaylist() {
        return state.playlists.find(p => String(p.id) === String(state.activePlaylistId)) || null;
    }

    function getVisibleVideos(playlist) {
        let vids = [...playlist.videos];

        // Filter
        if (state.filterText.trim() !== "") {
            const t = state.filterText.toLowerCase();
            vids = vids.filter(v => (v.title || "").toLowerCase().includes(t));
        }

        // Sort
        switch (state.sortMode) {
            case "newest": // Added recently first
                vids.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
                break;
            case "oldest":
                vids.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
                break;
            case "az":
            default:
                vids.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
                break;
        }

        return vids;
    }

    function renderMain() {
        if (state.playlists.length === 0) return;

        const playlist = getActivePlaylist();
        if (!playlist) {
            setMainNoSelection();
            return;
        }

        qs("#noSelectionBox").classList.add("d-none");
        qs("#controlsRow").classList.remove("d-none");
        qs("#btnDeletePlaylist").disabled = false;

        qs("#activePlaylistTitle").textContent = playlist.name;
        qs("#activePlaylistMeta").textContent = `${playlist.videos.length} videos`;

        const vids = getVisibleVideos(playlist);
        const container = qs("#videosContainer");
        container.innerHTML = "";

        if (playlist.videos.length === 0) {
            qs("#emptyPlaylistBox").classList.remove("d-none");
        } else {
            qs("#emptyPlaylistBox").classList.add("d-none");
        }

        if (vids.length === 0 && playlist.videos.length > 0) {
            container.innerHTML = `<div class="col-12"><div class="alert alert-info">No videos match your filter.</div></div>`;
            return;
        }

        vids.forEach(v => {
            const col = document.createElement("div");
            col.className = "col-12 col-md-6 col-xl-4";

            const thumb = v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;

            // תצוגת משך זמן - אם קיים
            const durationBadge = v.duration
                ? `<span class="badge bg-dark opacity-75">${escapeHtml(v.duration)}</span>`
                : "";

            // תצוגת צפיות - אם קיים
            const viewsText = v.views
                ? `<small class="text-muted">${escapeHtml(v.views)} views</small>`
                : "";

            col.innerHTML = `
                <div class="card h-100 shadow-sm border-0">
                    <div role="button" class="position-relative" onclick="window.playVideo('${v.videoId}', '${escapeAttr(v.title)}')">
                        <img src="${escapeAttr(thumb)}" class="card-img-top" alt="thumbnail" style="height: 180px; object-fit: cover;">
                        <div class="position-absolute bottom-0 end-0 m-2">${durationBadge}</div>
                        <div class="position-absolute top-50 start-50 translate-middle text-white opacity-75">
                            <i class="bi bi-play-circle-fill" style="font-size: 3rem;"></i>
                        </div>
                    </div>

                    <div class="card-body d-flex flex-column">
                        <h6 class="card-title text-truncate" title="${escapeAttr(v.title)}">
                            ${escapeHtml(v.title)}
                        </h6>
                        <div class="mb-2">
                             ${viewsText}
                        </div>
                        
                        <div class="mt-auto d-flex gap-2">
                            <button class="btn btn-outline-primary btn-sm w-100" onclick="window.playVideo('${v.videoId}', '${escapeAttr(v.title)}')">
                                Play
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="window.removeVideo('${playlist.id}', '${v.videoId}')" title="Remove">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16">
                                  <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5h9.916Zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.53Zm5.058 0a.5.5 0 0 1 .47.53l-.5 8.5a.5.5 0 1 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47ZM8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5Z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(col);
        });
    }

    function renderAll() {
        renderSidebar();
        renderMain();
    }

    // ---------- Global Actions (for onclick handlers) ----------
    window.playVideo = function (videoId, title) {
        qs("#playerModalTitle").textContent = title || "Now Playing";
        qs("#playerFrame").src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
        const modal = new bootstrap.Modal(qs("#playerModal"));
        modal.show();

        qs("#playerModal").addEventListener("hidden.bs.modal", () => {
            qs("#playerFrame").src = "";
        }, { once: true });
    };

    window.removeVideo = function (playlistId, videoId) {
        const p = state.playlists.find(x => String(x.id) === String(playlistId));
        if (!p) return;

        if (!confirm("Remove this video from the playlist?")) return;

        p.videos = p.videos.filter(v => v.videoId !== videoId);
        savePlaylistsForUser(state.username, state.source, state.playlists);
        renderAll();
    };

    function deletePlaylist(playlistId) {
        const p = state.playlists.find(x => String(x.id) === String(playlistId));
        if (!p) return;

        if (!confirm(`Delete playlist "${p.name}"? This cannot be undone.`)) return;

        state.playlists = state.playlists.filter(x => String(x.id) !== String(playlistId));

        if (state.playlists.length === 0) {
            state.activePlaylistId = null;
            setQueryParam("playlistId", null);
        } else {
            state.activePlaylistId = state.playlists[0].id;
            setQueryParam("playlistId", state.activePlaylistId);
        }

        savePlaylistsForUser(state.username, state.source, state.playlists);
        renderAll();
    }

    function createPlaylist(name) {
        const trimmed = name.trim();
        if (trimmed.length < 1) return { ok: false, message: "Name is required" };

        const newPl = {
            id: uid(),
            name: trimmed,
            createdAt: Date.now(),
            videos: []
        };

        state.playlists.unshift(newPl);
        state.activePlaylistId = newPl.id;
        setQueryParam("playlistId", newPl.id);

        savePlaylistsForUser(state.username, state.source, state.playlists);
        return { ok: true };
    }

    // ---------- Events ----------
    function bindEvents() {
        qs("#btnLogout").addEventListener("click", () => {
            sessionStorage.removeItem("currentUser");
            window.location.href = "login.html";
        });

        qs("#filterInput").addEventListener("input", (e) => {
            state.filterText = e.target.value || "";
            renderMain();
        });

        qs("#btnClearFilter").addEventListener("click", () => {
            state.filterText = "";
            qs("#filterInput").value = "";
            renderMain();
        });

        qs("#sortSelect").addEventListener("change", (e) => {
            state.sortMode = e.target.value;
            renderMain();
        });

        qs("#btnDeletePlaylist").addEventListener("click", () => {
            if (state.activePlaylistId) deletePlaylist(state.activePlaylistId);
        });

        qs("#createPlaylistForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const err = qs("#createPlaylistError");
            err.classList.add("d-none");

            const nameInput = qs("#newPlaylistName");
            const res = createPlaylist(nameInput.value);

            if (!res.ok) {
                err.textContent = res.message;
                err.classList.remove("d-none");
            } else {
                nameInput.value = "";
                bootstrap.Modal.getInstance(qs("#createPlaylistModal")).hide();
                renderAll();
            }
        });
    }

    // ---------- XSS Security ----------
    function escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function escapeAttr(str) {
        return escapeHtml(str).replace(/`/g, "&#096;");
    }

    // ---------- Init ----------
    function init() {
        const user = requireAuth();
        if (!user) return;

        state.user = user;
        state.username = user.username;
        renderNavUser(user);

        const loaded = loadPlaylistsForUser(state.username);
        state.source = loaded.source;
        state.playlists = loaded.data;

        const requested = getQueryParam("playlistId");

        if (requested && state.playlists.some(p => String(p.id) === String(requested))) {
            state.activePlaylistId = requested;
        } else if (state.playlists.length > 0) {
            state.activePlaylistId = state.playlists[0].id;
            setQueryParam("playlistId", state.activePlaylistId);
        } else {
            state.activePlaylistId = null;
            setQueryParam("playlistId", null);
        }

        bindEvents();
        renderAll();
    }

    document.addEventListener("DOMContentLoaded", init);
})();