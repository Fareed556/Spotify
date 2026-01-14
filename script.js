/* =====================================================
   1. CONFIGURATION & AUTH STATE
   ===================================================== */
const ITUNES_API = "https://itunes.apple.com/search";
const YOUTUBE_API = "https://www.youtube.com/results?search_query=";
let currentUser = JSON.parse(localStorage.getItem('spotify_user')) || null;
let currentQueue = [];
let currentIndex = 0;
let recentlyPlayed = JSON.parse(localStorage.getItem('recently_played')) || [];
let currentTrack = null;
let youtubePlayer = null;

// Performance optimizations: Cache
const apiCache = new Map();
const youtubeCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let searchDebounceTimer = null;

// Check authentication on page load
if (!currentUser && window.location.pathname.includes('main.htm')) {
    window.location.href = 'login.html';
}

// DOM Elements
const homeView = document.getElementById("homeView");
const searchView = document.getElementById("searchView");
const libraryView = document.getElementById("libraryView");
const albumView = document.getElementById("albumView");
const artistView = document.getElementById("artistView");
const audio = document.getElementById("audio");
const playBtn = document.getElementById("playBtn");
const searchInput = document.getElementById("searchInput");

/* =====================================================
   2. AUTHENTICATION UI & LOGOUT
   ===================================================== */
function updateAuthUI() {
    const authBtn = document.getElementById("authBtn");
    const userDisplay = document.getElementById("userDisplay");
    const registerBtn = document.querySelector(".register-btn");
    
    if (currentUser) {
        userDisplay.style.display = "block";
        userDisplay.textContent = `👤 ${currentUser.username}`;
        if (authBtn) {
            authBtn.textContent = "Log out";
            authBtn.onclick = handleLogout;
        }
        if (registerBtn) {
            registerBtn.style.display = "none";
        }
    } else {
        if (userDisplay) userDisplay.style.display = "none";
        if (authBtn) {
            authBtn.textContent = "Log in";
            authBtn.onclick = () => { window.location.href = 'login.html'; };
        }
        if (registerBtn) {
            registerBtn.style.display = "block";
        }
    }
}

function handleLogout() {
    if (confirm(`Log out as ${currentUser.username}?`)) {
        localStorage.removeItem('spotify_user');
        window.location.href = 'login.html';
    }
}

if (document.getElementById("authBtn")) {
    updateAuthUI();
}

/* =====================================================
   3. NAVIGATION SYSTEM
   ===================================================== */
function switchView(viewName) {
    // Hide all views
    [homeView, searchView, libraryView, albumView, artistView].forEach(v => {
        if (v) v.classList.remove("active");
    });
    
    // Show selected view
    switch(viewName) {
        case "home":
            if (homeView) homeView.classList.add("active");
            break;
        case "search":
            if (searchView) {
                searchView.classList.add("active");
                loadSearchCategories();
            }
            break;
        case "library":
            if (libraryView) {
                libraryView.classList.add("active");
                loadLibrary();
            }
            break;
    }
}

document.querySelectorAll(".nav-item").forEach(item => {
    item.onclick = () => {
        document.querySelector(".nav-item.active")?.classList.remove("active");
        item.classList.add("active");
        switchView(item.dataset.view);
    };
});

/* =====================================================
   4. CORE MUSIC ENGINE (OPTIMIZED WITH CACHE)
   ===================================================== */
async function fetchSpotifyContent(term, containerId, isAlbum = false, isArtist = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const entity = isAlbum ? 'album' : 'song'; // Always use song/album for images
    const cacheKey = `${term}_${isArtist ? 'artist' : entity}`;
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        if (isArtist) {
            renderArtistGrid(container, cached.data);
        } else {
            renderSpotifyGrid(container, cached.data, isAlbum);
        }
        return;
    }
    
    try {
        // For artists, fetch songs to get artwork images
        const response = await fetch(`${ITUNES_API}?term=${encodeURIComponent(term)}&entity=${entity}&limit=${isArtist ? 20 : 6}`);
        const data = await response.json();
        
        if (isArtist && data.results) {
            // Group songs by artist and create artist objects with images
            const artistMap = new Map();
            data.results.forEach(track => {
                if (track.artistName && !artistMap.has(track.artistName)) {
                    artistMap.set(track.artistName, {
                        artistName: track.artistName,
                        artworkUrl100: track.artworkUrl100 || track.artworkUrl60
                    });
                }
            });
            const artistData = Array.from(artistMap.values()).slice(0, 8);
            apiCache.set(cacheKey, { data: artistData, timestamp: Date.now() });
            renderArtistGrid(container, artistData);
        } else {
            // Cache the result
            apiCache.set(cacheKey, { data: data.results, timestamp: Date.now() });
        renderSpotifyGrid(container, data.results, isAlbum);
        }
    } catch (err) {
        console.error("Fetch error", err);
    }
}

function renderSpotifyGrid(container, items, isAlbum) {
    if (!container) return;
    
    if (!items || items.length === 0) {
        container.innerHTML = "<p style='color: #b3b3b3; padding: 20px; text-align: center;'>No results found</p>";
        return;
    }
    
    // Use document fragment for faster DOM updates
    const fragment = document.createDocumentFragment();
    
    items.forEach(item => {
        if (!item) return; // Skip null/undefined items
        
        const card = document.createElement("div");
        card.className = "card";
        const img = (item.artworkUrl100 || item.artworkUrl60 || "").replace("100x100", "500x500").replace("60x60", "500x500") || "https://via.placeholder.com/500/1db954/ffffff?text=Music";
        const title = item.trackName || item.collectionName || "Unknown";
        const sub = item.artistName || "Unknown Artist";

        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${img}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/500/1db954/ffffff?text=Music'">
                <div class="play-overlay">▶</div>
            </div>
            <h4>${title}</h4>
            <p>${sub}</p>
        `;
        
        // Ensure click handler works properly
        if (isAlbum && item.collectionId) {
            card.onclick = () => loadAlbum(item.collectionId, img, title, sub);
        } else if (!isAlbum && (item.previewUrl || item.trackName)) {
            card.onclick = () => playTrack(item);
        }
        
        fragment.appendChild(card);
    });
    
    container.innerHTML = "";
    container.appendChild(fragment);
}

function renderArtistGrid(container, items) {
    if (!container || !items) return;
    
    const fragment = document.createDocumentFragment();
    
    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "card artist-card";
        
        // Get image URL - try artworkUrl100 first, then artworkUrl60, then placeholder
        let img = item.artworkUrl100 || item.artworkUrl60 || "";
        if (img) {
            img = img.replace("100x100", "500x500").replace("60x60", "500x500");
        } else {
            img = "https://via.placeholder.com/500/1db954/ffffff?text=" + encodeURIComponent(item.artistName || "Artist");
        }
        
        const name = item.artistName || "Unknown Artist";

        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${img}" alt="${name}" loading="lazy" onerror="this.src='https://via.placeholder.com/500/1db954/ffffff?text=${encodeURIComponent(name)}'">
                <div class="play-overlay">▶</div>
            </div>
            <h4>${name}</h4>
            <p>Artist</p>
        `;
        card.onclick = () => loadArtist(name);
        fragment.appendChild(card);
    });
    
    container.innerHTML = "";
    container.appendChild(fragment);
}

/* =====================================================
   5. QUICK ACCESS (Home Page) - ENHANCED WITH PROPER HANDLING
   ===================================================== */
async function loadQuickAccess() {
    const container = document.getElementById("quickAccess");
    if (!container) return;
    
    container.innerHTML = "";
    const fragment = document.createDocumentFragment();
    
    // Handle "Recently Played" specially
    if (recentlyPlayed.length > 0) {
        const firstTrack = recentlyPlayed[0];
        const img = firstTrack.artworkUrl100?.replace("100x100", "500x500") || firstTrack.artworkUrl60?.replace("60x60", "500x500") || "https://via.placeholder.com/500/1db954/ffffff?text=Recently+Played";
        
        const quickItem = document.createElement("div");
        quickItem.className = "quick-access-item";
        quickItem.innerHTML = `
            <img src="${img}" alt="Recently Played" loading="lazy">
            <div class="quick-access-item-info">
                <h3>Recently Played</h3>
                <p>Playlist</p>
            </div>
        `;
        quickItem.onclick = () => {
            // Show recently played songs
            renderRecentlyPlayed();
            // Scroll to recently played section
            const section = document.getElementById("recentlyPlayedRow")?.closest('.section');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
        fragment.appendChild(quickItem);
    }
    
    // Load other quick access items
    const quickItems = [
        { term: "Coke Studio", type: "playlist", searchTerm: "Coke Studio Pakistan" },
        { term: "Atif Aslam", type: "artist" },
        { term: "Liked Songs", type: "playlist", searchTerm: "Popular Songs" }
    ];
    
    // Load all items in parallel
    const promises = quickItems.map(item => {
        const searchTerm = item.searchTerm || item.term;
        return fetch(`${ITUNES_API}?term=${encodeURIComponent(searchTerm)}&entity=song&limit=1`)
            .then(res => res.json())
            .then(data => ({ item, data }))
            .catch(err => {
                console.error(`Error loading ${item.term}:`, err);
                return { item, data: null };
            });
    });
    
    const results = await Promise.all(promises);
    
    results.forEach(({ item, data }) => {
        if (data?.results && data.results.length > 0) {
            const track = data.results[0];
            const img = track.artworkUrl100?.replace("100x100", "500x500") || track.artworkUrl60?.replace("60x60", "500x500") || "https://via.placeholder.com/500/1db954/ffffff?text=" + encodeURIComponent(item.term);
            
            const quickItem = document.createElement("div");
            quickItem.className = "quick-access-item";
            quickItem.innerHTML = `
                <img src="${img}" alt="${item.term}" loading="lazy" onerror="this.src='https://via.placeholder.com/500/1db954/ffffff?text=${encodeURIComponent(item.term)}'">
                <div class="quick-access-item-info">
                    <h3>${item.term}</h3>
                    <p>${item.type === 'artist' ? 'Artist' : 'Playlist'}</p>
                </div>
            `;
            quickItem.onclick = () => {
                if (item.type === 'artist') {
                    loadArtist(item.term);
                } else {
                    // For playlists like Coke Studio, load multiple songs
                    const searchTerm = item.searchTerm || item.term;
                    fetchSpotifyContent(searchTerm, "recentlyPlayedRow", false);
                    // Scroll to the section
                    setTimeout(() => {
                        const section = document.getElementById("recentlyPlayedRow")?.closest('.section');
                        if (section) {
                            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 500);
                }
            };
            fragment.appendChild(quickItem);
        } else {
            // Show placeholder even if API fails
            const quickItem = document.createElement("div");
            quickItem.className = "quick-access-item";
            quickItem.innerHTML = `
                <img src="https://via.placeholder.com/500/1db954/ffffff?text=${encodeURIComponent(item.term)}" alt="${item.term}" loading="lazy">
                <div class="quick-access-item-info">
                    <h3>${item.term}</h3>
                    <p>${item.type === 'artist' ? 'Artist' : 'Playlist'}</p>
                </div>
            `;
            quickItem.onclick = () => {
                if (item.type === 'artist') {
                    loadArtist(item.term);
                } else {
                    const searchTerm = item.searchTerm || item.term;
                    fetchSpotifyContent(searchTerm, "recentlyPlayedRow", false);
                }
            };
            fragment.appendChild(quickItem);
        }
    });
    
    container.appendChild(fragment);
}

/* =====================================================
   6. HOME PAGE SECTIONS - OPTIMIZED WITH PARALLEL LOADING
   ===================================================== */
function loadHomePage() {
    // Always render recently played if available, otherwise load popular songs
    if (recentlyPlayed && recentlyPlayed.length > 0) {
        renderRecentlyPlayed();
    } else {
        // Load popular songs for recently played section
        fetchSpotifyContent("Ed Sheeran", "recentlyPlayedRow", false).catch(err => {
            console.error("Error loading recently played:", err);
            // Fallback
            fetchSpotifyContent("Popular Songs", "recentlyPlayedRow", false);
        });
    }
    
    // Load all other sections simultaneously with better search terms and error handling
    Promise.all([
        fetchSpotifyContent("Taylor Swift", "madeForYouRow", false).catch(() => {
            fetchSpotifyContent("Popular Music", "madeForYouRow", false);
        }),
        fetchSpotifyContent("The Weeknd", "artistsRow", false, true).catch(() => {
            fetchSpotifyContent("Popular Artists", "artistsRow", false, true);
        }),
        fetchSpotifyContent("Billie Eilish", "chartsRow", false).catch(() => {
            fetchSpotifyContent("Top Songs", "chartsRow", false);
        }),
        fetchSpotifyContent("Dua Lipa", "newReleasesRow", false).catch(() => {
            fetchSpotifyContent("New Music", "newReleasesRow", false);
        }),
        fetchSpotifyContent("Drake", "albumsRow", true).catch(() => {
            fetchSpotifyContent("Popular Albums", "albumsRow", true);
        })
    ]);
}

function renderRecentlyPlayed() {
    const container = document.getElementById("recentlyPlayedRow");
    if (!container) return;
    
    if (!recentlyPlayed || recentlyPlayed.length === 0) {
        container.innerHTML = "<p style='color: #b3b3b3; padding: 20px; text-align: center;'>No recently played songs</p>";
        return;
    }
    
    const fragment = document.createDocumentFragment();
    recentlyPlayed.slice(0, 6).forEach((item, index) => {
        if (!item) return;
        
        const card = document.createElement("div");
        card.className = "card";
        const img = item.artworkUrl100?.replace("100x100", "500x500") || 
                   item.artworkUrl60?.replace("60x60", "500x500") || 
                   "https://via.placeholder.com/500/1db954/ffffff?text=Music";
        
        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${img}" alt="${item.trackName || 'Track'}" loading="lazy" onerror="this.src='https://via.placeholder.com/500/1db954/ffffff?text=Music'">
                <div class="play-overlay">▶</div>
            </div>
            <h4>${item.trackName || 'Unknown Track'}</h4>
            <p>${item.artistName || 'Unknown Artist'}</p>
        `;
        card.onclick = () => {
            // Set queue to recently played songs
            currentQueue = recentlyPlayed.slice(0, 6);
            currentIndex = index;
            playTrack(item, index);
        };
        fragment.appendChild(card);
    });
    
    container.innerHTML = "";
    container.appendChild(fragment);
}

/* =====================================================
   7. SEARCH FUNCTIONALITY
   ===================================================== */
function loadSearchCategories() {
    const container = document.getElementById("searchCategories");
    if (!container) return;
    
    const categories = [
        { name: "Pop", color: "#8D67AB" },
        { name: "Rock", color: "#E8115B" },
        { name: "Hip-Hop", color: "#148A08" },
        { name: "Jazz", color: "#BA5D07" },
        { name: "Classical", color: "#E13300" },
        { name: "Electronic", color: "#1E3264" }
    ];
    
    container.innerHTML = "";
    categories.forEach(cat => {
        const card = document.createElement("div");
        card.className = "category-card";
        card.style.background = `linear-gradient(135deg, ${cat.color} 0%, ${cat.color}dd 100%)`;
        card.innerHTML = `<h3>${cat.name}</h3>`;
        card.onclick = () => {
            searchInput.value = cat.name;
            performSearch(cat.name);
        };
        container.appendChild(card);
    });
}

function performSearch(term) {
    if (!term) return;
    
    const searchResults = document.getElementById("searchResults");
    const searchCategories = document.getElementById("searchCategories");
    
    if (searchCategories) searchCategories.style.display = "none";
    if (searchResults) {
        searchResults.classList.add("active");
        searchResults.style.display = "block";
    }
    
    // Load all search results in parallel for faster response
    Promise.all([
        // Top result
        fetch(`${ITUNES_API}?term=${encodeURIComponent(term)}&entity=song&limit=1`)
            .then(res => res.json())
            .then(data => {
                if (data.results && data.results.length > 0) {
                    const track = data.results[0];
                    const topResult = document.getElementById("topResult");
                    if (topResult) {
                        const card = document.createElement("div");
                        card.className = "top-result-card";
                        const img = track.artworkUrl100?.replace("100x100", "500x500") || track.artworkUrl60?.replace("60x60", "500x500") || "https://via.placeholder.com/500/1db954/ffffff?text=" + encodeURIComponent(track.artistName);
                        card.innerHTML = `
                            <img src="${img}" alt="${track.artistName}" loading="lazy" onerror="this.src='https://via.placeholder.com/500/1db954/ffffff?text=${encodeURIComponent(track.artistName)}'">
                            <h3>${track.artistName}</h3>
                            <p>Artist</p>
                        `;
                        card.onclick = () => loadArtist(track.artistName);
                        topResult.innerHTML = "";
                        topResult.appendChild(card);
                    }
                }
            }),
        // Songs
        fetch(`${ITUNES_API}?term=${encodeURIComponent(term)}&entity=song&limit=10`)
            .then(res => res.json())
            .then(data => {
                const container = document.getElementById("searchSongs");
                if (container) {
                    const fragment = document.createDocumentFragment();
                    data.results?.forEach(track => {
                        const songItem = document.createElement("div");
                        songItem.className = "song-item";
                        songItem.innerHTML = `
                            <img src="${track.artworkUrl60}" alt="${track.trackName}" loading="lazy">
                            <div class="song-item-info">
                                <h4>${track.trackName}</h4>
                                <p>${track.artistName}</p>
                            </div>
                            <span class="song-item-duration">${formatTime(track.trackTimeMillis/1000)}</span>
                        `;
                        songItem.onclick = () => {
                            // Reset queue when clicking from search
                            currentQueue = [];
                            playTrack(track);
                        };
                        fragment.appendChild(songItem);
                    });
                    container.innerHTML = "";
                    container.appendChild(fragment);
                }
            }),
        // Artists and Albums (already optimized with cache)
        fetchSpotifyContent(term, "searchArtists", false, true),
        fetchSpotifyContent(term, "searchAlbums", true)
    ]);
}

// Debounced search for better performance
searchInput?.addEventListener("input", (e) => {
    clearTimeout(searchDebounceTimer);
    const term = e.target.value.trim();
    
    if (term.length > 2) {
        searchDebounceTimer = setTimeout(() => {
            switchView("search");
            performSearch(term);
        }, 300); // 300ms debounce
    }
});

searchInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && e.target.value.trim()) {
        clearTimeout(searchDebounceTimer);
        switchView("search");
        performSearch(e.target.value.trim());
    }
});

/* =====================================================
   8. LIBRARY FUNCTIONALITY
   ===================================================== */
function loadLibrary() {
    const container = document.getElementById("libraryGrid");
    if (!container) return;
    
    container.innerHTML = "";
    
    // Load saved playlists, artists, albums from localStorage
    const savedData = JSON.parse(localStorage.getItem('library_data')) || {
        playlists: ["Liked Songs", "My Playlist #1"],
        artists: [],
        albums: []
    };
    
    savedData.playlists.forEach(playlist => {
        const item = document.createElement("div");
        item.className = "library-item";
        item.innerHTML = `
            <img src="https://via.placeholder.com/64" alt="${playlist}">
            <div class="library-item-info">
                <h3>${playlist}</h3>
                <p>Playlist</p>
            </div>
        `;
        container.appendChild(item);
    });
}

document.querySelectorAll(".filter-btn")?.forEach(btn => {
    btn.onclick = () => {
        document.querySelector(".filter-btn.active")?.classList.remove("active");
        btn.classList.add("active");
        loadLibrary();
    };
});

/* =====================================================
   9. ALBUM VIEW
   ===================================================== */
async function loadAlbum(id, cover, title, artist) {
    switchView("album");
    if (albumView) albumView.classList.add("active");
    
    document.getElementById("albumCover").src = cover;
    document.getElementById("albumTitle").textContent = title;
    document.getElementById("albumDesc").textContent = artist;
    document.getElementById("albumOwner").textContent = artist;

    const res = await fetch(`${ITUNES_API}?id=${id}&entity=song`);
    const data = await res.json();
    currentQueue = data.results || [];
    currentIndex = 0;
    
    // Update album stats with actual data
    const releaseDate = currentQueue[0]?.releaseDate ? new Date(currentQueue[0].releaseDate).getFullYear() : new Date().getFullYear();
    document.getElementById("albumStats").textContent = `${releaseDate} • ${currentQueue.length} ${currentQueue.length === 1 ? 'song' : 'songs'}`;
    
    const trackList = document.getElementById("trackList");
    const fragment = document.createDocumentFragment();
    currentQueue.forEach((track, i) => {
        const row = document.createElement("div");
        row.className = "track-row";
        row.innerHTML = `
            <span>${i + 1}</span>
            <div class="t-details">
                <div class="t-name">${track.trackName}</div>
                <div class="t-artist">${track.artistName}</div>
            </div>
            <span>${formatTime(track.trackTimeMillis/1000)}</span>
        `;
        row.onclick = () => { 
            currentIndex = i; 
            playTrack(track, i); 
        };
        fragment.appendChild(row);
    });
    trackList.innerHTML = "";
    trackList.appendChild(fragment);
    
    document.getElementById("playAlbumBtn").onclick = () => {
        if (currentQueue.length > 0) {
            currentIndex = 0;
            playTrack(currentQueue[0]);
        }
    };
}

/* =====================================================
   10. ARTIST VIEW
   ===================================================== */
async function loadArtist(artistName) {
    switchView("artist");
    if (artistView) artistView.classList.add("active");
    
    document.getElementById("artistName").textContent = artistName;
    document.getElementById("artistFollowers").textContent = `${Math.floor(Math.random() * 5000000 + 1000000).toLocaleString()} monthly listeners`;
    
    // Fetch artist data and albums in parallel for faster loading
    const [songsResponse, albumsResponse] = await Promise.all([
        fetch(`${ITUNES_API}?term=${encodeURIComponent(artistName)}&entity=song&limit=20`),
        fetch(`${ITUNES_API}?term=${encodeURIComponent(artistName)}&entity=album&limit=6`)
    ]);
    
    const [songsData, albumsData] = await Promise.all([
        songsResponse.json(),
        albumsResponse.json()
    ]);
    
    if (songsData.results && songsData.results.length > 0) {
        const firstTrack = songsData.results[0];
        document.getElementById("artistImage").src = firstTrack.artworkUrl100?.replace("100x100", "500x500") || "https://via.placeholder.com/500";
        
        // Popular songs - optimized with fragment
        const popularContainer = document.getElementById("artistPopular");
        const fragment = document.createDocumentFragment();
        songsData.results.slice(0, 5).forEach((track, i) => {
            const songItem = document.createElement("div");
            songItem.className = "song-item";
            songItem.innerHTML = `
                <img src="${track.artworkUrl60}" alt="${track.trackName}" loading="lazy">
                <div class="song-item-info">
                    <h4>${track.trackName}</h4>
                    <p>${track.collectionName || 'Single'}</p>
                </div>
                <span class="song-item-duration">${formatTime(track.trackTimeMillis/1000)}</span>
            `;
            songItem.onclick = () => {
                // Set queue to artist's songs when clicking from artist page
                if (currentQueue.length === 0 || currentQueue[0]?.artistName !== track.artistName) {
                    currentQueue = songsData.results;
                    currentIndex = i;
                } else {
                    currentIndex = i;
                }
                playTrack(track, i);
            };
            fragment.appendChild(songItem);
        });
        popularContainer.innerHTML = "";
        popularContainer.appendChild(fragment);
        
        // Set queue for artist page
        currentQueue = songsData.results;
        
        // Albums
        renderSpotifyGrid(document.getElementById("artistAlbums"), albumsData.results, true);
    }
    
    document.getElementById("playArtistBtn").onclick = () => {
        if (songsData.results && songsData.results.length > 0) {
            playTrack(songsData.results[0]);
        }
    };
}

/* =====================================================
   11. PLAYER LOGIC - FULL SONG SUPPORT
   ===================================================== */
async function getFullSongUrl(track) {
    if (!track) return null;
    
    const searchQuery = `${track.trackName} ${track.artistName}`;
    const cacheKey = `full_${searchQuery}`;
    
    // Check cache
    if (youtubeCache.has(cacheKey)) {
        return youtubeCache.get(cacheKey);
    }
    
    try {
        // Try multiple methods to get YouTube video
        // Method 1: Try YouTube via proxy with multiple search variations
        const searchVariations = [
            `${track.trackName} ${track.artistName} official audio`,
            `${track.trackName} ${track.artistName} official`,
            `${track.artistName} ${track.trackName}`,
            `${track.trackName} ${track.artistName}`
        ];
        
        for (const searchTerm of searchVariations) {
            try {
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`)}`;
                
                const response = await fetch(proxyUrl, { 
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (!response.ok) continue;
                
                const data = await response.json();
                
                if (data.contents) {
                    // Try multiple regex patterns to find video ID
                    const patterns = [
                        /"videoId":"([a-zA-Z0-9_-]{11})"/,
                        /watch\?v=([a-zA-Z0-9_-]{11})/,
                        /\/embed\/([a-zA-Z0-9_-]{11})/,
                        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
                    ];
                    
                    for (const pattern of patterns) {
                        const match = data.contents.match(pattern);
                        if (match && match[1]) {
                            const videoId = match[1];
                            youtubeCache.set(cacheKey, { type: 'youtube', videoId: videoId });
                            return { type: 'youtube', videoId: videoId };
                        }
                    }
                }
            } catch (err) {
                continue; // Try next search variation
            }
        }
    } catch (err) {
        console.log("YouTube search failed, using preview");
    }
    
    // Fallback to preview
    return { type: 'preview', url: track.previewUrl };
}

async function playTrack(track, queueIndex = null) {
    if (!track) {
        showNotification("Track not available");
        return;
    }
    
    // Validate track has playable content
    if (!track.previewUrl && !track.trackName) {
        showNotification("This track cannot be played");
        return;
    }
    
    // Update queue index if provided
    if (queueIndex !== null) {
        currentIndex = queueIndex;
    }
    
    // If queue is empty, create a queue with this track and similar songs
    if (currentQueue.length === 0) {
        currentQueue = [track];
        currentIndex = 0;
        // Try to get more songs by the same artist
        try {
            const response = await fetch(`${ITUNES_API}?term=${encodeURIComponent(track.artistName)}&entity=song&limit=10`);
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                // Add similar songs to queue
                currentQueue = data.results;
                currentIndex = currentQueue.findIndex(t => t.trackId === track.trackId || t.trackName === track.trackName);
                if (currentIndex === -1) currentIndex = 0;
            }
        } catch (err) {
            console.log("Could not load similar songs");
        }
    }
    
    currentTrack = track;
    
    // Stop any current playback
    audio.pause();
    stopYouTubePlayer();
    
    // Update UI immediately
    playBtn.textContent = "⏸";
    const playerCover = document.getElementById("playerCover");
    const playerTitle = document.getElementById("playerTitle");
    const playerArtist = document.getElementById("playerArtist");
    
    if (playerCover) playerCover.src = track.artworkUrl100 || track.artworkUrl60 || "https://via.placeholder.com/60/1db954/ffffff?text=Music";
    if (playerTitle) playerTitle.textContent = track.trackName || "Unknown Track";
    if (playerArtist) playerArtist.textContent = track.artistName || "Unknown Artist";
    
    // Try to get full song immediately
    showNotification("Loading full version...");
    const audioSource = await getFullSongUrl(track);
    
    if (audioSource && audioSource.type === 'youtube') {
        // Load YouTube player for full song
        loadYouTubePlayer(audioSource.videoId);
        showNotification("Playing full version!");
    } else {
        // Use preview URL but continue searching for full version in background
        const previewUrl = audioSource?.url || track.previewUrl;
        
        if (previewUrl) {
            audio.src = previewUrl;
            audio.load();
            
            // Try to get full version in background
            getFullSongUrl(track).then(fullSource => {
                if (fullSource && fullSource.type === 'youtube' && currentTrack === track) {
                    // Switch to full version if still playing same track
                    stopYouTubePlayer();
                    loadYouTubePlayer(fullSource.videoId);
                    showNotification("Switched to full version!");
                }
            });
            
            // Enhanced preview handling
            audio.onended = () => {
                // Auto-play next track if available
                if (currentQueue.length > 0 && currentIndex < currentQueue.length - 1) {
                    currentIndex++;
                    playTrack(currentQueue[currentIndex]);
                } else if (currentQueue.length > 0 && currentIndex >= currentQueue.length - 1) {
                    // Loop back to start
                    currentIndex = 0;
                    playTrack(currentQueue[0]);
                } else {
                    playBtn.textContent = "▶";
                    showNotification("Preview ended. Searching for full version...");
                    // Try to get full version one more time
                    setTimeout(() => {
                        getFullSongUrl(track).then(fullSource => {
                            if (fullSource && fullSource.type === 'youtube') {
                                loadYouTubePlayer(fullSource.videoId);
                                showNotification("Playing full version!");
                            } else {
                                showNotification("Full version not available");
                            }
                        });
                    }, 500);
                }
            };
            
            audio.play().catch(err => {
                console.error("Playback error:", err);
                playBtn.textContent = "▶";
                showNotification("Error playing track. Please try another song.");
            });
        } else {
            showNotification("This track is not available for playback");
            playBtn.textContent = "▶";
        }
    }
    
    // Add to recently played
    setTimeout(() => {
        const existingIndex = recentlyPlayed.findIndex(t => t.trackId === track.trackId);
        if (existingIndex > -1) {
            recentlyPlayed.splice(existingIndex, 1);
        }
        recentlyPlayed.unshift(track);
        recentlyPlayed = recentlyPlayed.slice(0, 50);
        localStorage.setItem('recently_played', JSON.stringify(recentlyPlayed));
    }, 0);
}

let currentYoutubeIframe = null;

function loadYouTubePlayer(videoId) {
    // Stop audio player
    audio.pause();
    audio.src = '';
    
    const youtubeContainer = document.getElementById("youtube-player");
    if (!youtubeContainer) return;
    
    // Remove existing iframe
    if (currentYoutubeIframe) {
        currentYoutubeIframe.remove();
    }
    
    // Create new iframe
    const iframe = document.createElement("iframe");
    iframe.id = "ytplayer";
    iframe.width = "0";
    iframe.height = "0";
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&modestbranding=1&rel=0&enablejsapi=1&loop=0&playlist=${videoId}`;
    iframe.frameBorder = "0";
    iframe.allow = "autoplay; encrypted-media";
    iframe.style.cssText = "position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none;";
    
    youtubeContainer.appendChild(iframe);
    currentYoutubeIframe = iframe;
    
    // Update play/pause to control YouTube
    const originalOnClick = playBtn.onclick;
    playBtn.onclick = () => {
        if (currentYoutubeIframe && currentYoutubeIframe.contentWindow) {
            currentYoutubeIframe.contentWindow.postMessage('{"event":"command","func":"' + (playBtn.textContent === "⏸" ? "pauseVideo" : "playVideo") + '","args":""}', '*');
            playBtn.textContent = playBtn.textContent === "⏸" ? "▶" : "⏸";
        }
    };
}

function stopYouTubePlayer() {
    if (currentYoutubeIframe) {
        if (currentYoutubeIframe.contentWindow) {
            currentYoutubeIframe.contentWindow.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
        }
        currentYoutubeIframe.remove();
        currentYoutubeIframe = null;
    }
}

function showNotification(message) {
    // Remove existing notification
    const existing = document.querySelector('.spotify-notification');
    if (existing) existing.remove();
    
    // Create notification element
    const notification = document.createElement("div");
    notification.className = "spotify-notification";
    notification.style.cssText = "position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: #1db954; color: white; padding: 12px 24px; border-radius: 8px; z-index: 10000; font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: slideUp 0.3s ease;";
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = "slideDown 0.3s ease";
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Enhanced play/pause button
playBtn.onclick = () => {
    // Check if YouTube player is active
    if (currentYoutubeIframe) {
        if (playBtn.textContent === "⏸") {
            currentYoutubeIframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            playBtn.textContent = "▶";
        } else {
            currentYoutubeIframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            playBtn.textContent = "⏸";
        }
    } else {
        // Use regular audio player
        if (audio.paused) { 
            audio.play(); 
            playBtn.textContent = "⏸"; 
        } else { 
            audio.pause(); 
            playBtn.textContent = "▶"; 
        }
    }
};

document.getElementById("prevBtn").onclick = () => {
    // Stop current playback first
    audio.pause();
    stopYouTubePlayer();
    
    if (currentQueue.length > 0) {
        if (currentIndex > 0) {
            currentIndex--;
        } else {
            // Loop to end
            currentIndex = currentQueue.length - 1;
        }
        playTrack(currentQueue[currentIndex], currentIndex);
    } else {
        showNotification("No previous track");
    }
};

document.getElementById("nextBtn").onclick = () => {
    // Stop current playback first
    audio.pause();
    stopYouTubePlayer();
    
    if (currentQueue.length > 0) {
        if (currentIndex < currentQueue.length - 1) {
            currentIndex++;
        } else {
            // Loop to start
            currentIndex = 0;
        }
        playTrack(currentQueue[currentIndex], currentIndex);
    } else {
        showNotification("No next track");
    }
};

// Enhanced time update for both audio and YouTube
function updateProgress() {
    if (currentYoutubeIframe) {
        // For YouTube, we can't easily get current time without API
        // So we'll show the full duration
        const duration = currentTrack?.trackTimeMillis ? currentTrack.trackTimeMillis / 1000 : 0;
        document.getElementById("currentTime").textContent = "0:00";
        document.getElementById("duration").textContent = formatTime(duration);
        document.getElementById("progressBar").value = 0;
    } else {
    const prog = (audio.currentTime / audio.duration) * 100;
    document.getElementById("progressBar").value = prog || 0;
    document.getElementById("currentTime").textContent = formatTime(audio.currentTime);
        document.getElementById("duration").textContent = formatTime(audio.duration || (currentTrack?.trackTimeMillis ? currentTrack.trackTimeMillis / 1000 : 0));
    }
}

audio.ontimeupdate = updateProgress;

// Update progress every second for YouTube
setInterval(updateProgress, 1000);

document.getElementById("progressBar").oninput = (e) => {
    audio.currentTime = (e.target.value / 100) * audio.duration;
};

document.getElementById("volumeBar").oninput = (e) => { 
    audio.volume = e.target.value / 100; 
};

/* =====================================================
   12. UTILS & INITIAL LOAD
   ===================================================== */
function formatTime(s) {
    if (!s) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
}

/* =====================================================
   13. TIME-BASED GREETING
   ===================================================== */
function updateGreeting() {
    const greetingEl = document.querySelector(".greeting");
    if (!greetingEl) return;
    
    const hour = new Date().getHours();
    let greeting;
    
    if (hour >= 5 && hour < 12) {
        greeting = "Good morning";
    } else if (hour >= 12 && hour < 17) {
        greeting = "Good afternoon";
    } else if (hour >= 17 && hour < 21) {
        greeting = "Good evening";
    } else {
        greeting = "Good night";
    }
    
    greetingEl.textContent = greeting;
}

// Update greeting on page load and every minute
updateGreeting();
setInterval(updateGreeting, 60000);

// Initialize on page load
if (homeView) {
    loadHomePage();
    loadQuickAccess();
}
