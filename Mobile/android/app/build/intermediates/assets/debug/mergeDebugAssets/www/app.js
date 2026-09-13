// --- SoundSphere Android Dedicated Mobile Engine ---

const state = {
  tracks: [],
  filteredTracks: [],
  playlists: JSON.parse(localStorage.getItem('soundsphere_playlists') || '[]'),
  favorites: new Set(JSON.parse(localStorage.getItem('soundsphere_favs') || '[]')),
  queue: [],
  queueIndex: -1,
  selectedTrack: null,
  parsedLyrics: [],
  shuffle: false,
  repeat: 'off', // 'off' | 'all' | 'one'
  currentTab: 'songs',
  activeSourceFilter: 'all',
  searchQuery: '',
  theme: localStorage.getItem('soundsphere_theme') || 'dark_obsidian',
  plexConfig: JSON.parse(localStorage.getItem('soundsphere_plex') || '{"url":"","token":""}'),
  isLyricsManualScroll: false
};

// DOM Helper
const $ = (id) => document.getElementById(id);

const elements = {
  audioElement: $('audioElement'),
  toast: $('toast'),
  
  // Header & Search
  btnOpenSearch: $('btnOpenSearch'),
  searchContainer: $('searchContainer'),
  mobileSearchInput: $('mobileSearchInput'),
  searchInput: $('mobileSearchInput'),
  btnCloseSearch: $('btnCloseSearch'),
  btnSearchClear: $('btnCloseSearch'),
  btnSearchToggle: $('btnOpenSearch'),
  btnOpenSettings: $('btnOpenSettings'),
  filterChips: document.querySelectorAll('.chip'),
  mobileViewport: $('mobileViewport'),
  immersiveLyricsView: $('immersiveLyricsView'),
  sheetLyricsHeartBtn: $('sheetHeartBtn'),

  // Views
  tabViews: document.querySelectorAll('.tab-view'),
  viewSongs: $('viewSongs'),
  viewArtists: $('viewArtists'),
  viewArtistDetail: $('viewArtistDetail'),
  viewAlbums: $('viewAlbums'),
  viewAlbumDetail: $('viewAlbumDetail'),
  viewPlaylists: $('viewPlaylists'),
  viewPlaylistDetail: $('viewPlaylistDetail'),

  // Lists & Grids
  trackList: $('trackList'),
  artistsGrid: $('artistsGrid'),
  albumsGrid: $('albumsGrid'),
  playlistCards: $('playlistCards'),
  songsTitle: $('songsTitle'),
  songsSubTitle: $('songsSubTitle'),
  artistsSubTitle: $('artistsSubTitle'),
  albumsSubTitle: $('albumsSubTitle'),
  btnPlayAll: $('btnPlayAll'),

  // Detail View Elements
  btnBackFromArtist: $('btnBackFromArtist'),
  artistDetailImg: $('artistDetailImg'),
  artistDetailFallback: $('artistDetailFallback'),
  artistDetailName: $('artistDetailName'),
  artistDetailMeta: $('artistDetailMeta'),
  artistTrackList: $('artistTrackList'),

  btnBackFromAlbum: $('btnBackFromAlbum'),
  albumDetailImg: $('albumDetailImg'),
  albumDetailFallback: $('albumDetailFallback'),
  albumDetailTitle: $('albumDetailTitle'),
  albumDetailArtist: $('albumDetailArtist'),
  albumTrackList: $('albumTrackList'),

  btnBackFromPlaylist: $('btnBackFromPlaylist'),
  playlistDetailTitle: $('playlistDetailTitle'),
  playlistDetailMeta: $('playlistDetailMeta'),
  playlistTrackList: $('playlistTrackList'),
  btnNewPlaylist: $('btnNewPlaylist'),

  // Bottom Navigation
  navTabs: document.querySelectorAll('.nav-tab'),

  // Mini-Player
  miniPlayer: $('miniPlayer'),
  miniProgressFill: $('miniProgressFill'),
  miniCoverTrigger: $('miniCoverTrigger'),
  miniCoverImg: $('miniCoverImg'),
  miniCoverFallback: $('miniCoverFallback'),
  miniMetaTrigger: $('miniMetaTrigger'),
  miniTitle: $('miniTitle'),
  miniArtist: $('miniArtist'),
  miniHeartBtn: $('miniHeartBtn'),
  miniPlayPauseBtn: $('miniPlayPauseBtn'),
  miniPlayIcon: $('miniPlayIcon'),
  miniPauseIcon: $('miniPauseIcon'),
  miniNextBtn: $('miniNextBtn'),

  // Fullscreen Player Sheet
  playerSheet: $('playerSheet'),
  sheetAmbientBg: $('sheetAmbientBg'),
  btnClosePlayerSheet: $('btnClosePlayerSheet'),
  btnOpenQueueSheet: $('btnOpenQueueSheet'),
  sheetBody: $('sheetBody'),
  sheetTopCluster: $('sheetTopCluster'),
  sheetCoverTrigger: $('sheetCoverTrigger'),
  sheetCoverImg: $('sheetCoverImg'),
  sheetCoverFallback: $('sheetCoverFallback'),
  lyricsHintBadge: $('lyricsHintBadge'),
  sheetMetaRow: $('sheetMetaRow'),
  sheetTitle: $('sheetTitle'),
  sheetArtist: $('sheetArtist'),
  sheetHeartBtn: $('sheetHeartBtn'),

  // Separate Independent Scrollable Lyrics View
  sheetHybridLyricsContainer: $('sheetHybridLyricsContainer'),
  sheetHybridLyricsContent: $('sheetHybridLyricsContent'),
  btnSyncHybridLyrics: $('btnSyncHybridLyrics'),

  // Bottom Controls (Always fixed at bottom)
  sheetBottomCluster: $('sheetBottomCluster'),
  sheetScrubberBar: $('sheetScrubberBar'),
  sheetScrubberFill: $('sheetScrubberFill'),
  sheetCurrentTime: $('sheetCurrentTime'),
  sheetTotalDuration: $('sheetTotalDuration'),
  sheetShuffleBtn: $('sheetShuffleBtn'),
  sheetPrevBtn: $('sheetPrevBtn'),
  sheetPlayPauseBtn: $('sheetPlayPauseBtn'),
  sheetPlayIcon: $('sheetPlayIcon'),
  sheetPauseIcon: $('sheetPauseIcon'),
  sheetNextBtn: $('sheetNextBtn'),
  sheetRepeatBtn: $('sheetRepeatBtn'),
  sheetRepeatBadge: $('sheetRepeatBadge'),

  // Queue Sheet
  queueSheet: $('queueSheet'),
  btnCloseQueueSheet: $('btnCloseQueueSheet'),
  btnClearQueueBtn: $('btnClearQueueBtn'),
  queueList: $('queueList'),
  queueSubtitle: $('queueSubtitle'),
  queueNowPlayingBox: $('queueNowPlayingBox'),
  queueUpcomingCount: $('queueUpcomingCount'),

  // Settings Sheet
  settingsSheet: $('settingsSheet'),
  btnCloseSettingsSheet: $('btnCloseSettingsSheet'),
  cfgPlexUrl: $('cfgPlexUrl'),
  cfgPlexToken: $('cfgPlexToken'),
  btnConnectPlex: $('btnConnectPlex'),
  plexStatusNotice: $('plexStatusNotice'),
  btnRescanDeviceMusic: $('btnRescanDeviceMusic'),
  cfgEqPreset: $('cfgEqPreset'),
  eqSlidersBox: $('eqSlidersBox'),
  themeBtns: document.querySelectorAll('.btn-theme')
};

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDuration(sec) {
  if (isNaN(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let toastTimer;
function showToast(msg, dur = 2800) {
  if (!elements.toast) return;
  elements.toast.textContent = msg;
  elements.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), dur);
}

function hapticClick() {
  if (window.AndroidBridge && window.AndroidBridge.vibrateClick) {
    window.AndroidBridge.vibrateClick();
  }
}

// --- Theme Management ---
function applyTheme(themeName) {
  state.theme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('soundsphere_theme', themeName);
  elements.themeBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-theme') === themeName));
}

// --- Navigation & View Switching ---
function switchTab(tabName) {
  state.currentTab = tabName;
  elements.navTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabName));
  
  elements.tabViews.forEach(v => v.classList.remove('active'));
  if (tabName === 'songs') {
    elements.viewSongs.classList.add('active');
    renderTrackList();
  } else if (tabName === 'artists') {
    elements.viewArtists.classList.add('active');
    renderArtistsGrid();
  } else if (tabName === 'albums') {
    elements.viewAlbums.classList.add('active');
    renderAlbumsGrid();
  } else if (tabName === 'playlists') {
    elements.viewPlaylists.classList.add('active');
    renderPlaylists();
  }
}

function showDetailView(viewElement) {
  elements.tabViews.forEach(v => v.classList.remove('active'));
  viewElement.classList.add('active');
}

// --- Filtered Tracks Engine ---
function getFilteredTracks() {
  let list = state.tracks;

  // Source Filter
  if (state.activeSourceFilter === 'plex') {
    list = list.filter(t => t.source === 'plex' || (t.file_path && t.file_path.startsWith('plex://')));
  } else if (state.activeSourceFilter === 'local') {
    list = list.filter(t => t.source === 'local' || (t.file_path && t.file_path.startsWith('content://')));
  } else if (state.activeSourceFilter === 'favorites') {
    list = list.filter(t => state.favorites.has(t.id || t.file_path));
  }

  // Search Query
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(t => 
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.artist && t.artist.toLowerCase().includes(q)) ||
      (t.album && t.album.toLowerCase().includes(q))
    );
  }

  return list;
}

// --- Rendering Track List ---
let renderedTrackCount = 0;
const TRACK_CHUNK_SIZE = 50;
let currentRenderedTracks = [];

function buildTrackHtml(t, idx, showIndex = false) {
  const isPlaying = state.selectedTrack && (state.selectedTrack.id || state.selectedTrack.file_path) === (t.id || t.file_path);
  const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
  
  return `
    <div class="track-item ${isPlaying ? 'playing' : ''}" data-index="${idx}" data-track-id="${escapeHtml(t.id || t.file_path)}">
      ${showIndex ? `<div class="track-item-index">${idx + 1}</div>` : ''}
      <div class="track-item-cover">
        ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none';" />` : ''}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
      </div>
      <div class="track-item-info">
        <div class="track-item-title">${escapeHtml(t.title || 'Unbekannter Titel')}</div>
        <div class="track-item-meta">${escapeHtml(t.artist || 'Unbekannt')}${t.album ? ` • ${escapeHtml(t.album)}` : ''}</div>
      </div>
      <div class="track-item-duration">${t.duration_str || formatDuration(t.duration)}</div>
    </div>
  `;
}

function renderTrackList() {
  const tracks = getFilteredTracks();
  currentRenderedTracks = tracks;
  if (elements.songsSubTitle) {
    elements.songsSubTitle.textContent = `${tracks.length} Titel`;
  }

  if (tracks.length === 0) {
    elements.trackList.innerHTML = `
      <div style="text-align:center; padding: 48px 16px; color:var(--text-muted);">
        <div style="font-size: 2.8rem; margin-bottom: 10px;">🎵</div>
        <h3 style="color:#fff; font-size:1.15rem; font-weight:700; margin-bottom: 6px;">Keine Songs gefunden</h3>
        <p style="font-size:0.85rem; max-width:300px; margin:0 auto 16px auto; line-height: 1.4;">Verbinde deinen Plex Server oder scanne Smartphone-Dateien.</p>
        <button class="btn-accent" style="max-width:200px; margin:0 auto;" onclick="openSettingsSheet()">⚙️ Einstellungen öffnen</button>
      </div>
    `;
    renderedTrackCount = 0;
    return;
  }

  const initialTracks = tracks.slice(0, TRACK_CHUNK_SIZE);
  elements.trackList.innerHTML = initialTracks.map((t, idx) => buildTrackHtml(t, idx)).join('');
  renderedTrackCount = initialTracks.length;
}

function appendMoreTracks() {
  if (!currentRenderedTracks || renderedTrackCount >= currentRenderedTracks.length) return;
  const nextChunk = currentRenderedTracks.slice(renderedTrackCount, renderedTrackCount + TRACK_CHUNK_SIZE);
  if (nextChunk.length === 0) return;

  const fragment = document.createRange().createContextualFragment(
    nextChunk.map((t, idx) => buildTrackHtml(t, renderedTrackCount + idx)).join('')
  );
  elements.trackList.appendChild(fragment);
  renderedTrackCount += nextChunk.length;
}

// --- Rendering Artists Grid ---
function renderArtistsGrid() {
  const map = new Map();
  state.tracks.forEach(t => {
    const art = (t.artist || 'Unbekannter Interpret').trim();
    if (!map.has(art)) {
      map.set(art, { name: art, count: 1, firstTrack: t });
    } else {
      map.get(art).count++;
    }
  });

  const artists = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (elements.artistsSubTitle) elements.artistsSubTitle.textContent = `${artists.length} Künstler`;

  if (artists.length === 0) {
    elements.artistsGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">Keine Künstler vorhanden.</div>`;
    return;
  }

  elements.artistsGrid.innerHTML = artists.map(a => {
    const coverUrl = a.firstTrack.cover_url || '';
    return `
      <div class="artist-card" data-artist="${escapeHtml(a.name)}">
        <div class="artist-avatar-wrapper">
          ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none';" />` : ''}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:36px; height:36px; color:var(--text-dim);"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </div>
        <div class="card-title">${escapeHtml(a.name)}</div>
        <div class="card-subtitle">${a.count === 1 ? '1 Song' : a.count + ' Songs'}</div>
      </div>
    `;
  }).join('');
}

function openArtistDetail(artistName) {
  const artistTracks = state.tracks.filter(t => (t.artist || '').trim() === artistName);
  elements.artistDetailName.textContent = artistName;
  elements.artistDetailMeta.textContent = `${artistTracks.length === 1 ? '1 Song' : artistTracks.length + ' Songs'}`;
  
  const firstCover = artistTracks.find(t => t.cover_url);
  if (firstCover && firstCover.cover_url) {
    elements.artistDetailImg.src = firstCover.cover_url;
    elements.artistDetailImg.style.display = 'block';
  } else {
    elements.artistDetailImg.style.display = 'none';
  }

  elements.artistTrackList.innerHTML = artistTracks.map((t, idx) => buildTrackHtml(t, idx)).join('');

  elements.artistTrackList.querySelectorAll('.track-item').forEach((item, idx) => {
    item.addEventListener('click', () => {
      hapticClick();
      state.queue = [...artistTracks];
      state.queueIndex = idx;
      selectTrack(artistTracks[idx], true);
    });
  });

  showDetailView(elements.viewArtistDetail);
}

// --- Rendering Albums Grid ---
function renderAlbumsGrid() {
  const map = new Map();
  state.tracks.forEach(t => {
    const alb = (t.album || 'Unbekanntes Album').trim();
    if (!map.has(alb)) {
      map.set(alb, { title: alb, artist: t.artist || 'Unbekannt', count: 1, cover: t.cover_url });
    } else {
      map.get(alb).count++;
    }
  });

  const albums = Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  if (elements.albumsSubTitle) elements.albumsSubTitle.textContent = `${albums.length} Alben`;

  if (albums.length === 0) {
    elements.albumsGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">Keine Alben vorhanden.</div>`;
    return;
  }

  elements.albumsGrid.innerHTML = albums.map(a => `
    <div class="album-card" data-album="${escapeHtml(a.title)}">
      <div class="album-cover-wrapper">
        ${a.cover ? `<img src="${a.cover}" loading="lazy" onerror="this.style.display='none';" />` : ''}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:36px; height:36px; color:var(--text-dim);"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
      </div>
      <div class="card-title">${escapeHtml(a.title)}</div>
      <div class="card-subtitle">${escapeHtml(a.artist)} • ${a.count === 1 ? '1 Song' : a.count + ' Songs'}</div>
    </div>
  `).join('');
}

function openAlbumDetail(albumTitle) {
  const albumTracks = state.tracks.filter(t => (t.album || '').trim() === albumTitle);
  elements.albumDetailTitle.textContent = albumTitle;
  elements.albumDetailArtist.textContent = `${(albumTracks[0] && albumTracks[0].artist) ? albumTracks[0].artist : 'Unbekannter Künstler'} • ${albumTracks.length === 1 ? '1 Song' : albumTracks.length + ' Songs'}`;

  const firstCover = albumTracks.find(t => t.cover_url);
  if (firstCover && firstCover.cover_url) {
    elements.albumDetailImg.src = firstCover.cover_url;
    elements.albumDetailImg.style.display = 'block';
  } else {
    elements.albumDetailImg.style.display = 'none';
  }

  elements.albumTrackList.innerHTML = albumTracks.map((t, idx) => buildTrackHtml(t, idx, false)).join('');

  elements.albumTrackList.querySelectorAll('.track-item').forEach((item, idx) => {
    item.addEventListener('click', () => {
      hapticClick();
      state.queue = [...albumTracks];
      state.queueIndex = idx;
      selectTrack(albumTracks[idx], true);
    });
  });

  showDetailView(elements.viewAlbumDetail);
}

// --- Playlists & Favorites ---
function renderPlaylists() {
  const favCount = state.favorites.size;
  let html = `
    <div class="playlist-card" id="cardFavorites">
      <div class="playlist-cover-container">
        <div class="album-cover-wrapper" style="background: linear-gradient(135deg, #ef4444, #f43f5e);">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:36px; height:36px; color:#fff;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </div>
      </div>
      <div class="card-title">❤️ Lieblingssongs</div>
      <div class="card-subtitle">${favCount} Favoriten</div>
    </div>
  `;

  state.playlists.forEach((pl, idx) => {
    const isPlex = pl.source === 'plex' || (pl.id && pl.id.startsWith('plex_'));
    const coverArt = pl.cover_url || pl.composite;
    const coverHtml = coverArt ? `
      <img src="${escapeHtml(coverArt)}" alt="${escapeHtml(pl.name)}" class="playlist-card-img" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
      <div class="album-cover-wrapper" style="display:none; background: linear-gradient(135deg, #e5a00d, #f59e0b);">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:36px; height:36px; color:#fff;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      </div>
    ` : `
      <div class="album-cover-wrapper" style="background: ${isPlex ? 'linear-gradient(135deg, #e5a00d, #b45309)' : 'linear-gradient(135deg, #8b5cf6, #3b82f6)'};">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px; height:36px; color:#fff;"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
      </div>
    `;

    const badgeHtml = isPlex ? `<span class="badge-plex-tag">Plex</span>` : '';

    html += `
      <div class="playlist-card custom-pl" data-index="${idx}">
        <div class="playlist-cover-container">
          ${coverHtml}
          ${badgeHtml}
        </div>
        <div class="card-title">${escapeHtml(pl.name)}</div>
        <div class="card-subtitle">${pl.tracks ? pl.tracks.length : (pl.track_count || 0)} Songs</div>
      </div>
    `;
  });

  elements.playlistCards.innerHTML = html;

  const favCard = $('cardFavorites');
  if (favCard) {
    favCard.addEventListener('click', () => {
      hapticClick();
      openFavoritesDetail();
    });
  }

  elements.playlistCards.querySelectorAll('.custom-pl').forEach(card => {
    card.addEventListener('click', () => {
      hapticClick();
      const idx = parseInt(card.getAttribute('data-index'), 10);
      openCustomPlaylistDetail(state.playlists[idx]);
    });
  });
}

function openFavoritesDetail() {
  const favTracks = state.tracks.filter(t => state.favorites.has(t.id || t.file_path));
  elements.playlistDetailTitle.textContent = '❤️ Favoriten';
  elements.playlistDetailMeta.textContent = `${favTracks.length} Songs`;

  elements.playlistTrackList.innerHTML = favTracks.map((t, idx) => buildTrackHtml(t, idx)).join('');

  elements.playlistTrackList.querySelectorAll('.track-item').forEach((item, idx) => {
    item.addEventListener('click', () => {
      hapticClick();
      state.queue = [...favTracks];
      state.queueIndex = idx;
      selectTrack(favTracks[idx], true);
    });
  });

  showDetailView(elements.viewPlaylistDetail);
}

function openCustomPlaylistDetail(pl) {
  if (!pl) return;
  const plTracks = pl.tracks || [];
  elements.playlistDetailTitle.textContent = pl.name;
  elements.playlistDetailMeta.textContent = `${plTracks.length} Songs ${pl.source === 'plex' ? '• Plex Playlist' : ''}`;

  elements.playlistTrackList.innerHTML = plTracks.map((t, idx) => buildTrackHtml(t, idx, false)).join('');

  elements.playlistTrackList.querySelectorAll('.track-item').forEach((item) => {
    item.addEventListener('click', () => {
      hapticClick();
      const idx = parseInt(item.getAttribute('data-index'), 10);
      // STRICT PLAYLIST ORDER: queue receives the exact sequential playlist array
      state.queue = [...plTracks];
      state.queueIndex = idx;
      selectTrack(plTracks[idx], true);
    });
  });

  showDetailView(elements.viewPlaylistDetail);
}

// --- Player Engine & Audio Control ---
function selectTrack(track, autoPlay = true) {
  if (!track) return;
  state.selectedTrack = track;

  // Build audio stream URL
  let streamSrc = '';
  if (track.stream_url) {
    streamSrc = track.stream_url;
  } else if (track.file_path && track.file_path.startsWith('content://')) {
    streamSrc = track.file_path;
  } else if (track.file_path && track.file_path.startsWith('plex://') && state.plexConfig.url && state.plexConfig.token) {
    const key = track.file_path.replace('plex://', '');
    streamSrc = `${state.plexConfig.url}${key}?X-Plex-Token=${state.plexConfig.token}`;
  } else {
    streamSrc = `/api/audio/stream?path=${encodeURIComponent(track.file_path || '')}`;
  }

  // Update Mini-Player UI
  elements.miniTitle.textContent = track.title || 'Unbekannter Titel';
  elements.miniArtist.textContent = track.artist || 'Unbekannter Interpret';
  if (track.cover_url) {
    elements.miniCoverImg.src = track.cover_url;
    elements.miniCoverImg.classList.remove('hidden');
    elements.miniCoverFallback.classList.add('hidden');
  } else {
    elements.miniCoverImg.classList.add('hidden');
    elements.miniCoverFallback.classList.remove('hidden');
  }

  // Update Fullscreen Sheet UI
  elements.sheetTitle.textContent = track.title || 'Unbekannter Titel';
  elements.sheetArtist.textContent = track.artist || 'Unbekannter Interpret';
  elements.sheetTotalDuration.textContent = track.duration_str || formatDuration(track.duration);
  elements.sheetCurrentTime.textContent = '00:00';
  elements.sheetScrubberFill.style.width = '0%';
  if (track.cover_url) {
    elements.sheetCoverImg.src = track.cover_url;
    elements.sheetCoverImg.classList.remove('hidden');
    elements.sheetCoverFallback.classList.add('hidden');
    if (elements.sheetAmbientBg) elements.sheetAmbientBg.style.backgroundImage = `url('${track.cover_url}')`;
  } else {
    elements.sheetCoverImg.classList.add('hidden');
    elements.sheetCoverFallback.classList.remove('hidden');
    if (elements.sheetAmbientBg) elements.sheetAmbientBg.style.backgroundImage = 'none';
  }

  // Update Favorite status
  const isFav = state.favorites.has(track.id || track.file_path);
  elements.miniHeartBtn.classList.toggle('active', isFav);
  elements.sheetHeartBtn.classList.toggle('active', isFav);

  // Load Audio
  elements.audioElement.src = streamSrc;
  if (autoPlay) {
    elements.audioElement.play().catch(e => {
      console.warn('Play error:', e);
      showToast('⚠️ Wiedergabe nicht möglich.');
    });
  }

  // Sync with Android Native Background Service & Lockscreen
  syncNativePlayback(autoPlay);

  // Highlight current track in tracklist
  document.querySelectorAll('.track-item').forEach(item => {
    item.classList.toggle('playing', item.getAttribute('data-track-id') === (track.id || track.file_path));
  });

  // Load Live Synced Lyrics
  loadTrackLyrics(track);

  // If state.queue is empty, initialize queue with this track
  if (state.queue.length === 0) {
    state.queue = [track];
    state.queueIndex = 0;
  }

  // Preload next track audio stream immediately into browser buffer
  preloadNextTrack();

  // Save session state to localStorage
  savePlaybackSession();

  // Update Queue Sheet if currently visible
  if (elements.queueSheet && elements.queueSheet.classList.contains('open')) {
    renderQueueList();
  }
}

// --- Instant Next-Track Preloading & Zero-Delay Audio Buffer ---
const nextAudioPreloader = new Audio();
nextAudioPreloader.preload = 'auto';

function getNextTrackToPlay() {
  if (state.queue.length > 0 && state.queueIndex < state.queue.length - 1) {
    return state.queue[state.queueIndex + 1];
  } else if (state.queue.length > 0 && state.repeat === 'all') {
    return state.queue[0];
  } else {
    const tracks = getFilteredTracks();
    if (tracks.length === 0) return null;
    if (state.selectedTrack) {
      const curIdx = tracks.findIndex(t => (t.id || t.file_path) === (state.selectedTrack.id || state.selectedTrack.file_path));
      if (curIdx !== -1 && curIdx < tracks.length - 1) {
        return tracks[curIdx + 1];
      } else if (state.repeat === 'all') {
        return tracks[0];
      }
    }
  }
  return null;
}

function preloadNextTrack() {
  const nextTrack = getNextTrackToPlay();
  if (!nextTrack) return;

  let streamSrc = '';
  if (nextTrack.stream_url) {
    streamSrc = nextTrack.stream_url;
  } else if (nextTrack.file_path && nextTrack.file_path.startsWith('content://')) {
    streamSrc = nextTrack.file_path;
  } else if (nextTrack.file_path && nextTrack.file_path.startsWith('plex://') && state.plexConfig.url && state.plexConfig.token) {
    const key = nextTrack.file_path.replace('plex://', '');
    streamSrc = `${state.plexConfig.url}${key}?X-Plex-Token=${state.plexConfig.token}`;
  } else {
    streamSrc = `/api/audio/stream?path=${encodeURIComponent(nextTrack.file_path || '')}`;
  }

  if (streamSrc && nextAudioPreloader.src !== streamSrc) {
    nextAudioPreloader.src = streamSrc;
    nextAudioPreloader.load();
  }

  // Preload next track cover image into memory cache
  if (nextTrack.cover_url) {
    const img = new Image();
    img.src = nextTrack.cover_url;
  }
}

function togglePlay() {
  if (!state.selectedTrack) {
    const list = getFilteredTracks();
    if (list.length > 0) {
      selectTrack(list[0], true);
    }
    return;
  }

  hapticClick();
  if (elements.audioElement.paused) {
    elements.audioElement.play().catch(() => {});
  } else {
    elements.audioElement.pause();
  }
}

function playNextTrack() {
  hapticClick();
  if (state.queue.length > 0 && state.queueIndex < state.queue.length - 1) {
    state.queueIndex++;
    selectTrack(state.queue[state.queueIndex], true);
  } else {
    const tracks = getFilteredTracks();
    if (tracks.length === 0) return;
    let nextIdx = 0;
    if (state.selectedTrack) {
      const curIdx = tracks.findIndex(t => (t.id || t.file_path) === (state.selectedTrack.id || state.selectedTrack.file_path));
      if (curIdx !== -1 && curIdx < tracks.length - 1) {
        nextIdx = curIdx + 1;
      }
    }
    selectTrack(tracks[nextIdx], true);
  }
}

function playPrevTrack() {
  hapticClick();
  if (elements.audioElement.currentTime > 3) {
    elements.audioElement.currentTime = 0;
    return;
  }
  if (state.queue.length > 0 && state.queueIndex > 0) {
    state.queueIndex--;
    selectTrack(state.queue[state.queueIndex], true);
  } else {
    const tracks = getFilteredTracks();
    if (tracks.length === 0) return;
    let prevIdx = tracks.length - 1;
    if (state.selectedTrack) {
      const curIdx = tracks.findIndex(t => (t.id || t.file_path) === (state.selectedTrack.id || state.selectedTrack.file_path));
      if (curIdx > 0) prevIdx = curIdx - 1;
    }
    selectTrack(tracks[prevIdx], true);
  }
}

function toggleFavorite(track) {
  if (!track) return;
  const id = track.id || track.file_path;
  hapticClick();
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    showToast('Aus Favoriten entfernt');
  } else {
    state.favorites.add(id);
    showToast('❤️ Zu Favoriten hinzugefügt');
  }
  localStorage.setItem('soundsphere_favs', JSON.stringify(Array.from(state.favorites)));
  const isFav = state.favorites.has(id);
  elements.miniHeartBtn.classList.toggle('active', isFav);
  elements.sheetHeartBtn.classList.toggle('active', isFav);
  if (elements.sheetLyricsHeartBtn) elements.sheetLyricsHeartBtn.classList.toggle('active', isFav);
}

function syncNativePlayback(isPlaying) {
  if (window.AndroidBridge && window.AndroidBridge.updatePlaybackState && state.selectedTrack) {
    const t = state.selectedTrack;
    const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
    const dur = (elements.audioElement && elements.audioElement.duration) ? elements.audioElement.duration : (t.duration || 0);
    const rawCover = t.cover_url || '';
    const fullCover = (rawCover.startsWith('http') || rawCover.startsWith('content:')) ? rawCover : (window.location.origin + rawCover);
    window.AndroidBridge.updatePlaybackState(t.title || '', t.artist || '', t.album || '', fullCover, isPlaying, cur, dur);
  }
}

// --- Live Karaoke Synced Lyrics Parser & Engine ---
async function loadTrackLyrics(track) {
  state.parsedLyrics = [];
  if (elements.sheetHybridLyricsContent) {
    elements.sheetHybridLyricsContent.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-muted); font-size:1.05rem;">Suche Songtexte...</div>`;
  }

  try {
    let lrcText = '';
    
    // 1. Check if track already has embedded lyrics in object
    if (track.lyrics) {
      lrcText = track.lyrics;
    }

    // 2. Direct Plex Lyrics Extraction (from user's Plex Media Server)
    if (!lrcText && state.plexConfig.url && state.plexConfig.token && (track.source === 'plex' || (track.id && track.id.startsWith('plex_')) || track.rating_key)) {
      const rKey = track.rating_key || (track.id ? track.id.replace('plex_', '') : '');
      if (rKey) {
        try {
          const metaRes = await fetch(`${state.plexConfig.url}/library/metadata/${rKey}?X-Plex-Token=${state.plexConfig.token}&includeLyrics=1&includeMarkers=1`, {
            headers: { 'Accept': 'application/json' }
          });
          if (metaRes.ok) {
            const metaData = await metaRes.json();
            const item = metaData.MediaContainer && metaData.MediaContainer.Metadata ? metaData.MediaContainer.Metadata[0] : null;
            const part = item && item.Media && item.Media[0] && item.Media[0].Part ? item.Media[0].Part[0] : null;
            const streams = (part && part.Stream) ? part.Stream : [];
            const lyricStream = streams.find(s => s.streamType === 4 || s.format === 'lrc' || s.format === 'txt' || (s.key && s.key.includes('lyrics')));
            if (lyricStream && lyricStream.key) {
              const lyrRes = await fetch(`${state.plexConfig.url}${lyricStream.key}?X-Plex-Token=${state.plexConfig.token}`);
              if (lyrRes.ok) {
                lrcText = await lyrRes.text();
              }
            }
          }
        } catch (pe) {
          console.warn('Plex direct lyric fetch error:', pe);
        }
      }
    }

    // 3. Local server fallback (if connected via desktop)
    if (!lrcText && track.file_path && !track.file_path.startsWith('plex://') && !track.file_path.startsWith('content://')) {
      try {
        const res = await fetch(`/api/track/lyrics?path=${encodeURIComponent(track.file_path)}`);
        if (res.ok) {
          const data = await res.json();
          lrcText = data.lyrics || '';
        }
      } catch (e) {}
    }

    // 4. Online Synced Karaoke LRCLIB Database Fallback
    if (!lrcText && track.artist && track.title) {
      try {
        const cleanArtist = track.artist.replace(/\(feat\..*?\)/i, '').trim();
        const cleanTitle = track.title.replace(/\(feat\..*?\)/i, '').trim();
        const durParam = track.duration ? `&duration=${Math.round(track.duration)}` : '';
        const lrclibUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}${durParam}`;
        
        const lrcRes = await fetch(lrclibUrl);
        if (lrcRes.ok) {
          const lrcJson = await lrcRes.json();
          lrcText = lrcJson.syncedLyrics || lrcJson.plainLyrics || '';
        } else {
          // Search fallback
          const sRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanArtist + ' ' + cleanTitle)}`);
          if (sRes.ok) {
            const sJson = await sRes.json();
            if (Array.isArray(sJson) && sJson.length > 0) {
              const best = sJson.find(x => x.syncedLyrics) || sJson[0];
              lrcText = best.syncedLyrics || best.plainLyrics || '';
            }
          }
        }
      } catch (le) {
        console.warn('LRCLIB fetch error:', le);
      }
    }

    if (lrcText && lrcText.trim().length > 0) {
      parseAndRenderLyrics(lrcText, track.duration);
    } else {
      if (elements.sheetHybridLyricsContent) {
        elements.sheetHybridLyricsContent.innerHTML = `<div style="text-align:center; padding:60px 20px; color:var(--text-muted); font-size:1.05rem;">Kein synchronisierter Songtext verfügbar.</div>`;
      }
    }
  } catch (e) {
    if (elements.sheetHybridLyricsContent) {
      elements.sheetHybridLyricsContent.innerHTML = `<div style="text-align:center; padding:60px 20px; color:var(--text-muted);">Songtext konnte nicht geladen werden.</div>`;
    }
  }
}

function parseAndRenderLyrics(lrcText, totalDurationSec = 0) {
  const lines = lrcText.split('\n');
  const rawLines = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  lines.forEach(line => {
    let match;
    const text = line.replace(timeRegex, '').trim();
    let hasTimestamp = false;
    while ((match = timeRegex.exec(line)) !== null) {
      hasTimestamp = true;
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
      const timestamp = min * 60 + sec + ms / 1000;
      rawLines.push({ timestamp, text });
    }
  });

  // If no timestamp tags were present (plain text), distribute lines evenly
  if (rawLines.length === 0 && lines.filter(l => l.trim()).length > 0) {
    const validLines = lines.filter(l => l.trim());
    const step = (totalDurationSec && totalDurationSec > 0 ? totalDurationSec : 180) / (validLines.length + 1);
    validLines.forEach((l, idx) => {
      rawLines.push({ timestamp: idx * step, text: l.trim() });
    });
  }

  if (rawLines.length === 0) {
    state.parsedLyrics = [];
    return;
  }

  rawLines.sort((a, b) => a.timestamp - b.timestamp);

  const processed = [];
  // 1. Intro ♪ if the first sung line starts >= 2.0s
  const firstSung = rawLines.find(l => {
    const txt = (l.text || '').trim();
    return txt !== '' && txt !== '♪' && !/^♫\s*instrumental\s*♫$/i.test(txt);
  });
  if (firstSung && firstSung.timestamp >= 2.0) {
    processed.push({ timestamp: 0.0, text: '♪' });
  }

  for (let i = 0; i < rawLines.length; i++) {
    const cur = rawLines[i];
    const next = (i + 1 < rawLines.length) ? rawLines[i + 1] : null;
    const cleanText = (cur.text || '').trim();

    if (!cleanText || cleanText === '♪') {
      // Empty line / placeholder: ONLY keep as ♪ if pause until next line is >= 2.0s!
      const durationUntilNext = next ? (next.timestamp - cur.timestamp) : 5.0;
      if (durationUntilNext >= 2.0) {
        processed.push({ timestamp: cur.timestamp, text: '♪' });
      }
    } else {
      processed.push({ timestamp: cur.timestamp, text: cleanText });
    }
  }

  state.parsedLyrics = processed;
  renderLyricsView();
}

function renderLyricsView() {
  if (state.parsedLyrics.length === 0) return;

  const html = state.parsedLyrics.map((l, idx) => `
    <div class="lyrics-line" data-index="${idx}">
      ${escapeHtml(l.text)}
    </div>
  `).join('');

  if (elements.sheetHybridLyricsContent) {
    elements.sheetHybridLyricsContent.innerHTML = html;
  }

  // Immediately style and position lines
  if (elements.audioElement) {
    updateLyricsScroll(elements.audioElement.currentTime || 0);
  }
}

function updateLyricsScroll(currentTime) {
  if (state.parsedLyrics.length === 0) return;

  let activeIndex = -1;
  for (let i = 0; i < state.parsedLyrics.length; i++) {
    if (currentTime >= state.parsedLyrics[i].timestamp) {
      activeIndex = i;
    } else {
      break;
    }
  }

  // Update Hybrid Player Sheet Lyrics View
  if (elements.sheetHybridLyricsContent) {
    const hybridLines = elements.sheetHybridLyricsContent.querySelectorAll('.lyrics-line');
    hybridLines.forEach((line, idx) => {
      line.className = 'lyrics-line';
      if (idx === activeIndex) {
        line.classList.add('active');
      } else if (Math.abs(idx - activeIndex) === 1) {
        line.classList.add('dist-1');
      } else if (Math.abs(idx - activeIndex) === 2) {
        line.classList.add('dist-2');
      } else {
        line.classList.add('dist-far');
      }
    });

    if (!state.isHybridManualScroll && elements.sheetHybridLyricsContainer && elements.sheetBody && elements.sheetBody.scrollTop > 60 && activeIndex !== -1 && hybridLines[activeIndex]) {
      const activeEl = hybridLines[activeIndex];
      const container = elements.sheetHybridLyricsContainer;
      const offset = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
      container.scrollTo({ top: offset, behavior: 'smooth' });
    }
  }
}

// --- Sheets Open / Close ---
const MAX_DRIVE_SCROLL = 240;

function openPlayerSheet(asLyrics = false) {
  hapticClick();
  elements.playerSheet.classList.add('open');
  state.isHybridManualScroll = false;
  if (elements.btnSyncHybridLyrics) elements.btnSyncHybridLyrics.classList.add('hidden');
  
  if (typeof updateCachedDimensions === 'function') updateCachedDimensions();
  setTimeout(() => {
    if (typeof updateCachedDimensions === 'function') updateCachedDimensions();
    if (elements.sheetBody) {
      elements.sheetBody.scrollTo({ top: asLyrics ? MAX_DRIVE_SCROLL : 0, behavior: 'smooth' });
    }
    if (typeof updateScrollDrivenPlayerLayout === 'function') updateScrollDrivenPlayerLayout();
  }, 50);
}

function closePlayerSheet() {
  elements.playerSheet.classList.remove('open');
  state.isHybridManualScroll = false;
  if (elements.btnSyncHybridLyrics) elements.btnSyncHybridLyrics.classList.add('hidden');
}

function toggleHybridLyricsMode() {
  hapticClick();
  if (!elements.sheetBody) return;
  if (elements.sheetBody.scrollTop > 50) {
    elements.sheetBody.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    elements.sheetBody.scrollTo({ top: MAX_DRIVE_SCROLL, behavior: 'smooth' });
  }
}

function openHybridLyrics() {
  openPlayerSheet(true);
}
window.openHybridLyrics = openHybridLyrics;
window.openImmersiveLyrics = openHybridLyrics;
window.closeImmersiveLyrics = closePlayerSheet;

function openSettingsSheet() {
  hapticClick();
  elements.settingsSheet.classList.add('open');
}
window.openSettingsSheet = openSettingsSheet;

function closeSettingsSheet() {
  elements.settingsSheet.classList.remove('open');
}
window.closeSettingsSheet = closeSettingsSheet;

function openQueueSheet() {
  hapticClick();
  renderQueueList();
  elements.queueSheet.classList.add('open');
}
window.openQueueSheet = openQueueSheet;

function closeQueueSheet() {
  elements.queueSheet.classList.remove('open');
}
window.closeQueueSheet = closeQueueSheet;

function renderQueueList() {
  if (!elements.queueSheet) return;

  let currentTrack = state.selectedTrack;
  
  // If state.queue is empty, populate with current track or filtered tracks
  if (!state.queue || state.queue.length === 0) {
    if (currentTrack) {
      state.queue = [currentTrack];
      state.queueIndex = 0;
    } else if (state.tracks.length > 0) {
      state.queue = [...state.tracks];
      state.queueIndex = 0;
      currentTrack = state.queue[0];
    }
  }

  let currentIdx = (typeof state.queueIndex === 'number' && state.queueIndex >= 0) ? state.queueIndex : 0;
  if (currentTrack) {
    const foundIdx = state.queue.findIndex(t => (t.id || t.file_path) === (currentTrack.id || currentTrack.file_path));
    if (foundIdx !== -1) {
      currentIdx = foundIdx;
      state.queueIndex = foundIdx;
    }
  }

  const totalCount = state.queue.length;

  if (elements.queueSubtitle) {
    elements.queueSubtitle.textContent = `${totalCount} Titel`;
  }

  // 1. Now Playing Hero Box
  if (elements.queueNowPlayingBox) {
    if (currentTrack) {
      const coverUrl = currentTrack.cover_url || (currentTrack.file_path ? `/api/track/cover?path=${encodeURIComponent(currentTrack.file_path)}` : '');
      elements.queueNowPlayingBox.innerHTML = `
        <div class="queue-now-playing-card">
          <div class="track-item-cover" style="width: 52px; height: 52px; border-radius: 10px;">
            ${coverUrl ? `<img src="${coverUrl}" alt="Cover" onerror="this.style.display='none';" />` : ''}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px; height:24px; color:var(--primary-light);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
          <div class="queue-now-playing-info">
            <span class="queue-playing-tag">
              <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              Läuft gerade
            </span>
            <div class="queue-playing-title">${escapeHtml(currentTrack.title || 'Unbekannter Titel')}</div>
            <div class="queue-playing-artist">${escapeHtml(currentTrack.artist || 'Unbekannter Künstler')}${currentTrack.album ? ` • ${escapeHtml(currentTrack.album)}` : ''}</div>
          </div>
        </div>
      `;
      elements.queueNowPlayingBox.style.display = 'block';
    } else {
      elements.queueNowPlayingBox.innerHTML = '';
      elements.queueNowPlayingBox.style.display = 'none';
    }
  }

  // 2. Upcoming Tracks List
  const upcomingStartIndex = currentIdx >= 0 ? currentIdx + 1 : 0;
  const upcomingTracks = state.queue.slice(upcomingStartIndex);

  if (elements.queueUpcomingCount) {
    elements.queueUpcomingCount.textContent = `${upcomingTracks.length}`;
  }

  // Show / Hide Clear FAB overlay based on whether queue has tracks
  if (elements.btnClearQueueBtn) {
    if (state.queue.length > 0) {
      elements.btnClearQueueBtn.classList.remove('hidden');
    } else {
      elements.btnClearQueueBtn.classList.add('hidden');
    }
  }

  if (upcomingTracks.length === 0) {
    elements.queueList.innerHTML = `
      <div style="text-align:center; padding: 48px 16px; color:var(--text-muted);">
        <div style="font-size: 2.4rem; margin-bottom: 10px;">🎵</div>
        <p style="font-size:1rem; font-weight:700; color:#fff; margin-bottom:6px;">Keine weiteren Titel</p>
        <p style="font-size:0.85rem; line-height:1.4; max-width:280px; margin:0 auto;">Wähle einen Song oder starte eine Playlist, um weitere Titel in die Warteschlange zu laden.</p>
      </div>
    `;
    return;
  }

  elements.queueList.innerHTML = upcomingTracks.map((t, idx) => {
    const realIndex = upcomingStartIndex + idx;
    const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
    return `
      <div class="queue-item" data-queue-index="${realIndex}">
        <div class="track-item-cover" style="width: 44px; height: 44px; border-radius: 8px;">
          ${coverUrl ? `<img src="${coverUrl}" loading="lazy" alt="Cover" onerror="this.style.display='none';" />` : ''}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        </div>
        <div class="queue-item-info">
          <div class="queue-item-title">${escapeHtml(t.title || 'Unbekannter Titel')}</div>
          <div class="queue-item-meta">${escapeHtml(t.artist || 'Unbekannt')}${t.album ? ` • ${escapeHtml(t.album)}` : ''}</div>
        </div>
        <button class="queue-item-remove-btn" title="Aus Warteschlange entfernen" data-remove-index="${realIndex}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;
  }).join('');

  // Jump to track on click
  elements.queueList.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.queue-item-remove-btn')) return;
      hapticClick();
      const qIdx = parseInt(item.getAttribute('data-queue-index'), 10);
      if (state.queue[qIdx]) {
        state.queueIndex = qIdx;
        selectTrack(state.queue[qIdx], true);
        renderQueueList();
      }
    });
  });

  // Remove individual track on click
  elements.queueList.querySelectorAll('.queue-item-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      hapticClick();
      const rIdx = parseInt(btn.getAttribute('data-remove-index'), 10);
      if (rIdx >= 0 && rIdx < state.queue.length) {
        state.queue.splice(rIdx, 1);
        if (state.queueIndex > rIdx) {
          state.queueIndex--;
        }
        renderQueueList();
        savePlaybackSession();
        showToast('Titel entfernt');
      }
    });
  });
}

// --- Playback Session & Queue Persistence ---
const SESSION_STORAGE_KEY = 'soundsphere_last_session';

function savePlaybackSession() {
  try {
    if (!state.selectedTrack) return;
    const sessionData = {
      selectedTrack: state.selectedTrack,
      queue: state.queue,
      queueIndex: state.queueIndex,
      currentTime: elements.audioElement ? elements.audioElement.currentTime : 0,
      duration: (elements.audioElement && elements.audioElement.duration) ? elements.audioElement.duration : (state.selectedTrack.duration || 0),
      timestamp: Date.now()
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
  } catch (e) {
    console.warn('Failed to save playback session:', e);
  }
}

function restorePlaybackSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (!session || !session.selectedTrack) return false;

    state.selectedTrack = session.selectedTrack;
    state.queue = Array.isArray(session.queue) && session.queue.length > 0 ? session.queue : [session.selectedTrack];
    state.queueIndex = (typeof session.queueIndex === 'number' && session.queueIndex >= 0) ? session.queueIndex : 0;

    const track = state.selectedTrack;
    const savedTime = session.currentTime || 0;
    const duration = session.duration || track.duration || 0;

    // Stream URL calculation
    let streamSrc = '';
    if (track.stream_url) {
      streamSrc = track.stream_url;
    } else if (track.file_path && track.file_path.startsWith('content://')) {
      streamSrc = track.file_path;
    } else if (track.file_path && track.file_path.startsWith('plex://') && state.plexConfig.url && state.plexConfig.token) {
      const key = track.file_path.replace('plex://', '');
      streamSrc = `${state.plexConfig.url}${key}?X-Plex-Token=${state.plexConfig.token}`;
    } else {
      streamSrc = `/api/audio/stream?path=${encodeURIComponent(track.file_path || '')}`;
    }

    // Restore Mini Player UI
    elements.miniTitle.textContent = track.title || 'Unbekannter Titel';
    elements.miniArtist.textContent = track.artist || 'Unbekannter Interpret';
    if (track.cover_url) {
      elements.miniCoverImg.src = track.cover_url;
      elements.miniCoverImg.classList.remove('hidden');
      elements.miniCoverFallback.classList.add('hidden');
    } else {
      elements.miniCoverImg.classList.add('hidden');
      elements.miniCoverFallback.classList.remove('hidden');
    }

    // Restore Fullscreen Sheet UI
    elements.sheetTitle.textContent = track.title || 'Unbekannter Titel';
    elements.sheetArtist.textContent = track.artist || 'Unbekannter Interpret';
    elements.sheetTotalDuration.textContent = formatDuration(duration);
    elements.sheetCurrentTime.textContent = formatDuration(savedTime);
    const pct = duration > 0 ? (savedTime / duration) * 100 : 0;
    elements.miniProgressFill.style.width = `${pct}%`;
    elements.sheetScrubberFill.style.width = `${pct}%`;

    if (track.cover_url) {
      elements.sheetCoverImg.src = track.cover_url;
      elements.sheetCoverImg.classList.remove('hidden');
      elements.sheetCoverFallback.classList.add('hidden');
      if (elements.sheetAmbientBg) elements.sheetAmbientBg.style.backgroundImage = `url('${track.cover_url}')`;
    } else {
      elements.sheetCoverImg.classList.add('hidden');
      elements.sheetCoverFallback.classList.remove('hidden');
      if (elements.sheetAmbientBg) elements.sheetAmbientBg.style.backgroundImage = 'none';
    }

    // Setup audio element ready for play
    if (streamSrc) {
      elements.audioElement.src = streamSrc;
      elements.audioElement.currentTime = savedTime;
    }

    // Load lyrics in background ready for viewing
    loadTrackLyrics(track);

    return true;
  } catch (e) {
    console.warn('Failed to restore playback session:', e);
    return false;
  }
}

// --- Android Hardware Back Button Handler & Audio Shutdown ---
window.stopAudioCompletely = function() {
  if (elements.audioElement) {
    elements.audioElement.pause();
    elements.audioElement.currentTime = 0;
    elements.audioElement.src = '';
  }
};

window.handleAndroidBack = function() {
  try {
    // 1. If Search input is focused or query entered
    if (elements.searchInput && (document.activeElement === elements.searchInput || (state.searchQuery && state.searchQuery.length > 0))) {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.btnSearchClear.classList.add('hidden');
      elements.searchContainer.classList.add('hidden');
      elements.btnSearchToggle.classList.remove('hidden');
      elements.searchInput.blur();
      renderMainView();
      return true;
    }

    // 2. If Settings Sheet is open -> close Settings
    if (elements.settingsSheet && elements.settingsSheet.classList.contains('open')) {
      closeSettingsSheet();
      return true;
    }

    // 3. If Queue Sheet is open -> close Queue
    if (elements.queueSheet && elements.queueSheet.classList.contains('open')) {
      closeQueueSheet();
      return true;
    }

    // 4. If Player Sheet is open
    if (elements.playerSheet && elements.playerSheet.classList.contains('open')) {
      if (elements.playerSheet.classList.contains('hybrid-lyrics-mode')) {
        // Exit Hybrid Mode -> return to big album cover
        elements.playerSheet.classList.remove('hybrid-lyrics-mode');
        elements.playerSheet.classList.remove('manual-scroll');
        state.isHybridManualScroll = false;
        if (elements.btnSyncHybridLyrics) elements.btnSyncHybridLyrics.classList.add('hidden');
        hapticClick();
        return true;
      } else {
        // In standard Fullscreen mode -> close Player Sheet down to mini-player
        closePlayerSheet();
        return true;
      }
    }

    // 5. If any Detail View is open (Playlist, Artist, Album) -> return to parent tab
    const isDetailOpen = (elements.viewArtistDetail && elements.viewArtistDetail.classList.contains('active')) ||
                         (elements.viewAlbumDetail && elements.viewAlbumDetail.classList.contains('active')) ||
                         (elements.viewPlaylistDetail && elements.viewPlaylistDetail.classList.contains('active'));
    if (isDetailOpen) {
      switchTab(state.currentTab || 'tracks');
      return true;
    }

    // 6. If on a sub-tab other than 'tracks' -> return to 'tracks' tab
    if (state.currentTab && state.currentTab !== 'tracks') {
      switchTab('tracks');
      return true;
    }

    // 7. If on main tracks screen -> return false so native double-back exit confirms and closes app
    return false;
  } catch (e) {
    console.error('handleAndroidBack error:', e);
    return false;
  }
};

function renderQueueList() {
  if (state.queue.length === 0) {
    elements.queueList.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">Warteschlange ist leer.</div>`;
    return;
  }

  elements.queueList.innerHTML = state.queue.map((t, idx) => `
    <div class="track-item ${idx === state.queueIndex ? 'playing' : ''}" data-idx="${idx}">
      <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">${idx + 1}</div>
      <div class="track-item-info">
        <div class="track-item-title">${escapeHtml(t.title)}</div>
        <div class="track-item-meta">${escapeHtml(t.artist)}</div>
      </div>
      <div class="track-item-duration">${t.duration_str || formatDuration(t.duration)}</div>
    </div>
  `).join('');

  elements.queueList.querySelectorAll('.track-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.getAttribute('data-idx'), 10);
      state.queueIndex = idx;
      selectTrack(state.queue[idx], true);
    });
  });
}

// --- Android Bridge Integration & Handlers ---
window.handleNativeMediaAction = function(action, extraLong) {
  if (action === 'play') {
    if (elements.audioElement && elements.audioElement.paused) togglePlay();
  } else if (action === 'pause') {
    if (elements.audioElement && !elements.audioElement.paused) togglePlay();
  } else if (action === 'next') {
    playNextTrack();
  } else if (action === 'prev') {
    playPrevTrack();
  } else if (action === 'seek') {
    if (elements.audioElement && extraLong > 0) {
      elements.audioElement.currentTime = extraLong / 1000;
    }
  }
};

window.handleAndroidBack = function() {
  if (elements.immersiveLyricsView.classList.contains('open')) {
    closeImmersiveLyrics();
    return true;
  }
  if (elements.queueSheet.classList.contains('open')) {
    closeQueueSheet();
    return true;
  }
  if (elements.settingsSheet.classList.contains('open')) {
    closeSettingsSheet();
    return true;
  }
  if (elements.playerSheet.classList.contains('open')) {
    if (elements.playerSheet.classList.contains('hybrid-lyrics-mode')) {
      elements.playerSheet.classList.remove('hybrid-lyrics-mode');
      return true;
    }
    closePlayerSheet();
    return true;
  }
  if (elements.viewArtistDetail.classList.contains('active')) {
    switchTab('artists');
    return true;
  }
  if (elements.viewAlbumDetail.classList.contains('active')) {
    switchTab('albums');
    return true;
  }
  if (elements.viewPlaylistDetail.classList.contains('active')) {
    switchTab('playlists');
    return true;
  }
  return false;
};

// --- Initial Data Loading & Media Sources ---
async function loadDeviceLocalMusic() {
  if (window.AndroidBridge && window.AndroidBridge.getLocalDeviceTracksJson) {
    try {
      const raw = window.AndroidBridge.getLocalDeviceTracksJson();
      const tracks = JSON.parse(raw || '[]');
      if (tracks && tracks.length > 0) {
        state.tracks = tracks;
        renderTrackList();
        showToast(`📱 ${tracks.length} Songs vom Smartphone geladen!`);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function loadPlexMusicDirect() {
  if (!state.plexConfig.url || !state.plexConfig.token) return false;
  try {
    elements.plexStatusNotice.textContent = 'Verbinde mit Plex...';
    const sectionsRes = await fetch(`${state.plexConfig.url}/library/sections?X-Plex-Token=${state.plexConfig.token}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (sectionsRes.ok) {
      const data = await sectionsRes.json();
      const sections = (data.MediaContainer && data.MediaContainer.Directory) ? data.MediaContainer.Directory : [];
      const musicSec = sections.find(s => s.type === 'artist');
      if (musicSec) {
        const secKey = musicSec.key;
        const tracksRes = await fetch(`${state.plexConfig.url}/library/sections/${secKey}/all?type=10&X-Plex-Token=${state.plexConfig.token}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (tracksRes.ok) {
          const trackData = await tracksRes.json();
          const plexTracks = ((trackData.MediaContainer && trackData.MediaContainer.Metadata) ? trackData.MediaContainer.Metadata : []).map(m => {
            const partKey = (m.Media && m.Media[0] && m.Media[0].Part && m.Media[0].Part[0]) ? m.Media[0].Part[0].key : '';
            return {
              id: `plex_${m.ratingKey}`,
              title: m.title || 'Unbekannter Titel',
              artist: m.grandparentTitle || m.originalTitle || 'Unbekannt',
              album: m.parentTitle || '',
              duration: (m.duration || 0) / 1000,
              duration_str: formatDuration((m.duration || 0) / 1000),
              file_path: `plex://${m.ratingKey}`,
              part_key: partKey,
              cover_url: m.thumb ? `${state.plexConfig.url}${m.thumb}?X-Plex-Token=${state.plexConfig.token}` : '',
              stream_url: `${state.plexConfig.url}${partKey}?X-Plex-Token=${state.plexConfig.token}`,
              source: 'plex'
            };
          });

          if (plexTracks.length > 0) {
            state.tracks = plexTracks;
            renderTrackList();
            elements.plexStatusNotice.textContent = `✅ ${plexTracks.length} Plex Songs synchronisiert!`;
            showToast(`📺 ${plexTracks.length} Plex Songs geladen!`);
            return true;
          }
        }
      }
    }
  } catch (e) {
    elements.plexStatusNotice.textContent = '❌ Verbindung zu Plex fehlgeschlagen.';
  }
  return false;
}

async function loadInitialData() {
  // 1. Try local phone music first
  const loadedLocal = await loadDeviceLocalMusic();
  // 2. If no local music, try direct Plex
  if (!loadedLocal) {
    await loadPlexMusicDirect();
  }
  renderTrackList();
  renderArtistsGrid();
  renderAlbumsGrid();
  renderPlaylists();
}
window.loadInitialData = loadInitialData;
window.loadInitialTracks = loadInitialData;

// --- Setup Event Listeners ---
function setupEventListeners() {
  // Bottom Navigation
  elements.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      hapticClick();
      switchTab(tab.getAttribute('data-tab'));
    });
  });

  // Source Filter Chips
  elements.filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      hapticClick();
      elements.filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeSourceFilter = chip.getAttribute('data-source');
      renderTrackList();
    });
  });

  // Search
  elements.btnOpenSearch.addEventListener('click', () => {
    hapticClick();
    elements.searchContainer.classList.toggle('hidden');
    if (!elements.searchContainer.classList.contains('hidden')) {
      elements.mobileSearchInput.focus();
    }
  });

  elements.btnCloseSearch.addEventListener('click', () => {
    elements.mobileSearchInput.value = '';
    state.searchQuery = '';
    elements.searchContainer.classList.add('hidden');
    renderTrackList();
  });

  elements.mobileSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    renderTrackList();
  });

  // Detail Back Buttons
  elements.btnBackFromArtist.addEventListener('click', () => switchTab('artists'));
  elements.btnBackFromAlbum.addEventListener('click', () => switchTab('albums'));
  elements.btnBackFromPlaylist.addEventListener('click', () => switchTab('playlists'));

  if (elements.btnNewPlaylist) {
    elements.btnNewPlaylist.addEventListener('click', () => {
      hapticClick();
      const name = prompt('Name der neuen Playlist:');
      if (name && name.trim()) {
        const newPl = {
          id: 'custom_' + Date.now(),
          name: name.trim(),
          track_count: 0,
          tracks: [],
          source: 'local'
        };
        state.playlists.push(newPl);
        localStorage.setItem('soundsphere_playlists', JSON.stringify(state.playlists));
        renderPlaylists();
        showToast(`Playlist "${newPl.name}" erstellt`);
      }
    });
  }

  // Play All Button
  elements.btnPlayAll.addEventListener('click', () => {
    const list = getFilteredTracks();
    if (list.length > 0) {
      state.queue = [...list];
      state.queueIndex = 0;
      selectTrack(list[0], true);
    }
  });

  // Fast Delegated Track List Click Handler
  elements.trackList.addEventListener('click', (e) => {
    const item = e.target.closest('.track-item');
    if (!item) return;
    const idx = parseInt(item.getAttribute('data-index'), 10);
    if (currentRenderedTracks && currentRenderedTracks[idx]) {
      hapticClick();
      state.queue = [...currentRenderedTracks];
      state.queueIndex = idx;
      selectTrack(currentRenderedTracks[idx], true);
    }
  });

  // Infinite Scroll for Track List
  elements.mobileViewport.addEventListener('scroll', () => {
    if (state.currentTab === 'tracks' && elements.viewSongs.classList.contains('active')) {
      if (elements.mobileViewport.scrollTop + elements.mobileViewport.clientHeight >= elements.mobileViewport.scrollHeight - 300) {
        appendMoreTracks();
      }
    }
  }, { passive: true });

  // Delegated Artists & Albums Click Handlers
  elements.artistsGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.artist-card');
    if (!card) return;
    hapticClick();
    const artName = card.getAttribute('data-artist');
    openArtistDetail(artName);
  });

  elements.artistTrackList.addEventListener('click', (e) => {
    const item = e.target.closest('.track-item');
    if (!item) return;
    const artistTracks = state.tracks.filter(t => (t.artist || '').trim() === elements.artistDetailName.textContent);
    const id = item.getAttribute('data-id');
    const idx = artistTracks.findIndex(t => (t.id || t.file_path) === id);
    if (idx !== -1) {
      hapticClick();
      state.queue = [...artistTracks];
      state.queueIndex = idx;
      selectTrack(artistTracks[idx], true);
    }
  });

  elements.albumsGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.album-card');
    if (!card) return;
    hapticClick();
    const albumTitle = card.getAttribute('data-album');
    openAlbumDetail(albumTitle);
  });

  elements.albumTrackList.addEventListener('click', (e) => {
    const item = e.target.closest('.track-item');
    if (!item) return;
    const albumTracks = state.tracks.filter(t => (t.album || '').trim() === elements.albumDetailTitle.textContent);
    const id = item.getAttribute('data-id');
    const idx = albumTracks.findIndex(t => (t.id || t.file_path) === id);
    if (idx !== -1) {
      hapticClick();
      state.queue = [...albumTracks];
      state.queueIndex = idx;
      selectTrack(albumTracks[idx], true);
    }
  });

  // Mini Player Interactions
  // Tapping Mini-Cover -> Opens Hybrid Lyrics View!
  elements.miniCoverTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    openHybridLyrics();
  });
  // Tapping Mini Bar / Body -> Opens Fullscreen Now Playing Sheet
  elements.miniPlayer.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('#miniCoverTrigger')) return;
    openPlayerSheet(false);
  });
  elements.miniMetaTrigger.addEventListener('click', () => openPlayerSheet(false));
  elements.miniPlayPauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });
  elements.miniNextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    playNextTrack();
  });
  elements.miniHeartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(state.selectedTrack);
  });

  // Fullscreen Sheet Interactions
  elements.btnClosePlayerSheet.addEventListener('click', closePlayerSheet);
  // Tapping Big Album Cover -> Toggles Hybrid Lyrics View!
  elements.sheetCoverTrigger.addEventListener('click', toggleHybridLyricsMode);
  elements.sheetHeartBtn.addEventListener('click', () => toggleFavorite(state.selectedTrack));
  elements.sheetPlayPauseBtn.addEventListener('click', togglePlay);
  elements.sheetNextBtn.addEventListener('click', playNextTrack);
  elements.sheetPrevBtn.addEventListener('click', playPrevTrack);

  elements.sheetShuffleBtn.addEventListener('click', () => {
    hapticClick();
    state.shuffle = !state.shuffle;
    elements.sheetShuffleBtn.classList.toggle('active', state.shuffle);
    showToast(state.shuffle ? 'Zufallswiedergabe: Ein' : 'Zufallswiedergabe: Aus');
  });

  elements.sheetRepeatBtn.addEventListener('click', () => {
    hapticClick();
    if (state.repeat === 'off') {
      state.repeat = 'all';
      elements.sheetRepeatBtn.classList.add('active');
      elements.sheetRepeatBadge.classList.add('hidden');
      showToast('Wiederholen: Alle');
    } else if (state.repeat === 'all') {
      state.repeat = 'one';
      elements.sheetRepeatBtn.classList.add('active');
      elements.sheetRepeatBadge.classList.remove('hidden');
      showToast('Wiederholen: Ein Song');
    } else {
      state.repeat = 'off';
      elements.sheetRepeatBtn.classList.remove('active');
      elements.sheetRepeatBadge.classList.add('hidden');
      showToast('Wiederholen: Aus');
    }
  });

  // Scrubber Touch Seek
  elements.sheetScrubberBar.addEventListener('click', (e) => {
    if (!elements.audioElement || !elements.audioElement.duration) return;
    const rect = elements.sheetScrubberBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    elements.audioElement.currentTime = pct * elements.audioElement.duration;
  });

  // Player Sheet Interactive Swipe Gestures (Horizontal Skip & Vertical Hybrid Drag)
  let sheetTouchStartY = 0;
  let sheetTouchStartX = 0;
  let isDraggingSheet = false;
  let startGeometry = null;

  elements.playerSheet.addEventListener('touchstart', (e) => {
    if (e.target.closest('#sheetHybridLyricsContainer') || e.target.closest('.sheet-scrubber')) {
      isDraggingSheet = false;
      return;
    }
    if (e.touches && e.touches.length > 0) {
      sheetTouchStartY = e.touches[0].clientY;
      sheetTouchStartX = e.touches[0].clientX;
      isDraggingSheet = true;

      // Capture exact starting DOM geometry
      const isHybrid = elements.playerSheet.classList.contains('hybrid-lyrics-mode');
      const bodyRect = elements.playerSheet.getBoundingClientRect();
      const coverRect = elements.sheetCoverTrigger.getBoundingClientRect();
      const metaRect = elements.sheetMetaRow.getBoundingClientRect();

      startGeometry = {
        isHybrid,
        bodyWidth: bodyRect.width,
        bodyHeight: bodyRect.height,
        coverX: coverRect.left,
        coverY: coverRect.top,
        coverWidth: coverRect.width,
        metaX: metaRect.left,
        metaY: metaRect.top,
        metaWidth: metaRect.width
      };
    }
  }, { passive: true });

  elements.playerSheet.addEventListener('touchmove', (e) => {
    if (!isDraggingSheet || !e.touches || e.touches.length === 0 || !startGeometry) return;
    const deltaY = e.touches[0].clientY - sheetTouchStartY;
    const deltaX = e.touches[0].clientX - sheetTouchStartX;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      if (!startGeometry.isHybrid) {
        if (deltaY < 0) {
          // Dragging UP from Fullscreen -> Interpolate directly to Hybrid header bar
          const progress = Math.min(1, Math.max(0, -deltaY / 180));
          const targetCoverX = 20;
          const targetCoverY = 66;
          const targetCoverSize = 52;
          const targetMetaX = 84;
          const targetMetaY = 68;

          const dCoverX = targetCoverX - startGeometry.coverX;
          const dCoverY = targetCoverY - startGeometry.coverY;
          const dScale = targetCoverSize / (startGeometry.coverWidth || 280);
          const dMetaX = targetMetaX - startGeometry.metaX;
          const dMetaY = targetMetaY - startGeometry.metaY;

          elements.sheetCoverTrigger.style.transformOrigin = 'top left';
          elements.sheetCoverTrigger.style.transform = `translate(${progress * dCoverX}px, ${progress * dCoverY}px) scale(${1 - progress * (1 - dScale)})`;

          if (elements.sheetMetaRow) {
            elements.sheetMetaRow.style.transformOrigin = 'top left';
            elements.sheetMetaRow.style.transform = `translate(${progress * dMetaX}px, ${progress * dMetaY}px)`;
          }
          if (elements.sheetTitle) {
            elements.sheetTitle.style.transformOrigin = 'left center';
            elements.sheetTitle.style.transform = `scale(${1 - progress * 0.22})`;
          }
          if (elements.sheetHybridLyricsContainer) {
            elements.sheetHybridLyricsContainer.style.opacity = `${progress}`;
            elements.sheetHybridLyricsContainer.style.transform = `translateY(${(1 - progress) * 35}px)`;
          }
          if (elements.sheetBottomCluster) {
            elements.sheetBottomCluster.style.transform = `translateY(${progress * 14}px)`;
          }
          if (elements.sheetPlayPauseBtn) {
            elements.sheetPlayPauseBtn.style.transform = `scale(${1 - progress * 0.16})`;
          }
        } else if (deltaY > 0) {
          // Dragging DOWN to close sheet to mini-player
          elements.playerSheet.style.transform = `translateY(${deltaY * 0.7}px)`;
        }
      } else {
        if (deltaY > 0) {
          // Dragging DOWN from Hybrid -> Interpolate directly to Fullscreen center position
          const progress = Math.min(1, Math.max(0, deltaY / 180));
          const targetBigWidth = Math.min(startGeometry.bodyWidth * 0.74, 300);
          const targetCoverX = (startGeometry.bodyWidth - targetBigWidth) / 2;
          const targetCoverY = startGeometry.bodyHeight * 0.16;
          const targetMetaX = (startGeometry.bodyWidth - startGeometry.metaWidth) / 2;
          const targetMetaY = targetCoverY + targetBigWidth + 20;

          const dCoverX = targetCoverX - startGeometry.coverX;
          const dCoverY = targetCoverY - startGeometry.coverY;
          const dScale = targetBigWidth / 52;
          const dMetaX = targetMetaX - startGeometry.metaX;
          const dMetaY = targetMetaY - startGeometry.metaY;

          elements.sheetCoverTrigger.style.transformOrigin = 'top left';
          elements.sheetCoverTrigger.style.transform = `translate(${progress * dCoverX}px, ${progress * dCoverY}px) scale(${1 + progress * (dScale - 1)})`;

          if (elements.sheetMetaRow) {
            elements.sheetMetaRow.style.transformOrigin = 'top left';
            elements.sheetMetaRow.style.transform = `translate(${progress * dMetaX}px, ${progress * dMetaY}px)`;
          }
          if (elements.sheetTitle) {
            elements.sheetTitle.style.transformOrigin = 'left center';
            elements.sheetTitle.style.transform = `scale(${1 + progress * 0.28})`;
          }
          if (elements.sheetHybridLyricsContainer) {
            elements.sheetHybridLyricsContainer.style.opacity = `${1 - progress}`;
            elements.sheetHybridLyricsContainer.style.transform = `translateY(${progress * 35}px)`;
          }
          if (elements.sheetBottomCluster) {
            elements.sheetBottomCluster.style.transform = `translateY(${-progress * 14}px)`;
          }
          if (elements.sheetPlayPauseBtn) {
            elements.sheetPlayPauseBtn.style.transform = `scale(${1 + progress * 0.18})`;
          }
        }
      }
    }
  }, { passive: true });

  elements.playerSheet.addEventListener('touchend', (e) => {
    if (!isDraggingSheet) return;
    isDraggingSheet = false;
    startGeometry = null;

    elements.playerSheet.style.transform = '';
    if (elements.sheetTopCluster) elements.sheetTopCluster.style.transform = '';
    elements.sheetCoverTrigger.style.transform = '';
    elements.sheetCoverTrigger.style.transformOrigin = '';
    if (elements.sheetMetaRow) {
      elements.sheetMetaRow.style.transform = '';
      elements.sheetMetaRow.style.transformOrigin = '';
    }
    if (elements.sheetTitle) {
      elements.sheetTitle.style.transform = '';
      elements.sheetTitle.style.transformOrigin = '';
    }
    if (elements.sheetBottomCluster) elements.sheetBottomCluster.style.transform = '';
    if (elements.sheetPlayPauseBtn) elements.sheetPlayPauseBtn.style.transform = '';
    if (elements.sheetHybridLyricsContainer) {
      elements.sheetHybridLyricsContainer.style.opacity = '';
      elements.sheetHybridLyricsContainer.style.transform = '';
    }

    if (e.changedTouches && e.changedTouches.length > 0) {
      const deltaY = e.changedTouches[0].clientY - sheetTouchStartY;
      const deltaX = e.changedTouches[0].clientX - sheetTouchStartX;

      // 1. Horizontal Swipe: Left = Next Track, Right = Previous Track
      if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        if (deltaX < -50) {
          hapticClick();
          playNextTrack();
        } else if (deltaX > 50) {
          hapticClick();
          playPrevTrack();
        }
        return;
      }

      // 2. Vertical Swipe
      if (Math.abs(deltaY) > 30) {
        if (deltaY > 40) {
          // Swiped Downwards
          if (elements.playerSheet.classList.contains('hybrid-lyrics-mode')) {
            elements.playerSheet.classList.remove('hybrid-lyrics-mode');
            elements.playerSheet.classList.remove('manual-scroll');
            state.isHybridManualScroll = false;
            if (elements.btnSyncHybridLyrics) elements.btnSyncHybridLyrics.classList.add('hidden');
            hapticClick();
          } else {
            closePlayerSheet();
          }
        } else if (deltaY < -40) {
          // Swiped Upwards -> Enter Hybrid Lyrics Mode!
          if (!elements.playerSheet.classList.contains('hybrid-lyrics-mode')) {
            elements.playerSheet.classList.add('hybrid-lyrics-mode');
            elements.playerSheet.classList.remove('manual-scroll');
            state.isHybridManualScroll = false;
            if (elements.btnSyncHybridLyrics) elements.btnSyncHybridLyrics.classList.add('hidden');
            hapticClick();
            if (elements.audioElement) updateLyricsScroll(elements.audioElement.currentTime);
          }
        }
      }
    }
  }, { passive: true });

  // Lyrics Line Tapping -> Jump timestamp & reactivate live sync immediately!
  if (elements.sheetHybridLyricsContent) {
    elements.sheetHybridLyricsContent.addEventListener('click', (e) => {
      const lineEl = e.target.closest('.lyrics-line');
      if (!lineEl) return;
      e.stopPropagation();
      hapticClick();
      const idx = parseInt(lineEl.getAttribute('data-index'), 10);
      if (state.parsedLyrics && state.parsedLyrics[idx]) {
        elements.audioElement.currentTime = state.parsedLyrics[idx].timestamp;
        state.isHybridManualScroll = false;
        elements.playerSheet.classList.remove('manual-scroll');
        if (elements.btnSyncHybridLyrics) elements.btnSyncHybridLyrics.classList.add('hidden');
        updateLyricsScroll(elements.audioElement.currentTime);
      }
    });
  }

  // Manual Lyrics Scrolling Handlers: ONLY user touch gestures that move > 8px activate manual scroll
  let lyricsTouchStartY = 0;

  if (elements.sheetHybridLyricsContainer) {
    elements.sheetHybridLyricsContainer.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        lyricsTouchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    elements.sheetHybridLyricsContainer.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) {
        const delta = Math.abs(e.touches[0].clientY - lyricsTouchStartY);
        if (delta > 8) {
          state.isHybridManualScroll = true;
          elements.playerSheet.classList.add('manual-scroll');
          if (elements.btnSyncHybridLyrics) elements.btnSyncHybridLyrics.classList.remove('hidden');
        }
      }
    }, { passive: true });

    elements.sheetHybridLyricsContainer.addEventListener('wheel', () => {
      state.isHybridManualScroll = true;
      elements.playerSheet.classList.add('manual-scroll');
      if (elements.btnSyncHybridLyrics) elements.btnSyncHybridLyrics.classList.remove('hidden');
    }, { passive: true });
  }

  // Floating Sync Button Click -> Re-centers active line & resumes sync with blur restored
  if (elements.btnSyncHybridLyrics) {
    elements.btnSyncHybridLyrics.addEventListener('click', (e) => {
      e.stopPropagation();
      hapticClick();
      state.isHybridManualScroll = false;
      elements.playerSheet.classList.remove('manual-scroll');
      elements.btnSyncHybridLyrics.classList.add('hidden');
      if (elements.audioElement) updateLyricsScroll(elements.audioElement.currentTime);
    });
  }

  // Queue Sheet Interactions
  elements.btnOpenQueueSheet.addEventListener('click', openQueueSheet);
  elements.btnCloseQueueSheet.addEventListener('click', closeQueueSheet);
  elements.btnClearQueueBtn.addEventListener('click', () => {
    hapticClick();
    state.queue = [];
    state.queueIndex = -1;
    renderQueueList();
    showToast('Warteschlange geleert');
  });

  // Settings Sheet Interactions
  elements.btnOpenSettings.addEventListener('click', openSettingsSheet);
  elements.btnCloseSettingsSheet.addEventListener('click', closeSettingsSheet);

  elements.btnConnectPlex.addEventListener('click', async () => {
    hapticClick();
    const url = elements.cfgPlexUrl.value.trim();
    const token = elements.cfgPlexToken.value.trim();
    state.plexConfig = { url, token };
    localStorage.setItem('soundsphere_plex', JSON.stringify(state.plexConfig));
    await loadPlexMusicDirect();
  });

  

  elements.btnRescanDeviceMusic.addEventListener('click', async () => {
    hapticClick();
    await loadDeviceLocalMusic();
  });

  elements.themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      hapticClick();
      applyTheme(btn.getAttribute('data-theme'));
    });
  });

  // Audio Element Events
  elements.audioElement.addEventListener('play', () => {
    elements.miniPlayIcon.classList.add('hidden');
    elements.miniPauseIcon.classList.remove('hidden');
    elements.sheetPlayIcon.classList.add('hidden');
    elements.sheetPauseIcon.classList.remove('hidden');
    syncNativePlayback(true);
  });

  elements.audioElement.addEventListener('pause', () => {
    elements.miniPlayIcon.classList.remove('hidden');
    elements.miniPauseIcon.classList.add('hidden');
    elements.sheetPlayIcon.classList.remove('hidden');
    elements.sheetPauseIcon.classList.add('hidden');
    syncNativePlayback(false);
  });

  elements.audioElement.addEventListener('ended', () => {
    if (state.repeat === 'one') {
      elements.audioElement.currentTime = 0;
      elements.audioElement.play();
    } else {
      playNextTrack();
    }
  });

  elements.audioElement.addEventListener('timeupdate', () => {
    const cur = elements.audioElement.currentTime;
    const dur = elements.audioElement.duration || (state.selectedTrack ? state.selectedTrack.duration : 0);
    const pct = dur > 0 ? (cur / dur) * 100 : 0;

    elements.miniProgressFill.style.width = `${pct}%`;
    elements.sheetScrubberFill.style.width = `${pct}%`;
    elements.sheetCurrentTime.textContent = formatDuration(cur);
    if (dur > 0) elements.sheetTotalDuration.textContent = formatDuration(dur);

    updateLyricsScroll(cur);
  });
}

// --- App Bootstrap ---
function bootMobileApp() {
  applyTheme(state.theme);
  if (state.plexConfig.url) elements.cfgPlexUrl.value = state.plexConfig.url;
  if (state.plexConfig.token) elements.cfgPlexToken.value = state.plexConfig.token;

  setupEventListeners();
  switchTab('songs');
  loadInitialData();
}

window.addEventListener('DOMContentLoaded', bootMobileApp);
