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

    // ---------- Auth ----------
    function getCurrentUser() {
        const raw = sessionStorage.getItem("currentUser");
        return raw ? JSON.parse(raw) : null;
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
        const img = user.imgUrl || user.imageUrl || "https://via.placeholder.com/32";
        qs("#navUserImg").src = img;
    }

    // ---------- API & Storage ----------
    async function loadPlaylistsForUser(username) {
        try {
            const res = await fetch(`/api/playlists/${username}`);
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("Load error:", e);
            return [];
        }
    }

    async function savePlaylistsForUser(username, playlists) {
        try {
            await fetch('/api/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, playlists })
            });
        } catch (e) {
            console.error("Save error:", e);
        }
    }

    async function uploadMp3(file) {
        const formData = new FormData();
        formData.append("mp3file", file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error("Upload failed");
        return await res.json();
    }

    // ---------- State ----------
    const state = {
        user: null,
        playlists: [],
        activePlaylistId: null,
        filterText: "",
        sortMode: "az"
    };

    // ---------- Rendering Functions (These were missing!) ----------

    function renderSidebar() {
        const list = qs("#playlistsList");
        list.innerHTML = "";

        const empty = qs("#sidebarEmpty");
        if (state.playlists.length === 0) {
            empty.classList.remove("d-none");
            qs("#noSelectionBox").classList.add("d-none"); // Hide selection prompt if empty
            setMainNoPlaylists(); // Helper to clear main view
            return;
        } else {
            empty.classList.add("d-none");
        }

        state.playlists.forEach(p => {
            const isActive = (String(p.id) === String(state.activePlaylistId));
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isActive ? 'active' : ''}`;

            btn.innerHTML = `
                <div class="text-truncate me-2">
                    <i class="bi bi-music-note-list me-2"></i>${escapeHtml(p.name)}
                </div>
                <span class="badge ${isActive ? 'bg-light text-dark' : 'bg-secondary'} rounded-pill">
                    ${p.videos ? p.videos.length : 0}
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
        qs("#videosContainer").innerHTML = "";
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

    function renderMain() {
        if (state.playlists.length === 0) {
            setMainNoPlaylists();
            return;
        }

        const playlist = state.playlists.find(p => String(p.id) === String(state.activePlaylistId));
        if (!playlist) {
            setMainNoSelection();
            return;
        }

        // Active Playlist Found
        qs("#noSelectionBox").classList.add("d-none");
        qs("#controlsRow").classList.remove("d-none");
        qs("#btnDeletePlaylist").disabled = false;

        qs("#activePlaylistTitle").textContent = playlist.name;
        qs("#activePlaylistMeta").textContent = `${playlist.videos ? playlist.videos.length : 0} items`;

        // Filter & Sort Logic
        let vids = [...(playlist.videos || [])];

        // Filter
        if (state.filterText.trim()) {
            const t = state.filterText.toLowerCase();
            vids = vids.filter(v => (v.title || "").toLowerCase().includes(t));
        }

        // Sort
        const sortMode = state.sortMode;
        vids.sort((a, b) => {
            if (sortMode === "newest") return (b.addedAt || 0) - (a.addedAt || 0);
            if (sortMode === "oldest") return (a.addedAt || 0) - (b.addedAt || 0);
            return (a.title || "").localeCompare(b.title || ""); // a-z default
        });

        const container = qs("#videosContainer");
        container.innerHTML = "";

        if (playlist.videos.length === 0) {
            qs("#emptyPlaylistBox").classList.remove("d-none");
        } else {
            qs("#emptyPlaylistBox").classList.add("d-none");
        }

        if (vids.length === 0 && playlist.videos.length > 0) {
            container.innerHTML = `<div class="col-12"><div class="alert alert-info">No matches found for filter.</div></div>`;
            return;
        }

        vids.forEach(v => {
            const col = document.createElement("div");
            col.className = "col-12 col-md-6 col-xl-4";

            // Determine if MP3 or YouTube
            const isLocal = v.isLocal === true;
            const thumb = v.thumbnail || (isLocal ? "https://cdn-icons-png.flaticon.com/512/3750/3750063.png" : "https://via.placeholder.com/320x180");
            const durationBadge = v.duration ? `<span class="badge bg-dark opacity-75">${escapeHtml(v.duration)}</span>` : "";
            const filePath = v.filePath || "";

            // **CRITICAL**: passing arguments correctly to window.playVideo
            col.innerHTML = `
                <div class="card h-100 shadow-sm border-0">
                    <div role="button" class="position-relative" 
                         onclick="window.playVideo('${v.videoId}', '${escapeAttr(v.title)}', ${isLocal}, '${escapeAttr(filePath)}')">
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
                        <div class="small text-muted mb-2">
                             ${isLocal ? 'Uploaded MP3' : 'YouTube Video'}
                        </div>
                        
                        <div class="mt-auto d-flex gap-2">
                            <button class="btn btn-primary btn-sm flex-grow-1" 
                                onclick="window.playVideo('${v.videoId}', '${escapeAttr(v.title)}', ${isLocal}, '${escapeAttr(filePath)}')">
                                Play
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="window.removeVideo('${playlist.id}', '${v.videoId}')" title="Remove">
                                <i class="bi bi-trash"></i>
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

    // ---------- Actions ----------

    window.playVideo = function (videoId, title, isLocal, filePath) {
        const modalEl = qs("#playerModal");
        qs("#playerModalTitle").textContent = title;

        const ytContainer = qs("#youtubeContainer");
        const audioContainer = qs("#audioContainer");
        const ytFrame = qs("#playerFrame");
        const audioPlayer = qs("#audioPlayer");

        // Reset
        ytFrame.src = "";
        audioPlayer.pause();
        audioPlayer.src = "";

        if (isLocal) {
            // Show Audio
            ytContainer.classList.add("d-none");
            audioContainer.classList.remove("d-none");
            audioPlayer.src = filePath;
            audioPlayer.play();
        } else {
            // Show YouTube
            audioContainer.classList.add("d-none");
            ytContainer.classList.remove("d-none");
            ytFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&origin=${window.location.origin}`;
        }

        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        modalEl.addEventListener("hidden.bs.modal", () => {
            ytFrame.src = "";
            audioPlayer.pause();
            audioPlayer.src = "";
        }, { once: true });
    };

    window.removeVideo = async function (playlistId, videoId) {
        const p = state.playlists.find(x => String(x.id) === String(playlistId));
        if (!p) return;

        if (!confirm("Remove this item?")) return;

        p.videos = p.videos.filter(v => v.videoId !== videoId);
        await savePlaylistsForUser(state.user.username, state.playlists);
        renderAll();
    };

    async function createPlaylist(name) {
        const trimmed = name.trim();
        if (trimmed.length < 1) return { ok: false, message: "Name required" };

        const newPl = {
            id: uid(),
            name: trimmed,
            createdAt: Date.now(),
            videos: []
        };
        state.playlists.unshift(newPl);
        state.activePlaylistId = newPl.id;

        await savePlaylistsForUser(state.user.username, state.playlists);
        return { ok: true };
    }

    async function deletePlaylist() {
        if (!state.activePlaylistId) return;
        if (!confirm("Delete this playlist?")) return;

        state.playlists = state.playlists.filter(p => String(p.id) !== String(state.activePlaylistId));
        state.activePlaylistId = null;
        setQueryParam("playlistId", null);

        await savePlaylistsForUser(state.user.username, state.playlists);
        renderAll();
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

        qs("#btnDeletePlaylist").addEventListener("click", deletePlaylist);

        qs("#createPlaylistForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const err = qs("#createPlaylistError");
            err.classList.add("d-none");
            const nameInput = qs("#newPlaylistName");
            const res = await createPlaylist(nameInput.value);

            if (!res.ok) {
                err.textContent = res.message;
                err.classList.remove("d-none");
            } else {
                nameInput.value = "";
                bootstrap.Modal.getInstance(qs("#createPlaylistModal")).hide();
                renderAll();
            }
        });

        // MP3 Upload
        qs("#btnUploadMp3").addEventListener("click", async () => {
            const fileInput = qs("#mp3Input");
            const file = fileInput.files[0];
            if (!file) return alert("Select a file first");
            if (!state.activePlaylistId) return alert("Select a playlist first");

            try {
                const result = await uploadMp3(file);

                const mp3Video = {
                    videoId: "local_" + Date.now(),
                    title: result.originalName.replace(".mp3", ""),
                    thumbnail: "",
                    duration: "MP3",
                    isLocal: true,
                    filePath: result.filePath,
                    addedAt: Date.now()
                };

                const pl = state.playlists.find(p => String(p.id) === String(state.activePlaylistId));
                if (pl) {
                    if (!pl.videos) pl.videos = [];
                    pl.videos.push(mp3Video);
                    await savePlaylistsForUser(state.user.username, state.playlists);
                    renderAll();
                    alert("Uploaded!");
                    fileInput.value = "";
                }
            } catch (err) {
                alert("Upload failed");
                console.error(err);
            }
        });
    }

    // ---------- Init ----------
    async function init() {
        const user = requireAuth();
        if (!user) return;
        state.user = user;
        renderNavUser(user);

        // Load
        state.playlists = await loadPlaylistsForUser(user.username);

        // Recover Active ID
        const reqId = getQueryParam("playlistId");
        if (reqId && state.playlists.some(p => String(p.id) === String(reqId))) {
            state.activePlaylistId = reqId;
        } else if (state.playlists.length > 0) {
            state.activePlaylistId = state.playlists[0].id;
            setQueryParam("playlistId", state.activePlaylistId);
        }

        bindEvents();
        renderAll();
    }

    document.addEventListener("DOMContentLoaded", init);
})();