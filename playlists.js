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

    function toast(msg) {
        // Simple fallback (Bootstrap Toast is optional)
        alert(msg);
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
        qs("#navUserName").textContent = user.username || "";
        const img = user.imageUrl || user.image || user.photo || "";
        qs("#navUserImg").src = img || "https://via.placeholder.com/64?text=User";
    }

    // ---------- Storage (supports multiple shapes) ----------
    // We will prefer saving back to the same source we loaded from.
    function loadUsersArray() {
        const raw = localStorage.getItem("users");
        if (!raw) return null;
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : null;
        } catch {
            return null;
        }
    }

    function saveUsersArray(usersArr) {
        localStorage.setItem("users", JSON.stringify(usersArr));
    }

    function loadPlaylistsMapping(key) {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            const obj = JSON.parse(raw);
            return (obj && typeof obj === "object") ? obj : null;
        } catch {
            return null;
        }
    }

    function savePlaylistsMapping(key, obj) {
        localStorage.setItem(key, JSON.stringify(obj));
    }

    function normalizeVideo(v) {
        // We keep it flexible: your search page might save different property names.
        return {
            videoId: v.videoId || v.id || v.youtubeId,
            title: v.title || v.videoTitle || "Untitled",
            thumbnail: v.thumbnail || v.thumb || v.image || "",
            duration: v.duration || v.videoDuration || "",
            views: v.views || v.viewCount || "",
            rating: Number.isFinite(+v.rating) ? +v.rating : (Number.isFinite(+v.rank) ? +v.rank : 0),
            addedAt: v.addedAt || v.savedAt || v.createdAt || Date.now()
        };
    }

    function normalizePlaylist(p) {
        return {
            id: p.id || p.playlistId || uid(),
            name: p.name || p.title || "Unnamed Playlist",
            createdAt: p.createdAt || Date.now(),
            videos: Array.isArray(p.videos) ? p.videos.map(normalizeVideo) : []
        };
    }

    function loadPlaylistsForUser(username) {
        // Option A: users array contains playlists per user
        const usersArr = loadUsersArray();
        if (usersArr) {
            const u = usersArr.find(x => x.username === username);
            if (u && Array.isArray(u.playlists)) {
                return { source: "users", data: u.playlists.map(normalizePlaylist) };
            }
        }

        // Option B: playlistsByUser mapping
        const byUser = loadPlaylistsMapping("playlistsByUser");
        if (byUser && Array.isArray(byUser[username])) {
            return { source: "playlistsByUser", data: byUser[username].map(normalizePlaylist) };
        }

        // Option C: playlists mapping
        const pl = loadPlaylistsMapping("playlists");
        if (pl && Array.isArray(pl[username])) {
            return { source: "playlists", data: pl[username].map(normalizePlaylist) };
        }

        // Default empty
        return { source: "playlistsByUser", data: [] };
    }

    function savePlaylistsForUser(username, source, playlistsArr) {
        const clean = playlistsArr.map(normalizePlaylist);

        if (source === "users") {
            const usersArr = loadUsersArray() || [];
            const idx = usersArr.findIndex(x => x.username === username);
            if (idx >= 0) {
                usersArr[idx].playlists = clean;
                saveUsersArray(usersArr);
            } else {
                // if user not found, fallback to mapping
                const byUser = loadPlaylistsMapping("playlistsByUser") || {};
                byUser[username] = clean;
                savePlaylistsMapping("playlistsByUser", byUser);
            }
            return;
        }

        if (source === "playlists") {
            const obj = loadPlaylistsMapping("playlists") || {};
            obj[username] = clean;
            savePlaylistsMapping("playlists", obj);
            return;
        }

        // default playlistsByUser
        const obj = loadPlaylistsMapping("playlistsByUser") || {};
        obj[username] = clean;
        savePlaylistsMapping("playlistsByUser", obj);
    }

    // ---------- UI State ----------
    const state = {
        user: null,
        username: "",
        source: "playlistsByUser",
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
            const a = document.createElement("button");
            a.type = "button";
            a.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
            if (p.id === state.activePlaylistId) a.classList.add("active");

            a.innerHTML = `
        <span class="text-truncate" style="max-width: 220px;">${escapeHtml(p.name)}</span>
        <span class="badge bg-secondary rounded-pill">${p.videos.length}</span>
      `;

            a.addEventListener("click", () => {
                state.activePlaylistId = p.id;
                setQueryParam("playlistId", p.id);
                renderAll();
            });

            list.appendChild(a);
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
      <div class="col-12">
        <div class="alert alert-secondary mb-0">
          Create a playlist using <b>+ New Playlist</b>.
        </div>
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
        return state.playlists.find(p => p.id === state.activePlaylistId) || null;
    }

    function getVisibleVideos(playlist) {
        let vids = [...playlist.videos];

        if (state.filterText.trim() !== "") {
            const t = state.filterText.toLowerCase();
            vids = vids.filter(v => (v.title || "").toLowerCase().includes(t));
        }

        switch (state.sortMode) {
            case "rating":
                vids.sort((a, b) => (+b.rating || 0) - (+a.rating || 0));
                break;
            case "newest":
                vids.sort((a, b) => (+b.addedAt || 0) - (+a.addedAt || 0));
                break;
            case "oldest":
                vids.sort((a, b) => (+a.addedAt || 0) - (+b.addedAt || 0));
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
        qs("#activePlaylistMeta").textContent = `${playlist.videos.length} video(s)`;

        const vids = getVisibleVideos(playlist);
        const container = qs("#videosContainer");
        container.innerHTML = "";

        if (playlist.videos.length === 0) {
            qs("#emptyPlaylistBox").classList.remove("d-none");
        } else {
            qs("#emptyPlaylistBox").classList.add("d-none");
        }

        if (vids.length === 0 && playlist.videos.length > 0) {
            container.innerHTML = `
        <div class="col-12">
          <div class="alert alert-info mb-0">
            No results match your filter.
          </div>
        </div>
      `;
            return;
        }

        vids.forEach(v => {
            const col = document.createElement("div");
            col.className = "col-12 col-md-6 col-xl-4";

            const thumb = v.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(v.videoId)}/hqdefault.jpg`;
            const duration = v.duration ? `<span class="badge bg-dark">${escapeHtml(v.duration)}</span>` : "";
            const views = v.views ? `<span class="text-muted small">${escapeHtml(String(v.views))} views</span>` : `<span class="text-muted small">views: —</span>`;
            const rating = Number.isFinite(+v.rating) ? +v.rating : 0;

            col.innerHTML = `
        <div class="card h-100 shadow-sm">
          <div role="button" class="position-relative" data-action="play">
            <img src="${escapeAttr(thumb)}" class="card-img-top" alt="thumbnail" style="height: 180px; object-fit: cover;">
            <div class="position-absolute bottom-0 end-0 m-2">${duration}</div>
          </div>

          <div class="card-body d-flex flex-column">
            <h6 class="card-title text-truncate" title="${escapeAttr(v.title)}" role="button" data-action="play">
              ${escapeHtml(v.title)}
            </h6>

            <div class="d-flex justify-content-between align-items-center mb-2">
              ${views}
              <span class="badge bg-primary">Rating: ${rating}</span>
            </div>

            <div class="mt-auto d-flex gap-2">
              <button class="btn btn-outline-primary btn-sm w-100" data-action="play">Play</button>
              <button class="btn btn-outline-danger btn-sm" data-action="remove" title="Remove from playlist">🗑</button>
            </div>
          </div>
        </div>
      `;

            col.querySelectorAll('[data-action="play"]').forEach(el => {
                el.addEventListener("click", () => openPlayer(v.videoId, v.title));
            });

            col.querySelector('[data-action="remove"]').addEventListener("click", () => {
                removeVideoFromPlaylist(playlist.id, v.videoId);
            });

            container.appendChild(col);
        });
    }

    function renderAll() {
        renderSidebar();
        renderMain();
    }

    // ---------- Actions ----------
    function openPlayer(videoId, title) {
        qs("#playerModalTitle").textContent = title || "Player";
        qs("#playerFrame").src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;

        const modal = new bootstrap.Modal(qs("#playerModal"));
        modal.show();

        // stop video on close
        qs("#playerModal").addEventListener("hidden.bs.modal", () => {
            qs("#playerFrame").src = "";
        }, { once: true });
    }

    function removeVideoFromPlaylist(playlistId, videoId) {
        const p = state.playlists.find(x => x.id === playlistId);
        if (!p) return;

        const before = p.videos.length;
        p.videos = p.videos.filter(v => (v.videoId || v.id) !== videoId);

        if (p.videos.length === before) return;

        savePlaylistsForUser(state.username, state.source, state.playlists);
        renderAll();
    }

    function deletePlaylist(playlistId) {
        const p = state.playlists.find(x => x.id === playlistId);
        if (!p) return;

        const ok = confirm(`Delete playlist "${p.name}"? This cannot be undone.`);
        if (!ok) return;

        state.playlists = state.playlists.filter(x => x.id !== playlistId);

        // choose next active
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
        if (trimmed.length < 1) return { ok: false, message: "Playlist name is required." };

        const exists = state.playlists.some(p => p.name.toLowerCase() === trimmed.toLowerCase());
        if (exists) return { ok: false, message: "A playlist with this name already exists." };

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
            if (!state.activePlaylistId) return;
            deletePlaylist(state.activePlaylistId);
        });

        qs("#createPlaylistForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const err = qs("#createPlaylistError");
            err.classList.add("d-none");
            err.textContent = "";

            const name = qs("#newPlaylistName").value;

            const res = createPlaylist(name);
            if (!res.ok) {
                err.textContent = res.message;
                err.classList.remove("d-none");
                return;
            }

            qs("#newPlaylistName").value = "";
            bootstrap.Modal.getInstance(qs("#createPlaylistModal"))?.hide();
            renderAll();
        });

        // reset create modal error when opened
        qs("#createPlaylistModal").addEventListener("show.bs.modal", () => {
            qs("#createPlaylistError").classList.add("d-none");
            qs("#createPlaylistError").textContent = "";
            qs("#newPlaylistName").value = "";
        });
    }

    // ---------- XSS-safe text ----------
    function escapeHtml(str) {
        return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
    function escapeAttr(str) {
        return escapeHtml(str).replaceAll("`", "&#096;");
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

        // Pick active from querystring or default
        const requested = getQueryParam("playlistId");
        if (requested && state.playlists.some(p => p.id === requested)) {
            state.activePlaylistId = requested;
        } else if (state.playlists.length > 0) {
            state.activePlaylistId = state.playlists[0].id;
            // keep querystring in sync
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
