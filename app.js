// --- Tonarr Player JavaScript Engine ---
const state = {
  tracks: [],
  playlists: [],
  favorites: new Set(),
  queue: [],
  queueIndex: -1,
  selectedTrack: null,
  parsedLyrics: [],
  shuffle: false,
  repeat: 'off', // 'off' | 'all' | 'one'
  activeView: 'songs',
  activeSource: 'all', // 'all' | 'plex' | 'local'
  previousView: 'songs',
  navHistory: ['songs'],
  navHistoryIndex: 0,
  selectedArtist: null,
  selectedAlbum: null,
  selectedPlaylist: null,
  contextMenuTrack: null,
  searchQuery: '',
  theme: 'dark_obsidian',
  config: {},
  directories: [],
  sideLyricsVisible: false,
  sideManualScroll: false,
  sideQueueVisible: false,
  fsLyricsVisible: false,
  fsManualScroll: false,
  fsQueueVisible: false,
  pendingResumeTime: 0
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Storage Helpers with Seamless Tonarr & SoundSphere Compatibility ---
function getStoredItem(key) {
  return localStorage.getItem(`tonarr_${key}`) ?? localStorage.getItem(`soundsphere_${key}`);
}
function setStoredItem(key, val) {
  try {
    localStorage.setItem(`tonarr_${key}`, val);
    localStorage.setItem(`soundsphere_${key}`, val);
  } catch (_) {}
}
function removeStoredItem(key) {
  try {
    localStorage.removeItem(`tonarr_${key}`);
    localStorage.removeItem(`soundsphere_${key}`);
  } catch (_) {}
}

function isHostTrack(track) {
  if (!track) return false;
  return track.source === 'tonarr_host' || track.source === 'soundsphere_host' ||
         (track.file_path && track.file_path.startsWith('host://')) ||
         (track.id && String(track.id).startsWith('host://')) ||
         Boolean(track.host_id);
}

function isPlexTrack(track) {
  if (!track) return false;
  if (track.source === 'plex') return true;
  if (Boolean(track.plex_key)) return true;
  const fp = String(track.file_path || '');
  if (fp.startsWith('plex://')) return true;
  const tid = String(track.id || '');
  if (tid.startsWith('plex://') || tid.startsWith('plex_') || tid.startsWith('host://plex_')) return true;
  const hostId = String(track.host_id || '');
  if (hostId.startsWith('plex_') || hostId.startsWith('plex://')) return true;
  return false;
}

function getTrackQualityInfo(track) {
  if (!track) return { label: '', className: '', isLossless: false, isHiRes: false };
  const ext = (track.extension || (track.file_name ? '.' + track.file_name.split('.').pop() : '')).toLowerCase().replace('.', '');
  const codec = (track.codec || track.audio_codec || ext).toUpperCase();
  
  const isLossless = Boolean(
    track.is_lossless || 
    ['flac', 'wav', 'alac', 'aiff', 'dsd'].includes(ext) || 
    ['FLAC', 'ALAC', 'WAV', 'AIFF', 'DSD'].includes(codec)
  );
  
  const bitDepth = track.bit_depth || (track.bits_per_sample ? parseInt(track.bits_per_sample, 10) : null);
  const sampleRate = track.sample_rate || (track.sampling_rate ? parseInt(track.sampling_rate, 10) : null);
  const isHiRes = Boolean(
    track.is_hi_res || 
    (isLossless && ((bitDepth && bitDepth > 16) || (sampleRate && sampleRate > 48000)))
  );

  let label = track.quality_str || '';
  if (!label) {
    if (isHiRes) {
      const parts = [codec || 'FLAC'];
      if (bitDepth) parts.push(`${bitDepth}-Bit`);
      if (sampleRate) parts.push(`${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)} kHz`);
      label = parts.join(' ');
    } else if (isLossless) {
      const parts = [codec || 'LOSSLESS'];
      if (bitDepth && sampleRate) {
        parts.push(`${bitDepth}B/${(sampleRate / 1000).toFixed(1)}k`);
      }
      label = parts.join(' ');
    } else if (track.bitrate) {
      label = `${codec || 'MP3'} ${track.bitrate}k`;
    } else if (codec) {
      label = codec;
    } else if (ext) {
      label = ext.toUpperCase();
    }
  }

  const className = isHiRes ? 'hi-res' : (isLossless ? 'lossless' : '');
  return { label: label || 'AUDIO', className, isLossless, isHiRes };
}
window.getTrackQualityInfo = getTrackQualityInfo;

function isPlexOnlyPlayerSource() {
  const stored = getStoredItem('plex_as_only_player_source');
  if (stored !== null) return stored === 'true';
  return Boolean(
    (state.config && (state.config.plex_as_only_player_source || state.config.folder_source_for_creator_and_manager_only)) ||
    (state.hostConfig && (state.hostConfig.plex_as_only_player_source || state.hostConfig.folder_source_for_creator_and_manager_only))
  );
}

// --- Tonarr Host Helper Functions ---
function getHostBaseUrl() {
  const url = (state.config && (state.config.tonarr_host_url || state.config.soundsphere_host_url)) || 
              getStoredItem('host_url') || '';
  return url.trim().replace(/\/+$/, '');
}

function getHostToken() {
  return (state.config && (state.config.tonarr_host_token || state.config.soundsphere_host_token)) || 
         getStoredItem('host_token') || '';
}

function getApiEndpoint(endpoint) {
  const hostBase = getHostBaseUrl();
  if (hostBase) {
    const sep = endpoint.startsWith('/') ? '' : '/';
    const token = getHostToken();
    const tokenParam = token ? (endpoint.includes('?') ? `&token=${encodeURIComponent(token)}` : `?token=${encodeURIComponent(token)}`) : '';
    return `${hostBase}${sep}${endpoint}${tokenParam}`;
  }
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}
window.getApiEndpoint = getApiEndpoint;

function getPlexApiUrl(endpoint) {
  const hostBase = getHostBaseUrl();
  if (hostBase) {
    const sep = endpoint.startsWith('/') ? '' : '/';
    const token = getHostToken();
    const tokenParam = token ? (endpoint.includes('?') ? `&token=${encodeURIComponent(token)}` : `?token=${encodeURIComponent(token)}`) : '';
    return `${hostBase}${sep}${endpoint}${tokenParam}`;
  }
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}
window.getPlexApiUrl = getPlexApiUrl;


function getTrackCoverUrl(track) {
  if (!track) return '';
  if (track.cover_url) {
    if (track.cover_url.startsWith('http://') || track.cover_url.startsWith('https://')) {
      return track.cover_url;
    }
    const hostBase = getHostBaseUrl();
    if (hostBase && (track.cover_url.startsWith('/api/') || track.cover_url.startsWith('api/'))) {
      const sep = track.cover_url.startsWith('/') ? '' : '/';
      return `${hostBase}${sep}${track.cover_url}`;
    }
    return track.cover_url;
  }
  const isHost = isHostTrack(track);
  const hostBase = getHostBaseUrl();
  if ((isHost || (hostBase && isPlexTrack(track))) && hostBase) {
    const token = getHostToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const trackId = track.host_id || (track.id ? String(track.id).replace(/^host:\/\//, '') : (track.plex_key ? `plex_${track.plex_key}` : ''));
    return `${hostBase}/api/cover?id=${encodeURIComponent(trackId)}&path=${encodeURIComponent(track.file_path || '')}${tokenParam}`;
  }
  return `/api/track/cover?path=${encodeURIComponent(track.file_path || track.id || '')}`;
}
window.getTrackCoverUrl = getTrackCoverUrl;

function getTrackStreamUrl(track) {
  if (!track) return '';
  if (track.stream_url) {
    if (track.stream_url.startsWith('http://') || track.stream_url.startsWith('https://')) {
      return track.stream_url;
    }
    const hostBase = getHostBaseUrl();
    if (hostBase && (track.stream_url.startsWith('/api/') || track.stream_url.startsWith('api/'))) {
      const sep = track.stream_url.startsWith('/') ? '' : '/';
      return `${hostBase}${sep}${track.stream_url}`;
    }
    return track.stream_url;
  }
  if (track.file_path && track.file_path.startsWith('content://')) return track.file_path;
  const isHost = isHostTrack(track);
  const hostBase = getHostBaseUrl();
  if ((isHost || (hostBase && isPlexTrack(track))) && hostBase) {
    const token = getHostToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const trackId = track.host_id || (track.id ? String(track.id).replace(/^host:\/\//, '') : (track.plex_key ? `plex_${track.plex_key}` : ''));
    return `${hostBase}/api/audio/stream?id=${encodeURIComponent(trackId)}${tokenParam}`;
  }
  return `/api/audio/stream?path=${encodeURIComponent(track.file_path || track.id || '')}`;
}
window.getTrackStreamUrl = getTrackStreamUrl;

function getArtistImageUrl(artistName) {
  if (!artistName) return '';
  return getApiEndpoint(`/api/artist/image?name=${encodeURIComponent(artistName)}`);
}
window.getArtistImageUrl = getArtistImageUrl;

// DOM Element Selectors
const $ = (id) => document.getElementById(id);

const elements = {
  // Navigation & Search
  btnNavBack: $('btnNavBack'),
  btnNavForward: $('btnNavForward'),
  searchInput: $('searchInput'),
  clearSearchBtn: $('clearSearchBtn'),
  btnOpenSettings: $('btnOpenSettings'),

  // Music Directories Management
  btnAddDirectoryBtn: $('btnAddDirectoryBtn'),
  directoriesListContainer: $('directoriesListContainer'),
  btnRescanAllDirs: $('btnRescanAllDirs'),
  scanStatusMsg: $('scanStatusMsg'),

  // Mobile Bottom Navigation Bar
  mobileBottomNav: $('mobileBottomNav'),
  mobNavSongs: $('mobNavSongs'),
  mobNavArtists: $('mobNavArtists'),
  mobNavAlbums: $('mobNavAlbums'),
  mobNavFavorites: $('mobNavFavorites'),
  mobNavServer: $('mobNavServer'),

  // Sidebar Items
  navBtnSongs: $('navBtnSongs'),
  navBtnHostSource: $('navBtnHostSource'),
  navBtnPlexSource: $('navBtnPlexSource'),
  navBtnLocalSource: $('navBtnLocalSource'),
  navBtnArtists: $('navBtnArtists'),
  navBtnAlbums: $('navBtnAlbums'),
  navBtnFavorites: $('navBtnFavorites'),
  navBtnQueue: $('navBtnQueue'),
  countSongsBadge: $('countSongsBadge'),
  countHostBadge: $('countHostBadge'),
  countPlexBadge: $('countPlexBadge'),
  countLocalBadge: $('countLocalBadge'),
  countArtistsBadge: $('countArtistsBadge'),
  countAlbumsBadge: $('countAlbumsBadge'),
  countFavsBadge: $('countFavsBadge'),
  countQueueBadge: $('countQueueBadge'),
  playlistNavList: $('playlistNavList'),
  btnCreatePlaylist: $('btnCreatePlaylist'),
  btnImportPlaylists: $('btnImportPlaylists'),

  // Views
  viewSongs: $('viewSongs'),
  viewArtists: $('viewArtists'),
  viewArtistDetail: $('viewArtistDetail'),
  viewAlbums: $('viewAlbums'),
  viewAlbumDetail: $('viewAlbumDetail'),
  viewPlaylistDetail: $('viewPlaylistDetail'),
  viewQueue: $('viewQueue'),

  // View Details & Grids
  songsGrid: $('songsGrid'),
  songsViewTitle: $('songsViewTitle'),
  songsViewSubtitle: $('songsViewSubtitle'),
  tracksTableBody: $('tracksTableBody'),
  artistsGrid: $('artistsGrid'),
  artistsCountLabel: $('artistsCountLabel'),
  artistDetailAvatarImg: $('artistDetailAvatarImg'),
  artistDetailAvatarSvg: $('artistDetailAvatarSvg'),
  artistDetailName: $('artistDetailName'),
  artistDetailMeta: $('artistDetailMeta'),
  artistDetailPopularSection: $('artistDetailPopularSection'),
  artistDetailPopularHeader: $('artistDetailPopularHeader'),
  artistDetailTracksBody: $('artistDetailTracksBody'),
  artistDetailAlbumsSection: $('artistDetailAlbumsSection'),
  artistDetailAlbumsGrid: $('artistDetailAlbumsGrid'),
  artistDetailSinglesSection: $('artistDetailSinglesSection'),
  artistDetailSinglesGrid: $('artistDetailSinglesGrid'),
  btnPlayArtistAll: $('btnPlayArtistAll'),

  albumsGrid: $('albumsGrid'),
  albumsCountLabel: $('albumsCountLabel'),
  albumDetailTitle: $('albumDetailTitle'),
  albumDetailMeta: $('albumDetailMeta'),
  albumDetailCoverImg: $('albumDetailCoverImg'),
  albumDetailCoverFallback: $('albumDetailCoverFallback'),
  albumDetailTracksBody: $('albumDetailTracksBody'),
  btnPlayAlbumAll: $('btnPlayAlbumAll'),

  playlistDetailCoverWrapper: $('playlistDetailCoverWrapper'),
  playlistDetailTitle: $('playlistDetailTitle'),
  playlistDetailMeta: $('playlistDetailMeta'),
  playlistDetailTracksBody: $('playlistDetailTracksBody'),
  playlistSourceBadge: $('playlistSourceBadge'),
  btnPlayPlaylistAll: $('btnPlayPlaylistAll'),
  btnDeletePlaylist: $('btnDeletePlaylist'),

  queueCountLabel: $('queueCountLabel'),
  queueListContainer: $('queueListContainer'),
  btnClearQueue: $('btnClearQueue'),

  // Right Live Lyrics Sidebar Panel
  playerLyricsSidebar: $('playerLyricsSidebar'),
  btnCloseSideLyrics: $('btnCloseSideLyrics'),
  sideLyricsSubtitle: $('sideLyricsSubtitle'),
  sideLyricsWrapper: $('sideLyricsWrapper'),
  sideLyricsScrollBox: $('sideLyricsScrollBox'),
  sideSyncLyricsBtn: $('sideSyncLyricsBtn'),
  btnPlayerLyricsToggle: $('btnPlayerLyricsToggle'),

  // Right Queue Sidebar Panel (Standard View)
  playerQueueSidebar: $('playerQueueSidebar'),
  btnCloseSideQueue: $('btnCloseSideQueue'),
  btnClearSideQueue: $('btnClearSideQueue'),
  sideQueueSubtitle: $('sideQueueSubtitle'),
  sideQueueWrapper: $('sideQueueWrapper'),
  sideQueueList: $('sideQueueList'),
  btnPlayerQueueToggle: $('btnPlayerQueueToggle'),

  // Bottom Persistent Player Bar
  audioElement: $('audioElement'),
  spLeft: document.querySelector('.sp-left'),
  spCoverImg: $('spCoverImg'),
  spCoverImgBack: $('spCoverImgBack'),
  spCoverFallback: $('spCoverFallback'),
  spTitle: $('spTitle'),
  spQualityBadge: $('spQualityBadge'),
  spArtist: $('spArtist'),
  playerHeartBtn: $('playerHeartBtn'),
  shuffleBtn: $('shuffleBtn'),
  prevTrackBtn: $('prevTrackBtn'),
  playPauseBtn: $('playPauseBtn'),
  playIcon: $('playIcon'),
  pauseIcon: $('pauseIcon'),
  nextTrackBtn: $('nextTrackBtn'),
  repeatBtn: $('repeatBtn'),
  repeatBadge: $('repeatBadge'),
  currentTime: $('currentTime'),
  totalDuration: $('totalDuration'),
  progressBar: $('progressBar'),
  progressFill: $('progressFill'),
  volumeBtn: $('volumeBtn'),
  volumeSlider: $('volumeSlider'),
  volHighIcon: $('volHighIcon'),
  volMuteIcon: $('volMuteIcon'),
  fullscreenToggleBtn: $('fullscreenToggleBtn'),

  // Fullscreen Canvas Overlay
  fullscreenVisualizer: $('fullscreenVisualizer'),
  fsBackdrop: $('fsBackdrop'),
  fsBackdropBack: $('fsBackdropBack'),
  fsCoverImg: $('fsCoverImg'),
  fsCoverImgBack: $('fsCoverImgBack'),
  fsCoverFallback: $('fsCoverFallback'),
  fsArtworkContainer: $('fsArtworkContainer'),
  fsMetaBox: $('fsMetaBox'),
  fsLyricsWrapper: $('fsLyricsWrapper'),
  fsLyricsScrollBox: $('fsLyricsScrollBox'),
  fsLyricsToggleBtn: $('fsLyricsToggleBtn'),
  fsSyncLyricsBtn: $('fsSyncLyricsBtn'),
  fsQueueCol: $('fsQueueCol'),
  fsQueueSubtitle: $('fsQueueSubtitle'),
  fsQueueWrapper: $('fsQueueWrapper'),
  fsQueueList: $('fsQueueList'),
  fsQueueToggleBtn: $('fsQueueToggleBtn'),
  btnClearFsQueue: $('btnClearFsQueue'),
  fsTitle: $('fsTitle'),
  fsQualityBadge: $('fsQualityBadge'),
  fsArtist: $('fsArtist'),
  fsAlbum: $('fsAlbum'),
  fsCurrentTime: $('fsCurrentTime'),
  fsTotalDuration: $('fsTotalDuration'),
  fsProgressBar: $('fsProgressBar'),
  fsProgressFill: $('fsProgressFill'),
  fsPlayPauseBtn: $('fsPlayPauseBtn'),
  fsPlayIcon: $('fsPlayIcon'),
  fsPauseIcon: $('fsPauseIcon'),
  fsPrevBtn: $('fsPrevBtn'),
  fsNextBtn: $('fsNextBtn'),
  fsShuffleBtn: $('fsShuffleBtn'),
  fsRepeatBtn: $('fsRepeatBtn'),
  btnToggleNativeFs: $('toggleScreenFullscreenBtn') || $('btnToggleNativeFs'),
  iconExpandFs: $('screenFsExpandIcon') || $('iconExpandFs'),
  iconCompressFs: $('screenFsCompressIcon') || $('iconCompressFs'),
  closeFullscreenBtn: $('closeFullscreenBtn'),

  // Context Menu
  trackContextMenu: $('trackContextMenu'),
  ctxPlayNext: $('ctxPlayNext'),
  ctxAddToQueue: $('ctxAddToQueue'),
  ctxAddToPlaylist: $('ctxAddToPlaylist'),
  ctxToggleFavorite: $('ctxToggleFavorite'),
  ctxFavoriteLabel: $('ctxFavoriteLabel'),
  ctxGoToArtist: $('ctxGoToArtist'),
  ctxGoToAlbum: $('ctxGoToAlbum'),
  ctxShowInExplorer: $('ctxShowInExplorer'),

  // Album Context Menu
  albumContextMenu: $('albumContextMenu'),
  ctxAlbumPlay: $('ctxAlbumPlay'),
  ctxAlbumPlayNext: $('ctxAlbumPlayNext'),
  ctxAlbumAddToQueue: $('ctxAlbumAddToQueue'),
  ctxAlbumGoToArtist: $('ctxAlbumGoToArtist'),

  // Modals
  settingsModal: $('settingsModal'),
  settingsModalBackdrop: $('settingsModalBackdrop'),
  btnCloseSettingsModal: $('btnCloseSettingsModal'),
  btnCancelSettings: $('btnCancelSettings'),
  btnSaveSettings: $('btnSaveSettings'),
  hostConnectionBadge: $('hostConnectionBadge'),
  hostConnectedContainer: $('hostConnectedContainer'),
  hostConnectedServerInfo: $('hostConnectedServerInfo'),
  hostConfigContainer: $('hostConfigContainer'),
  hostUrlInput: $('hostUrlInput'),
  hostTokenInput: $('hostTokenInput'),
  btnTestHostConnection: $('btnTestHostConnection'),
  btnSyncHostLibrary: $('btnSyncHostLibrary'),
  btnDisconnectHost: $('btnDisconnectHost'),
  btnDiscoverHost: $('btnDiscoverHost'),
  btnDiscoverHostConnected: $('btnDiscoverHostConnected'),
  hostDiscoveryResultsContainer: $('hostDiscoveryResultsContainer'),
  hostDiscoveryResultsConnectedContainer: $('hostDiscoveryResultsConnectedContainer'),
  hostStatusMsg: $('hostStatusMsg'),
  plexConnectionBadge: $('plexConnectionBadge'),
  plexLoggedOutContainer: $('plexLoggedOutContainer'),
  plexConnectedContainer: $('plexConnectedContainer'),
  plexConnectedServerInfo: $('plexConnectedServerInfo'),
  btnLoginPlexOAuth: $('btnLoginPlexOAuth'),
  btnSyncPlexLibrary: $('btnSyncPlexLibrary'),
  btnLogoutPlex: $('btnLogoutPlex'),
  btnToggleManualPlex: $('btnToggleManualPlex'),
  manualPlexContainer: $('manualPlexContainer'),
  plexUrlInput: $('plexUrlInput'),
  plexTokenInput: $('plexTokenInput'),
  btnTestPlexConnection: $('btnTestPlexConnection'),
  plexStatusMsg: $('plexStatusMsg'),
  plexViaHostToggle: $('plexViaHostToggle'),
  preferPlexMetadataToggle: $('preferPlexMetadataToggle'),
  plexAsOnlyPlayerSourceToggle: $('plexAsOnlyPlayerSourceToggle'),
  plexSectionSelect: $('plexSectionSelect'),
  tabBtnSources: $('tabBtnSources'),
  settingsSourcesGroup: $('settingsSourcesGroup'),
  spotifyLoggedOutContainer: $('spotifyLoggedOutContainer'),
  spotifyConnectedContainer: $('spotifyConnectedContainer'),
  spotifyConnectedUserInfo: $('spotifyConnectedUserInfo'),
  btnLoginSpotifyOAuth: $('btnLoginSpotifyOAuth'),
  btnSyncSpotifyPlaylists: $('btnSyncSpotifyPlaylists'),
  btnLogoutSpotify: $('btnLogoutSpotify'),
  btnToggleSpotifyCustomApp: $('btnToggleSpotifyCustomApp'),
  spotifyCustomAppContainer: $('spotifyCustomAppContainer'),
  spotifyClientIdInput: $('spotifyClientIdInput'),
  spotifyClientSecretInput: $('spotifyClientSecretInput'),
  btnSaveSpotifyApiKeys: $('btnSaveSpotifyApiKeys'),
  spotifyStatusMsg: $('spotifyStatusMsg'),

  eqPresetSelect: $('eqPresetSelect'),
  btnResetEq: $('btnResetEq'),
  eqSlidersContainer: $('eqSlidersContainer'),
  eqPreampSlider: $('eqPreampSlider'),
  eqPreampValue: $('eqPreampValue'),
  eqLimiterToggle: $('eqLimiterToggle'),

  themeDropdownContainer: $('themeDropdownContainer'),
  themeDropdownTrigger: $('themeDropdownTrigger'),
  themeDropdownSelectedSwatch: $('themeDropdownSelectedSwatch'),
  themeDropdownSelectedTitle: $('themeDropdownSelectedTitle'),
  themeDropdownSelectedDesc: $('themeDropdownSelectedDesc'),
  themeDropdownMenu: $('themeDropdownMenu'),
  swatchDynamic: $('swatchDynamic'),
  ambientCoverBgToggle: $('ambientCoverBgToggle'),
  globalCoverBackdrop: $('globalCoverBackdrop'),
  globalCoverBackdropFront: $('globalCoverBackdropFront'),
  globalCoverBackdropBack: $('globalCoverBackdropBack'),

  importPlaylistsModal: $('importPlaylistsModal'),
  importPlaylistsBackdrop: $('importPlaylistsBackdrop'),
  btnCloseImportModal: $('btnCloseImportModal'),
  btnCancelImport: $('btnCancelImport'),
  tabImportPlex: $('tabImportPlex'),
  tabImportSpotify: $('tabImportSpotify'),
  importPlaylistsList: $('importPlaylistsList'),

  newPlaylistModal: $('newPlaylistModal'),
  newPlaylistBackdrop: $('newPlaylistBackdrop'),
  btnCloseNewPlaylistModal: $('btnCloseNewPlaylistModal'),
  btnCancelNewPlaylist: $('btnCancelNewPlaylist'),
  btnSaveNewPlaylist: $('btnSaveNewPlaylist'),
  newPlaylistNameInput: $('newPlaylistNameInput'),

  toast: $('toast')
};

// --- Toast Messenger ---
let toastTimeout;
function showToast(msg, duration = 3000) {
  if (!elements.toast) return;
  elements.toast.textContent = msg;
  elements.toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, duration);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDuration(sec) {
  if (isNaN(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Theme Metadata & Descriptions ---
const THEME_METADATA = {
  dark_obsidian: {
    title: 'Dark Obsidian',
    desc: 'Dunkles Lila (Standard)',
    swatchStyle: 'background: linear-gradient(135deg, #090d16, #8b5cf6);'
  },
  dynamic: {
    title: '✨ Dynamisch',
    desc: 'Passt sich dem Cover an',
    swatchStyle: 'background: linear-gradient(135deg, #ec4899, #8b5cf6, #3b82f6, #10b981);'
  },
  midnight_violet: {
    title: 'Midnight Violet',
    desc: 'Deep Neon Glow',
    swatchStyle: 'background: linear-gradient(135deg, #110726, #c084fc);'
  },
  obsidian_emerald: {
    title: 'Emerald Dark',
    desc: 'Smaragdgrün',
    swatchStyle: 'background: linear-gradient(135deg, #061e16, #10b981);'
  },
  sunset_amber: {
    title: 'Sunset Amber',
    desc: 'Warmes Gold / Bernstein',
    swatchStyle: 'background: linear-gradient(135deg, #1f1105, #f59e0b);'
  },
  snow_white: {
    title: 'Snow Light',
    desc: 'Helles Design',
    swatchStyle: 'background: linear-gradient(135deg, #f8fafc, #6366f1);'
  }
};

// --- Theme Management & Dynamic Palette Extractor ---
function setTheme(themeName) {
  state.theme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  setStoredItem('theme', themeName);

  // Update theme trigger preview in custom dropdown
  const meta = THEME_METADATA[themeName] || THEME_METADATA.dark_obsidian;
  if (elements.themeDropdownSelectedTitle) elements.themeDropdownSelectedTitle.textContent = meta.title;
  if (elements.themeDropdownSelectedDesc) elements.themeDropdownSelectedDesc.textContent = meta.desc;
  if (elements.themeDropdownSelectedSwatch) elements.themeDropdownSelectedSwatch.style.cssText = meta.swatchStyle;

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === themeName);
  });

  if (themeName === 'dynamic') {
    if (state.selectedTrack) {
      applyDynamicThemeFromImage(getTrackCoverUrl(state.selectedTrack) || state.selectedTrack);
    } else if (elements.spCoverImg && elements.spCoverImg.src && !elements.spCoverImg.classList.contains('hidden')) {
      applyDynamicThemeFromImage(elements.spCoverImg);
    }
  } else {
    clearDynamicThemeVariables();
  }
}

// --- Ambient Cover Background (Cover als Hintergrund) ---
let isAmbientCoverBgEnabled = false;

function setAmbientCoverBg(enabled, shouldSync = true) {
  isAmbientCoverBgEnabled = !!enabled;
  document.body.classList.toggle('ambient-cover-bg', isAmbientCoverBgEnabled);
  setStoredItem('ambient_cover_bg', isAmbientCoverBgEnabled ? 'true' : 'false');
  if (elements.ambientCoverBgToggle) {
    elements.ambientCoverBgToggle.checked = isAmbientCoverBgEnabled;
  }
  if (isAmbientCoverBgEnabled) {
    const track = state.selectedTrack || (state.queue && state.queue[state.queueIndex]);
    const coverUrl = track ? getTrackCoverUrl(track) : (elements.spCoverImg && elements.spCoverImg.src && !elements.spCoverImg.src.includes('data:image/svg') ? elements.spCoverImg.src : '');
    if (coverUrl) {
      updateGlobalCoverBackdrop(coverUrl);
    }
  } else {
    updateGlobalCoverBackdrop(null);
  }
  if (shouldSync && typeof syncConfigToBackend === 'function') {
    syncConfigToBackend();
  }
}

function updateGlobalCoverBackdrop(coverUrl) {
  if (!isAmbientCoverBgEnabled) {
    if (elements.globalCoverBackdropFront) elements.globalCoverBackdropFront.style.backgroundImage = 'none';
    if (elements.globalCoverBackdropBack) elements.globalCoverBackdropBack.style.backgroundImage = 'none';
    return;
  }
  if (!coverUrl) return;
  crossfadeBackdrop(elements.globalCoverBackdropFront, elements.globalCoverBackdropBack, coverUrl);
}

function applyDynamicThemeFromImage(imgOrUrl) {
  if (state.theme !== 'dynamic') return;

  function fallbackDynamicTheme() {
    const track = state.selectedTrack;
    if (!track) return;
    const str = `${track.title || ''} ${track.artist || ''} ${track.album || ''}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    const root = document.documentElement;
    root.style.setProperty('--bg-base', `hsl(${hue}, 26%, 7%)`);
    root.style.setProperty('--bg-surface', `hsla(${hue}, 24%, 13%, 0.75)`);
    root.style.setProperty('--bg-surface-hover', `hsla(${hue}, 28%, 20%, 0.82)`);
    root.style.setProperty('--bg-sidebar', `hsla(${hue}, 24%, 9%, 0.90)`);
    root.style.setProperty('--bg-player-bar', `hsla(${hue}, 28%, 8%, 0.96)`);
    root.style.setProperty('--border-color', `hsla(${hue}, 24%, 70%, 0.1)`);
    root.style.setProperty('--border-color-light', `hsla(${hue}, 24%, 80%, 0.18)`);
    root.style.setProperty('--primary', `hsl(${hue}, 70%, 52%)`);
    root.style.setProperty('--primary-hover', `hsl(${hue}, 70%, 44%)`);
    root.style.setProperty('--primary-light', `hsl(${hue}, 60%, 68%)`);
    root.style.setProperty('--primary-glow', `hsla(${hue}, 70%, 52%, 0.42)`);
  }

  function applyPaletteFromRgb(avgR, avgG, avgB) {
    const hsl = rgbToHsl(avgR, avgG, avgB);
    let dominantHue = Math.round(hsl.h * 360);
    let satPct = Math.round(hsl.s * 100);
    let lightPct = Math.round(hsl.l * 100);

    const root = document.documentElement;

    if (satPct < 10) {
      // True monochrome (neutral grayscale) theme for black & white or near-monochrome covers
      root.style.setProperty('--bg-base', '#08080a');
      root.style.setProperty('--bg-surface', 'rgba(24, 24, 27, 0.75)');
      root.style.setProperty('--bg-surface-hover', 'rgba(39, 39, 42, 0.85)');
      root.style.setProperty('--bg-sidebar', 'rgba(13, 13, 15, 0.90)');
      root.style.setProperty('--bg-player-bar', 'rgba(10, 10, 12, 0.96)');
      root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.08)');
      root.style.setProperty('--border-color-light', 'rgba(255, 255, 255, 0.16)');

      // Balanced silver / neutral zinc primary: capped at 48% lightness so white text & icons (#fff) on buttons are 100% readable
      root.style.setProperty('--primary', 'hsl(0, 0%, 48%)');
      root.style.setProperty('--primary-hover', 'hsl(0, 0%, 38%)');
      root.style.setProperty('--primary-light', 'hsl(0, 0%, 66%)');
      root.style.setProperty('--primary-glow', 'rgba(255, 255, 255, 0.15)');
      return;
    }

    const baseSat = Math.min(satPct, 36);
    const accentSat = Math.min(95, Math.max(satPct, Math.round(satPct * 1.2)));

    // Strictly cap max lightness at 52% so white text / button icons remain high contrast
    let targetLight = lightPct > 60 ? 50 : (lightPct < 35 ? lightPct + 22 : lightPct + 4);
    const accentLight = Math.min(52, Math.max(44, targetLight));

    root.style.setProperty('--bg-base', `hsl(${dominantHue}, ${baseSat}%, 7%)`);
    root.style.setProperty('--bg-surface', `hsla(${dominantHue}, ${Math.min(baseSat, 28)}%, 13%, 0.75)`);
    root.style.setProperty('--bg-surface-hover', `hsla(${dominantHue}, ${Math.min(baseSat, 32)}%, 20%, 0.82)`);
    root.style.setProperty('--bg-sidebar', `hsla(${dominantHue}, ${baseSat}%, 9%, 0.90)`);
    root.style.setProperty('--bg-player-bar', `hsla(${dominantHue}, ${Math.min(baseSat + 4, 36)}%, 8%, 0.96)`);
    root.style.setProperty('--border-color', `hsla(${dominantHue}, ${baseSat}%, 70%, 0.1)`);
    root.style.setProperty('--border-color-light', `hsla(${dominantHue}, ${baseSat}%, 80%, 0.18)`);

    root.style.setProperty('--primary', `hsl(${dominantHue}, ${accentSat}%, ${accentLight}%)`);
    root.style.setProperty('--primary-hover', `hsl(${dominantHue}, ${accentSat}%, ${Math.max(36, accentLight - 8)}%)`);
    root.style.setProperty('--primary-light', `hsl(${dominantHue}, ${Math.max(20, accentSat - 12)}%, ${Math.min(68, accentLight + 14)}%)`);
    root.style.setProperty('--primary-glow', `hsla(${dominantHue}, ${accentSat}%, ${accentLight}%, 0.42)`);

    // Live update dynamic swatch preview in dropdown
    if (elements.swatchDynamic) {
      elements.swatchDynamic.style.background = `hsl(${dominantHue}, ${accentSat}%, ${accentLight}%)`;
    }
    if (elements.themeDropdownSelectedSwatch && state.theme === 'dynamic') {
      elements.themeDropdownSelectedSwatch.style.background = `hsl(${dominantHue}, ${accentSat}%, ${accentLight}%)`;
    }
  }

  function extractFromImg(loadedImg) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = 64;
      canvas.height = 64;
      ctx.drawImage(loadedImg, 0, 0, 64, 64);
      const imgData = ctx.getImageData(0, 0, 64, 64).data;

      // Pass 1: Chromatic collection (ignores blindingly bright white backgrounds > 220 & deep blacks < 18)
      let chromaR = 0, chromaG = 0, chromaB = 0, chromaCount = 0;
      // Pass 2: Grayscale fallback collection
      let grayR = 0, grayG = 0, grayB = 0, grayCount = 0;

      for (let i = 0; i < imgData.length; i += 16) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];
        if (a < 128) continue;
        const brightness = (r + g + b) / 3;

        if (brightness >= 18 && brightness <= 220) {
          grayR += r;
          grayG += g;
          grayB += b;
          grayCount++;

          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const sat = (maxC - minC) / Math.max(1, maxC);
          if (sat > 0.14) {
            chromaR += r;
            chromaG += g;
            chromaB += b;
            chromaCount++;
          }
        }
      }

      let avgR, avgG, avgB;
      if (chromaCount >= 6) {
        avgR = Math.round(chromaR / chromaCount);
        avgG = Math.round(chromaG / chromaCount);
        avgB = Math.round(chromaB / chromaCount);
      } else if (grayCount > 0) {
        avgR = Math.round(grayR / grayCount);
        avgG = Math.round(grayG / grayCount);
        avgB = Math.round(grayB / grayCount);
      } else {
        let totR = 0, totG = 0, totB = 0, totCnt = 0;
        for (let i = 0; i < imgData.length; i += 16) {
          totR += imgData[i];
          totG += imgData[i + 1];
          totB += imgData[i + 2];
          totCnt++;
        }
        avgR = Math.round(totR / Math.max(1, totCnt));
        avgG = Math.round(totG / Math.max(1, totCnt));
        avgB = Math.round(totB / Math.max(1, totCnt));
      }

      applyPaletteFromRgb(avgR, avgG, avgB);
    } catch (err) {
      console.warn('Canvas dynamic theme extraction error (CORS):', err);
      fallbackDynamicTheme();
    }
  }

  if (typeof imgOrUrl === 'string') {
    if (!imgOrUrl) {
      fallbackDynamicTheme();
      return;
    }
    const temp = new Image();
    temp.crossOrigin = 'anonymous';
    temp.onload = () => extractFromImg(temp);
    temp.onerror = () => fallbackDynamicTheme();
    temp.src = imgOrUrl;
    return;
  }

  if (imgOrUrl instanceof HTMLImageElement) {
    if (imgOrUrl.complete && imgOrUrl.naturalWidth > 0) {
      const temp = new Image();
      temp.crossOrigin = 'anonymous';
      temp.onload = () => extractFromImg(temp);
      temp.onerror = () => extractFromImg(imgOrUrl);
      temp.src = imgOrUrl.src;
    } else {
      imgOrUrl.addEventListener('load', () => applyDynamicThemeFromImage(imgOrUrl), { once: true });
    }
    return;
  }

  fallbackDynamicTheme();
}

function clearDynamicThemeVariables() {
  const root = document.documentElement;
  const props = [
    '--bg-base', '--bg-surface', '--bg-surface-hover', '--bg-sidebar', '--bg-player-bar',
    '--border-color', '--border-color-light', '--primary', '--primary-hover', '--primary-light', '--primary-glow'
  ];
  props.forEach(p => root.style.removeProperty(p));
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

// --- Web Audio API 10-Band Equalizer, Preamp & Dynamics Limiter ---
let audioCtx = null;
let eqFilters = [];
let preampNode = null;
let limiterNode = null;
let isLimiterEnabled = true;
let currentPreampDb = 0;
const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass_boost: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  vocal_boost: [-2, -2, -1, 1, 4, 5, 4, 2, 0, -1],
  rock: [4, 3, 2, 0, -1, -1, 1, 3, 4, 4],
  pop: [-1, 1, 3, 4, 3, 0, -1, -1, 2, 3],
  electronic: [5, 4, 2, 0, -2, 2, 1, 3, 4, 5],
  acoustic: [3, 2, 1, 1, 2, 2, 3, 3, 2, 1]
};

function formatPreampText(db) {
  const sign = db > 0 ? '+' : '';
  return `${sign}${db.toFixed(1)} dB`;
}

function updatePreampGain(db) {
  currentPreampDb = db;
  if (elements.eqPreampValue) {
    elements.eqPreampValue.textContent = formatPreampText(db);
  }
  if (preampNode && audioCtx) {
    const linearGain = Math.pow(10, currentPreampDb / 20);
    try {
      preampNode.gain.setTargetAtTime(linearGain, audioCtx.currentTime, 0.01);
    } catch (e) {
      preampNode.gain.value = linearGain;
    }
  }
}

function updateLimiterRouting() {
  if (!audioCtx || !eqFilters || !eqFilters.length) return;
  const lastFilter = eqFilters[eqFilters.length - 1];
  try {
    lastFilter.disconnect();
  } catch (e) {}
  try {
    if (limiterNode) limiterNode.disconnect();
  } catch (e) {}

  if (isLimiterEnabled) {
    if (!limiterNode) {
      limiterNode = audioCtx.createDynamicsCompressor();
      limiterNode.threshold.value = -1.5;
      limiterNode.knee.value = 4.0;
      limiterNode.ratio.value = 20.0;
      limiterNode.attack.value = 0.003;
      limiterNode.release.value = 0.15;
    }
    try {
      lastFilter.connect(limiterNode);
      limiterNode.connect(audioCtx.destination);
    } catch (e) {
      console.warn('Could not connect limiter node:', e);
      lastFilter.connect(audioCtx.destination);
    }
  } else {
    try {
      lastFilter.connect(audioCtx.destination);
    } catch (e) {
      console.warn('Could not connect filter to destination:', e);
    }
  }
}

// --- Universal Settings Persistence & Storage ---
function saveAllSettings() {
  // 1. Theme
  if (state.theme) {
    setStoredItem('theme', state.theme);
  }

  // 2. Ambient Cover Background
  if (elements.ambientCoverBgToggle) {
    isAmbientCoverBgEnabled = elements.ambientCoverBgToggle.checked;
  }
  setStoredItem('ambient_cover_bg', isAmbientCoverBgEnabled ? 'true' : 'false');
  document.body.classList.toggle('ambient-cover-bg', isAmbientCoverBgEnabled);

  // 3. Tonarr Host settings
  const hostUrl = elements.hostUrlInput ? elements.hostUrlInput.value.trim() : (state.config?.tonarr_host_url || state.config?.soundsphere_host_url || '');
  const hostToken = elements.hostTokenInput ? elements.hostTokenInput.value.trim() : (state.config?.tonarr_host_token || state.config?.soundsphere_host_token || '');
  setStoredItem('host_url', hostUrl);
  setStoredItem('host_token', hostToken);
  setStoredItem('host_enabled', hostUrl ? 'true' : 'false');

  // 4. Plex Server settings
  const plexUrl = elements.plexUrlInput ? elements.plexUrlInput.value.trim() : (state.config?.plex_url || '');
  const plexToken = elements.plexTokenInput ? elements.plexTokenInput.value.trim() : (state.config?.plex_token || '');
  const plexSection = elements.plexSectionSelect ? elements.plexSectionSelect.value : (state.config?.plex_section || '');
  const plexViaHost = elements.plexViaHostToggle ? elements.plexViaHostToggle.checked : (state.config?.plex_via_host || false);
  const preferPlexMeta = elements.preferPlexMetadataToggle ? elements.preferPlexMetadataToggle.checked : (state.config?.prefer_plex_metadata !== false);

  setStoredItem('plex_url', plexUrl);
  setStoredItem('plex_token', plexToken);
  setStoredItem('plex_section', plexSection);
  setStoredItem('plex_via_host', plexViaHost ? 'true' : 'false');
  setStoredItem('prefer_plex_metadata', preferPlexMeta ? 'true' : 'false');
  const plexAsOnly = elements.plexAsOnlyPlayerSourceToggle ? elements.plexAsOnlyPlayerSourceToggle.checked : (getStoredItem('plex_as_only_player_source') === 'true');
  setStoredItem('plex_as_only_player_source', plexAsOnly ? 'true' : 'false');
  if (plexUrl && plexToken) {
    setStoredItem('plex_enabled', 'true');
  }

  // 5. Equalizer settings
  if (elements.eqPreampSlider) {
    const p = parseFloat(elements.eqPreampSlider.value);
    if (!isNaN(p)) currentPreampDb = p;
  }
  if (elements.eqLimiterToggle) {
    isLimiterEnabled = elements.eqLimiterToggle.checked;
  }
  setStoredItem('eq_preamp', currentPreampDb.toString());
  setStoredItem('eq_limiter', isLimiterEnabled ? 'true' : 'false');
  if (elements.eqPresetSelect) {
    setStoredItem('eq_preset', elements.eqPresetSelect.value);
  }
  const eqSliders = elements.eqSlidersContainer ? elements.eqSlidersContainer.querySelectorAll('input[type="range"]') : [];
  if (eqSliders.length === 10) {
    const bandValues = Array.from(eqSliders).map(s => parseFloat(s.value));
    setStoredItem('eq_bands', JSON.stringify(bandValues));
  }

  // 6. Audio playback settings
  if (elements.audioElement) {
    setStoredItem('volume', elements.audioElement.volume.toString());
    setStoredItem('muted', elements.audioElement.muted ? 'true' : 'false');
  }
  setStoredItem('repeat_mode', state.repeatMode || 'off');
  setStoredItem('shuffle_mode', state.isShuffled ? 'true' : 'false');
  setStoredItem('view_mode', state.viewMode || 'grid');

  // Update state.config in memory
  if (!state.config) state.config = {};
  Object.assign(state.config, {
    theme: state.theme,
    ambient_cover_bg: isAmbientCoverBgEnabled,
    eq_preset: elements.eqPresetSelect ? elements.eqPresetSelect.value : (getStoredItem('eq_preset') || 'flat'),
    eq_bands: eqSliders.length === 10 ? Array.from(eqSliders).map(s => parseFloat(s.value)) : (state.config?.eq_bands || [0,0,0,0,0,0,0,0,0,0]),
    eq_preamp: currentPreampDb,
    eq_limiter: isLimiterEnabled,
    tonarr_host_url: hostUrl,
    soundsphere_host_url: hostUrl,
    tonarr_host_token: hostToken,
    soundsphere_host_token: hostToken,
    tonarr_host_enabled: Boolean(hostUrl),
    soundsphere_host_enabled: Boolean(hostUrl),
    plex_url: plexUrl,
    plex_token: plexToken,
    plex_section: plexSection,
    plex_via_host: plexViaHost,
    prefer_plex_metadata: preferPlexMeta
  });
}
window.saveAllSettings = saveAllSettings;

let _backendConfigSyncTimer = null;
function syncConfigToBackend(immediate = false) {
  saveAllSettings();
  if (_backendConfigSyncTimer) clearTimeout(_backendConfigSyncTimer);
  const doSync = async () => {
    try {
      let eqBandValues = [];
      const eqSliders = elements.eqSlidersContainer ? elements.eqSlidersContainer.querySelectorAll('input[type="range"]') : [];
      if (eqSliders.length === 10) {
        eqBandValues = Array.from(eqSliders).map(s => parseFloat(s.value));
      } else {
        const storedBands = getStoredItem('eq_bands');
        if (storedBands) {
          try {
            const parsed = JSON.parse(storedBands);
            if (Array.isArray(parsed) && parsed.length === 10) eqBandValues = parsed;
          } catch (_) {}
        }
        if (eqBandValues.length !== 10 && Array.isArray(state.config?.eq_bands) && state.config.eq_bands.length === 10) {
          eqBandValues = state.config.eq_bands;
        }
      }
      if (eqBandValues.length !== 10) {
        eqBandValues = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      }

      const activePreset = (elements.eqPresetSelect && elements.eqPresetSelect.value) || getStoredItem('eq_preset') || state.config?.eq_preset || 'flat';
      const activePreamp = (elements.eqPreampSlider ? parseFloat(elements.eqPreampSlider.value) : null) ?? currentPreampDb ?? 0;
      const activeLimiter = elements.eqLimiterToggle ? elements.eqLimiterToggle.checked : isLimiterEnabled;
      const activeAmbient = elements.ambientCoverBgToggle ? elements.ambientCoverBgToggle.checked : ((getStoredItem('ambient_cover_bg') !== null) ? (getStoredItem('ambient_cover_bg') === 'true') : isAmbientCoverBgEnabled);

      const hostUrl = elements.hostUrlInput ? elements.hostUrlInput.value.trim() : (state.config?.tonarr_host_url || state.config?.soundsphere_host_url || '');
      const hostToken = elements.hostTokenInput ? elements.hostTokenInput.value.trim() : (state.config?.tonarr_host_token || state.config?.soundsphere_host_token || '');
      const cfg = {
        ...(state.config || {}),
        theme: state.theme,
        ambient_cover_bg: activeAmbient,
        eq_preset: activePreset,
        eq_bands: eqBandValues,
        eq_preamp: activePreamp,
        eq_limiter: activeLimiter,
        tonarr_host_url: hostUrl,
        soundsphere_host_url: hostUrl,
        tonarr_host_token: hostToken,
        soundsphere_host_token: hostToken,
        tonarr_host_enabled: Boolean(hostUrl),
        soundsphere_host_enabled: Boolean(hostUrl),
        plex_url: elements.plexUrlInput ? elements.plexUrlInput.value.trim() : (state.config?.plex_url || ''),
        plex_token: elements.plexTokenInput ? elements.plexTokenInput.value.trim() : (state.config?.plex_token || ''),
        plex_section_id: elements.plexSectionSelect ? elements.plexSectionSelect.value : (state.config?.plex_section_id || ''),
        plex_via_host: elements.plexViaHostToggle ? elements.plexViaHostToggle.checked : (state.config?.plex_via_host || false),
        prefer_plex_metadata: elements.preferPlexMetadataToggle ? elements.preferPlexMetadataToggle.checked : (state.config?.prefer_plex_metadata !== false),
        plex_as_only_player_source: elements.plexAsOnlyPlayerSourceToggle ? elements.plexAsOnlyPlayerSourceToggle.checked : (state.config?.plex_as_only_player_source || false)
      };

      // 1. Local backend
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg)
        });
      } catch (_) {}

      // 2. Remote Host if configured and different from local
      const hostEndpoint = getApiEndpoint('/api/config');
      if (hostEndpoint && !hostEndpoint.startsWith('/api/config')) {
        try {
          await fetch(hostEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg)
          });
        } catch (_) {}
      }
    } catch (_) {}
  };
  if (immediate) {
    doSync();
  } else {
    _backendConfigSyncTimer = setTimeout(doSync, 300);
  }
}
window.syncConfigToBackend = syncConfigToBackend;

function loadAllSettings() {
  // 1. Theme
  const savedTheme = getStoredItem('theme');
  if (savedTheme) setTheme(savedTheme);

  // 2. Ambient Cover Bg
  const savedAmbient = getStoredItem('ambient_cover_bg');
  if (savedAmbient !== null) {
    setAmbientCoverBg(savedAmbient === 'true', false);
  }

  // 3. Host
  const savedHostUrl = getStoredItem('host_url');
  const savedHostToken = getStoredItem('host_token');
  if (elements.hostUrlInput && savedHostUrl) elements.hostUrlInput.value = savedHostUrl;
  if (elements.hostTokenInput && savedHostToken) elements.hostTokenInput.value = savedHostToken;

  // 4. Plex
  const savedPlexUrl = getStoredItem('plex_url');
  const savedPlexToken = getStoredItem('plex_token');
  const savedPlexViaHost = getStoredItem('plex_via_host');
  const savedPreferPlex = getStoredItem('prefer_plex_metadata');
  const savedPlexAsOnly = getStoredItem('plex_as_only_player_source');
  if (elements.plexUrlInput && savedPlexUrl) elements.plexUrlInput.value = savedPlexUrl;
  if (elements.plexTokenInput && savedPlexToken) elements.plexTokenInput.value = savedPlexToken;
  if (elements.plexViaHostToggle && savedPlexViaHost !== null) {
    elements.plexViaHostToggle.checked = savedPlexViaHost === 'true';
  }
  if (elements.preferPlexMetadataToggle && savedPreferPlex !== null) {
    elements.preferPlexMetadataToggle.checked = savedPreferPlex !== 'false';
  }
  if (elements.plexAsOnlyPlayerSourceToggle && savedPlexAsOnly !== null) {
    elements.plexAsOnlyPlayerSourceToggle.checked = savedPlexAsOnly === 'true';
  }

  // 5. Volume & Playback modes
  const savedVol = getStoredItem('volume');
  if (savedVol !== null && elements.audioElement) {
    const v = parseFloat(savedVol);
    if (!isNaN(v)) {
      elements.audioElement.volume = v;
      if (elements.volumeSlider) elements.volumeSlider.value = v;
    }
  }
  const savedMuted = getStoredItem('muted');
  if (savedMuted === 'true' && elements.audioElement) {
    elements.audioElement.muted = true;
    updateVolumeIcon();
  }
  const savedRepeat = getStoredItem('repeat_mode');
  if (savedRepeat) {
    state.repeatMode = savedRepeat;
    updateRepeatBtnUI();
  }
  const savedShuffle = getStoredItem('shuffle_mode');
  if (savedShuffle !== null) {
    state.isShuffled = savedShuffle === 'true';
    updateShuffleBtnUI();
  }

  // 6. View mode
  const savedViewMode = getStoredItem('view_mode');
  if (savedViewMode) {
    state.viewMode = savedViewMode;
  }

  // 7. Equalizer restoration
  restoreEqualizer();
}
window.loadAllSettings = loadAllSettings;

function restoreEqualizer() {
  // Restore Preamp setting
  const savedPreamp = getStoredItem('eq_preamp') ?? (state.config?.eq_preamp !== undefined ? String(state.config.eq_preamp) : null);
  if (savedPreamp !== null) {
    const p = parseFloat(savedPreamp);
    if (!isNaN(p)) {
      currentPreampDb = p;
      updatePreampGain(p);
    }
  }
  if (elements.eqPreampSlider) {
    elements.eqPreampSlider.value = currentPreampDb;
    if (elements.eqPreampValue) elements.eqPreampValue.textContent = formatPreampText(currentPreampDb);
  }

  // Restore Limiter setting
  const savedLimiter = getStoredItem('eq_limiter') ?? (state.config?.eq_limiter !== undefined ? (state.config.eq_limiter ? 'true' : 'false') : null);
  if (savedLimiter !== null) {
    isLimiterEnabled = savedLimiter !== 'false';
    updateLimiterRouting();
  }
  if (elements.eqLimiterToggle) {
    elements.eqLimiterToggle.checked = isLimiterEnabled;
  }

  // Restore saved preset
  const savedPreset = getStoredItem('eq_preset') || state.config?.eq_preset || 'flat';
  if (elements.eqPresetSelect) {
    elements.eqPresetSelect.value = savedPreset;
  }

  // Restore saved bands
  let bandsToApply = null;
  const savedBands = getStoredItem('eq_bands');
  if (savedBands) {
    try {
      const parsed = JSON.parse(savedBands);
      if (Array.isArray(parsed) && parsed.length === 10) bandsToApply = parsed;
    } catch (e) {}
  }
  if (!bandsToApply && Array.isArray(state.config?.eq_bands) && state.config.eq_bands.length === 10) {
    bandsToApply = state.config.eq_bands;
  }
  if (!bandsToApply && EQ_PRESETS[savedPreset]) {
    bandsToApply = EQ_PRESETS[savedPreset];
  }

  if (bandsToApply) {
    const sliders = elements.eqSlidersContainer ? elements.eqSlidersContainer.querySelectorAll('input[type="range"]') : [];
    if (sliders.length === 10) {
      sliders.forEach((s, idx) => {
        if (bandsToApply[idx] !== undefined) {
          s.value = bandsToApply[idx];
          if (eqFilters[idx]) eqFilters[idx].gain.value = bandsToApply[idx];
        }
      });
    } else {
      bandsToApply.forEach((val, idx) => {
        if (typeof val === 'number' && eqFilters[idx]) {
          eqFilters[idx].gain.value = val;
        }
      });
    }
  }
}
window.restoreEqualizer = restoreEqualizer;

function initEqualizer() {
  if (elements.eqPreampSlider) {
    elements.eqPreampSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      updatePreampGain(val);
      setStoredItem('eq_preamp', val.toString());
      syncConfigToBackend();
    });
  }

  if (elements.eqLimiterToggle) {
    elements.eqLimiterToggle.addEventListener('change', (e) => {
      isLimiterEnabled = e.target.checked;
      updateLimiterRouting();
      setStoredItem('eq_limiter', isLimiterEnabled ? 'true' : 'false');
      syncConfigToBackend();
    });
  }

  if (elements.eqSlidersContainer) {
    elements.eqSlidersContainer.innerHTML = EQ_FREQUENCIES.map((freq, idx) => {
      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
      return `
        <div class="eq-band-col">
          <input type="range" min="-12" max="12" step="0.5" value="0" data-index="${idx}">
          <span class="eq-band-label">${label}</span>
        </div>
      `;
    }).join('');

    elements.eqSlidersContainer.querySelectorAll('input[type="range"]').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        const val = parseFloat(e.target.value);
        if (eqFilters[idx]) eqFilters[idx].gain.value = val;
        const sliders = elements.eqSlidersContainer.querySelectorAll('input[type="range"]');
        const bandValues = Array.from(sliders).map(s => parseFloat(s.value));
        setStoredItem('eq_bands', JSON.stringify(bandValues));
        if (elements.eqPresetSelect) elements.eqPresetSelect.value = 'custom';
        setStoredItem('eq_preset', 'custom');
        syncConfigToBackend();
      });
    });
  }

  restoreEqualizer();
}

function setupAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();
    if (elements.audioElement) {
      elements.audioElement.crossOrigin = 'anonymous';
    }
    const source = audioCtx.createMediaElementSource(elements.audioElement);
    
    // Master Preamp Gain
    preampNode = audioCtx.createGain();
    preampNode.gain.value = Math.pow(10, currentPreampDb / 20);

    // 10-Band EQ Filters
    eqFilters = EQ_FREQUENCIES.map((freq, idx) => {
      const filter = audioCtx.createBiquadFilter();
      filter.type = idx === 0 ? 'lowshelf' : (idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking');
      filter.frequency.value = freq;
      filter.gain.value = 0;
      return filter;
    });

    // Dynamics Limiter Node (Anti-Clipping & Overdrive Protection)
    limiterNode = audioCtx.createDynamicsCompressor();
    limiterNode.threshold.value = -1.5;
    limiterNode.knee.value = 4.0;
    limiterNode.ratio.value = 20.0;
    limiterNode.attack.value = 0.003;
    limiterNode.release.value = 0.15;

    // Chain: source -> preampNode -> eqFilters
    source.connect(preampNode);
    let prevNode = preampNode;
    eqFilters.forEach(f => {
      prevNode.connect(f);
      prevNode = f;
    });

    // Chain: eqFilters -> limiterNode (or destination)
    if (isLimiterEnabled) {
      prevNode.connect(limiterNode);
      limiterNode.connect(audioCtx.destination);
    } else {
      prevNode.connect(audioCtx.destination);
    }

    // Apply active EQ band gains, preamp and limiter routing to Web Audio graph
    updatePreampGain(currentPreampDb);
    updateLimiterRouting();
    restoreEqualizer();
  } catch (err) {
    console.warn('Web Audio API not initialized (using direct audio output):', err);
  }
}

function applyEqPreset(presetName, shouldSync = true) {
  const gains = EQ_PRESETS[presetName] || EQ_PRESETS.flat;
  if (elements.eqPresetSelect) {
    elements.eqPresetSelect.value = presetName;
  }
  const sliders = elements.eqSlidersContainer ? elements.eqSlidersContainer.querySelectorAll('input[type="range"]') : [];
  sliders.forEach((s, idx) => {
    if (gains[idx] !== undefined) {
      s.value = gains[idx];
      if (eqFilters[idx]) eqFilters[idx].gain.value = gains[idx];
    }
  });
  if (sliders.length === 0) {
    gains.forEach((val, idx) => {
      if (eqFilters[idx]) eqFilters[idx].gain.value = val;
    });
  }
  try {
    setStoredItem('eq_preset', presetName);
    setStoredItem('eq_bands', JSON.stringify(gains));
  } catch (e) {}
  if (shouldSync && typeof syncConfigToBackend === 'function') {
    syncConfigToBackend();
  }
}

// --- View Switching & Navigation History ---
function switchView(viewName, data = null, pushHistory = true) {
  state.previousView = state.activeView;
  state.activeView = viewName;

  if (pushHistory) {
    state.navHistory = state.navHistory.slice(0, state.navHistoryIndex + 1);
    state.navHistory.push(viewName);
    state.navHistoryIndex = state.navHistory.length - 1;
  }

  // Update Sidebar Nav Item Highlighting
  if (elements.navBtnSongs) elements.navBtnSongs.classList.toggle('active', viewName === 'songs');
  if (elements.navBtnHostSource) elements.navBtnHostSource.classList.toggle('active', viewName === 'host');
  if (elements.navBtnPlexSource) elements.navBtnPlexSource.classList.toggle('active', viewName === 'plex');
  if (elements.navBtnLocalSource) elements.navBtnLocalSource.classList.toggle('active', viewName === 'local');
  if (elements.navBtnArtists) elements.navBtnArtists.classList.toggle('active', viewName === 'artists' || viewName === 'artist_detail');
  if (elements.navBtnAlbums) elements.navBtnAlbums.classList.toggle('active', viewName === 'albums' || viewName === 'album_detail');
  if (elements.navBtnFavorites) elements.navBtnFavorites.classList.toggle('active', viewName === 'favorites');
  if (elements.navBtnQueue) elements.navBtnQueue.classList.toggle('active', viewName === 'queue');
  if (elements.btnPlayerLyricsToggle) elements.btnPlayerLyricsToggle.classList.toggle('active', viewName === 'lyrics');

  // Hide all views and show target view
  const allViews = [
    elements.viewSongs,
    elements.viewArtists,
    elements.viewArtistDetail,
    elements.viewAlbums,
    elements.viewAlbumDetail,
    elements.viewPlaylistDetail,
    elements.viewQueue,
    elements.viewLyrics
  ];

  allViews.forEach(v => {
    if (v) v.classList.remove('active');
  });

  if (viewName === 'songs') {
    state.activeSource = 'all';
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = 'Alle Titel';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${getFilteredTracks().length} Titel in der Mediathek`;
    renderTracksTable();
  } else if (viewName === 'host') {
    state.activeSource = 'host';
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = 'Tonarr Host';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${getFilteredTracks().length} Titel vom Host Server`;
    renderTracksTable();
  } else if (viewName === 'plex') {
    state.activeSource = 'plex';
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = 'Plex Mediathek';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${getFilteredTracks().length} Plex Titel`;
    renderTracksTable();
  } else if (viewName === 'local') {
    state.activeSource = 'local';
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = 'Lokale Musik';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${getFilteredTracks().length} lokale Titel`;
    renderTracksTable();
  } else if (viewName === 'favorites') {
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = '❤️ Favoriten';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${state.favorites.size} Lieblingstitel`;
    renderTracksTable();
  } else if (viewName === 'artists') {
    if (elements.viewArtists) elements.viewArtists.classList.add('active');
    renderArtistsGrid();
  } else if (viewName === 'artist_detail') {
    if (elements.viewArtistDetail) elements.viewArtistDetail.classList.add('active');
    if (data) openArtistDetail(data);
  } else if (viewName === 'albums') {
    if (elements.viewAlbums) elements.viewAlbums.classList.add('active');
    renderAlbumsGrid();
  } else if (viewName === 'album_detail') {
    if (elements.viewAlbumDetail) elements.viewAlbumDetail.classList.add('active');
    if (data) openAlbumDetail(data);
  } else if (viewName === 'playlist_detail') {
    if (elements.viewPlaylistDetail) elements.viewPlaylistDetail.classList.add('active');
    if (data) openPlaylistDetail(data);
  } else if (viewName === 'queue') {
    if (elements.viewQueue) elements.viewQueue.classList.add('active');
    renderQueueView();
  } else if (viewName === 'lyrics') {
    if (elements.viewLyrics) elements.viewLyrics.classList.add('active');
    renderInPlayerLyrics();
  }
}

// --- Data Filtering & Rendering ---
function cleanTrackText(s) {
  if (!s) return '';
  let txt = String(s).toLowerCase().trim();
  txt = txt.replace(/^\d+[\s\.\-_]+/, '').trim();
  txt = txt.replace(/\s*(feat\.?|featuring|ft\.).*$/i, '').trim();
  txt = txt.replace(/\s*[\(\[](remastered|remaster|album version|official|deluxe|bonus|live).*?[\)\]]/gi, '').trim();
  txt = txt.replace(/[^\p{L}\p{N}\s]/gu, '');
  return txt.replace(/\s+/g, ' ').trim();
}

function deduplicateTracksList(list) {
  if (!Array.isArray(list)) return [];
  const seenPlexKeys = new Set();
  const seenTrackNorms = new Set();
  const seenFileNames = new Set();
  const dedupedList = [];
  for (const t of list) {
    if (!t) continue;
    const pkey = t.plex_key ? String(t.plex_key).trim() : '';
    const normA = cleanTrackText(t.artist || '');
    const normT = cleanTrackText(t.title || '');
    const norm = `${normA}:::${normT}`;
    const fname = (t.file_path || '').split(/[/\\]/).pop().toLowerCase();

    if (pkey && seenPlexKeys.has(pkey)) continue;
    if (fname && !fname.startsWith('plex:') && seenFileNames.has(fname)) continue;
    if (normA && normT && seenTrackNorms.has(norm)) continue;

    if (pkey) seenPlexKeys.add(pkey);
    if (fname && !fname.startsWith('plex:')) seenFileNames.add(fname);
    if (normA && normT) seenTrackNorms.add(norm);

    dedupedList.push(t);
  }
  return dedupedList;
}
window.deduplicateTracksList = deduplicateTracksList;

function getFilteredTracks() {
  let list = state.tracks;

  if (isPlexOnlyPlayerSource()) {
    list = list.filter(t => isPlexTrack(t));
    if (state.activeSource === 'local') {
      state.activeSource = 'all';
    }
  }

  if (state.activeSource === 'host') {
    list = list.filter(t => isHostTrack(t));
  } else if (state.activeSource === 'plex') {
    list = list.filter(t => isPlexTrack(t));
  } else if (state.activeSource === 'local') {
    list = list.filter(t => !isHostTrack(t) && !isPlexTrack(t));
  }

  if (state.activeView === 'favorites') {
    list = list.filter(t => state.favorites.has(t.id || t.file_path));
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase().trim();
    list = list.filter(t => {
      const title = (t.title || '').toLowerCase();
      const artist = (t.artist || '').toLowerCase();
      const album = (t.album || '').toLowerCase();
      const genre = (t.genre || '').toLowerCase();
      const path = (t.file_path || '').toLowerCase();
      return title.includes(q) || artist.includes(q) || album.includes(q) || genre.includes(q) || path.includes(q);
    });
  }

  return deduplicateTracksList(list);
}

function renderTracksTable(container = elements.tracksTableBody, tracks = getFilteredTracks(), customRowClickHandler = null) {
  if (container === elements.tracksTableBody && elements.songsGrid) {
    renderSongsGrid(elements.songsGrid, tracks);
  }
  if (!container) return;
  if (tracks.length === 0) {
    container.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px; color:var(--text-muted);">Keine Songs gefunden.</td></tr>`;
    return;
  }

  container.innerHTML = tracks.map((t, idx) => {
    const isSelected = state.selectedTrack && (state.selectedTrack.id === t.id || state.selectedTrack.file_path === t.file_path);
    const isFav = state.favorites.has(t.id || t.file_path);
    const qInfo = getTrackQualityInfo(t);
    const qClass = qInfo.className;
    const qLabel = qInfo.label;

    return `
      <tr class="${isSelected ? 'selected' : ''}" data-track-id="${escapeHtml(t.id || t.file_path)}">
        <td style="text-align: center; color: var(--text-dim); font-size: 0.8rem;">
          ${idx + 1}
        </td>
        <td>
          <div class="track-row-cell-title">
            <div class="track-row-cover">
              <img src="${escapeHtml(getTrackCoverUrl(t))}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none; width:18px; height:18px;"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
            </div>
            <div>
              <span style="display:block; font-weight:700;">${escapeHtml(t.title)}</span>
            </div>
          </div>
        </td>
        <td>${escapeHtml(t.artist || 'Unbekannt')}</td>
        <td>${escapeHtml(t.album || '—')}</td>
        <td style="text-align: center;">
          <span class="quality-tag ${qClass}">${escapeHtml(qLabel)}</span>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); font-size: 0.82rem;">${t.duration_str || '00:00'}</td>
      </tr>
    `;
  }).join('');

  container.querySelectorAll('tr').forEach((row, idx) => {
    const track = tracks[idx];
    row.addEventListener('click', () => {
      if (typeof customRowClickHandler === 'function') {
        customRowClickHandler(track, idx);
      } else {
        playTrackWithContext(track, tracks);
      }
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, track);
    });
  });
}

// --- Artists Helper & Deduplication / Grouping ---
function getPrimaryArtist(artistStr) {
  if (!artistStr) return 'Unbekannter Künstler';
  let art = artistStr.trim();
  const splitRegex = /\s*(?:,|;|\/|&|(?:\s+(?:feat\.?|ft\.?|featuring|vs\.?|x|with)\s+))\s*/i;
  const parts = art.split(splitRegex).map(p => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts[0] : art;
}

function trackMatchesArtist(track, artistName) {
  if (!track || !artistName) return false;
  const target = artistName.trim().toLowerCase();
  const raw = (track.artist || '').trim().toLowerCase();
  if (raw === target) return true;
  const primary = getPrimaryArtist(track.artist).trim().toLowerCase();
  if (primary === target) return true;
  const splitRegex = /\s*(?:,|;|\/|&|(?:\s+(?:feat\.?|ft\.?|featuring|vs\.?|x|with)\s+))\s*/i;
  const parts = raw.split(splitRegex).map(p => p.trim()).filter(Boolean);
  return parts.includes(target);
}

// --- Artists Grid & Artist Detail ---
function renderArtistsGrid() {
  if (!elements.artistsGrid) return;
  const artistMap = new Map();

  state.tracks.forEach(t => {
    const rawArt = (t.artist || 'Unbekannter Künstler').trim();
    const primaryArt = getPrimaryArtist(rawArt);
    const key = primaryArt.toLowerCase();
    
    if (!artistMap.has(key)) {
      artistMap.set(key, { name: primaryArt, tracks: [], firstTrack: t });
    } else {
      const existing = artistMap.get(key);
      if (primaryArt !== primaryArt.toLowerCase() && existing.name === existing.name.toLowerCase()) {
        existing.name = primaryArt;
      }
    }
    const group = artistMap.get(key);
    if (!group.tracks.some(tr => (tr.id || tr.file_path) === (t.id || t.file_path))) {
      group.tracks.push(t);
    }
  });

  const sortedArtists = Array.from(artistMap.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  if (elements.artistsCountLabel) {
    elements.artistsCountLabel.textContent = `${sortedArtists.length} Künstler in der Mediathek`;
  }

  elements.artistsGrid.innerHTML = sortedArtists.map(a => `
    <div class="artist-card" data-artist="${escapeHtml(a.name)}">
      <div class="artist-avatar">
        <img src="${escapeHtml(getArtistImageUrl(a.name))}" loading="lazy" alt="${escapeHtml(a.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </div>
      </div>
      <div class="card-title">${escapeHtml(a.name)}</div>
      <div class="card-meta">${a.tracks.length} ${a.tracks.length === 1 ? 'Titel' : 'Titel'}</div>
    </div>
  `).join('');

  elements.artistsGrid.querySelectorAll('.artist-card').forEach(card => {
    card.addEventListener('click', () => {
      const artName = card.getAttribute('data-artist');
      openArtistDetail(artName);
    });
  });
}

function openArtistDetail(artistName) {
  state.selectedArtist = artistName;
  const artistTracks = state.tracks.filter(t => trackMatchesArtist(t, artistName));
  
  if (elements.artistDetailName) elements.artistDetailName.textContent = artistName;
  if (elements.artistDetailMeta) elements.artistDetailMeta.textContent = `${artistTracks.length} Songs`;

  // 1. Load artist avatar image
  if (elements.artistDetailAvatarImg) {
    elements.artistDetailAvatarImg.src = getArtistImageUrl(artistName);
    elements.artistDetailAvatarImg.style.display = 'block';
    if (elements.artistDetailAvatarSvg) elements.artistDetailAvatarSvg.style.display = 'none';
  }

  // 2. Top tracks (limit to top 5)
  const popularTracks = artistTracks.filter(t => (t.play_count && t.play_count > 0) || (t.popularity && t.popularity > 0) || (t.rating && t.rating > 0));
  const topTracks = popularTracks.length > 0
    ? [...popularTracks].sort((a, b) => ((b.play_count || b.popularity || b.rating || 0) - (a.play_count || a.popularity || a.rating || 0))).slice(0, 5)
    : [...artistTracks].sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })).slice(0, 5);

  if (elements.artistDetailPopularHeader) {
    elements.artistDetailPopularHeader.textContent = popularTracks.length > 0 ? 'Beliebte Titel' : 'Titel';
  }
  if (elements.artistDetailTracksBody) {
    renderTracksTable(elements.artistDetailTracksBody, topTracks);
  }

  // 3. Render Artist Albums
  const albumMap = new Map();
  artistTracks.forEach(t => {
    const alb = (t.album || 'Single / Unbekannt').trim();
    if (!albumMap.has(alb)) {
      albumMap.set(alb, { title: alb, artist: t.artist, tracks: [], firstTrack: t });
    }
    albumMap.get(alb).tracks.push(t);
  });

  if (elements.artistDetailAlbumsGrid) {
    elements.artistDetailAlbumsGrid.innerHTML = Array.from(albumMap.values()).map(a => `
      <div class="album-card" draggable="true" data-album="${escapeHtml(a.title)}" data-artist="${escapeHtml(a.artist)}">
        <div class="album-cover">
          <img src="${escapeHtml(getTrackCoverUrl(a.firstTrack))}" loading="lazy" onerror="this.style.display='none';" />
        </div>
        <div class="card-title">${escapeHtml(a.title)}</div>
        <div class="card-meta">${a.tracks.length} Songs</div>
      </div>
    `).join('');

    elements.artistDetailAlbumsGrid.querySelectorAll('.album-card').forEach(c => {
      const alb = c.getAttribute('data-album');
      const art = c.getAttribute('data-artist');
      const albObj = albumMap.get(alb) || { title: alb, artist: art, tracks: [] };
      makeAlbumCardDraggable(c, alb, art);
      c.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAlbumContextMenu(e.clientX, e.clientY, albObj);
      });
      c.addEventListener('click', () => {
        openAlbumDetail({ title: alb, artist: art, tracks: albObj.tracks });
      });
    });
  }

  if (elements.btnPlayArtistAll) {
    elements.btnPlayArtistAll.onclick = () => {
      if (artistTracks.length > 0) {
        state.queue = [...artistTracks];
        state.queueIndex = 0;
        selectTrack(artistTracks[0], true);
      }
    };
  }

  switchView('artist_detail');
}

// --- Albums Grid & Album Detail ---
function renderAlbumsGrid() {
  if (!elements.albumsGrid) return;
  const albumMap = new Map();

  state.tracks.forEach(t => {
    const alb = (t.album || 'Unbekanntes Album').trim();
    const key = `${alb}____${t.artist || ''}`;
    if (!albumMap.has(key)) {
      albumMap.set(key, { title: alb, artist: t.artist || 'Unbekannt', tracks: [], firstTrack: t });
    }
    albumMap.get(key).tracks.push(t);
  });

  const sortedAlbums = Array.from(albumMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  if (elements.albumsCountLabel) {
    elements.albumsCountLabel.textContent = `${sortedAlbums.length} Alben in der Mediathek`;
  }

  elements.albumsGrid.innerHTML = sortedAlbums.map(a => `
    <div class="album-card" draggable="true" data-album="${escapeHtml(a.title)}" data-artist="${escapeHtml(a.artist)}">
      <div class="album-cover">
        <img src="${escapeHtml(getTrackCoverUrl(a.firstTrack))}" loading="lazy" onerror="this.style.display='none';" />
      </div>
      <div class="card-title">${escapeHtml(a.title)}</div>
      <div class="card-meta">${escapeHtml(a.artist)} • ${a.tracks.length} Songs</div>
    </div>
  `).join('');

  elements.albumsGrid.querySelectorAll('.album-card').forEach(card => {
    const alb = card.getAttribute('data-album');
    const art = card.getAttribute('data-artist');
    const albObj = albumMap.get(`${alb}____${art}`) || albumMap.get(`${alb}____`) || { title: alb, artist: art };
    makeAlbumCardDraggable(card, alb, art);
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAlbumContextMenu(e.clientX, e.clientY, albObj);
    });
    card.addEventListener('click', () => {
      openAlbumDetail({ title: alb, artist: art, tracks: albObj.tracks });
    });
  });
}

function openAlbumDetail(albumObj) {
  if (!albumObj) return;
  state.selectedAlbum = albumObj;
  const albumTracks = (albumObj.tracks && albumObj.tracks.length > 0)
    ? albumObj.tracks
    : state.tracks.filter(t => (t.album || '').trim() === (albumObj.title || '').trim());

  if (elements.albumDetailTitle) elements.albumDetailTitle.textContent = albumObj.title || 'Album';
  if (elements.albumDetailMeta) elements.albumDetailMeta.textContent = `${albumObj.artist || 'Künstler'} • ${albumTracks.length} Songs`;

  if (albumTracks.length > 0 && elements.albumDetailCoverImg) {
    elements.albumDetailCoverImg.src = getTrackCoverUrl(albumTracks[0]);
    elements.albumDetailCoverImg.onload = () => {
      elements.albumDetailCoverImg.style.display = 'block';
      if (elements.albumDetailCoverFallback) elements.albumDetailCoverFallback.style.display = 'none';
    };
  }

  renderTracksTable(elements.albumDetailTracksBody, albumTracks);

  if (elements.btnPlayAlbumAll) {
    elements.btnPlayAlbumAll.onclick = () => {
      if (albumTracks.length > 0) {
        state.queue = [...albumTracks];
        state.queueIndex = 0;
        selectTrack(albumTracks[0], true);
      }
    };
  }

  switchView('album_detail');
}

// --- Playlists Management ---
function getPlaylistCoverUrl(pl) {
  if (!pl) return '';
  const hostBase = getHostBaseUrl();
  const token = getHostToken();
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';

  if (pl.cover_url && !pl.cover_url.includes('undefined')) {
    if (pl.cover_url.startsWith('http://') || pl.cover_url.startsWith('https://')) {
      if (hostBase && (pl.cover_url.includes('127.0.0.1:32400') || pl.cover_url.includes('localhost:32400') || pl.source === 'plex' || String(pl.id).startsWith('plex_'))) {
        const cleanKey = pl.plex_key || (pl.id ? String(pl.id).replace(/^host:\/\//, '').replace(/^plex_/, '') : '');
        let endpoint = `/api/playlist/cover?key=${encodeURIComponent(cleanKey)}`;
        if (pl.thumb) endpoint += `&thumb=${encodeURIComponent(pl.thumb)}`;
        else if (pl.composite) endpoint += `&composite=${encodeURIComponent(pl.composite)}`;
        return `${hostBase}${endpoint}${tokenParam}`;
      }
      return pl.cover_url;
    }
    if (hostBase && (pl.cover_url.startsWith('/api/') || pl.cover_url.startsWith('api/'))) {
      const sep = pl.cover_url.startsWith('/') ? '' : '/';
      const sepParam = pl.cover_url.includes('?') ? '&' : '?';
      return `${hostBase}${sep}${pl.cover_url}${token ? `${sepParam}token=${encodeURIComponent(token)}` : ''}`;
    }
    return pl.cover_url;
  }

  const isPlex = pl.source === 'plex' || (pl.id && String(pl.id).startsWith('plex_')) || pl.plex_key;
  if (isPlex) {
    const cleanKey = pl.plex_key || (pl.id ? String(pl.id).replace(/^host:\/\//, '').replace(/^plex_/, '') : '');
    let url = `/api/playlist/cover?key=${encodeURIComponent(cleanKey)}`;
    if (pl.thumb) url += `&thumb=${encodeURIComponent(pl.thumb)}`;
    else if (pl.composite) url += `&composite=${encodeURIComponent(pl.composite)}`;
    if (hostBase) {
      return `${hostBase}${url}${tokenParam}`;
    }
    return getPlexApiUrl(url);
  }

  if (pl.track_ids && pl.track_ids.length > 0) {
    for (const tid of pl.track_ids) {
      const cleanTid = String(tid).replace(/^host:\/\//, '');
      const track = state.tracks.find(t => 
        t.id === tid || 
        t.id === cleanTid || 
        t.file_path === tid || 
        t.file_path === cleanTid || 
        t.host_id === cleanTid ||
        (t.plex_key && (`plex_${t.plex_key}` === cleanTid || `host://plex_${t.plex_key}` === tid || String(t.plex_key) === cleanTid))
      );
      if (track) {
        const cUrl = getTrackCoverUrl(track);
        if (cUrl) return cUrl;
      }
    }
    const firstTid = String(pl.track_ids[0]).replace(/^host:\/\//, '');
    if (hostBase) {
      return `${hostBase}/api/cover?id=${encodeURIComponent(firstTid)}${tokenParam}`;
    }
    return `/api/track/cover?path=${encodeURIComponent(firstTid)}`;
  }

  // Generate Vibrant Gradient Cover with Initials
  const name = pl.name || 'Playlist';
  const char = name.trim().charAt(0).toUpperCase() || '♪';
  const colorGradients = [
    ['#8b5cf6', '#ec4899'],
    ['#3b82f6', '#10b981'],
    ['#f59e0b', '#ef4444'],
    ['#06b6d4', '#6366f1'],
    ['#10b981', '#3b82f6'],
    ['#a855f7', '#6366f1'],
    ['#ec4899', '#f43f5e']
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const pair = colorGradients[Math.abs(hash) % colorGradients.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${pair[0]}"/><stop offset="100%" stop-color="${pair[1]}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)" rx="14"/><text x="50" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="900" fill="white" text-anchor="middle" dominant-baseline="middle">${escapeHtml(char)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
window.getPlaylistCoverUrl = getPlaylistCoverUrl;
window.getPlaylistCoverUrl = getPlaylistCoverUrl;

function renderPlaylists() {
  if (!elements.playlistNavList) return;
  if (state.playlists.length === 0) {
    elements.playlistNavList.innerHTML = `<span style="font-size:0.75rem; color:var(--text-dim); padding:6px 12px;">Keine Playlists</span>`;
    return;
  }

  elements.playlistNavList.innerHTML = state.playlists.map(p => {
    const isPlex = p.source === 'plex';
    const isSpotify = p.source === 'spotify';
    const badge = isPlex ? '📺 Plex' : (isSpotify ? '🟢 Spotify' : '');

    return `
      <button class="nav-item" data-playlist-id="${p.id}" title="${escapeHtml(p.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.name)}</span>
        ${badge ? `<span style="font-size:0.65rem; color:var(--primary-light);">${badge}</span>` : ''}
        <span class="nav-count">${(p.track_ids || []).length}</span>
      </button>
    `;
  }).join('');

  elements.playlistNavList.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-playlist-id');
      const pl = state.playlists.find(p => p.id === pid);
      if (pl) openPlaylistDetail(pl);
    });
  });
}

async function createNewPlaylist(name) {
  if (!name.trim()) return;
  try {
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    if (res.ok) {
      const newPl = await res.json();
      state.playlists.push(newPl);
      renderPlaylists();
      showToast(`✨ Playlist "${newPl.name}" erstellt!`);
    }
  } catch (err) {
    showToast('Fehler beim Erstellen der Playlist.');
  }
}

async function deletePlaylist(id) {
  try {
    const res = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
    if (res.ok) {
      state.playlists = state.playlists.filter(p => p.id !== id);
      renderPlaylists();
      switchView('songs');
      showToast('Playlist gelöscht.');
    }
  } catch (err) {
    showToast('Fehler beim Löschen der Playlist.');
  }
}

// --- Queue Management ---
function renderQueueView() {
  if (!elements.queueListContainer) return;
  if (elements.queueCountLabel) {
    elements.queueCountLabel.textContent = `${state.queue.length} Songs in der Warteschlange`;
  }

  if (state.queue.length === 0) {
    elements.queueListContainer.innerHTML = `
      <div style="text-align:center; padding: 40px; color:var(--text-muted);">
        <p>Die Warteschlange ist leer.</p>
        <p style="font-size:0.8rem; color:var(--text-dim); margin-top:6px;">Rechtsklick auf einen Song &gt; "Als Nächstes spielen" oder "An Warteschlange anhängen".</p>
      </div>
    `;
    return;
  }

  elements.queueListContainer.innerHTML = state.queue.map((t, idx) => {
    const isCurrent = idx === state.queueIndex;
    return `
      <div class="queue-item ${isCurrent ? 'current-playing' : ''}" data-index="${idx}">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:0.8rem; color:var(--text-dim); width:20px; text-align:center;">${idx + 1}</span>
          <div>
            <h4 style="font-size:0.9rem; font-weight:700; color:#fff;">${escapeHtml(t.title)} ${isCurrent ? '<span style="color:var(--primary-light); font-size:0.75rem;">(Wird abgespielt)</span>' : ''}</h4>
            <p style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(t.artist)} • ${t.duration_str}</p>
          </div>
        </div>
        <button class="btn-icon-tiny btn-remove-queue" data-index="${idx}" title="Aus Warteschlange entfernen">&times;</button>
      </div>
    `;
  }).join('');

  elements.queueListContainer.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-remove-queue')) return;
      const idx = parseInt(item.getAttribute('data-index'), 10);
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
      }
    });
  });

  elements.queueListContainer.querySelectorAll('.btn-remove-queue').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      state.queue.splice(idx, 1);
      if (state.queueIndex >= idx) state.queueIndex--;
      renderQueueView();
      updateBadgeCounts();
    });
  });
}

function addToQueue(track, playNext = false) {
  if (!track) return;
  if (!Array.isArray(state.queue)) state.queue = [];

  if (playNext) {
    const insertIdx = (typeof state.queueIndex === 'number' && state.queueIndex >= 0) ? state.queueIndex + 1 : 0;
    state.queue.splice(insertIdx, 0, track);
    showToast(`🎵 Als Nächstes: "${track.title}"`);
  } else {
    state.queue.push(track);
    showToast(`➕ "${track.title}" zur Warteschlange hinzugefügt.`);
  }

  updateAllQueueViews();
}
window.addToQueue = addToQueue;

// --- In-Player Live Lyrics View ---
function hasLyricsAvailable(track) {
  if (!track) return false;
  if (track.is_instrumental || track.status === 'instrumental') return false;
  if (track.has_synced_lrc || track.status === 'synced' || track.status === 'plain' || track.has_plain_lyrics || track.existing_plain_content) return true;
  if (state.parsedLyrics && state.parsedLyrics.length > 0) return true;
  return false;
}

function updateLyricsButtonVisibility() {
  if (elements.btnPlayerLyricsToggle) {
    elements.btnPlayerLyricsToggle.classList.remove('hidden');
    elements.btnPlayerLyricsToggle.classList.toggle('active', !!state.sideLyricsVisible);
  }
}

function toggleInPlayerLyrics(open) {
  if (!elements.playerLyricsSidebar) return;
  const shouldOpen = (typeof open === 'boolean') ? open : elements.playerLyricsSidebar.classList.contains('hidden');
  state.sideLyricsVisible = shouldOpen;
  elements.playerLyricsSidebar.classList.toggle('hidden', !shouldOpen);
  if (elements.btnPlayerLyricsToggle) elements.btnPlayerLyricsToggle.classList.toggle('active', shouldOpen);
  if (shouldOpen) {
    state.sideManualScroll = false;
    if (elements.sideSyncLyricsBtn) elements.sideSyncLyricsBtn.classList.add('hidden');
    if (elements.sideLyricsWrapper) elements.sideLyricsWrapper.classList.remove('manual-scroll');
    renderInPlayerLyrics();
  }
}

function renderInPlayerLyrics() {
  if (!elements.sideLyricsScrollBox) return;
  const track = state.selectedTrack;
  if (!track) {
    elements.sideLyricsScrollBox.innerHTML = `<div style="text-align:center; padding:60px 16px; color:var(--text-muted); font-size:0.95rem;">Kein Song ausgewählt.</div>`;
    if (elements.sideSyncLyricsBtn) elements.sideSyncLyricsBtn.classList.add('hidden');
    return;
  }

  if (elements.sideLyricsSubtitle) {
    elements.sideLyricsSubtitle.textContent = track.title || 'Live Sync';
  }

  if (track.is_instrumental || track.status === 'instrumental') {
    elements.sideLyricsScrollBox.innerHTML = `
      <div style="text-align:center; padding:60px 16px;">
        <h3 style="font-size:1.3rem; margin-bottom:6px;">🎷 Instrumental</h3>
        <p style="color:var(--text-dim); font-size:0.85rem;">Dieser Titel enthält keinen Gesang.</p>
      </div>
    `;
    if (elements.sideSyncLyricsBtn) elements.sideSyncLyricsBtn.classList.add('hidden');
    return;
  }

  if (state.lyricsLoading && (!state.parsedLyrics || state.parsedLyrics.length === 0)) {
    elements.sideLyricsScrollBox.innerHTML = `
      <div style="text-align:center; padding:60px 16px; color:var(--text-muted); font-size:0.95rem;">
        <div style="width:24px; height:24px; border:2.5px solid rgba(255,255,255,0.15); border-top-color:var(--primary); border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 14px;"></div>
        Lade Songtexte...
      </div>
    `;
    if (elements.sideSyncLyricsBtn) elements.sideSyncLyricsBtn.classList.add('hidden');
    return;
  }

  if (!state.parsedLyrics || state.parsedLyrics.length === 0) {
    elements.sideLyricsScrollBox.innerHTML = `<div style="text-align:center; padding:60px 16px; color:var(--text-muted); font-size:0.95rem;">Kein synchronisierter Songtext verfügbar.</div>`;
    if (elements.sideSyncLyricsBtn) elements.sideSyncLyricsBtn.classList.add('hidden');
    return;
  }

  elements.sideLyricsScrollBox.innerHTML = state.parsedLyrics.map((l, idx) => `
    <div class="side-lyrics-line dist-far" data-idx="${idx}" data-time="${l.timestamp}">
      ${escapeHtml(l.text)}
    </div>
  `).join('');

  elements.sideLyricsScrollBox.querySelectorAll('.side-lyrics-line').forEach(line => {
    line.addEventListener('click', () => {
      const t = parseFloat(line.getAttribute('data-time'));
      if (!isNaN(t) && t >= 0 && elements.audioElement) {
        elements.audioElement.currentTime = t;
        if (elements.audioElement.paused) elements.audioElement.play().catch(() => {});
        state.sideManualScroll = false;
        if (elements.sideSyncLyricsBtn) elements.sideSyncLyricsBtn.classList.add('hidden');
        if (elements.sideLyricsWrapper) elements.sideLyricsWrapper.classList.remove('manual-scroll');
        updateInPlayerLyrics(t, true);
      }
    });
  });

  const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
  updateInPlayerLyrics(cur, true);
}

function updateInPlayerLyrics(currentTime, forceScroll = false) {
  if (!elements.sideLyricsScrollBox || !state.sideLyricsVisible || !state.parsedLyrics || state.parsedLyrics.length === 0) return;

  let activeIdx = -1;
  let maxTime = -1;
  for (let i = 0; i < state.parsedLyrics.length; i++) {
    const t = state.parsedLyrics[i].timestamp;
    if (t <= currentTime && t >= maxTime) {
      maxTime = t;
      activeIdx = i;
    }
  }

  const lines = elements.sideLyricsScrollBox.querySelectorAll('.side-lyrics-line');

  if (state.sideManualScroll) {
    lines.forEach((line, idx) => {
      if (idx === activeIdx) {
        line.className = 'side-lyrics-line active';
      } else {
        line.className = 'side-lyrics-line';
      }
    });
    return;
  }

  lines.forEach((line, idx) => {
    const dist = Math.abs(idx - activeIdx);
    if (idx === activeIdx) {
      const wasActive = line.classList.contains('active') && !line.classList.contains('dist-1') && !line.classList.contains('dist-2') && !line.classList.contains('dist-far');
      line.className = 'side-lyrics-line active';
      if (!wasActive || forceScroll) {
        if (elements.sideLyricsWrapper) {
          if (activeIdx <= 0) {
            elements.sideLyricsWrapper.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            const wrapH = elements.sideLyricsWrapper.clientHeight;
            const lineTop = line.offsetTop;
            const lineH = line.offsetHeight;
            const targetScroll = Math.max(0, lineTop - (wrapH / 2) + (lineH / 2));
            elements.sideLyricsWrapper.scrollTo({ top: targetScroll, behavior: 'smooth' });
          }
        }
      }
    } else if (dist === 1) {
      line.className = 'side-lyrics-line dist-1';
    } else if (dist === 2) {
      line.className = 'side-lyrics-line dist-2';
    } else {
      line.className = 'side-lyrics-line dist-far';
    }
  });

  if (activeIdx <= 0 && elements.sideLyricsWrapper && (forceScroll || currentTime < 1.5)) {
    elements.sideLyricsWrapper.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderFullscreenLyrics() {
  if (!elements.fsLyricsScrollBox) return;
  if (state.lyricsLoading && (!state.parsedLyrics || state.parsedLyrics.length === 0)) {
    elements.fsLyricsScrollBox.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-muted); font-size:1.2rem; font-weight:600;">
        <div style="width:32px; height:32px; border:3px solid rgba(255,255,255,0.15); border-top-color:var(--primary); border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 16px;"></div>
        Lade Songtexte...
      </div>
    `;
    if (elements.fsSyncLyricsBtn) elements.fsSyncLyricsBtn.classList.add('hidden');
    return;
  }

  if (!state.parsedLyrics || state.parsedLyrics.length === 0) {
    elements.fsLyricsScrollBox.innerHTML = `<div style="text-align:center; padding:60px 20px; color:var(--text-muted); font-size:1.2rem; font-weight:600;">Kein synchronisierter Songtext verfügbar.</div>`;
    if (elements.fsSyncLyricsBtn) elements.fsSyncLyricsBtn.classList.add('hidden');
    return;
  }

  elements.fsLyricsScrollBox.innerHTML = state.parsedLyrics.map((l, idx) => `
    <div class="fs-lyrics-line dist-far" data-idx="${idx}" data-time="${l.timestamp}">
      ${escapeHtml(l.text)}
    </div>
  `).join('');

  elements.fsLyricsScrollBox.querySelectorAll('.fs-lyrics-line').forEach(line => {
    line.addEventListener('click', () => {
      const t = parseFloat(line.getAttribute('data-time'));
      if (!isNaN(t) && t >= 0 && elements.audioElement) {
        elements.audioElement.currentTime = t;
        if (elements.audioElement.paused) elements.audioElement.play().catch(() => {});
        // Automatically re-synchronize when a user clicks on a line
        state.fsManualScroll = false;
        if (elements.fsSyncLyricsBtn) elements.fsSyncLyricsBtn.classList.add('hidden');
        if (elements.fsLyricsWrapper) elements.fsLyricsWrapper.classList.remove('manual-scroll');
        updateFullscreenLyrics(t, true);
      }
    });
  });

  const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
  updateFullscreenLyrics(cur, true);
}

function updateFullscreenLyrics(currentTime, forceScroll = false) {
  if (!elements.fsLyricsScrollBox || !state.fsLyricsVisible || !state.parsedLyrics || state.parsedLyrics.length === 0) return;

  let activeIdx = -1;
  let maxTime = -1;
  for (let i = 0; i < state.parsedLyrics.length; i++) {
    const t = state.parsedLyrics[i].timestamp;
    if (t <= currentTime && t >= maxTime) {
      maxTime = t;
      activeIdx = i;
    }
  }

  const lines = elements.fsLyricsScrollBox.querySelectorAll('.fs-lyrics-line');

  if (state.fsManualScroll) {
    // In manual scroll mode, keep the active line highlighted but remove all blurs and keep user scroll
    lines.forEach((line, idx) => {
      if (idx === activeIdx) {
        line.className = 'fs-lyrics-line active';
      } else {
        line.className = 'fs-lyrics-line';
      }
    });
    return;
  }

  lines.forEach((line, idx) => {
    const dist = Math.abs(idx - activeIdx);
    if (idx === activeIdx) {
      const wasActive = line.classList.contains('active') && !line.classList.contains('dist-1') && !line.classList.contains('dist-2') && !line.classList.contains('dist-far');
      line.className = 'fs-lyrics-line active';
      if (!wasActive || forceScroll) {
        if (elements.fsLyricsWrapper) {
          if (activeIdx <= 0) {
            elements.fsLyricsWrapper.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            const wrapH = elements.fsLyricsWrapper.clientHeight;
            const lineTop = line.offsetTop;
            const lineH = line.offsetHeight;
            const targetScroll = Math.max(0, lineTop - (wrapH / 2) + (lineH / 2));
            elements.fsLyricsWrapper.scrollTo({ top: targetScroll, behavior: 'smooth' });
          }
        }
      }
    } else if (dist === 1) {
      line.className = 'fs-lyrics-line dist-1';
    } else if (dist === 2) {
      line.className = 'fs-lyrics-line dist-2';
    } else {
      line.className = 'fs-lyrics-line dist-far';
    }
  });

  if (activeIdx <= 0 && elements.fsLyricsWrapper && (forceScroll || currentTime < 1.5)) {
    elements.fsLyricsWrapper.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function updateNativeFullscreenUI(overrideState) {
  const isFull = typeof overrideState === 'boolean' ? overrideState : Boolean(document.fullscreenElement);
  state.isNativeFullscreen = isFull;
  const expandIcon = elements?.iconExpandFs || document.getElementById('screenFsExpandIcon');
  const compressIcon = elements?.iconCompressFs || document.getElementById('screenFsCompressIcon');
  const toggleBtn = elements?.btnToggleNativeFs || document.getElementById('toggleScreenFullscreenBtn');

  if (expandIcon) expandIcon.classList.toggle('hidden', isFull);
  if (compressIcon) compressIcon.classList.toggle('hidden', !isFull);
  if (toggleBtn) {
    toggleBtn.title = isFull ? 'Vollbildmodus verlassen (F11)' : 'Ganzer Bildschirm (F11)';
  }
}
window.updateNativeFullscreenUI = updateNativeFullscreenUI;

async function toggleNativeFullscreen() {
  let handled = false;
  // 1. Try PyWebView native window fullscreen endpoint
  try {
    const res = await fetch('/api/window/fullscreen', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        handled = true;
        updateNativeFullscreenUI(data.fullscreen);
        return;
      }
    }
  } catch (e) {}

  // 2. Fallback to HTML5 Fullscreen API
  if (!handled) {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().then(() => updateNativeFullscreenUI(true)).catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => updateNativeFullscreenUI(false)).catch(() => {});
      }
    }
  }
}
window.toggleNativeFullscreen = toggleNativeFullscreen;

function toggleFullscreen(open) {
  if (!elements.fullscreenVisualizer) {
    elements.fullscreenVisualizer = document.getElementById('fullscreenVisualizer');
  }
  if (!elements.fullscreenVisualizer) return;

  const shouldOpen = (typeof open === 'boolean') 
    ? open 
    : !elements.fullscreenVisualizer.classList.contains('open');

  if (shouldOpen) {
    elements.fullscreenVisualizer.classList.add('open');
    if (state.selectedTrack) {
      const coverUrl = getTrackCoverUrl(state.selectedTrack);
      if (elements.fsCoverImg) {
        elements.fsCoverImg.src = coverUrl;
        elements.fsCoverImg.classList.remove('hidden');
        if (elements.fsCoverFallback) elements.fsCoverFallback.classList.add('hidden');
      }
      if (elements.fsTitle) elements.fsTitle.textContent = state.selectedTrack.title || state.selectedTrack.file_name || 'Kein Titel';
      if (elements.fsArtist) elements.fsArtist.textContent = state.selectedTrack.artist || 'Unbekannter Interpret';
      if (elements.fsAlbum) elements.fsAlbum.textContent = state.selectedTrack.album || '';
      if (elements.fsBackdrop) elements.fsBackdrop.style.backgroundImage = `url("${coverUrl}")`;
    }
    elements.fullscreenVisualizer.classList.toggle('lyrics-active', !!state.fsLyricsVisible);
    if (elements.fsLyricsToggleBtn) elements.fsLyricsToggleBtn.classList.toggle('active', !!state.fsLyricsVisible);
    if (state.fsLyricsVisible) renderFullscreenLyrics();
    
    // Ensure button icon accurately reflects current OS/DOM fullscreen state
    updateNativeFullscreenUI();

    requestAnimationFrame(() => {
      alignFsQueuePosition();
      setTimeout(alignFsQueuePosition, 60);
      setTimeout(alignFsQueuePosition, 300);
      setTimeout(alignFsQueuePosition, 500);
    });
  } else {
    // If the program is currently in fullscreen, trigger the exact same toggle action as the fullscreen button
    if (state.isNativeFullscreen || document.fullscreenElement) {
      toggleNativeFullscreen();
    } else {
      fetch('/api/window/fullscreen?exit_only=true', { method: 'POST' }).catch(() => {});
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (_) {}
    }
    elements.fullscreenVisualizer.classList.remove('open');
    updateNativeFullscreenUI(false);
  }
}
window.toggleFullscreen = toggleFullscreen;

// --- True Dual-Layer Crossfade Engines ---
function crossfadeImage(frontImg, backImg, fallbackEl, newUrl, onLoaded) {
  if (!frontImg) return;
  if (!newUrl) {
    frontImg.classList.add('hidden');
    if (backImg) backImg.classList.add('hidden');
    if (fallbackEl) fallbackEl.classList.remove('hidden');
    return;
  }
  const tempImg = new Image();
  tempImg.crossOrigin = 'anonymous';
  frontImg.crossOrigin = 'anonymous';
  if (backImg) backImg.crossOrigin = 'anonymous';

  tempImg.onload = () => {
    // 1. Move current visible image to background layer
    if (backImg && frontImg.src && !frontImg.classList.contains('hidden')) {
      backImg.src = frontImg.src;
      backImg.classList.remove('hidden');
      backImg.style.opacity = '1';
    }

    // 2. Prepare foreground layer with new source silently
    frontImg.style.transition = 'none';
    frontImg.style.opacity = '0';
    frontImg.src = newUrl;
    frontImg.classList.remove('hidden');
    if (fallbackEl) fallbackEl.classList.add('hidden');

    // Force layout recalculation
    void frontImg.offsetWidth;

    // 3. Smoothly fade in new image over 1.0s
    frontImg.style.transition = 'opacity 1.0s cubic-bezier(0.16, 1, 0.3, 1), transform 1.0s ease';
    frontImg.style.opacity = '1';

    if (onLoaded) onLoaded(tempImg);
  };
  tempImg.onerror = () => {
    if (frontImg) frontImg.classList.add('hidden');
    if (backImg) backImg.classList.add('hidden');
    if (fallbackEl) fallbackEl.classList.remove('hidden');
  };
  tempImg.src = newUrl;
}

function crossfadeBackdrop(frontBackdrop, backBackdrop, newUrl) {
  if (!frontBackdrop) return;
  if (!newUrl) {
    frontBackdrop.style.backgroundImage = 'none';
    if (backBackdrop) backBackdrop.style.backgroundImage = 'none';
    return;
  }
  const tempImg = new Image();
  tempImg.onload = () => {
    if (backBackdrop && frontBackdrop.style.backgroundImage) {
      backBackdrop.style.backgroundImage = frontBackdrop.style.backgroundImage;
      backBackdrop.style.opacity = '0.9';
    }

    frontBackdrop.style.transition = 'none';
    frontBackdrop.style.opacity = '0';
    frontBackdrop.style.backgroundImage = `url("${newUrl}")`;

    void frontBackdrop.offsetWidth;

    frontBackdrop.style.transition = 'opacity 1.6s ease-in-out';
    frontBackdrop.style.opacity = '0.9';
  };
  tempImg.onerror = () => {
    frontBackdrop.style.backgroundImage = `url("${newUrl}")`;
    frontBackdrop.style.opacity = '0.9';
  };
  tempImg.src = newUrl;
}

// --- Playback State Persistence (Resume on Startup) ---
let lastPlaybackSaveTime = 0;
let isRestoringPlayback = false;

function savePlaybackState(force = false) {
  if (isRestoringPlayback) return;
  if (!state.selectedTrack) return;
  const now = Date.now();
  if (!force && now - lastPlaybackSaveTime < 1000) return;
  lastPlaybackSaveTime = now;
  try {
    let curTime = (elements.audioElement && !isNaN(elements.audioElement.currentTime)) ? elements.audioElement.currentTime : 0;
    if (elements.audioElement && elements.audioElement.paused && state.pendingResumeTime > 0) {
      curTime = state.pendingResumeTime;
    }
    const playbackData = {
      track: state.selectedTrack,
      currentTime: curTime,
      queue: (state.queue || []).slice(0, 500),
      queueIndex: state.queueIndex,
      repeat: state.repeat,
      shuffle: state.shuffle,
      volume: (elements.audioElement && !isNaN(elements.audioElement.volume)) ? elements.audioElement.volume : 1,
      timestamp: now
    };
    
    // 1. LocalStorage
    try {
      setStoredItem('last_playback', JSON.stringify(playbackData));
    } catch (e) {}

    // 2. Persistent Backend Disk Store (~/.tonarr_playback_state.json / ~/.soundsphere_playback_state.json)
    const jsonStr = JSON.stringify(playbackData);
    if (navigator.sendBeacon && force) {
      navigator.sendBeacon('/api/playback/state', new Blob([jsonStr], { type: 'application/json' }));
    } else {
      fetch('/api/playback/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
        keepalive: true
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('Error saving playback state:', err);
  }
}
window.savePlaybackState = savePlaybackState;

async function restoreLastPlayback() {
  try {
    let data = null;
    // 1. Check localStorage first
    try {
      const saved = getStoredItem('last_playback');
      if (saved) {
        data = JSON.parse(saved);
      }
    } catch (e) {}

    // 2. Fetch from backend disk store if missing or to get most recent state
    try {
      const res = await fetch('/api/playback/state');
      if (res.ok) {
        const diskData = await res.json();
        if (diskData && diskData.track) {
          if (!data || (diskData.timestamp && diskData.timestamp >= (data.timestamp || 0))) {
            data = diskData;
          }
        }
      }
    } catch (e) {}

    if (!data || !data.track) return;

    isRestoringPlayback = true;

    if (Array.isArray(data.queue) && data.queue.length > 0) {
      state.queue = data.queue;
      state.queueIndex = typeof data.queueIndex === 'number' ? data.queueIndex : 0;
      updateAllQueueViews();
    }

    if (data.repeat) {
      state.repeat = data.repeat;
      if (elements.repeatBtn) elements.repeatBtn.classList.toggle('active', state.repeat !== 'off');
      if (elements.fsRepeatBtn) elements.fsRepeatBtn.classList.toggle('active', state.repeat !== 'off');
      if (elements.repeatBadge) elements.repeatBadge.classList.toggle('hidden', state.repeat !== 'one');
    }
    if (typeof data.shuffle === 'boolean') {
      state.shuffle = data.shuffle;
      if (elements.shuffleBtn) elements.shuffleBtn.classList.toggle('active', state.shuffle);
      if (elements.fsShuffleBtn) elements.fsShuffleBtn.classList.toggle('active', state.shuffle);
    }
    if (typeof data.volume === 'number' && elements.audioElement) {
      elements.audioElement.volume = data.volume;
      if (elements.volumeSlider) elements.volumeSlider.value = data.volume;
    }

    const targetSec = (typeof data.currentTime === 'number' && data.currentTime > 0) ? data.currentTime : 0;
    state.pendingResumeTime = targetSec;

    // Load last track in paused mode
    await selectTrack(data.track, false);

    const applyTimeAndUI = () => {
      const displaySec = state.pendingResumeTime > 0 ? state.pendingResumeTime : ((elements.audioElement && !isNaN(elements.audioElement.currentTime)) ? elements.audioElement.currentTime : targetSec);
      if (targetSec > 0 && elements.audioElement) {
        try {
          elements.audioElement.currentTime = targetSec;
        } catch (e) {}
      }
      const dur = (elements.audioElement && elements.audioElement.duration) ? elements.audioElement.duration : (data.track.duration || 0);
      const pct = dur > 0 ? (displaySec / dur) * 100 : 0;
      if (elements.currentTime) elements.currentTime.textContent = formatDuration(displaySec);
      if (elements.progressFill) elements.progressFill.style.width = `${pct}%`;
      if (elements.fsCurrentTime) elements.fsCurrentTime.textContent = formatDuration(displaySec);
      if (elements.fsProgressFill) elements.fsProgressFill.style.width = `${pct}%`;
      updateInPlayerLyrics(displaySec);
      updateFullscreenLyrics(displaySec);
    };

    applyTimeAndUI();

    if (elements.audioElement) {
      elements.audioElement.addEventListener('loadedmetadata', applyTimeAndUI, { once: true });
      elements.audioElement.addEventListener('canplay', applyTimeAndUI, { once: true });
    }
    setTimeout(applyTimeAndUI, 50);
    setTimeout(applyTimeAndUI, 200);
    setTimeout(applyTimeAndUI, 600);
    setTimeout(applyTimeAndUI, 1200);
    setTimeout(() => { isRestoringPlayback = false; }, 2500);
  } catch (err) {
    isRestoringPlayback = false;
    console.warn('Error restoring last playback state:', err);
  }
}
window.restoreLastPlayback = restoreLastPlayback;

// --- Track Playback Engine ---
async function selectTrack(track, autoPlay = true) {
  if (!Array.isArray(state.queue)) state.queue = [];
  if (state.queue.length === 0 && track) { state.queue = [track]; state.queueIndex = 0; }
  updateAllQueueViews();
  setTimeout(() => updateAllQueueViews(), 50);
  if (!track) return;
  state.selectedTrack = track;

  // Update bottom player bar meta
  if (elements.spTitle) elements.spTitle.textContent = track.title || 'Unbekannter Titel';
  if (elements.spArtist) elements.spArtist.textContent = track.artist || 'Unbekannter Interpret';

  // Update Audio Quality Badges (Hi-Res / Lossless / Bitrate)
  const qInfo = getTrackQualityInfo(track);
  if (elements.spQualityBadge) {
    if (qInfo.label) {
      elements.spQualityBadge.textContent = qInfo.label;
      elements.spQualityBadge.className = `quality-tag ${qInfo.className}`.trim();
      elements.spQualityBadge.style.display = 'inline-block';
    } else {
      elements.spQualityBadge.style.display = 'none';
    }
  }
  if (elements.fsQualityBadge) {
    if (qInfo.label) {
      elements.fsQualityBadge.textContent = qInfo.label;
      elements.fsQualityBadge.className = `quality-tag ${qInfo.className}`.trim();
      elements.fsQualityBadge.style.display = 'inline-block';
    } else {
      elements.fsQualityBadge.style.display = 'none';
    }
  }

  const coverUrl = getTrackCoverUrl(track);
  
  // Bottom Player Bar Artwork (True Dual-Layer Crossfade 1.0s)
  if (state.theme === 'dynamic') {
    applyDynamicThemeFromImage(coverUrl || track);
  }
  crossfadeImage(elements.spCoverImg, elements.spCoverImgBack, elements.spCoverFallback, coverUrl, (loadedImg) => {
    if (state.theme === 'dynamic') {
      applyDynamicThemeFromImage(loadedImg);
    }
  });

  // Fullscreen Artwork & Meta (True Dual-Layer Crossfade 1.0s)
  if (elements.fsTitle) elements.fsTitle.textContent = track.title || 'Unbekannter Titel';
  if (elements.fsArtist) elements.fsArtist.textContent = track.artist || 'Unbekannter Interpret';
  if (elements.fsAlbum) elements.fsAlbum.textContent = track.album || '';
  
  crossfadeImage(elements.fsCoverImg, elements.fsCoverImgBack, elements.fsCoverFallback, coverUrl);

  // Fullscreen Atmosphere Backdrop (True Dual-Layer Crossfade 1.6s)
  crossfadeBackdrop(elements.fsBackdrop, elements.fsBackdropBack, coverUrl);
  updateGlobalCoverBackdrop(coverUrl);

  // Update Windows Media Session
  updateMediaSession(track);

  // Update Heart
  const isFav = state.favorites.has(track.id || track.file_path);
  if (elements.playerHeartBtn) elements.playerHeartBtn.classList.toggle('active', isFav);

  // Load Audio
  setupAudioContext();
  const streamSrc = getTrackStreamUrl(track);
  if (elements.audioElement) {
    elements.audioElement.crossOrigin = 'anonymous';
    if (elements.audioElement.muted) elements.audioElement.muted = false;
    if (elements.audioElement.volume === 0) elements.audioElement.volume = 1;
    elements.audioElement.src = streamSrc;
  }
  
  if (!autoPlay && state.pendingResumeTime > 0) {
    const dur = track.duration || 0;
    const pct = dur > 0 ? (state.pendingResumeTime / dur) * 100 : 0;
    elements.progressFill.style.width = `${pct}%`;
    elements.currentTime.textContent = formatDuration(state.pendingResumeTime);
    elements.totalDuration.textContent = track.duration_str || formatDuration(dur);
  } else {
    state.pendingResumeTime = 0;
    elements.progressFill.style.width = '0%';
    elements.currentTime.textContent = '00:00';
    elements.totalDuration.textContent = track.duration_str || '00:00';
  }

  if (autoPlay) {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    elements.audioElement.play().catch(e => {
      console.warn('Play error:', e);
      showToast('⚠️ Wiedergabe nicht möglich (Format/Zugriff).', 3000);
    });
  }

  // Native Android MediaSession Sync
  if (window.AndroidBridge && window.AndroidBridge.updatePlaybackState) {
    const rawCover = getTrackCoverUrl(track);
    const fullCover = (rawCover.startsWith('http') || rawCover.startsWith('content:')) ? rawCover : (window.location.origin + rawCover);
    window.AndroidBridge.updatePlaybackState(track.title || '', track.artist || '', track.album || '', fullCover, autoPlay, 0, track.duration || 0);
  }

  renderSideQueueList();
  renderFsQueueList();
  preloadNextTrack();
  savePlaybackState(true);

  // Update table & grid card highlights
  document.querySelectorAll('.tracks-table tr, .song-card').forEach(r => {
    r.classList.toggle('selected', r.getAttribute('data-track-id') === (track.id || track.file_path));
  });

  // Load Lyrics Asynchronously
  state.lyricsLoading = true;
  state.parsedLyrics = [];
  if (state.sideLyricsVisible) renderInPlayerLyrics();
  if (state.fsLyricsVisible) renderFullscreenLyrics();

  loadTrackLyrics(track).then(() => {
    state.lyricsLoading = false;
    updateLyricsButtonVisibility();
    if (state.sideLyricsVisible) renderInPlayerLyrics();
    if (state.fsLyricsVisible) renderFullscreenLyrics();
  });
}

function processAndSetLyrics(rawLines) {
  if (!rawLines || rawLines.length === 0) {
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
      // If pause is < 2.0s, remove/omit the line completely!
      const durationUntilNext = next ? (next.timestamp - cur.timestamp) : 5.0;
      if (durationUntilNext >= 2.0) {
        processed.push({ timestamp: cur.timestamp, text: '♪' });
      }
    } else {
      processed.push({ timestamp: cur.timestamp, text: cleanText });
    }
  }

  state.parsedLyrics = processed;
}

async function loadTrackLyrics(track, isRetry = false) {
  if (!isRetry) state.parsedLyrics = [];
  if (!track) return;

  const isHost = isHostTrack(track);
  const hostBase = getHostBaseUrl();

  // 1. Direct Tonarr Host Lyrics resolution
  if (isHost && hostBase) {
    try {
      const token = getHostToken();
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const trackId = track.host_id || (track.id ? String(track.id).replace(/^host:\/\//, '') : '');
      const hostLyricsUrl = `${hostBase}/api/lyrics?id=${encodeURIComponent(trackId)}&path=${encodeURIComponent(track.file_path || '')}&title=${encodeURIComponent(track.title || '')}&artist=${encodeURIComponent(track.artist || '')}${tokenParam}`;
      const hRes = await fetch(hostLyricsUrl, { signal: AbortSignal.timeout(8000) });
      if (hRes.ok) {
        const hData = await hRes.json();
        if (hData && hData.content) {
          parseLrc(hData.content);
          return;
        }
      }
    } catch (e) {
      console.warn('Direct Host lyrics fetch error:', e);
    }
  }

  try {
    const filePath = track.file_path || track.id || '';
    const url = `/api/track/lyrics?path=${encodeURIComponent(filePath)}&title=${encodeURIComponent(track.title || '')}&artist=${encodeURIComponent(track.artist || '')}&album=${encodeURIComponent(track.album || '')}&duration=${encodeURIComponent(track.duration || 0)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.lines && Array.isArray(data.lines) && data.lines.length > 0) {
        const hasTimestamps = data.lines.some(l => typeof l.timestamp === 'number' && l.timestamp >= 0);
        const mapped = data.lines.map((l, idx) => ({
          timestamp: (typeof l.timestamp === 'number' && l.timestamp >= 0) ? l.timestamp : (hasTimestamps ? 0 : idx * 3.5),
          text: l.text || ''
        }));
        processAndSetLyrics(mapped);
      } else if (data.raw_content || data.lrc_content) {
        const content = data.raw_content || data.lrc_content || '';
        parseLrc(content);
      } else if (!isRetry && (filePath.startsWith('plex://') || filePath.startsWith('plex_'))) {
        // Retry once after 600ms for Plex on-demand stream resolution
        setTimeout(() => {
          if (state.selectedTrack === track && (!state.parsedLyrics || state.parsedLyrics.length === 0)) {
            loadTrackLyrics(track, true).then(() => {
              updateLyricsButtonVisibility();
              renderInPlayerLyrics();
              renderFullscreenLyrics();
            });
          }
        }, 600);
      }
    }
  } catch (err) {
    console.warn('Could not load lyrics:', err);
  }
}

function parseLrc(lrcText) {
  if (!lrcText) {
    state.parsedLyrics = [];
    return;
  }
  const rawLines = [];
  const pattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const rawLine of lrcText.split('\n')) {
    let trimmed = rawLine.trim();
    if (/^\[(?:ti|ar|al|by|offset|length|tool|au):/i.test(trimmed)) continue;

    pattern.lastIndex = 0;
    let match;
    const matches = [];
    while ((match = pattern.exec(trimmed)) !== null) {
      matches.push(match);
    }

    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const cleanText = trimmed.substring(lastMatch.index + lastMatch[0].length).trim();
      for (const m of matches) {
        const mins = parseInt(m[1], 10);
        const secs = parseInt(m[2], 10);
        const ms = m[3] ? parseFloat('0.' + m[3]) : 0;
        const totalSec = mins * 60 + secs + ms;
        rawLines.push({ timestamp: totalSec, text: cleanText });
      }
    }
  }

  // Fallback for plain text lyrics without timestamps
  if (rawLines.length === 0) {
    const plainLines = lrcText.split('\n').map(l => l.trim()).filter(l => l && !/^\[(?:ti|ar|al|by|offset):/i.test(l));
    plainLines.forEach((text, i) => {
      rawLines.push({ timestamp: i * 4, text: text });
    });
  }

  processAndSetLyrics(rawLines);
}

function togglePlay() {
  if (!elements.audioElement) return;
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (!elements.audioElement.src || elements.audioElement.src === window.location.href) {
    if (state.selectedTrack) selectTrack(state.selectedTrack, true);
    else if (state.tracks.length > 0) selectTrack(state.tracks[0], true);
    return;
  }

  if (elements.audioElement.paused) {
    elements.audioElement.play().catch(e => console.warn('Play error:', e));
  } else {
    elements.audioElement.pause();
  }
}

function playNextTrack() {
  setTimeout(() => updateAllQueueViews(), 50);
  if (state.repeat === 'one') {
    elements.audioElement.currentTime = 0;
    elements.audioElement.play();
    return;
  }

  if (state.queue.length > 0 && state.queueIndex + 1 < state.queue.length) {
    state.queueIndex++;
    selectTrack(state.queue[state.queueIndex], true);
    renderQueueView();
    return;
  }

  const list = getFilteredTracks();
  if (list.length === 0) return;

  if (state.shuffle) {
    const rand = Math.floor(Math.random() * list.length);
    selectTrack(list[rand], true);
    return;
  }

  const curIdx = state.selectedTrack ? list.findIndex(t => t.id === state.selectedTrack.id || t.file_path === state.selectedTrack.file_path) : -1;
  if (curIdx >= 0 && curIdx + 1 < list.length) {
    selectTrack(list[curIdx + 1], true);
  } else if (state.repeat === 'all' && list.length > 0) {
    selectTrack(list[0], true);
  }
}

function playPrevTrack() {
  setTimeout(() => updateAllQueueViews(), 50);
  if (elements.audioElement.currentTime > 3) {
    elements.audioElement.currentTime = 0;
    return;
  }

  if (state.queue.length > 0 && state.queueIndex > 0) {
    state.queueIndex--;
    selectTrack(state.queue[state.queueIndex], true);
    renderQueueView();
    return;
  }

  const list = getFilteredTracks();
  if (list.length === 0) return;

  const curIdx = state.selectedTrack ? list.findIndex(t => t.id === state.selectedTrack.id || t.file_path === state.selectedTrack.file_path) : -1;
  if (curIdx > 0) {
    selectTrack(list[curIdx - 1], true);
  } else {
    elements.audioElement.currentTime = 0;
  }
}

function toggleShuffle() {
  state.shuffle = !state.shuffle;
  if (elements.shuffleBtn) elements.shuffleBtn.classList.toggle('active', state.shuffle);
  if (elements.fsShuffleBtn) elements.fsShuffleBtn.classList.toggle('active', state.shuffle);
  showToast(state.shuffle ? '🔀 Zufallswiedergabe an' : '➡️ Lineare Wiedergabe');
}

function toggleRepeat() {
  if (state.repeat === 'off') state.repeat = 'all';
  else if (state.repeat === 'all') state.repeat = 'one';
  else state.repeat = 'off';

  const isActive = state.repeat !== 'off';
  if (elements.repeatBtn) elements.repeatBtn.classList.toggle('active', isActive);
  if (elements.fsRepeatBtn) elements.fsRepeatBtn.classList.toggle('active', isActive);
  if (elements.repeatBadge) elements.repeatBadge.classList.toggle('hidden', state.repeat !== 'one');

  const msg = state.repeat === 'one' ? '🔂 Einzeltitel wiederholen' : (state.repeat === 'all' ? '🔁 Alle wiederholen' : 'Wiederholung aus');
  showToast(msg);
}

function toggleFavorite(trackId) {
  if (state.favorites.has(trackId)) {
    state.favorites.delete(trackId);
    showToast('Aus Favoriten entfernt');
  } else {
    state.favorites.add(trackId);
    showToast('❤️ Zu Favoriten hinzugefügt');
  }

  if (state.selectedTrack && (state.selectedTrack.id === trackId || state.selectedTrack.file_path === trackId)) {
    if (elements.playerHeartBtn) elements.playerHeartBtn.classList.toggle('active', state.favorites.has(trackId));
  }

  updateBadgeCounts();
  if (state.activeView === 'favorites') renderTracksTable();
}

// --- Context Menu ---
function openContextMenu(x, y, track) {
  state.contextMenuTrack = track;
  closeAlbumContextMenu();
  if (!elements.trackContextMenu) return;

  const isFav = state.favorites.has(track.id || track.file_path);
  if (elements.ctxFavoriteLabel) {
    elements.ctxFavoriteLabel.textContent = isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen';
  }

  elements.trackContextMenu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
  elements.trackContextMenu.style.top = `${Math.min(y, window.innerHeight - 250)}px`;
  elements.trackContextMenu.classList.remove('hidden');
}

function closeContextMenu() {
  if (elements.trackContextMenu) elements.trackContextMenu.classList.add('hidden');
}

function openAlbumContextMenu(x, y, albumObj) {
  state.contextMenuAlbum = albumObj;
  closeContextMenu();
  if (!elements.albumContextMenu) return;

  elements.albumContextMenu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
  elements.albumContextMenu.style.top = `${Math.min(y, window.innerHeight - 220)}px`;
  elements.albumContextMenu.classList.remove('hidden');
}

function closeAlbumContextMenu() {
  if (elements.albumContextMenu) elements.albumContextMenu.classList.add('hidden');
}

function updateBadgeCounts() {
  if (elements.countSongsBadge) elements.countSongsBadge.textContent = state.tracks.length;
  if (elements.countFavsBadge) elements.countFavsBadge.textContent = state.favorites.size;
  if (elements.countQueueBadge) elements.countQueueBadge.textContent = state.queue.length;

  const isPlexOnly = isPlexOnlyPlayerSource();
  const hostCount = state.tracks.filter(t => isHostTrack(t)).length;
  const plexCount = state.tracks.filter(t => isPlexTrack(t)).length;
  const localCount = isPlexOnly ? 0 : state.tracks.filter(t => !isHostTrack(t) && !isPlexTrack(t)).length;
  if (elements.countHostBadge) elements.countHostBadge.textContent = hostCount;
  if (elements.countPlexBadge) elements.countPlexBadge.textContent = plexCount;
  if (elements.countLocalBadge) elements.countLocalBadge.textContent = localCount;

  const artists = new Set(
    state.tracks
      .map(t => getPrimaryArtist(t.artist).trim().toLowerCase())
      .filter(Boolean)
  );
  if (elements.countArtistsBadge) elements.countArtistsBadge.textContent = artists.size;

  const albums = new Set(state.tracks.map(t => (t.album || '').trim()).filter(Boolean));
  if (elements.countAlbumsBadge) elements.countAlbumsBadge.textContent = albums.size;
}

// --- Backend API Sync & Library Actions ---

async function pickFolder() {
  try {
    const res = await fetch('/api/pick-folder', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.folder) {
        if (elements.currentFolderText) elements.currentFolderText.textContent = data.folder;
        scanMusicFolder(data.folder);
      }
    }
  } catch (err) {
    showToast('Fehler bei der Ordnerauswahl.');
  }
}

async function scanMusicFolder(dir = '') {
  showToast('🔍 Mediathek wird gescannt...');
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: dir })
    });
    if (res.ok) {
      state.tracks = await res.json();
      updateBadgeCounts();
      renderTracksTable();
      showToast(`✅ ${state.tracks.length} Songs erfolgreich geladen!`);
    }
  } catch (err) {
    showToast('Fehler beim Scannen der Mediathek.');
  }
}

// --- Setup Event Listeners ---
function setupEventListeners() {
  // Save Playback State & Settings on Window Close / Page Exit
  window.addEventListener('beforeunload', () => {
    savePlaybackState(true);
    syncConfigToBackend(true);
  });
  window.addEventListener('pagehide', () => {
    savePlaybackState(true);
    syncConfigToBackend(true);
  });

  // Navigation History
  if (elements.btnNavBack) elements.btnNavBack.addEventListener('click', navigateViewBack);
  if (elements.btnNavForward) elements.btnNavForward.addEventListener('click', navigateViewForward);

  // Mouse Back & Forward Thumb Buttons (Button 3 & Button 4)
  window.addEventListener('mouseup', (e) => {
    if (e.button === 3) {
      e.preventDefault();
      navigateViewBack();
    } else if (e.button === 4) {
      e.preventDefault();
      navigateViewForward();
    }
  });

  window.addEventListener('auxclick', (e) => {
    if (e.button === 3 || e.button === 4) {
      e.preventDefault();
    }
  });

  // Search Input
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (elements.clearSearchBtn) elements.clearSearchBtn.classList.toggle('hidden', !state.searchQuery);
      
      if (['songs', 'favorites', 'plex', 'local'].includes(state.activeView)) {
        renderTracksTable();
      } else if (state.activeView === 'artists') {
        renderArtistsGrid();
      } else if (state.activeView === 'albums') {
        renderAlbumsGrid();
      } else if (state.activeView === 'queue') {
        renderQueueView();
      } else if (state.activeView === 'artist_detail' && state.selectedArtist) {
        openArtistDetail(state.selectedArtist);
      } else if (state.activeView === 'album_detail' && state.selectedAlbum) {
        openAlbumDetail(state.selectedAlbum);
      }
    });
  }
  if (elements.clearSearchBtn) {
    elements.clearSearchBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.clearSearchBtn.classList.add('hidden');
      if (['songs', 'favorites', 'plex', 'local'].includes(state.activeView)) {
        renderTracksTable();
      } else if (state.activeView === 'artists') {
        renderArtistsGrid();
      } else if (state.activeView === 'albums') {
        renderAlbumsGrid();
      } else if (state.activeView === 'queue') {
        renderQueueView();
      }
    });
  }

  // Sidebar Items
  if (elements.navBtnSongs) elements.navBtnSongs.addEventListener('click', () => switchView('songs'));
  if (elements.navBtnHostSource) elements.navBtnHostSource.addEventListener('click', () => switchView('host'));
  if (elements.navBtnPlexSource) elements.navBtnPlexSource.addEventListener('click', () => switchView('plex'));
  if (elements.navBtnLocalSource) elements.navBtnLocalSource.addEventListener('click', () => switchView('local'));
  if (elements.navBtnArtists) elements.navBtnArtists.addEventListener('click', () => switchView('artists'));
  if (elements.navBtnAlbums) elements.navBtnAlbums.addEventListener('click', () => switchView('albums'));
  if (elements.navBtnFavorites) elements.navBtnFavorites.addEventListener('click', () => switchView('favorites'));
  if (elements.navBtnQueue) elements.navBtnQueue.addEventListener('click', () => switchView('queue'));

  // Mobile Bottom Navigation Listeners
  if (elements.mobNavSongs) {
    elements.mobNavSongs.addEventListener('click', () => {
      if (window.AndroidBridge) window.AndroidBridge.vibrateClick();
      switchView('songs');
    });
  }
  if (elements.mobNavArtists) {
    elements.mobNavArtists.addEventListener('click', () => {
      if (window.AndroidBridge) window.AndroidBridge.vibrateClick();
      switchView('artists');
    });
  }
  if (elements.mobNavAlbums) {
    elements.mobNavAlbums.addEventListener('click', () => {
      if (window.AndroidBridge) window.AndroidBridge.vibrateClick();
      switchView('albums');
    });
  }
  if (elements.mobNavFavorites) {
    elements.mobNavFavorites.addEventListener('click', () => {
      if (window.AndroidBridge) window.AndroidBridge.vibrateClick();
      switchView('favorites');
    });
  }
  if (elements.mobNavServer) {
    elements.mobNavServer.addEventListener('click', () => {
      if (window.AndroidBridge) {
        window.AndroidBridge.vibrateClick();
        window.AndroidBridge.openServerConfig();
      } else if (elements.settingsModal) {
        elements.settingsModal.classList.add('open');
      }
    });
  }

  // Mobile Mini Player Tap to Open Fullscreen
  if (elements.spLeft) {
    elements.spLeft.addEventListener('click', () => {
      if (window.innerWidth <= 768 && state.selectedTrack) {
        if (window.AndroidBridge) window.AndroidBridge.vibrateClick();
        toggleFullscreen(true);
      }
    });
  }

  // Music Directories Management
  if (elements.btnAddDirectoryBtn) elements.btnAddDirectoryBtn.addEventListener('click', addDirectory);
  if (elements.btnRescanAllDirs) elements.btnRescanAllDirs.addEventListener('click', scanMusicFolders);

  // Player Controls
  if (elements.playPauseBtn) elements.playPauseBtn.addEventListener('click', togglePlay);
  if (elements.prevTrackBtn) elements.prevTrackBtn.addEventListener('click', playPrevTrack);
  if (elements.nextTrackBtn) elements.nextTrackBtn.addEventListener('click', playNextTrack);
  if (elements.shuffleBtn) elements.shuffleBtn.addEventListener('click', toggleShuffle);
  if (elements.repeatBtn) elements.repeatBtn.addEventListener('click', toggleRepeat);

  if (elements.playerHeartBtn) {
    elements.playerHeartBtn.addEventListener('click', () => {
      if (state.selectedTrack) toggleFavorite(state.selectedTrack.id || state.selectedTrack.file_path);
    });
  }

  // Lyrics Toggle & Close (Standard View)
  if (elements.btnPlayerLyricsToggle) elements.btnPlayerLyricsToggle.addEventListener('click', () => toggleInPlayerLyrics());
  if (elements.btnCloseSideLyrics) elements.btnCloseSideLyrics.addEventListener('click', () => toggleInPlayerLyrics(false));

  // Queue Toggle, Close & Clear (Standard View)
  if (elements.btnPlayerQueueToggle) elements.btnPlayerQueueToggle.addEventListener('click', () => toggleInPlayerQueue());
  if (elements.btnCloseSideQueue) elements.btnCloseSideQueue.addEventListener('click', () => toggleInPlayerQueue(false));
  if (elements.btnClearSideQueue) {
    elements.btnClearSideQueue.addEventListener('click', () => {
      state.queue = [];
      state.queueIndex = -1;
      renderSideQueueList();
      renderFsQueueList();
      renderQueueView();
      updateBadgeCounts();
      preloadNextTrack();
      showToast('Warteschlange geleert.');
    });
  }

  // Queue View Clear Button
  if (elements.btnClearQueue) {
    elements.btnClearQueue.addEventListener('click', () => {
      state.queue = [];
      state.queueIndex = -1;
      renderSideQueueList();
      renderFsQueueList();
      renderQueueView();
      updateBadgeCounts();
      preloadNextTrack();
      showToast('Warteschlange geleert.');
    });
  }

  // In-Player Sidebar Lyrics Manual Scroll & Sync
  if (elements.sideLyricsWrapper) {
    const handleSideManualScroll = () => {
      if (!state.sideLyricsVisible || state.sideManualScroll) return;
      state.sideManualScroll = true;
      if (elements.sideLyricsWrapper) elements.sideLyricsWrapper.classList.add('manual-scroll');
      if (elements.sideSyncLyricsBtn) elements.sideSyncLyricsBtn.classList.remove('hidden');
      const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
      updateInPlayerLyrics(cur);
    };

    elements.sideLyricsWrapper.addEventListener('wheel', handleSideManualScroll, { passive: true });
    elements.sideLyricsWrapper.addEventListener('touchmove', handleSideManualScroll, { passive: true });
  }

  if (elements.sideSyncLyricsBtn) {
    elements.sideSyncLyricsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.sideManualScroll = false;
      if (elements.sideSyncLyricsBtn) elements.sideSyncLyricsBtn.classList.add('hidden');
      if (elements.sideLyricsWrapper) elements.sideLyricsWrapper.classList.remove('manual-scroll');
      const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
      updateInPlayerLyrics(cur, true);
    });
  }

  // Fullscreen Visualizer & Native Screen Controls
  // Fullscreen Visualizer & Native Screen Controls Listeners
  const screenFsBtn = elements.btnToggleNativeFs || document.getElementById('toggleScreenFullscreenBtn');
  if (screenFsBtn) screenFsBtn.addEventListener('click', toggleNativeFullscreen);
  document.addEventListener('fullscreenchange', () => updateNativeFullscreenUI());

  if (elements.fullscreenToggleBtn) elements.fullscreenToggleBtn.addEventListener('click', () => toggleFullscreen(true));
  if (elements.closeFullscreenBtn) elements.closeFullscreenBtn.addEventListener('click', () => toggleFullscreen(false));
  if (elements.fsPlayPauseBtn) elements.fsPlayPauseBtn.addEventListener('click', togglePlay);
  if (elements.fsPrevBtn) elements.fsPrevBtn.addEventListener('click', playPrevTrack);
  if (elements.fsNextBtn) elements.fsNextBtn.addEventListener('click', playNextTrack);
  if (elements.fsShuffleBtn) elements.fsShuffleBtn.addEventListener('click', toggleShuffle);
  if (elements.fsRepeatBtn) elements.fsRepeatBtn.addEventListener('click', toggleRepeat);

  // Audio Progress & Timeupdate
  let lastPlexReportTime = 0;
  function reportPlexTimeline(playbackState) {
    const tr = state.selectedTrack;
    if (!tr || !tr.file_path || !tr.file_path.startsWith('plex://')) return;
    const ratingKey = tr.file_path.replace('plex://', '');
    const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
    const dur = (elements.audioElement && elements.audioElement.duration) ? elements.audioElement.duration : (tr.duration || 0);
    const timeMs = Math.floor(cur * 1000);
    const durMs = Math.floor(dur * 1000);
    fetch(`/api/plex/timeline?rating_key=${encodeURIComponent(ratingKey)}&state=${playbackState}&time_ms=${timeMs}&duration_ms=${durMs}`, {
      method: 'POST'
    }).catch(() => {});
  }

  elements.audioElement.addEventListener('play', () => {
    if (state.pendingResumeTime > 0) {
      try {
        elements.audioElement.currentTime = state.pendingResumeTime;
      } catch (e) {}
      state.pendingResumeTime = 0;
    }
    setTimeout(() => updateAllQueueViews(), 20);
    if (elements.playIcon) elements.playIcon.classList.add('hidden');
    if (elements.pauseIcon) elements.pauseIcon.classList.remove('hidden');
    if (elements.fsPlayIcon) elements.fsPlayIcon.classList.add('hidden');
    if (elements.fsPauseIcon) elements.fsPauseIcon.classList.remove('hidden');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    reportPlexTimeline('playing');
    preloadNextTrack();
    savePlaybackState(true);
    if (window.AndroidBridge && window.AndroidBridge.updatePlaybackState && state.selectedTrack) {
      const tr = state.selectedTrack;
      const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
      const dur = (elements.audioElement && elements.audioElement.duration) ? elements.audioElement.duration : (tr.duration || 0);
      const rawCover = getTrackCoverUrl(tr);
      const fullCover = (rawCover.startsWith('http') || rawCover.startsWith('content:')) ? rawCover : (window.location.origin + rawCover);
      window.AndroidBridge.updatePlaybackState(tr.title || '', tr.artist || '', tr.album || '', fullCover, true, cur, dur);
    }
  });

  elements.audioElement.addEventListener('pause', () => {
    if (elements.playIcon) elements.playIcon.classList.remove('hidden');
    if (elements.pauseIcon) elements.pauseIcon.classList.add('hidden');
    if (elements.fsPlayIcon) elements.fsPlayIcon.classList.remove('hidden');
    if (elements.fsPauseIcon) elements.fsPauseIcon.classList.add('hidden');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    reportPlexTimeline('paused');
    savePlaybackState(true);
    if (window.AndroidBridge && window.AndroidBridge.updatePlaybackState && state.selectedTrack) {
      const tr = state.selectedTrack;
      const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
      const dur = (elements.audioElement && elements.audioElement.duration) ? elements.audioElement.duration : (tr.duration || 0);
      const rawCover = getTrackCoverUrl(tr);
      const fullCover = (rawCover.startsWith('http') || rawCover.startsWith('content:')) ? rawCover : (window.location.origin + rawCover);
      window.AndroidBridge.updatePlaybackState(tr.title || '', tr.artist || '', tr.album || '', fullCover, false, cur, dur);
    }
  });

  elements.audioElement.addEventListener('ended', () => {
  setTimeout(() => updateAllQueueViews(), 20);
    reportPlexTimeline('stopped');
    playNextTrack();
  });

  elements.audioElement.addEventListener('timeupdate', () => {
    let cur = elements.audioElement.currentTime;
    if (elements.audioElement.paused && state.pendingResumeTime > 0) {
      cur = state.pendingResumeTime;
    } else if (state.pendingResumeTime > 0 && cur > 0) {
      state.pendingResumeTime = 0;
    }
    const dur = elements.audioElement.duration || (state.selectedTrack ? state.selectedTrack.duration : 0);
    const pct = dur > 0 ? (cur / dur) * 100 : 0;

    if (elements.currentTime) elements.currentTime.textContent = formatDuration(cur);
    if (elements.totalDuration && dur > 0) elements.totalDuration.textContent = formatDuration(dur);
    if (elements.progressFill) elements.progressFill.style.width = `${pct}%`;

    if (elements.fsCurrentTime) elements.fsCurrentTime.textContent = formatDuration(cur);
    if (elements.fsTotalDuration && dur > 0) elements.fsTotalDuration.textContent = formatDuration(dur);
    if (elements.fsProgressFill) elements.fsProgressFill.style.width = `${pct}%`;

    savePlaybackState(false);

    const now = Date.now();
    if (now - lastPlexReportTime > 9000) {
      lastPlexReportTime = now;
      reportPlexTimeline('playing');
    }

    updateInPlayerLyrics(cur);
    updateFullscreenLyrics(cur);
  });

  // Fullscreen Lyrics Toggle Button
  if (elements.fsLyricsToggleBtn) {
    elements.fsLyricsToggleBtn.addEventListener('click', () => {
      state.fsLyricsVisible = !state.fsLyricsVisible;
      if (elements.fullscreenVisualizer) {
        elements.fullscreenVisualizer.classList.toggle('lyrics-active', state.fsLyricsVisible);
      }
      if (elements.fsLyricsToggleBtn) elements.fsLyricsToggleBtn.classList.toggle('active', state.fsLyricsVisible);
      if (state.fsLyricsVisible) renderFullscreenLyrics();
      requestAnimationFrame(() => {
        alignFsQueuePosition();
        setTimeout(alignFsQueuePosition, 100);
        setTimeout(alignFsQueuePosition, 300);
        setTimeout(alignFsQueuePosition, 600);
      });
    });
  }

  // Fullscreen Queue Toggle & Clear (Immersive View)
  if (elements.fsQueueToggleBtn) {
    elements.fsQueueToggleBtn.addEventListener('click', () => toggleFsQueue());
  }
  if (elements.btnClearFsQueue) {
    elements.btnClearFsQueue.addEventListener('click', () => {
      state.queue = [];
      state.queueIndex = -1;
      renderSideQueueList();
      renderFsQueueList();
      renderQueueView();
      updateBadgeCounts();
      preloadNextTrack();
      showToast('Warteschlange geleert.');
    });
  }

  // Fullscreen Lyrics Manual Scroll Detection & Resync
  if (elements.fsLyricsWrapper) {
    const handleManualScroll = () => {
      if (!state.fsLyricsVisible || state.fsManualScroll) return;
      state.fsManualScroll = true;
      if (elements.fsLyricsWrapper) elements.fsLyricsWrapper.classList.add('manual-scroll');
      if (elements.fsSyncLyricsBtn) elements.fsSyncLyricsBtn.classList.remove('hidden');
      const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
      updateFullscreenLyrics(cur);
    };

    elements.fsLyricsWrapper.addEventListener('wheel', handleManualScroll, { passive: true });
    elements.fsLyricsWrapper.addEventListener('touchmove', handleManualScroll, { passive: true });
  }

  if (elements.fsSyncLyricsBtn) {
    elements.fsSyncLyricsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.fsManualScroll = false;
      if (elements.fsSyncLyricsBtn) elements.fsSyncLyricsBtn.classList.add('hidden');
      if (elements.fsLyricsWrapper) elements.fsLyricsWrapper.classList.remove('manual-scroll');
      const cur = elements.audioElement ? elements.audioElement.currentTime : 0;
      updateFullscreenLyrics(cur, true);
    });
  }

  if (elements.progressBar) {
    elements.progressBar.addEventListener('click', (e) => {
      const rect = elements.progressBar.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const dur = elements.audioElement.duration || (state.selectedTrack ? state.selectedTrack.duration : 0);
      if (dur > 0) elements.audioElement.currentTime = ratio * dur;
    });
  }

  if (elements.fsProgressBar) {
    elements.fsProgressBar.addEventListener('click', (e) => {
      const rect = elements.fsProgressBar.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const dur = elements.audioElement.duration || (state.selectedTrack ? state.selectedTrack.duration : 0);
      if (dur > 0) elements.audioElement.currentTime = ratio * dur;
    });
  }

  // Volume
  if (elements.volumeSlider) {
    elements.volumeSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      elements.audioElement.volume = v;
      try { setStoredItem('volume', v.toString()); } catch (_) {}
    });
  }

  // Equalizer inside Settings Modal
  if (elements.eqPresetSelect) {
    elements.eqPresetSelect.addEventListener('change', (e) => {
      if (e.target.value !== 'custom') {
        applyEqPreset(e.target.value);
      } else {
        setStoredItem('eq_preset', 'custom');
      }
      syncConfigToBackend();
    });
  }
  if (elements.btnResetEq) {
    elements.btnResetEq.addEventListener('click', () => {
      applyEqPreset('flat', false);
      if (elements.eqPresetSelect) elements.eqPresetSelect.value = 'flat';
      updatePreampGain(0);
      if (elements.eqPreampSlider) elements.eqPreampSlider.value = 0;
      setStoredItem('eq_preamp', '0');
      syncConfigToBackend(true);
    });
  }

  // Settings Modal & Themes
  if (elements.btnOpenSettings) {
    elements.btnOpenSettings.addEventListener('click', () => {
      if (elements.settingsModal) elements.settingsModal.classList.add('open');
      if (elements.ambientCoverBgToggle) {
        elements.ambientCoverBgToggle.checked = Boolean(isAmbientCoverBgEnabled);
      }
      restoreEqualizer();
      updateAuthUI();
      checkPlexLiveStatus();
    });
  }
  if (elements.btnCloseSettingsModal) {
    elements.btnCloseSettingsModal.addEventListener('click', () => {
      syncConfigToBackend(true);
      elements.settingsModal.classList.remove('open');
    });
  }
  if (elements.btnCancelSettings) {
    elements.btnCancelSettings.addEventListener('click', () => {
      syncConfigToBackend(true);
      elements.settingsModal.classList.remove('open');
    });
  }
  if (elements.settingsModalBackdrop) {
    elements.settingsModalBackdrop.addEventListener('click', () => {
      syncConfigToBackend(true);
      elements.settingsModal.classList.remove('open');
    });
  }

  // Settings Tab Navigation
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.toggle('active', p.id === targetTab));
      if (targetTab === 'tabSources') {
        updateAuthUI();
        checkPlexLiveStatus();
      }
    });
  });

  // Custom Theme Dropdown Trigger & Options
  if (elements.themeDropdownTrigger) {
    elements.themeDropdownTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (elements.themeDropdownContainer) {
        elements.themeDropdownContainer.classList.toggle('open');
      }
    });
  }

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = btn.getAttribute('data-theme');
      setTheme(t);
      if (elements.themeDropdownContainer) {
        elements.themeDropdownContainer.classList.remove('open');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (elements.themeDropdownContainer && !elements.themeDropdownContainer.contains(e.target)) {
      elements.themeDropdownContainer.classList.remove('open');
    }
  });

  if (elements.ambientCoverBgToggle) {
    elements.ambientCoverBgToggle.addEventListener('change', (e) => {
      setAmbientCoverBg(e.target.checked);
    });
  }

  // Create Playlist Modal
  if (elements.btnCreatePlaylist) {
    elements.btnCreatePlaylist.addEventListener('click', () => {
      if (elements.newPlaylistModal) elements.newPlaylistModal.classList.add('open');
      if (elements.newPlaylistNameInput) {
        elements.newPlaylistNameInput.value = '';
        elements.newPlaylistNameInput.focus();
      }
    });
  }
  if (elements.btnCloseNewPlaylistModal) elements.btnCloseNewPlaylistModal.addEventListener('click', () => elements.newPlaylistModal.classList.remove('open'));
  if (elements.btnCancelNewPlaylist) elements.btnCancelNewPlaylist.addEventListener('click', () => elements.newPlaylistModal.classList.remove('open'));
  if (elements.newPlaylistBackdrop) elements.newPlaylistBackdrop.addEventListener('click', () => elements.newPlaylistModal.classList.remove('open'));
  if (elements.btnSaveNewPlaylist) {
    elements.btnSaveNewPlaylist.addEventListener('click', () => {
      const name = elements.newPlaylistNameInput ? elements.newPlaylistNameInput.value.trim() : '';
      if (name) {
        createNewPlaylist(name);
        elements.newPlaylistModal.classList.remove('open');
      }
    });
  }

  // Queue Playback Confirmation Modal
  const queueConfirmModal = $('queueConfirmModal');
  const btnCloseQueueConfirm = $('btnCloseQueueConfirmModal');
  const btnCancelQueueConfirm = $('btnQueueConfirmCancel');
  const btnReplaceQueueConfirm = $('btnQueueConfirmReplace');
  const btnAppendQueueConfirm = $('btnQueueConfirmAppend');
  const queueConfirmBackdrop = $('queueConfirmBackdrop');

  const closeQueueModal = () => {
    pendingPlaylistPlayAction = null;
    if (queueConfirmModal) queueConfirmModal.classList.remove('open');
  };

  if (btnCloseQueueConfirm) btnCloseQueueConfirm.addEventListener('click', closeQueueModal);
  if (btnCancelQueueConfirm) btnCancelQueueConfirm.addEventListener('click', closeQueueModal);
  if (queueConfirmBackdrop) queueConfirmBackdrop.addEventListener('click', closeQueueModal);

  if (btnReplaceQueueConfirm) {
    btnReplaceQueueConfirm.addEventListener('click', () => {
      if (pendingPlaylistPlayAction) {
        state.queue = [...pendingPlaylistPlayAction.subsequentTracks];
        state.queueIndex = 0;
        selectTrack(pendingPlaylistPlayAction.track, true);
        updateAllQueueViews();
        showToast(`▶ Warteschlange ersetzt (${state.queue.length} Songs).`);
        closeQueueModal();
      }
    });
  }

  if (btnAppendQueueConfirm) {
    btnAppendQueueConfirm.addEventListener('click', () => {
      if (pendingPlaylistPlayAction) {
        const toAppend = pendingPlaylistPlayAction.subsequentTracks;
        state.queue.push(...toAppend);
        const newIdx = state.queue.length - toAppend.length;
        state.queueIndex = newIdx >= 0 ? newIdx : 0;
        selectTrack(pendingPlaylistPlayAction.track, true);
        updateAllQueueViews();
        showToast(`➕ ${toAppend.length} Songs an Warteschlange angehängt.`);
        closeQueueModal();
      }
    });
  }

  // Import Playlist Modal
  if (elements.btnImportPlaylists) {
    elements.btnImportPlaylists.addEventListener('click', () => {
      if (elements.importPlaylistsModal) elements.importPlaylistsModal.classList.add('open');
      loadImportPlaylists('plex');
    });
  }
  if (elements.btnCloseImportModal) elements.btnCloseImportModal.addEventListener('click', () => elements.importPlaylistsModal.classList.remove('open'));
  if (elements.btnCancelImport) elements.btnCancelImport.addEventListener('click', () => elements.importPlaylistsModal.classList.remove('open'));
  if (elements.importPlaylistsBackdrop) elements.importPlaylistsBackdrop.addEventListener('click', () => elements.importPlaylistsModal.classList.remove('open'));
  if (elements.tabImportPlex) {
    elements.tabImportPlex.addEventListener('click', () => {
      elements.tabImportPlex.classList.add('active');
      if (elements.tabImportSpotify) elements.tabImportSpotify.classList.remove('active');
      loadImportPlaylists('plex');
    });
  }
  if (elements.tabImportSpotify) {
    elements.tabImportSpotify.addEventListener('click', () => {
      elements.tabImportSpotify.classList.add('active');
      if (elements.tabImportPlex) elements.tabImportPlex.classList.remove('active');
      loadImportPlaylists('spotify');
    });
  }

  // Context Menu Actions
  document.addEventListener('click', () => {
    closeContextMenu();
    closeAlbumContextMenu();
  });
  if (elements.ctxPlayNext) {
    elements.ctxPlayNext.addEventListener('click', () => {
      if (state.contextMenuTrack) addToQueue(state.contextMenuTrack, true);
    });
  }
  if (elements.ctxAddToQueue) {
    elements.ctxAddToQueue.addEventListener('click', () => {
      if (state.contextMenuTrack) addToQueue(state.contextMenuTrack, false);
    });
  }
  if (elements.ctxToggleFavorite) {
    elements.ctxToggleFavorite.addEventListener('click', () => {
      if (state.contextMenuTrack) toggleFavorite(state.contextMenuTrack.id || state.contextMenuTrack.file_path);
    });
  }
  if (elements.ctxGoToArtist) {
    elements.ctxGoToArtist.addEventListener('click', () => {
      if (state.contextMenuTrack && state.contextMenuTrack.artist) openArtistDetail(state.contextMenuTrack.artist);
    });
  }
  if (elements.ctxGoToAlbum) {
    elements.ctxGoToAlbum.addEventListener('click', () => {
      if (state.contextMenuTrack && state.contextMenuTrack.album) openAlbumDetail({ title: state.contextMenuTrack.album, artist: state.contextMenuTrack.artist });
    });
  }

  // Album Context Menu Actions
  function getAlbumContextMenuTracks() {
    if (!state.contextMenuAlbum) return [];
    if (Array.isArray(state.contextMenuAlbum.tracks) && state.contextMenuAlbum.tracks.length > 0) {
      return state.contextMenuAlbum.tracks;
    }
    const albTitle = (state.contextMenuAlbum.title || '').trim().toLowerCase();
    const artName = (state.contextMenuAlbum.artist || '').trim().toLowerCase();
    return state.tracks.filter(t => {
      const matchAlb = (t.album || '').trim().toLowerCase() === albTitle;
      if (!matchAlb) return false;
      if (artName && artName !== 'unbekannt' && artName !== 'various artists') {
        return (t.artist || '').trim().toLowerCase() === artName;
      }
      return true;
    });
  }

  if (elements.ctxAlbumPlay) {
    elements.ctxAlbumPlay.addEventListener('click', () => {
      const trs = getAlbumContextMenuTracks();
      if (trs.length > 0) {
        playTrackWithContext(trs[0], trs);
        showToast(`▶ Album "${state.contextMenuAlbum?.title || ''}" wird abgespielt.`);
      }
    });
  }
  if (elements.ctxAlbumPlayNext) {
    elements.ctxAlbumPlayNext.addEventListener('click', () => {
      const trs = getAlbumContextMenuTracks();
      if (trs.length > 0) {
        const insertIdx = state.queueIndex >= 0 ? state.queueIndex + 1 : 0;
        state.queue.splice(insertIdx, 0, ...trs);
        updateAllQueueViews();
        showToast(`⏭ Album "${state.contextMenuAlbum?.title || ''}" (${trs.length} Songs) als Nächstes.`);
      }
    });
  }
  if (elements.ctxAlbumAddToQueue) {
    elements.ctxAlbumAddToQueue.addEventListener('click', () => {
      const trs = getAlbumContextMenuTracks();
      if (trs.length > 0) {
        state.queue.push(...trs);
        updateAllQueueViews();
        showToast(`➕ Album "${state.contextMenuAlbum?.title || ''}" (${trs.length} Songs) zur Warteschlange hinzugefügt.`);
      }
    });
  }
  if (elements.ctxAlbumGoToArtist) {
    elements.ctxAlbumGoToArtist.addEventListener('click', () => {
      if (state.contextMenuAlbum && state.contextMenuAlbum.artist) {
        openArtistDetail(state.contextMenuAlbum.artist);
      }
    });
  }
  // Tonarr Host, Plex & Spotify Auth UI Handlers
  function updateAuthUI(cfg = state.config || {}) {
    const currentHostUrl = cfg.tonarr_host_url || cfg.soundsphere_host_url || getStoredItem('host_url') || '';
    const isHostConnected = Boolean(currentHostUrl);
    if (elements.hostConnectionBadge) {
      elements.hostConnectionBadge.textContent = isHostConnected ? '🟢 Verbunden' : '🔴 Nicht verbunden';
      elements.hostConnectionBadge.className = `status-pill ${isHostConnected ? 'connected' : 'disconnected'}`;
    }
    if (elements.hostConnectedContainer) elements.hostConnectedContainer.style.display = isHostConnected ? 'flex' : 'none';
    if (elements.hostConfigContainer) elements.hostConfigContainer.style.display = isHostConnected ? 'none' : 'flex';
    if (isHostConnected && elements.hostConnectedServerInfo) {
      const hostTracks = state.tracks.filter(t => isHostTrack(t)).length;
      elements.hostConnectedServerInfo.textContent = `Server: ${currentHostUrl} (${hostTracks} Songs)`;
    }

    const plexToken = cfg.plex_token || getStoredItem('plex_token') || '';
    const plexUrl = cfg.plex_url || getStoredItem('plex_url') || '';
    const plexViaHost = (elements.plexViaHostToggle && elements.plexViaHostToggle.checked) ||
                        cfg.plex_via_host ||
                        (getStoredItem('plex_via_host') === 'true');
    const isPlexConfigured = Boolean((plexToken && plexUrl) || (plexViaHost && currentHostUrl) || (plexToken && !plexViaHost));

    if (elements.plexConnectionBadge) {
      elements.plexConnectionBadge.textContent = isPlexConfigured ? '🟢 Verbunden' : '🔴 Nicht verbunden';
      elements.plexConnectionBadge.className = `status-pill ${isPlexConfigured ? 'connected' : 'disconnected'}`;
    }
    if (elements.plexLoggedOutContainer) elements.plexLoggedOutContainer.style.display = isPlexConfigured ? 'none' : 'flex';
    if (elements.plexConnectedContainer) elements.plexConnectedContainer.style.display = isPlexConfigured ? 'flex' : 'none';
    if (isPlexConfigured && elements.plexConnectedServerInfo) {
      const plexTracks = state.tracks.filter(t => (t.file_path && t.file_path.startsWith('plex://')) || (t.id && t.id.startsWith('plex://'))).length;
      const srv = plexUrl || (plexViaHost ? `Über Host (${currentHostUrl})` : 'Plex Server');
      elements.plexConnectedServerInfo.textContent = `Server: ${srv} (${plexTracks} Songs)`;
    }

    const isSpotifyConnected = Boolean(cfg.spotify_access_token || cfg.spotify_user_name);
    if (elements.spotifyLoggedOutContainer) elements.spotifyLoggedOutContainer.style.display = isSpotifyConnected ? 'none' : 'flex';
    if (elements.spotifyConnectedContainer) elements.spotifyConnectedContainer.style.display = isSpotifyConnected ? 'flex' : 'none';
    if (isSpotifyConnected && elements.spotifyConnectedUserInfo) {
      elements.spotifyConnectedUserInfo.textContent = `Angemeldet als: ${cfg.spotify_user_name || 'Spotify Benutzer'}`;
    }
  }
  window.updateAuthUI = updateAuthUI;

  async function checkPlexLiveStatus() {
    const plexToken = state.config?.plex_token || getStoredItem('plex_token') || '';
    const plexUrl = state.config?.plex_url || getStoredItem('plex_url') || '';
    const plexViaHost = (elements.plexViaHostToggle && elements.plexViaHostToggle.checked) || 
                        (state.config && state.config.plex_via_host) || 
                        (getStoredItem('plex_via_host') === 'true');
    const hostUrl = getHostBaseUrl();

    if (!plexToken && !plexViaHost && !plexUrl) {
      if (elements.plexConnectionBadge) {
        elements.plexConnectionBadge.textContent = '🔴 Nicht verbunden';
        elements.plexConnectionBadge.className = 'status-pill disconnected';
      }
      if (elements.plexConnectedContainer) elements.plexConnectedContainer.style.display = 'none';
      if (elements.plexLoggedOutContainer) elements.plexLoggedOutContainer.style.display = 'flex';
      return;
    }

    try {
      const statusUrl = getPlexApiUrl('/api/plex/status');
      const res = await fetch(statusUrl, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (elements.plexConnectionBadge) {
            elements.plexConnectionBadge.textContent = '🟢 Verbunden';
            elements.plexConnectionBadge.className = 'status-pill connected';
          }
          if (elements.plexConnectedContainer) elements.plexConnectedContainer.style.display = 'flex';
          if (elements.plexLoggedOutContainer) elements.plexLoggedOutContainer.style.display = 'none';
          if (elements.plexConnectedServerInfo) {
            const trackCount = state.tracks.filter(t => (t.file_path && t.file_path.startsWith('plex://')) || (t.id && t.id.startsWith('plex://'))).length;
            const sUrl = data.effective_url || plexUrl || (plexViaHost ? `Über Host (${hostUrl})` : 'Plex Server');
            elements.plexConnectedServerInfo.textContent = `Server: ${sUrl} (${trackCount} Songs • v${data.version || 'OK'})`;
          }
          loadPlexSections().catch(() => {});
          return;
        }
      }
    } catch (_) {}

    // Fallback if configured but server temporarily unreachable
    if (plexToken || (plexViaHost && hostUrl)) {
      if (elements.plexConnectionBadge) {
        elements.plexConnectionBadge.textContent = '🟡 Server prüfen';
        elements.plexConnectionBadge.className = 'status-pill warning';
      }
    } else {
      if (elements.plexConnectionBadge) {
        elements.plexConnectionBadge.textContent = '🔴 Nicht verbunden';
        elements.plexConnectionBadge.className = 'status-pill disconnected';
      }
    }
  }
  window.checkPlexLiveStatus = checkPlexLiveStatus;

  async function verifyAndRestoreHostConnection(customUrl = null, customToken = null) {
    const targetUrl = (customUrl || getHostBaseUrl()).trim().replace(/\/+$/, '');
    const targetToken = (customToken !== null ? customToken : getHostToken());
    if (!targetUrl) {
      if (elements.hostConnectionBadge) {
        elements.hostConnectionBadge.textContent = '🔴 Nicht verbunden';
        elements.hostConnectionBadge.className = 'status-pill disconnected';
      }
      if (elements.hostConnectedContainer) elements.hostConnectedContainer.style.display = 'none';
      if (elements.hostConfigContainer) elements.hostConfigContainer.style.display = 'flex';
      return;
    }

    if (elements.hostConnectionBadge) {
      elements.hostConnectionBadge.textContent = '🟡 Verbinde...';
      elements.hostConnectionBadge.className = 'status-pill warning';
    }

    try {
      const tokenQuery = targetToken ? `?token=${encodeURIComponent(targetToken)}` : '';
      const headers = { 'Accept': 'application/json' };
      if (targetToken) {
        headers['X-Tonarr-Token'] = targetToken;
        headers['X-SoundSphere-Token'] = targetToken;
      }
      const res = await fetch(`${targetUrl}/api/info${tokenQuery}`, { headers, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const info = await res.json();
        const hName = info.host_name || info.app || 'Tonarr Host';
        const total = info.stats?.total_tracks || 0;
        if (elements.hostConnectionBadge) {
          elements.hostConnectionBadge.textContent = '🟢 Verbunden';
          elements.hostConnectionBadge.className = 'status-pill connected';
        }
        if (elements.hostConnectedContainer) elements.hostConnectedContainer.style.display = 'flex';
        if (elements.hostConfigContainer) elements.hostConfigContainer.style.display = 'none';
        if (elements.hostConnectedServerInfo) {
          elements.hostConnectedServerInfo.textContent = `Server: ${targetUrl} (${hName} • ${total} Songs)`;
        }
        if (elements.hostUrlInput) elements.hostUrlInput.value = targetUrl;
        if (elements.hostTokenInput) elements.hostTokenInput.value = targetToken;
        // Background sync to ensure client has latest tracks
        syncHostLibrary(targetUrl, targetToken).catch(() => {});
        return;
      }
    } catch (_) {}

    // Host temporarily unreachable
    if (elements.hostConnectionBadge) {
      elements.hostConnectionBadge.textContent = '🔴 Host offline';
      elements.hostConnectionBadge.className = 'status-pill disconnected';
    }
    if (elements.hostConnectedContainer) elements.hostConnectedContainer.style.display = 'flex';
    if (elements.hostConfigContainer) elements.hostConfigContainer.style.display = 'none';
    if (elements.hostConnectedServerInfo) {
      elements.hostConnectedServerInfo.textContent = `Server: ${targetUrl} (Offline / Nicht erreichbar)`;
    }
  }
  window.verifyAndRestoreHostConnection = verifyAndRestoreHostConnection;

  async function scanForHosts(containerEl) {
    if (!containerEl) return;
    containerEl.style.display = 'flex';
    containerEl.innerHTML = `
      <div style="padding:14px; background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.3); border-radius:var(--radius-md); text-align:center;">
        <span style="font-size:0.88rem; color:#c4b5fd;">⏳ Scanne lokales Netzwerk nach Tonarr Host (Port 8765)...</span>
      </div>
    `;

    try {
      const res = await fetch('/api/host/discover');
      if (res.ok) {
        const data = await res.json();
        const hosts = data.hosts || [];
        if (hosts.length === 0) {
          containerEl.innerHTML = `
            <div style="padding:12px; background:rgba(0,0,0,0.25); border:1px solid var(--border-color); border-radius:var(--radius-md);">
              <div style="font-size:0.88rem; color:#f87171; font-weight:600;">🔍 Kein Host im lokalen Netzwerk gefunden</div>
              <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">Stelle sicher, dass der Host (Docker / ZimaOS) läuft und Port 8765 erreichbar ist. Du kannst die IP auch manuell eingeben.</div>
            </div>
          `;
          return;
        }

        containerEl.innerHTML = `
          <div style="font-size:0.85rem; font-weight:700; color:#c4b5fd; margin-bottom:4px;">
            Gefundene Hosts im Netzwerk (${hosts.length}):
          </div>
          ${hosts.map(h => `
            <div class="settings-subcard" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; border-left:3px solid #8b5cf6;">
              <div>
                <div style="font-weight:700; color:#fff; font-size:0.92rem;">🖥️ ${escapeHtml(h.host_name || 'Tonarr Host')}</div>
                <div style="font-size:0.8rem; color:#a78bfa; font-family:monospace;">${escapeHtml(h.url)}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                  ${h.total_tracks} Songs • v${h.version} ${h.auth_required ? '• 🔒 Token erforderlich' : '• 🔓 Kein Token nötig'}
                </div>
              </div>
              <button type="button" class="btn btn-primary btn-sm btn-connect-discovered" data-url="${escapeHtml(h.url)}" style="background:#8b5cf6; color:#fff; font-weight:700;">
                <span>Verbinden</span>
              </button>
            </div>
          `).join('')}
        `;

        containerEl.querySelectorAll('.btn-connect-discovered').forEach(btn => {
          btn.addEventListener('click', async () => {
            const url = btn.getAttribute('data-url');
            if (elements.hostUrlInput) elements.hostUrlInput.value = url;
            showToast(`🖥️ Verbinde mit ${url}...`);
            containerEl.style.display = 'none';
            if (elements.btnTestHostConnection) elements.btnTestHostConnection.click();
          });
        });
      } else {
        containerEl.innerHTML = `
          <div style="padding:10px; color:#f87171; font-size:0.85rem;">Fehler bei der Host-Suche (HTTP ${res.status}).</div>
        `;
      }
    } catch (err) {
      containerEl.innerHTML = `
        <div style="padding:10px; color:#f87171; font-size:0.85rem;">Verbindungsfehler beim Scannen nach Hosts.</div>
      `;
    }
  }

  // Tonarr Host Action Handlers
  async function syncHostLibrary(customUrl = null, customToken = null) {
    const hostUrl = (customUrl || getHostBaseUrl()).trim().replace(/\/+$/, '');
    const token = (customToken !== null ? customToken : getHostToken());
    if (!hostUrl) {
      showToast('Bitte zuerst Tonarr Host URL konfigurieren.');
      return;
    }
    if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = '⏳ Synchronisiere Tonarr Host Mediathek...';
    showToast('🔄 Synchronisiere Tonarr Host...');
    try {
      const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
      const headers = { 'Accept': 'application/json' };
      if (token) {
        headers['X-Tonarr-Token'] = token;
        headers['X-SoundSphere-Token'] = token;
      }

      // Fetch host config to auto-align plex_as_only_player_source if set on host
      try {
        const cfgRes = await fetch(`${hostUrl}/api/config${tokenQuery}`, { headers, signal: AbortSignal.timeout(4000) });
        if (cfgRes.ok) {
          const hostCfg = await cfgRes.json();
          state.hostConfig = hostCfg;
          if (hostCfg.plex_as_only_player_source || hostCfg.folder_source_for_creator_and_manager_only) {
            setStoredItem('plex_as_only_player_source', 'true');
            if (elements.plexAsOnlyPlayerSourceToggle) elements.plexAsOnlyPlayerSourceToggle.checked = true;
          }
        }
      } catch (_) {}

      const res = await fetch(`${hostUrl}/api/tracks${tokenQuery}`, { headers, signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const data = await res.json();
        const rawTracks = Array.isArray(data) ? data : (Array.isArray(data.tracks) ? data.tracks : []);
        
        const mappedTracks = rawTracks.map(t => {
          const tid = t.id || t.file_path || String(Math.random());
          const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
          const isPlex = t.source === 'plex' || Boolean(t.plex_key) || String(t.file_path || '').startsWith('plex://') || String(t.id || '').startsWith('plex_');
          return {
            id: String(tid).startsWith('host://') ? tid : `host://${tid}`,
            host_id: t.id || tid,
            title: t.title || 'Unbekannter Titel',
            artist: t.artist || 'Unbekannter Interpret',
            album: t.album || 'Unbekanntes Album',
            duration: t.duration || 0,
            duration_str: t.duration_str || (t.duration ? formatDuration(t.duration) : '00:00'),
            genre: t.genre || '',
            year: t.year || null,
            track_no: t.track_no || null,
            file_path: t.file_path || `host://${tid}`,
            source: isPlex ? 'plex' : 'tonarr_host',
            plex_key: t.plex_key || (String(t.id || '').startsWith('plex_') ? String(t.id).replace('plex_', '') : null),
            cover_url: `${hostUrl}/api/cover?id=${encodeURIComponent(t.id || tid)}${tokenParam}`,
            stream_url: `${hostUrl}/api/audio/stream?id=${encodeURIComponent(t.id || tid)}${tokenParam}`,
            lyrics_url: `${hostUrl}/api/lyrics?id=${encodeURIComponent(t.id || tid)}${tokenParam}`,
            bitrate: t.bitrate || null,
            sample_rate: t.sample_rate || null,
            bit_depth: t.bit_depth || null,
            channels: t.channels || 2,
            codec: t.codec || t.audio_codec || (t.extension ? t.extension.replace('.', '').toUpperCase() : ''),
            extension: t.extension || (t.file_name ? '.' + t.file_name.split('.').pop() : ''),
            quality_str: t.quality_str || null,
            is_lossless: Boolean(t.is_lossless),
            is_hi_res: Boolean(t.is_hi_res)
          };
        });

        const isPlexOnly = isPlexOnlyPlayerSource();
        let targetList = [];
        if (isPlexOnly) {
          targetList = mappedTracks.filter(t => isPlexTrack(t));
        } else {
          const hostNorms = new Set(mappedTracks.map(t => `${(t.artist || '').trim().toLowerCase()}:::${(t.title || '').trim().toLowerCase()}`));
          const hostKeys = new Set(mappedTracks.map(t => t.plex_key ? String(t.plex_key) : '').filter(Boolean));
          
          const nonHostTracks = state.tracks.filter(t => {
            if (isHostTrack(t)) return false;
            const pkey = t.plex_key ? String(t.plex_key) : '';
            if (pkey && hostKeys.has(pkey)) return false;
            const norm = `${(t.artist || '').trim().toLowerCase()}:::${(t.title || '').trim().toLowerCase()}`;
            if (norm.length > 5 && hostNorms.has(norm)) return false;
            return true;
          });
          targetList = [...nonHostTracks, ...mappedTracks];
        }

        // Strict deduplication so no song ever exists twice
        const seenPlexKeys = new Set();
        const seenTrackNorms = new Set();
        const unique = [];
        for (const t of targetList) {
          const pkey = t.plex_key ? String(t.plex_key) : '';
          const norm = `${(t.artist || '').trim().toLowerCase()}:::${(t.title || '').trim().toLowerCase()}`;
          if (pkey && seenPlexKeys.has(pkey)) continue;
          if (norm.length > 5 && seenTrackNorms.has(norm)) continue;
          if (pkey) seenPlexKeys.add(pkey);
          if (norm.length > 5) seenTrackNorms.add(norm);
          unique.push(t);
        }
        state.tracks = unique;

        try {
          setStoredItem('host_tracks', JSON.stringify(mappedTracks));
        } catch (e) {
          console.warn('Could not cache host tracks in localStorage:', e);
        }

        updateBadgeCounts();
        renderTracksTable();
        renderArtistsGrid();
        renderAlbumsGrid();
        updateAuthUI(state.config);

        // Auto-sync Host and Plex playlists immediately with the library
        try {
          await fetchPlaylists();
          await autoImportAllPlaylists();
        } catch (e) {
          console.warn('Playlist auto-sync error after host sync:', e);
        }

        if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = `✅ ${mappedTracks.length} Host Songs synchronisiert!`;
        showToast(`✅ ${mappedTracks.length} Host Songs erfolgreich synchronisiert!`);
      } else {
        const err = await res.json().catch(() => ({}));
        if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = err.detail || `Fehler beim Synchronisieren (HTTP ${res.status}).`;
        showToast(`❌ Host-Synchronisation fehlgeschlagen (HTTP ${res.status})`);
      }
    } catch (err) {
      console.warn('Host sync error:', err);
      if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = '❌ Verbindungsfehler zum Host.';
      showToast('❌ Verbindungsfehler beim Synchronisieren mit dem Host.');
    }
  }
  window.syncHostLibrary = syncHostLibrary;

  if (elements.btnTestHostConnection) {
    elements.btnTestHostConnection.addEventListener('click', async () => {
      const rawUrl = elements.hostUrlInput ? elements.hostUrlInput.value.trim() : '';
      const token = elements.hostTokenInput ? elements.hostTokenInput.value.trim() : '';
      if (!rawUrl) {
        showToast('Bitte Tonarr Host URL eingeben.');
        return;
      }
      const url = rawUrl.replace(/\/+$/, '');
      if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = '⏳ Teste Verbindung zum Host...';

      try {
        // Save to localStorage immediately
        setStoredItem('host_url', url);
        setStoredItem('host_token', token);
        setStoredItem('host_enabled', 'true');
        if (!state.config) state.config = {};
        state.config.tonarr_host_url = url;
        state.config.soundsphere_host_url = url;
        state.config.tonarr_host_token = token;
        state.config.soundsphere_host_token = token;
        state.config.tonarr_host_enabled = true;
        state.config.soundsphere_host_enabled = true;

        // Also notify local backend if available
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tonarr_host_url: url,
            soundsphere_host_url: url,
            tonarr_host_token: token,
            soundsphere_host_token: token,
            tonarr_host_enabled: true,
            soundsphere_host_enabled: true
          })
        }).catch(() => {});

        // Direct test against Host API (/api/info or /api/status)
        const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
        const headers = { 'Accept': 'application/json' };
        if (token) {
          headers['X-Tonarr-Token'] = token;
          headers['X-SoundSphere-Token'] = token;
        }

        const infoRes = await fetch(`${url}/api/info${tokenQuery}`, { headers, signal: AbortSignal.timeout(7000) });
        if (infoRes.ok) {
          const info = await infoRes.json();
          const hostName = info.host_name || info.app || 'Tonarr Host';
          const songCount = info.stats?.total_tracks || 0;
          if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = `✅ Verbunden mit ${hostName} (${songCount} Titel auf Server)!`;
          showToast(`✅ Erfolgreich mit ${hostName} verbunden!`);
          updateAuthUI(state.config);
          await syncHostLibrary(url, token);
        } else if (infoRes.status === 401) {
          if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = '❌ Authentifizierungsfehler: Ungültiger oder fehlender Token.';
          showToast('❌ Ungültiger Host Token.');
        } else {
          if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = `❌ Server antwortete mit Status ${infoRes.status}`;
          showToast(`❌ Host Verbindung fehlgeschlagen (${infoRes.status})`);
        }
      } catch (e) {
        console.warn('Host connection test error:', e);
        if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = '❌ Verbindungsfehler (Host nicht erreichbar).';
        showToast('❌ Tonarr Host nicht erreichbar.');
      }
    });
  }

  if (elements.btnSyncHostLibrary) {
    elements.btnSyncHostLibrary.addEventListener('click', async () => {
      await syncHostLibrary();
    });
  }

  if (elements.btnDisconnectHost) {
    elements.btnDisconnectHost.addEventListener('click', async () => {
      try {
        removeStoredItem('host_url');
        removeStoredItem('host_token');
        setStoredItem('host_enabled', 'false');
        removeStoredItem('host_tracks');
        if (state.config) {
          state.config.tonarr_host_url = '';
          state.config.soundsphere_host_url = '';
          state.config.tonarr_host_token = '';
          state.config.soundsphere_host_token = '';
          state.config.tonarr_host_enabled = false;
          state.config.soundsphere_host_enabled = false;
        }
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tonarr_host_url: '',
            soundsphere_host_url: '',
            tonarr_host_token: '',
            soundsphere_host_token: '',
            tonarr_host_enabled: false,
            soundsphere_host_enabled: false
          })
        }).catch(() => {});

        if (elements.hostUrlInput) elements.hostUrlInput.value = '';
        if (elements.hostTokenInput) elements.hostTokenInput.value = '';
        if (elements.hostStatusMsg) elements.hostStatusMsg.textContent = '';
        // Remove only Host tracks from library
        state.tracks = state.tracks.filter(t => !isHostTrack(t));
        updateBadgeCounts();
        renderTracksTable();
        renderArtistsGrid();
        renderAlbumsGrid();
        updateAuthUI();
        showToast('🚪 Tonarr Host getrennt.');
      } catch (e) {
        showToast('Fehler beim Trennen des Hosts.');
      }
    });
  }

  if (elements.btnDiscoverHost) {
    elements.btnDiscoverHost.addEventListener('click', () => {
      scanForHosts(elements.hostDiscoveryResultsContainer);
    });
  }
  if (elements.btnDiscoverHostConnected) {
    elements.btnDiscoverHostConnected.addEventListener('click', () => {
      scanForHosts(elements.hostDiscoveryResultsConnectedContainer);
    });
  }

  if (elements.btnToggleManualPlex && elements.manualPlexContainer) {
    elements.btnToggleManualPlex.addEventListener('click', () => {
      elements.manualPlexContainer.style.display = elements.manualPlexContainer.style.display === 'none' ? 'flex' : 'none';
    });
  }

  if (elements.btnToggleSpotifyCustomApp && elements.spotifyCustomAppContainer) {
    elements.btnToggleSpotifyCustomApp.addEventListener('click', () => {
      elements.spotifyCustomAppContainer.style.display = elements.spotifyCustomAppContainer.style.display === 'none' ? 'flex' : 'none';
    });
  }

  function openCenteredPlexPopup(url) {
    if (!url) return null;
    const width = 600;
    const height = 700;
    const left = window.screenLeft !== undefined
      ? window.screenLeft + Math.max(0, (window.outerWidth - width) / 2)
      : (window.screen.width - width) / 2;
    const top = window.screenTop !== undefined
      ? window.screenTop + Math.max(0, (window.outerHeight - height) / 2)
      : (window.screen.height - height) / 2;

    const popup = window.open(
      url,
      'PlexOAuthWindow',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,resizable=yes,menubar=no,toolbar=no,location=yes`
    );
    if (popup) {
      try { popup.focus(); } catch (e) {}
    }
    return popup;
  }

  if (elements.btnLoginPlexOAuth) {
    elements.btnLoginPlexOAuth.addEventListener('click', async () => {
      let popup = null;
      try {
        if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = '⏳ Erstelle Plex Login-PIN...';
        const callbackUrl = `${window.location.origin}/api/plex/callback`;
        const res = await fetch('/api/plex/auth/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_url: callbackUrl })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.auth_url) {
            popup = openCenteredPlexPopup(data.auth_url);
            if (elements.plexStatusMsg) {
              elements.plexStatusMsg.innerHTML = `🌐 Bitte autorisiere Tonarr im geöffneten Anmeldefenster... (PIN: <strong>${escapeHtml(data.code || '')}</strong>)`;
            }
            
            let attempts = 0;
            let finished = false;

            const handleSuccess = async () => {
              if (finished) return;
              finished = true;
              if (pollInterval) clearInterval(pollInterval);
              window.removeEventListener('message', onPlexMessage);
              if (popup && !popup.closed) {
                try { popup.close(); } catch (e) {}
              }
              if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = `✅ Verbunden mit Plex! Songs werden synchronisiert...`;
              showToast(`📺 Erfolgreich mit Plex verbunden!`);
              await fetchConfig();
              if (typeof checkPlexLiveStatus === 'function') await checkPlexLiveStatus();
              if (typeof updateAuthUI === 'function') updateAuthUI();
              await scanMusicFolders();
              await loadImportPlaylists('plex');
            };

            const onPlexMessage = async (e) => {
              if (e && e.data && e.data.type === 'PLEX_AUTH_SUCCESS') {
                try {
                  const checkRes = await fetch(`/api/plex/auth/check?pin_id=${data.pin_id}&code=${encodeURIComponent(data.code || '')}`);
                  if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    if (checkData.authorized) {
                      await handleSuccess();
                    }
                  }
                } catch (err) {}
              }
            };
            window.addEventListener('message', onPlexMessage);

            const pollInterval = setInterval(async () => {
              if (finished) {
                clearInterval(pollInterval);
                return;
              }
              attempts++;
              if (attempts > 90) {
                clearInterval(pollInterval);
                window.removeEventListener('message', onPlexMessage);
                if (popup && !popup.closed) {
                  try { popup.close(); } catch(e) {}
                }
                if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = '❌ Zeitüberschreitung beim Plex Login.';
                return;
              }
              try {
                const checkRes = await fetch(`/api/plex/auth/check?pin_id=${data.pin_id}&code=${encodeURIComponent(data.code || '')}`);
                if (checkRes.ok) {
                  const checkData = await checkRes.json();
                  if (checkData.authorized) {
                    await handleSuccess();
                  }
                }
              } catch (err) {}
            }, 1500);
          }
        } else {
          if (popup && !popup.closed) popup.close();
          if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = '❌ Fehler beim Erstellen der Plex-PIN.';
        }
      } catch (err) {
        if (popup && !popup.closed) popup.close();
        if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = '❌ Fehler beim Starten des Plex Logins.';
      }
    });
  }

  if (elements.btnLogoutPlex) {
    elements.btnLogoutPlex.addEventListener('click', async () => {
      try {
        await fetch('/api/plex/auth/logout', { method: 'POST' });
        if (state.config) {
          state.config.plex_token = '';
          state.config.plex_url = '';
          state.config.plex_enabled = false;
        }
        if (elements.plexUrlInput) elements.plexUrlInput.value = '';
        if (elements.plexTokenInput) elements.plexTokenInput.value = '';
        // Remove only Plex tracks from library
        state.tracks = state.tracks.filter(t => !(t.file_path && t.file_path.startsWith('plex://')) && !(t.id && t.id.startsWith('plex://')));
        updateBadgeCounts();
        renderTracksTable();
        renderArtistsGrid();
        renderAlbumsGrid();
        updateAuthUI();
        showToast('🚪 Plex erfolgreich abgemeldet.');
      } catch (e) {
        showToast('Fehler beim Abmelden von Plex.');
      }
    });
  }

  if (elements.btnSyncPlexLibrary) {
    elements.btnSyncPlexLibrary.addEventListener('click', async () => {
      if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = '⏳ Synchronisiere Plex Mediathek...';
      showToast('🔄 Synchronisiere Plex Mediathek...');
      try {
        const res = await fetch(getPlexApiUrl('/api/plex/sync'), { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.tracks) {
            const isPlexOnly = isPlexOnlyPlayerSource();
            let target = [];
            if (isPlexOnly) {
              target = data.tracks;
            } else {
              const localTracks = state.tracks.filter(t => !isPlexTrack(t));
              target = [...localTracks, ...data.tracks];
            }
            const seenKeys = new Set();
            const seenNorms = new Set();
            const unique = [];
            for (const t of target) {
              const pkey = t.plex_key ? String(t.plex_key) : '';
              const norm = `${(t.artist || '').trim().toLowerCase()}:::${(t.title || '').trim().toLowerCase()}`;
              if (pkey && seenKeys.has(pkey)) continue;
              if (norm.length > 5 && seenNorms.has(norm)) continue;
              if (pkey) seenKeys.add(pkey);
              if (norm.length > 5) seenNorms.add(norm);
              unique.push(t);
            }
            state.tracks = unique;
            updateBadgeCounts();
            renderTracksTable();
            renderArtistsGrid();
            renderAlbumsGrid();
            if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = `✅ ${data.count || data.tracks.length} Plex Songs synchronisiert!`;
            showToast(`✅ ${data.count || data.tracks.length} Plex Songs erfolgreich synchronisiert!`);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = err.detail || 'Fehler beim Synchronisieren.';
          showToast(err.detail || 'Fehler bei der Plex-Synchronisation.');
        }
      } catch (err) {
        if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = 'Verbindungsfehler zu Plex.';
        showToast('Verbindungsfehler beim Synchronisieren mit Plex.');
      }
      updateAuthUI();
    });
  }

  if (elements.btnTestPlexConnection) {
    elements.btnTestPlexConnection.addEventListener('click', async () => {
      const url = elements.plexUrlInput ? elements.plexUrlInput.value.trim() : '';
      const token = elements.plexTokenInput ? elements.plexTokenInput.value.trim() : '';
      if (!url || !token) {
        showToast('Bitte URL und Token eingeben.');
        return;
      }
      if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = '⏳ Teste Plex Verbindung...';
      try {
        await fetch(getApiEndpoint('/api/config'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plex_url: url, plex_token: token, plex_enabled: true })
        });
        const res = await fetch(getPlexApiUrl('/api/plex/status'));
        if (res.ok) {
          const status = await res.json();
          if (status.success) {
            if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = `✅ Plex Server verbunden (${status.version || 'OK'})!`;
            showToast('✅ Plex Server erfolgreich verbunden!');
            await fetchConfig();
            await scanMusicFolders();
          } else {
            if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = `❌ ${status.error || 'Verbindung fehlgeschlagen'}`;
          }
        }
      } catch (e) {
        if (elements.plexStatusMsg) elements.plexStatusMsg.textContent = '❌ Verbindungsfehler.';
      }
    });
  }

  // Official Spotify OAuth Login
  if (elements.btnLoginSpotifyOAuth) {
    elements.btnLoginSpotifyOAuth.addEventListener('click', async () => {
      try {
        if (elements.spotifyStatusMsg) elements.spotifyStatusMsg.textContent = '⏳ Starte offizielle Spotify Autorisierung...';
        const res = await fetch('/api/spotify/auth/start', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.auth_url) {
            window.open(data.auth_url, '_blank');
            if (elements.spotifyStatusMsg) elements.spotifyStatusMsg.textContent = '🌐 Bitte im Browserfenster anmelden & Tonarr autorisieren...';
            
            let attempts = 0;
            const pollInterval = setInterval(async () => {
              attempts++;
              if (attempts > 90) {
                clearInterval(pollInterval);
                if (elements.spotifyStatusMsg) elements.spotifyStatusMsg.textContent = '❌ Zeitüberschreitung beim Spotify Login.';
                return;
              }
              try {
                const statRes = await fetch('/api/spotify/status');
                if (statRes.ok) {
                  const stat = await statRes.json();
                  if (stat.connected) {
                    clearInterval(pollInterval);
                    if (elements.spotifyStatusMsg) elements.spotifyStatusMsg.textContent = `✅ Verbunden als ${stat.display_name}!`;
                    showToast(`💚 Erfolgreich mit Spotify verbunden!`);
                    await fetchConfig();
                    await loadImportPlaylists('spotify');
                  }
                }
              } catch (e) {}
            }, 2000);
          }
        }
      } catch (err) {
        if (elements.spotifyStatusMsg) elements.spotifyStatusMsg.textContent = '❌ Fehler beim Starten des Spotify Logins.';
      }
    });
  }

  if (elements.btnLogoutSpotify) {
    elements.btnLogoutSpotify.addEventListener('click', async () => {
      try {
        await fetch('/api/spotify/auth/logout', { method: 'POST' });
        if (state.config) {
          state.config.spotify_access_token = '';
          state.config.spotify_user_name = '';
          state.config.spotify_refresh_token = '';
        }
        updateAuthUI();
        showToast('🚪 Spotify erfolgreich abgemeldet.');
      } catch (e) {
        showToast('Fehler beim Abmelden von Spotify.');
      }
    });
  }

  if (elements.btnSyncSpotifyPlaylists) {
    elements.btnSyncSpotifyPlaylists.addEventListener('click', async () => {
      showToast('🔄 Lade Spotify Playlists...');
      await loadImportPlaylists('spotify');
      if (elements.importPlaylistsModal) {
        elements.importPlaylistsModal.classList.add('open');
        if (elements.tabImportSpotify) elements.tabImportSpotify.click();
      }
    });
  }

  if (elements.btnSaveSpotifyApiKeys || elements.btnSaveSpotifyKeys) {
    const btnKey = elements.btnSaveSpotifyKeys || elements.btnSaveSpotifyApiKeys;
    if (btnKey) {
      btnKey.addEventListener('click', async () => {
        const clientId = elements.spotifyClientIdInput ? elements.spotifyClientIdInput.value.trim() : '';
        const clientSecret = elements.spotifyClientSecretInput ? elements.spotifyClientSecretInput.value.trim() : '';
        try {
          await fetch(getApiEndpoint('/api/config'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spotify_client_id: clientId, spotify_client_secret: clientSecret })
          });
          showToast('🔑 Spotify API-Keys gespeichert.');
        } catch (e) {
          showToast('Fehler beim Speichern der API-Keys.');
        }
      });
    }
  }

  // Save Settings Modal
  if (elements.btnSaveSettings) {
    elements.btnSaveSettings.addEventListener('click', async () => {
      saveAllSettings();
      syncConfigToBackend(true);
      showToast('⚙️ Einstellungen gespeichert!');
      if (elements.settingsModal) elements.settingsModal.classList.remove('open');
    });
  }

  // Global Windows Media Keys & Keyboard Shortcuts
  let lastMediaActionTime = 0;
  function handleDebouncedMediaAction(fn) {
    const now = Date.now();
    if (now - lastMediaActionTime < 300) return;
    lastMediaActionTime = now;
    fn();
  }
  window.handleDebouncedMediaAction = handleDebouncedMediaAction;

  window.addEventListener('keydown', (e) => {
    const isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');

    // Windows Media Hardware Keys (Play/Pause, Next, Prev, Stop)
    if (e.code === 'MediaPlayPause' || e.key === 'MediaPlayPause') {
      e.preventDefault();
      handleDebouncedMediaAction(togglePlay);
    } else if (e.code === 'MediaTrackNext' || e.key === 'MediaTrackNext') {
      e.preventDefault();
      handleDebouncedMediaAction(playNextTrack);
    } else if (e.code === 'MediaTrackPrevious' || e.key === 'MediaTrackPrevious') {
      e.preventDefault();
      handleDebouncedMediaAction(playPrevTrack);
    } else if (e.code === 'MediaStop' || e.key === 'MediaStop') {
      e.preventDefault();
      if (elements.audioElement) {
        elements.audioElement.pause();
        elements.audioElement.currentTime = 0;
      }
    } else if (e.key === 'Escape') {
      if (elements.fullscreenVisualizer && elements.fullscreenVisualizer.classList.contains('open')) {
        toggleFullscreen(false);
      }
      if (elements.settingsModal) elements.settingsModal.classList.remove('open');
      if (elements.importPlaylistsModal) elements.importPlaylistsModal.classList.remove('open');
      if (elements.newPlaylistModal) elements.newPlaylistModal.classList.remove('open');
    } else if (e.key === 'F11' || e.code === 'F11') {
      e.preventDefault();
      toggleNativeFullscreen();
    } else if (e.key === 'f' || e.key === 'F' || e.code === 'KeyF') {
      if (!isInput) {
        e.preventDefault();
        toggleFullscreen();
      }
    } else if (!isInput) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight' && (e.ctrlKey || e.altKey)) {
        e.preventDefault();
        handleDebouncedMediaAction(playNextTrack);
      } else if (e.code === 'ArrowLeft' && (e.ctrlKey || e.altKey)) {
        e.preventDefault();
        handleDebouncedMediaAction(playPrevTrack);
      }
    }
  });
}

// --- Windows Media Session Integration ---
function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }

  const coverUrl = getTrackCoverUrl(track);
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unbekannter Titel',
      artist: track.artist || 'Unbekannter Interpret',
      album: track.album || '',
      artwork: [
        { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
        { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
      ]
    });
  } catch (err) {
    console.warn('MediaMetadata creation failed:', err);
  }
}

function setupMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;

  const runDebounced = (fn) => {
    if (window.handleDebouncedMediaAction) window.handleDebouncedMediaAction(fn);
    else fn();
  };

  try {
    navigator.mediaSession.setActionHandler('play', () => {
      runDebounced(() => {
        if (elements.audioElement && elements.audioElement.paused) {
          elements.audioElement.play().catch(() => {});
        }
      });
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      runDebounced(() => {
        if (elements.audioElement && !elements.audioElement.paused) {
          elements.audioElement.pause();
        }
      });
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      runDebounced(playPrevTrack);
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      runDebounced(playNextTrack);
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && elements.audioElement) {
        elements.audioElement.currentTime = details.seekTime;
      }
    });

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      if (elements.audioElement) {
        elements.audioElement.currentTime = Math.max(0, elements.audioElement.currentTime - (details.seekOffset || 10));
      }
    });

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      if (elements.audioElement) {
        elements.audioElement.currentTime = Math.min(elements.audioElement.duration || 0, elements.audioElement.currentTime + (details.seekOffset || 10));
      }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      if (elements.audioElement) {
        elements.audioElement.pause();
        elements.audioElement.currentTime = 0;
      }
    });
  } catch (err) {
    console.warn('MediaSession action handler error:', err);
  }
}

async function loadImportPlaylists(source) {
  if (!elements.importPlaylistsList) return;
  elements.importPlaylistsList.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:20px;">Lade ${source.toUpperCase()} Playlists...</p>`;
  try {
    const url = source === 'plex' ? getPlexApiUrl('/api/plex/playlists') : '/api/spotify/playlists';
    const res = await fetch(url);
    if (res.ok) {
      const list = await res.json();
      if (list.length === 0) {
        elements.importPlaylistsList.innerHTML = `<p style="color:var(--text-dim); text-align:center; padding:20px;">Keine Playlists gefunden oder nicht konfiguriert.</p>`;
        return;
      }

      elements.importPlaylistsList.innerHTML = list.map(p => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--bg-surface); border-radius:var(--radius-md); margin-bottom:8px;">
          <div>
            <strong style="font-size:0.9rem; color:#fff;">${escapeHtml(p.name)}</strong>
            <span style="display:block; font-size:0.75rem; color:var(--text-dim);">${p.track_count || 0} Songs</span>
          </div>
          <button class="btn btn-secondary btn-sm btn-sync-playlist" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-source="${source}">+ Synchronisieren</button>
        </div>
      `).join('');

      elements.importPlaylistsList.querySelectorAll('.btn-sync-playlist').forEach(btn => {
        btn.addEventListener('click', async () => {
          const pid = btn.getAttribute('data-id');
          const pname = btn.getAttribute('data-name');
          const psource = btn.getAttribute('data-source');
          btn.disabled = true;
          btn.textContent = '⏳ Importiere...';
          try {
            const cleanId = pid.replace('plex_', '').replace('spotify_', '');
            const tracksUrl = psource === 'plex' ? getPlexApiUrl(`/api/plex/playlists/${cleanId}/tracks`) : `/api/spotify/playlists/${cleanId}/tracks`;
            const tRes = await fetch(tracksUrl);
            let importedTracks = [];
            if (tRes.ok) {
              importedTracks = await tRes.json();
            }

            if (importedTracks.length > 0 && psource === 'plex') {
              const existingIds = new Set(state.tracks.map(t => t.id || t.file_path));
              const newTracks = importedTracks.filter(t => !existingIds.has(t.id) && !existingIds.has(t.file_path));
              if (newTracks.length > 0) {
                state.tracks = [...state.tracks, ...newTracks];
                updateBadgeCounts();
                renderTracksTable();
                renderArtistsGrid();
                renderAlbumsGrid();
              }
            }

            const trackIds = importedTracks.map(t => t.id || t.file_path || (psource === 'plex' ? `plex://${t.rating_key || t.key}` : t.id));
            
            const existingIdx = state.playlists.findIndex(p => p.id === pid);
            const plObj = {
              id: pid,
              name: pname,
              source: psource,
              track_ids: trackIds
            };

            if (existingIdx >= 0) {
              state.playlists[existingIdx] = plObj;
            } else {
              state.playlists.push(plObj);
            }

            try {
              setStoredItem('saved_playlists', JSON.stringify(state.playlists));
            } catch (_) {}

            await fetch(getApiEndpoint('/api/playlists'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: pname, source: psource, track_ids: trackIds })
            });

            renderPlaylists();
            showToast(`✅ Playlist "${pname}" (${trackIds.length} Songs) synchronisiert!`);
            btn.textContent = '✅ Synchronisiert';
          } catch (e) {
            console.error('Playlist sync error:', e);
            btn.disabled = false;
            btn.textContent = '+ Synchronisieren';
            showToast('Fehler beim Synchronisieren der Playlist.');
          }
        });
      });
    }
  } catch (err) {
    elements.importPlaylistsList.innerHTML = `<p style="color:var(--text-dim); text-align:center; padding:20px;">Verbindungsfehler.</p>`;
  }
}

// --- Configuration & Multi-Directory Management ---
async function fetchConfig() {
  let cfg = state.config || {};
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      cfg = await res.json();
    }
  } catch (err) {
    console.warn('Could not fetch config from /api/config, fallback to localStorage:', err);
  }

  // Restore host config from localStorage if missing or not set
  const storedHostUrl = getStoredItem('host_url');
  const storedHostToken = getStoredItem('host_token');
  const storedHostEnabled = getStoredItem('host_enabled');
  if (!cfg.tonarr_host_url && !cfg.soundsphere_host_url && storedHostUrl) {
    cfg.tonarr_host_url = storedHostUrl;
    cfg.soundsphere_host_url = storedHostUrl;
    cfg.tonarr_host_token = storedHostToken || '';
    cfg.soundsphere_host_token = storedHostToken || '';
    cfg.tonarr_host_enabled = storedHostEnabled !== 'false';
    cfg.soundsphere_host_enabled = storedHostEnabled !== 'false';
  }

  state.config = cfg;
  state.directories = Array.isArray(cfg.directories) ? cfg.directories : (cfg.last_music_dir ? [cfg.last_music_dir] : []);
  if (cfg.theme) setTheme(cfg.theme);

  // --- AMBIENT COVER BACKGROUND ---
  let isAmb = false;
  if (typeof cfg.ambient_cover_bg === 'boolean') {
    isAmb = cfg.ambient_cover_bg;
  }
  const storedAmbient = getStoredItem('ambient_cover_bg');
  if (storedAmbient === 'true') {
    isAmb = true;
  } else if (storedAmbient === 'false' && cfg.ambient_cover_bg !== true) {
    isAmb = false;
  }
  cfg.ambient_cover_bg = isAmb;
  setAmbientCoverBg(isAmb, false);

  // --- EQUALIZER PRESET & BANDS ---
  const storedPreset = getStoredItem('eq_preset');
  const storedBands = getStoredItem('eq_bands');
  const storedPreamp = getStoredItem('eq_preamp');
  const storedLimiter = getStoredItem('eq_limiter');

  let effectivePreset = 'flat';
  if (storedPreset && storedPreset !== 'flat') {
    effectivePreset = storedPreset;
  } else if (cfg.eq_preset && cfg.eq_preset !== 'flat') {
    effectivePreset = cfg.eq_preset;
  } else if (storedPreset) {
    effectivePreset = storedPreset;
  } else if (cfg.eq_preset) {
    effectivePreset = cfg.eq_preset;
  }

  cfg.eq_preset = effectivePreset;
  setStoredItem('eq_preset', effectivePreset);
  if (elements.eqPresetSelect) elements.eqPresetSelect.value = effectivePreset;

  let effectiveBands = null;
  if (storedBands) {
    try {
      const parsed = JSON.parse(storedBands);
      if (Array.isArray(parsed) && parsed.length === 10) {
        effectiveBands = parsed;
      }
    } catch (_) {}
  }
  if (!effectiveBands && Array.isArray(cfg.eq_bands) && cfg.eq_bands.length === 10) {
    effectiveBands = cfg.eq_bands;
  }
  if (!effectiveBands && EQ_PRESETS[effectivePreset]) {
    effectiveBands = EQ_PRESETS[effectivePreset];
  }
  if (effectiveBands) {
    cfg.eq_bands = effectiveBands;
    setStoredItem('eq_bands', JSON.stringify(effectiveBands));
  }

  if (storedPreamp !== null) {
    const p = parseFloat(storedPreamp);
    if (!isNaN(p)) {
      cfg.eq_preamp = p;
      currentPreampDb = p;
    }
  } else if (typeof cfg.eq_preamp === 'number') {
    cfg.eq_preamp = cfg.eq_preamp;
    currentPreampDb = cfg.eq_preamp;
    setStoredItem('eq_preamp', String(cfg.eq_preamp));
  }

  if (storedLimiter !== null) {
    cfg.eq_limiter = (storedLimiter !== 'false');
    isLimiterEnabled = cfg.eq_limiter;
  } else if (typeof cfg.eq_limiter === 'boolean') {
    isLimiterEnabled = cfg.eq_limiter;
    setStoredItem('eq_limiter', cfg.eq_limiter ? 'true' : 'false');
  }

  restoreEqualizer();
  const currentHostUrl = cfg.tonarr_host_url || cfg.soundsphere_host_url || '';
  const currentHostToken = cfg.tonarr_host_token || cfg.soundsphere_host_token || '';
  if (elements.hostUrlInput) elements.hostUrlInput.value = currentHostUrl;
  if (elements.hostTokenInput) elements.hostTokenInput.value = currentHostToken;
  if (elements.plexUrlInput) elements.plexUrlInput.value = cfg.plex_url || '';
  if (elements.plexTokenInput) elements.plexTokenInput.value = cfg.plex_token || '';
  if (elements.spotifyClientIdInput) elements.spotifyClientIdInput.value = cfg.spotify_client_id || '';
  if (elements.spotifyClientSecretInput) elements.spotifyClientSecretInput.value = cfg.spotify_client_secret || '';

  updateAuthUI(cfg);
  renderDirectoriesList();
}

function renderDirectoriesList() {
  if (!elements.directoriesListContainer) return;
  if (!state.directories || state.directories.length === 0) {
    elements.directoriesListContainer.innerHTML = `
      <div class="empty-directories-msg">
        <span>Keine lokalen Musik-Ordner konfiguriert. Du kannst Tonarr rein im Streaming-Modus (Tonarr Host, Plex & Spotify) nutzen oder Verzeichnisse hinzufügen.</span>
      </div>
    `;
    return;
  }

  elements.directoriesListContainer.innerHTML = state.directories.map((dir, idx) => `
    <div class="directory-item" data-index="${idx}">
      <div class="directory-path-info" title="${escapeHtml(dir)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        <span class="directory-path-text">${escapeHtml(dir)}</span>
      </div>
      <button class="btn-icon-tiny btn-remove-dir" data-dir="${escapeHtml(dir)}" title="Verzeichnis entfernen">&times;</button>
    </div>
  `).join('');

  elements.directoriesListContainer.querySelectorAll('.btn-remove-dir').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const dirToRemove = btn.getAttribute('data-dir');
      if (dirToRemove) {
        await removeDirectory(dirToRemove);
      }
    });
  });
}

async function addDirectory() {
  try {
    const res = await fetch('/api/pick-folder', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      const folder = data.path || data.folder || '';
      if (folder) {
        const addRes = await fetch('/api/directories/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directory: folder })
        });
        if (addRes.ok) {
          const resData = await addRes.json();
          state.directories = resData.directories || [];
          renderDirectoriesList();
          showToast(`📁 "${folder}" hinzugefügt.`);
          await scanMusicFolders();
        }
      }
    }
  } catch (err) {
    showToast('Fehler bei der Verzeichnisauswahl.');
  }
}

async function removeDirectory(dir) {
  try {
    const res = await fetch('/api/directories/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: dir })
    });
    if (res.ok) {
      const data = await res.json();
      state.directories = data.directories || [];
      renderDirectoriesList();
      showToast('🗑️ Verzeichnis entfernt.');
      await scanMusicFolders();
    }
  } catch (err) {
    showToast('Fehler beim Entfernen des Verzeichnisses.');
  }
}

async function scanMusicFolders() {
  if (isPlexOnlyPlayerSource()) {
    console.log('[Scan] Ignoriere lokale Musikordner, da Plex als einzige Quelle aktiv ist.');
    if (elements.scanStatusMsg) elements.scanStatusMsg.textContent = 'Plex ist als einzige Quelle aktiv.';
    return;
  }
  if (elements.scanStatusMsg) elements.scanStatusMsg.textContent = '⏳ Mediathek wird gescannt...';
  showToast('🔍 Mediathek wird synchronisiert...');
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directories: state.directories })
    });
    if (res.ok) {
      const data = await res.json();
      const rawTracks = Array.isArray(data) ? data : (data.tracks || []);
      const tracks = isPlexOnlyPlayerSource() ? rawTracks.filter(t => isPlexTrack(t)) : rawTracks;
      state.tracks = deduplicateTracksList(tracks);
      if (elements.scanStatusMsg) elements.scanStatusMsg.textContent = `✅ ${state.tracks.length} Songs eingelesen`;
      showToast(`✅ ${state.tracks.length} Songs erfolgreich synchronisiert!`);
      updateBadgeCounts();
      renderTracksTable();
      renderArtistsGrid();
      renderAlbumsGrid();
    } else {
      const err = await res.json().catch(() => ({}));
      if (elements.scanStatusMsg) elements.scanStatusMsg.textContent = err.detail || 'Fehler beim Scannen.';
      showToast(err.detail || 'Fehler beim Scannen der Verzeichnisse.');
    }
  } catch (err) {
    if (elements.scanStatusMsg) elements.scanStatusMsg.textContent = 'Verbindungsfehler.';
    showToast('Verbindungsfehler beim Scannen.');
  }
}

async function loadInitialTracks() {
  const isPlexOnly = isPlexOnlyPlayerSource();
  try {
    const res = await fetch('/api/library/cache');
    if (res.ok) {
      const data = await res.json();
      let tracks = (data.has_cache && data.cache && data.cache.tracks) ? data.cache.tracks : (Array.isArray(data.tracks) ? data.tracks : []);
      if (isPlexOnly) {
        tracks = tracks.filter(t => isPlexTrack(t));
      }
      tracks = deduplicateTracksList(tracks);
      if (tracks.length > 0) {
        state.tracks = tracks;
        updateBadgeCounts();
        renderTracksTable();
        renderArtistsGrid();
        renderAlbumsGrid();
        updateAuthUI();
        if (isPlexOnly) {
          if (getHostBaseUrl()) syncHostLibrary().catch(() => {});
          else if (state.config && state.config.plex_url) {
            fetch(getPlexApiUrl('/api/plex/sync'), { method: 'POST' }).catch(() => {});
          }
        }
        return;
      }
    }
  } catch (e) {}

  if (isPlexOnly) {
    if (getHostBaseUrl()) {
      syncHostLibrary().catch(() => {});
    } else if (state.config && state.config.plex_url && state.config.plex_token) {
      fetch(getPlexApiUrl('/api/plex/sync'), { method: 'POST' }).catch(() => {});
    }
    return;
  }

  // If running on Android and offline / no server connection, load local smartphone audio files
  if (window.AndroidBridge && window.AndroidBridge.getLocalDeviceTracksJson && state.tracks.length === 0) {
    try {
      const rawLocal = window.AndroidBridge.getLocalDeviceTracksJson();
      const localDeviceTracks = JSON.parse(rawLocal || '[]');
      if (localDeviceTracks && localDeviceTracks.length > 0) {
        state.tracks = deduplicateTracksList(localDeviceTracks);
        updateBadgeCounts();
        renderTracksTable();
        renderArtistsGrid();
        renderAlbumsGrid();
        showToast(`📱 ${localDeviceTracks.length} lokale Songs vom Smartphone geladen!`);
        return;
      }
    } catch (e) {}
  }

  if (state.directories && state.directories.length > 0) {
    await scanMusicFolders();
  } else if (getHostBaseUrl()) {
    // 1. Load cached host tracks immediately for zero delay
    const cachedHost = getStoredItem('host_tracks');
    if (cachedHost) {
      try {
        const parsed = JSON.parse(cachedHost);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.tracks = deduplicateTracksList(parsed);
          updateBadgeCounts();
          renderTracksTable();
          renderArtistsGrid();
          renderAlbumsGrid();
          updateAuthUI();
        }
      } catch (e) {}
    }
    // 2. Fetch fresh tracks from Host in background
    syncHostLibrary().catch(() => {});
    if (state.tracks.length > 0) return;
  } else if (state.config && state.config.plex_url && state.config.plex_token) {
    try {
      const plexRes = await fetch('/api/plex/sync', { method: 'POST' });
      if (plexRes.ok) {
        const plexData = await plexRes.json();
        if (plexData.tracks) {
          state.tracks = deduplicateTracksList(plexData.tracks);
          updateBadgeCounts();
          renderTracksTable();
          renderArtistsGrid();
          renderAlbumsGrid();
          updateAuthUI();
          return;
        }
      }
    } catch (e) {}
  }

  // Fallback initial render (shows empty-state card with connection buttons if 0 tracks)
  updateBadgeCounts();
  renderTracksTable();
  renderArtistsGrid();
  renderAlbumsGrid();
}

// --- Native Android Bridge Handlers ---
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
  } else if (action === 'stop') {
    if (elements.audioElement) {
      elements.audioElement.pause();
      elements.audioElement.currentTime = 0;
    }
  }
};

window.handleAndroidBack = function() {
  if (elements.fullscreenVisualizer && elements.fullscreenVisualizer.classList.contains('open')) {
    toggleFullscreen(false);
    return true;
  }
  if (elements.settingsModal && elements.settingsModal.classList.contains('open')) {
    elements.settingsModal.classList.remove('open');
    return true;
  }
  if (elements.newPlaylistModal && elements.newPlaylistModal.classList.contains('open')) {
    elements.newPlaylistModal.classList.remove('open');
    return true;
  }
  if (elements.importPlaylistsModal && elements.importPlaylistsModal.classList.contains('open')) {
    elements.importPlaylistsModal.classList.remove('open');
    return true;
  }
  if (state.activeView !== 'songs') {
    switchView('songs');
    return true;
  }
  return false;
};

// --- App Bootstrapping ---
async function bootApp() {
  initEqualizer();
  loadAllSettings();
  const savedTheme = getStoredItem('theme') || 'dark_obsidian';
  setTheme(savedTheme);
  setupEventListeners();
  setupGlobalQueueDropTargets();
  setupMediaSessionHandlers();
  switchView('songs', null, false);
  try {
    await fetchConfig();
  } catch (e) {}
  try {
    await fetchPlaylists();
  } catch (e) {}

  // Auto-restore & verify Host connection on startup
  const savedHostUrl = state.config?.tonarr_host_url || state.config?.soundsphere_host_url || getStoredItem('host_url');
  const savedHostToken = state.config?.tonarr_host_token || state.config?.soundsphere_host_token || getStoredItem('host_token');
  if (savedHostUrl) {
    verifyAndRestoreHostConnection(savedHostUrl, savedHostToken).catch(() => {});
  }

  // Auto-verify Plex connection on startup
  const savedPlexToken = state.config?.plex_token || getStoredItem('plex_token');
  if (savedPlexToken || state.config?.plex_via_host) {
    checkPlexLiveStatus().catch(() => {});
  }
  await loadInitialTracks();
  await restoreLastPlayback();
  if (isAmbientCoverBgEnabled) {
    const activeTrack = state.selectedTrack || (state.queue && state.queue[state.queueIndex]);
    if (activeTrack) {
      updateGlobalCoverBackdrop(getTrackCoverUrl(activeTrack));
    }
  }
}

window.addEventListener('DOMContentLoaded', bootApp);



// --- Navigation History Helpers ---
function navigateViewBack() {
  if (elements.fullscreenVisualizer && elements.fullscreenVisualizer.classList.contains('open')) {
    toggleFullscreen(false);
    return;
  }
  if (elements.settingsModal && elements.settingsModal.classList.contains('open')) {
    elements.settingsModal.classList.remove('open');
    return;
  }
  if (state.navHistoryIndex > 0) {
    state.navHistoryIndex--;
    const viewItem = state.navHistory[state.navHistoryIndex];
    if (typeof viewItem === 'object' && viewItem !== null) {
      switchView(viewItem.view, viewItem.data, false);
    } else {
      switchView(viewItem, null, false);
    }
  }
}

function navigateViewForward() {
  if (state.navHistoryIndex < state.navHistory.length - 1) {
    state.navHistoryIndex++;
    const viewItem = state.navHistory[state.navHistoryIndex];
    if (typeof viewItem === 'object' && viewItem !== null) {
      switchView(viewItem.view, viewItem.data, false);
    } else {
      switchView(viewItem, null, false);
    }
  }
}

// --- Songs Grid (Alle Titel / Favoriten Kachelansicht) ---
function renderSongCardHtml(t) {
  const isSelected = state.selectedTrack && (state.selectedTrack.id === t.id || state.selectedTrack.file_path === t.file_path);
  const qInfo = getTrackQualityInfo(t);
  const qClass = qInfo.className;
  const qLabel = qInfo.label;
  const coverUrl = getTrackCoverUrl(t);

  return `
    <div class="song-card ${isSelected ? 'selected' : ''}" data-track-id="${escapeHtml(t.id || t.file_path)}">
      <div class="song-card-cover-wrapper">
        ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
        <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center; background:rgba(255,255,255,0.05);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:36px; height:36px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        </div>
        <button class="song-card-play-btn" title="Abspielen">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
      </div>
      <div class="song-card-info">
        <div class="song-card-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
        <div class="song-card-artist" title="${escapeHtml(t.artist || 'Unbekannt')}">${escapeHtml(t.artist || 'Unbekannt')}</div>
        <div class="song-card-footer">
          <span class="quality-tag ${qClass}">${escapeHtml(qLabel)}</span>
          <span class="song-card-duration">${t.duration_str || '00:00'}</span>
        </div>
      </div>
    </div>
  `;
}

function renderSongsGrid(container = elements.songsGrid, tracks = getFilteredTracks()) {
  if (!container) return;
  if (tracks.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding: 48px 16px; color:var(--text-muted);">
        <div style="font-size: 2.8rem; margin-bottom: 12px;">🎵</div>
        <h3 style="color:#fff; font-size:1.1rem; margin-bottom:6px;">Keine Songs gefunden</h3>
        <p style="font-size:0.88rem;">Füge einen Musikordner hinzu oder verbinde deinen Plex Server.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = tracks.map(t => renderSongCardHtml(t)).join('');

  container.querySelectorAll('.song-card').forEach((card, idx) => {
    const track = tracks[idx];
    card.addEventListener('click', (e) => {
      if (e.target.closest('.song-card-play-btn')) {
        selectTrack(track, true);
        return;
      }
      selectTrack(track, true);
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, track);
    });
  });
}

// --- Side Queue and Fullscreen Queue Helpers ---
function toggleInPlayerQueue(open) {
  if (!elements.playerQueueSidebar) return;
  const shouldOpen = (typeof open === 'boolean') ? open : elements.playerQueueSidebar.classList.contains('hidden');
  state.sideQueueVisible = shouldOpen;
  elements.playerQueueSidebar.classList.toggle('hidden', !shouldOpen);
  if (elements.btnPlayerQueueToggle) elements.btnPlayerQueueToggle.classList.toggle('active', shouldOpen);
  if (shouldOpen) renderSideQueueList();
}

function alignFsQueuePosition() {
  if (!elements.fsQueueCol) return;
  
  // 1. Measure the exact rendered top of the cover artwork image container
  const coverEl = elements.fsArtworkContainer || document.getElementById('fsArtworkContainer');
  if (coverEl) {
    const coverRect = coverEl.getBoundingClientRect();
    if (coverRect.top > 0) {
      elements.fsQueueCol.style.setProperty('--fs-queue-top', `${Math.round(coverRect.top)}px`);
    }
  }

  // 2. Measure the exact bottom of the playback controls row
  const buttonsRow = document.querySelector('.fs-buttons-row') || document.querySelector('.fs-bottom-controls');
  if (buttonsRow) {
    const btnRect = buttonsRow.getBoundingClientRect();
    if (btnRect.bottom > 0) {
      const bottomOffset = Math.max(0, window.innerHeight - btnRect.bottom);
      elements.fsQueueCol.style.setProperty('--fs-queue-bottom', `${Math.round(bottomOffset)}px`);
    }
  }
}
window.alignFsQueuePosition = alignFsQueuePosition;
window.addEventListener('resize', alignFsQueuePosition);
document.addEventListener('fullscreenchange', () => {
  setTimeout(alignFsQueuePosition, 100);
  setTimeout(alignFsQueuePosition, 400);
});

function toggleFsQueue(open) {
  if (!elements.fsQueueCol) return;
  const shouldOpen = (typeof open === 'boolean') ? open : elements.fsQueueCol.classList.contains('hidden');
  state.fsQueueVisible = shouldOpen;
  elements.fsQueueCol.classList.toggle('hidden', !shouldOpen);
  if (elements.fullscreenVisualizer) {
    elements.fullscreenVisualizer.classList.toggle('queue-active', shouldOpen);
  }
  if (elements.fsQueueToggleBtn) elements.fsQueueToggleBtn.classList.toggle('active', shouldOpen);
  if (shouldOpen) {
    alignFsQueuePosition();
    requestAnimationFrame(() => {
      alignFsQueuePosition();
      setTimeout(alignFsQueuePosition, 60);
    });
    renderFsQueueList();
  }
}

function renderSideQueueList() {
  if (!elements.sideQueueList) return;
  if (elements.sideQueueSubtitle) {
    elements.sideQueueSubtitle.textContent = `${state.queue.length} Songs`;
  }

  if (state.queue.length === 0) {
    elements.sideQueueList.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.85rem;">
        Warteschlange ist leer.
      </div>
    `;
    return;
  }

  elements.sideQueueList.innerHTML = state.queue.map((t, idx) => {
    const isCur = idx === state.queueIndex;
    const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
    return `
      <div class="side-queue-item ${isCur ? 'active' : ''}" data-queue-idx="${idx}">
        <div class="side-queue-cover">
          ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none';" />` : ''}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        </div>
        <div class="side-queue-info">
          <div class="side-queue-title">${escapeHtml(t.title)}</div>
          <div class="side-queue-artist">${escapeHtml(t.artist || 'Unbekannt')}</div>
        </div>
      </div>
    `;
  }).join('');

  elements.sideQueueList.querySelectorAll('.side-queue-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.getAttribute('data-queue-idx'), 10);
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
      }
    });
  });
}

function renderFsQueueList() {
  if (!elements.fsQueueList) return;
  if (elements.fsQueueSubtitle) {
    elements.fsQueueSubtitle.textContent = `${state.queue.length} Songs`;
  }

  if (state.queue.length === 0) {
    elements.fsQueueList.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.82rem;">
        Warteschlange ist leer.
      </div>
    `;
    return;
  }

  elements.fsQueueList.innerHTML = state.queue.map((t, idx) => {
    const isCur = idx === state.queueIndex;
    const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
    return `
      <div class="fs-queue-item ${isCur ? 'active' : ''}" data-queue-idx="${idx}">
        <div class="fs-queue-cover">
          ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none';" />` : ''}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        </div>
        <div class="fs-queue-info">
          <div class="fs-queue-title">${escapeHtml(t.title)}</div>
          <div class="fs-queue-artist">${escapeHtml(t.artist || 'Unbekannt')}</div>
        </div>
      </div>
    `;
  }).join('');

  elements.fsQueueList.querySelectorAll('.fs-queue-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.getAttribute('data-queue-idx'), 10);
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
      }
    });
  });
}

// Preloader Audio Element for Gapless Playback
let preloadAudio = new Audio();
function preloadNextTrack() {
  let nextTrack = null;
  if (state.repeat === 'one') {
    nextTrack = state.selectedTrack;
  } else if (state.queue.length > 0 && state.queueIndex + 1 < state.queue.length) {
    nextTrack = state.queue[state.queueIndex + 1];
  } else {
    const list = getFilteredTracks();
    if (list.length > 0) {
      if (state.shuffle) {
        nextTrack = list[Math.floor(Math.random() * list.length)];
      } else {
        const curIdx = state.selectedTrack ? list.findIndex(t => (t.id || t.file_path) === (state.selectedTrack.id || state.selectedTrack.file_path)) : -1;
        if (curIdx !== -1 && curIdx + 1 < list.length) {
          nextTrack = list[curIdx + 1];
        }
      }
    }
  }

  if (nextTrack && nextTrack.file_path) {
    const streamUrl = `/api/audio/stream?path=${encodeURIComponent(nextTrack.file_path)}`;
    const fullUrl = window.location.origin + streamUrl;
    if (preloadAudio.src !== fullUrl && preloadAudio.src !== streamUrl) {
      preloadAudio.src = streamUrl;
      preloadAudio.preload = 'auto';
    }
  }
}


// ==========================================================================
// High-Performance Infinite-Scroll / Chunked Rendering Engine
// ==========================================================================

function attachScrollObserver(container, loadNextChunk) {
  if (container._scrollAttached) return;
  container._scrollAttached = true;

  const contentArea = document.querySelector('.player-content-area');
  const scrollTargets = [contentArea, window].filter(Boolean);

  const onScroll = () => {
    if (!container._allData || container._renderedCount >= container._allData.length) return;
    const target = contentArea || document.documentElement;
    const scrollPos = target.scrollTop || window.scrollY || 0;
    const clientHeight = target.clientHeight || window.innerHeight;
    const scrollHeight = target.scrollHeight || document.documentElement.scrollHeight;

    if (scrollPos + clientHeight >= scrollHeight - 600) {
      loadNextChunk();
    }
  };

  scrollTargets.forEach(t => {
    t.addEventListener('scroll', onScroll, { passive: true });
  });
}

function renderSongCardHtml(t) {
  const isSelected = state.selectedTrack && (state.selectedTrack.id === t.id || state.selectedTrack.file_path === t.file_path);
  const qInfo = getTrackQualityInfo(t);
  const coverUrl = getTrackCoverUrl(t);

  return `
    <div class="song-card ${isSelected ? 'selected' : ''}" data-track-id="${escapeHtml(t.id || t.file_path)}">
      <div class="song-card-cover-wrapper">
        ${coverUrl ? `<img src="${coverUrl}" loading="lazy" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
        <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center; background:rgba(255,255,255,0.05);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:36px; height:36px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        </div>
        <button class="song-card-play-btn" title="Abspielen">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
      </div>
      <div class="song-card-info">
        <div class="song-card-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
        <div class="song-card-artist" title="${escapeHtml(t.artist || 'Unbekannt')}">${escapeHtml(t.artist || 'Unbekannt')}</div>
        <div class="song-card-footer">
          <span class="quality-tag ${qInfo.className}">${escapeHtml(qInfo.label)}</span>
          <span class="song-card-duration">${t.duration_str || '00:00'}</span>
        </div>
      </div>
    </div>
  `;
}

function renderSongsGrid(container = elements.songsGrid, tracks = getFilteredTracks()) {
  if (!container) return;
  if (tracks.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding: 48px 16px; color:var(--text-muted);">
        <div style="font-size: 2.8rem; margin-bottom: 12px;">🎵</div>
        <h3 style="color:#fff; font-size:1.1rem; margin-bottom:6px;">Keine Songs gefunden</h3>
        <p style="font-size:0.88rem;">Füge einen Musikordner hinzu oder verbinde deinen Plex Server.</p>
      </div>
    `;
    return;
  }

  container._allData = tracks;
  container._renderedCount = 0;
  container.innerHTML = '';

  function appendGridChunk() {
    const start = container._renderedCount;
    const end = Math.min(start + 80, container._allData.length);
    if (start >= end) return;

    const chunk = container._allData.slice(start, end);
    const html = chunk.map(t => renderSongCardHtml(t)).join('');
    container.insertAdjacentHTML('beforeend', html);
    container._renderedCount = end;

    const cards = container.querySelectorAll(`.song-card:nth-child(n+${start + 1})`);
    cards.forEach((card, idx) => {
      const track = chunk[idx];
      makeSongCardDraggable(card, track);
      card.addEventListener('click', (e) => {
        if (e.target.closest('.song-card-play-btn')) {
          selectTrack(track, true);
          return;
        }
        selectTrack(track, true);
      });

      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, track);
      });
    });
  }

  appendGridChunk();
  attachScrollObserver(container, appendGridChunk);
}

function renderTrackRowHtml(t, idx) {
  const isSelected = state.selectedTrack && (state.selectedTrack.id === t.id || state.selectedTrack.file_path === t.file_path);
  const qInfo = getTrackQualityInfo(t);
  const coverUrl = getTrackCoverUrl(t);

  return `
    <tr class="${isSelected ? 'selected' : ''}" data-track-id="${escapeHtml(t.id || t.file_path)}">
      <td style="text-align: center; color: var(--text-dim); font-size: 0.8rem;">
        ${idx + 1}
      </td>
      <td>
        <div class="track-row-cell-title">
          <div class="track-row-cover">
            ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${coverUrl ? 'display:none;' : ''} width:18px; height:18px;"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
          <div>
            <span style="display:block; font-weight:700;">${escapeHtml(t.title)}</span>
          </div>
        </div>
      </td>
      <td>${escapeHtml(t.artist || 'Unbekannt')}</td>
      <td>${escapeHtml(t.album || '—')}</td>
      <td style="text-align: center;">
        <span class="quality-tag ${qInfo.className}">${escapeHtml(qInfo.label)}</span>
      </td>
      <td style="text-align: right; font-family: var(--font-mono); font-size: 0.82rem;">${t.duration_str || '00:00'}</td>
    </tr>
  `;
}

function renderTracksTable(container = elements.tracksTableBody, tracks = getFilteredTracks(), customRowClickHandler = null) {
  if (container === elements.tracksTableBody && elements.songsGrid) {
    renderSongsGrid(elements.songsGrid, tracks);
  }
  if (!container) return;
  if (tracks.length === 0) {
    container.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px; color:var(--text-muted);">Keine Songs gefunden.</td></tr>`;
    return;
  }

  container._allData = tracks;
  container._renderedCount = 0;
  container.innerHTML = '';

  function appendTableChunk() {
    const start = container._renderedCount;
    const end = Math.min(start + 80, container._allData.length);
    if (start >= end) return;

    const chunk = container._allData.slice(start, end);
    const html = chunk.map((t, idx) => renderTrackRowHtml(t, start + idx)).join('');
    container.insertAdjacentHTML('beforeend', html);
    container._renderedCount = end;

    const rows = container.querySelectorAll(`tr:nth-child(n+${start + 1})`);
    rows.forEach((row, idx) => {
      const track = chunk[idx];
      const actualIndex = start + idx;
      makeSongCardDraggable(row, track);
      row.addEventListener('click', () => {
        if (typeof customRowClickHandler === 'function') {
          customRowClickHandler(track, actualIndex);
        } else {
          playTrackWithContext(track, tracks);
        }
      });

      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, track);
      });
    });
  }

  appendTableChunk();
  attachScrollObserver(container, appendTableChunk);
}

function renderArtistsGrid() {
  if (!elements.artistsGrid) return;
  const artistMap = new Map();

  getFilteredTracks().forEach(t => {
    const art = (t.artist || 'Unbekannter Künstler').trim();
    if (!artistMap.has(art)) {
      artistMap.set(art, { name: art, tracks: [], firstTrack: t });
    }
    artistMap.get(art).tracks.push(t);
  });

  const sortedArtists = Array.from(artistMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (elements.artistsCountLabel) {
    elements.artistsCountLabel.textContent = `${sortedArtists.length} Künstler in der Mediathek`;
  }

  if (sortedArtists.length === 0) {
    elements.artistsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding: 48px 16px; color:var(--text-muted);">
        <p>Keine Künstler gefunden.</p>
      </div>
    `;
    return;
  }

  elements.artistsGrid._allData = sortedArtists;
  elements.artistsGrid._renderedCount = 0;
  elements.artistsGrid.innerHTML = '';

  function appendArtistsChunk() {
    const start = elements.artistsGrid._renderedCount;
    const end = Math.min(start + 60, elements.artistsGrid._allData.length);
    if (start >= end) return;

    const chunk = elements.artistsGrid._allData.slice(start, end);
    const html = chunk.map(a => `
      <div class="artist-card" data-artist="${escapeHtml(a.name)}">
        <div class="artist-avatar">
          <img src="${escapeHtml(getArtistImageUrl(a.name))}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); border-radius:50%;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:36px; height:36px; color:var(--text-dim);"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </div>
        </div>
        <div class="card-title">${escapeHtml(a.name)}</div>
        <div class="card-meta">${a.tracks.length} Songs</div>
      </div>
    `).join('');

    elements.artistsGrid.insertAdjacentHTML('beforeend', html);
    elements.artistsGrid._renderedCount = end;

    const cards = elements.artistsGrid.querySelectorAll(`.artist-card:nth-child(n+${start + 1})`);
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const art = card.getAttribute('data-artist');
        openArtistDetail(art);
      });
    });
  }

  appendArtistsChunk();
  attachScrollObserver(elements.artistsGrid, appendArtistsChunk);
}

function renderAlbumsGrid() {
  if (!elements.albumsGrid) return;
  const albumMap = new Map();

  getFilteredTracks().forEach(t => {
    const alb = (t.album || 'Unbekanntes Album').trim();
    const key = `${alb}____${t.artist || ''}`;
    if (!albumMap.has(key)) {
      albumMap.set(key, { title: alb, artist: t.artist || 'Unbekannt', tracks: [], firstTrack: t });
    }
    albumMap.get(key).tracks.push(t);
  });

  const sortedAlbums = Array.from(albumMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  if (elements.albumsCountLabel) {
    elements.albumsCountLabel.textContent = `${sortedAlbums.length} Alben in der Mediathek`;
  }

  if (sortedAlbums.length === 0) {
    elements.albumsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding: 48px 16px; color:var(--text-muted);">
        <p>Keine Alben gefunden.</p>
      </div>
    `;
    return;
  }

  elements.albumsGrid._allData = sortedAlbums;
  elements.albumsGrid._renderedCount = 0;
  elements.albumsGrid.innerHTML = '';

  function appendAlbumsChunk() {
    const start = elements.albumsGrid._renderedCount;
    const end = Math.min(start + 60, elements.albumsGrid._allData.length);
    if (start >= end) return;

    const chunk = elements.albumsGrid._allData.slice(start, end);
    const html = chunk.map(a => `
      <div class="album-card" data-album="${escapeHtml(a.title)}" data-artist="${escapeHtml(a.artist)}">
        <div class="album-cover">
          <img src="${escapeHtml(getTrackCoverUrl(a.firstTrack))}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; background:rgba(255,255,255,0.05);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:36px; height:36px; color:var(--text-dim);"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
          </div>
        </div>
        <div class="card-title">${escapeHtml(a.title)}</div>
        <div class="card-meta">${escapeHtml(a.artist)} • ${a.tracks.length} Songs</div>
      </div>
    `).join('');

    elements.albumsGrid.insertAdjacentHTML('beforeend', html);
    elements.albumsGrid._renderedCount = end;

    const cards = elements.albumsGrid.querySelectorAll(`.album-card:nth-child(n+${start + 1})`);
    cards.forEach(card => {
      const alb = card.getAttribute('data-album');
      const art = card.getAttribute('data-artist');
      const albObj = albumMap.get(`${alb}____${art}`) || albumMap.get(`${alb}____`) || { title: alb, artist: art, tracks: [] };
      makeAlbumCardDraggable(card, alb, art);
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAlbumContextMenu(e.clientX, e.clientY, albObj);
      });
      card.addEventListener('click', () => {
        openAlbumDetail({ title: alb, artist: art, tracks: albObj.tracks });
      });
    });
  }

  appendAlbumsChunk();
  attachScrollObserver(elements.albumsGrid, appendAlbumsChunk);
}

// ==========================================================================
// Enhanced Global Search & Unified Queue Rendering Engine
// ==========================================================================

function renderQueueView() {
  if (!elements.queueListContainer) return;

  if (elements.queueCountLabel) {
    elements.queueCountLabel.textContent = `${state.queue.length} Songs in der Warteschlange`;
  }

  if (state.queue.length === 0) {
    elements.queueListContainer.innerHTML = `
      <div style="text-align:center; padding: 60px 20px; color:var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 12px;">🎵</div>
        <h3 style="color:#fff; font-size:1.1rem; margin-bottom:6px;">Die Warteschlange ist leer</h3>
        <p style="font-size:0.88rem; max-width:400px; margin:0 auto;">Wähle einen Song aus der Mediathek oder nutze das Rechtsklick-Menü, um Titel zur Warteschlange hinzuzufügen.</p>
      </div>
    `;
    return;
  }

  const currentIdx = (typeof state.queueIndex === 'number' && state.queueIndex >= 0) ? state.queueIndex : 0;
  const currentTrack = state.queue[currentIdx] || state.selectedTrack;
  const upcomingTracks = state.queue.slice(currentIdx + 1);

  let html = '';

  // 1. Now Playing Hero Card
  if (currentTrack) {
    const coverUrl = currentTrack.cover_url || (currentTrack.file_path ? `/api/track/cover?path=${encodeURIComponent(currentTrack.file_path)}` : '');
    html += `
      <div class="queue-section-heading">Läuft gerade</div>
      <div class="queue-now-playing-card">
        <div class="queue-now-playing-cover">
          ${coverUrl ? `<img src="${coverUrl}" loading="lazy" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
          <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center; background:rgba(255,255,255,0.05);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:28px; height:28px; color:var(--primary-light);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
        </div>
        <div class="queue-now-playing-info">
          <span class="queue-badge-playing">
            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Aktueller Titel
          </span>
          <div class="queue-now-playing-title">${escapeHtml(currentTrack.title || 'Unbekannter Titel')}</div>
          <div class="queue-now-playing-artist">${escapeHtml(currentTrack.artist || 'Unbekannt')}${currentTrack.album ? ` • ${escapeHtml(currentTrack.album)}` : ''}</div>
        </div>
      </div>
    `;
  }

  // 2. Upcoming Tracks List
  html += `<div class="queue-section-heading">Nächste Titel (${upcomingTracks.length})</div>`;

  if (upcomingTracks.length === 0) {
    html += `
      <div style="padding: 24px 16px; color:var(--text-muted); font-size:0.88rem; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-md);">
        Keine weiteren Titel in der Warteschlange.
      </div>
    `;
  } else {
    html += upcomingTracks.map((t, idx) => {
      const realIdx = currentIdx + 1 + idx;
      const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
      return `
        <div class="queue-item" data-queue-index="${realIdx}">
          <div class="queue-item-left">
            <span class="queue-item-index">${idx + 1}</span>
            <div class="queue-item-cover">
              ${coverUrl ? `<img src="${coverUrl}" loading="lazy" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
              <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px; height:20px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              </div>
            </div>
            <div class="queue-item-info">
              <div class="queue-item-title">${escapeHtml(t.title || 'Unbekannt')}</div>
              <div class="queue-item-artist">${escapeHtml(t.artist || 'Unbekannt')}${t.album ? ` • ${escapeHtml(t.album)}` : ''}</div>
            </div>
          </div>
          <div class="queue-item-right">
            <span class="queue-item-duration">${t.duration_str || '00:00'}</span>
            <button class="queue-item-remove" data-remove-idx="${realIdx}" title="Aus Warteschlange entfernen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  elements.queueListContainer.innerHTML = html;

  elements.queueListContainer.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.queue-item-remove')) return;
      const idx = parseInt(item.getAttribute('data-queue-index'), 10);
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
        renderQueueView();
      }
    });
  });

  elements.queueListContainer.querySelectorAll('.queue-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-remove-idx'), 10);
      state.queue.splice(idx, 1);
      if (state.queueIndex > idx) state.queueIndex--;
      renderQueueView();
      renderSideQueueList();
      renderFsQueueList();
      updateBadgeCounts();
    });
  });
}

function renderSideQueueList() {
  if (!elements.sideQueueList) return;
  if (elements.sideQueueSubtitle) {
    elements.sideQueueSubtitle.textContent = `${state.queue.length} Songs`;
  }

  if (state.queue.length === 0) {
    elements.sideQueueList.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.85rem;">
        Warteschlange ist leer.
      </div>
    `;
    return;
  }

  elements.sideQueueList.innerHTML = state.queue.map((t, idx) => {
    const isCur = idx === state.queueIndex;
    const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
    return `
      <div class="side-queue-item ${isCur ? 'active' : ''}" data-queue-idx="${idx}">
        <div class="side-queue-left">
          <div class="side-queue-cover">
            ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
            <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px; height:20px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
            </div>
          </div>
          <div class="side-queue-info">
            <div class="side-queue-title">${escapeHtml(t.title || 'Unbekannter Titel')}</div>
            <div class="side-queue-artist">${escapeHtml(t.artist || 'Unbekannt')}</div>
          </div>
        </div>
        <button class="side-queue-remove" data-remove-idx="${idx}" title="Entfernen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;
  }).join('');

  elements.sideQueueList.querySelectorAll('.side-queue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.side-queue-remove')) return;
      const idx = parseInt(item.getAttribute('data-queue-idx'), 10);
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
        renderSideQueueList();
      }
    });
  });

  elements.sideQueueList.querySelectorAll('.side-queue-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-remove-idx'), 10);
      state.queue.splice(idx, 1);
      if (state.queueIndex > idx) state.queueIndex--;
      renderSideQueueList();
      renderQueueView();
      renderFsQueueList();
      updateBadgeCounts();
    });
  });
}

function renderFsQueueList() {
  if (!elements.fsQueueList) return;
  if (elements.fsQueueSubtitle) {
    elements.fsQueueSubtitle.textContent = `${state.queue.length} Songs`;
  }

  if (state.queue.length === 0) {
    elements.fsQueueList.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.82rem;">
        Warteschlange ist leer.
      </div>
    `;
    return;
  }

  elements.fsQueueList.innerHTML = state.queue.map((t, idx) => {
    const isCur = idx === state.queueIndex;
    const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
    return `
      <div class="fs-queue-item ${isCur ? 'active' : ''}" data-queue-idx="${idx}">
        <div class="fs-queue-left">
          <div class="fs-queue-cover">
            ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
            <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px; height:18px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
            </div>
          </div>
          <div class="fs-queue-info">
            <div class="fs-queue-title">${escapeHtml(t.title || 'Unbekannt')}</div>
            <div class="fs-queue-artist">${escapeHtml(t.artist || 'Unbekannt')}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  elements.fsQueueList.querySelectorAll('.fs-queue-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.getAttribute('data-queue-idx'), 10);
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
        renderFsQueueList();
      }
    });
  });
}


// ==========================================================================
// Live Queue Engine & Drag-and-Drop System (Songs, Albums, Reordering)
// ==========================================================================

function updateAllQueueViews() {
  if (state.activeView === 'queue') {
    renderQueueView();
  }
  if (state.sideQueueVisible) {
    renderSideQueueList();
  }
  if (state.fsQueueVisible) {
    renderFsQueueList();
  }
  updateBadgeCounts();
  preloadNextTrack();
}
window.updateAllQueueViews = updateAllQueueViews;

// Global Drag-and-Drop state
let draggedQueueIndex = null;

const GRABBER_SVG = `
  <div class="queue-drag-handle" title="Reihenfolge durch Ziehen ändern">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
      <circle cx="9" cy="6" r="1"></circle>
      <circle cx="15" cy="6" r="1"></circle>
      <circle cx="9" cy="12" r="1"></circle>
      <circle cx="15" cy="12" r="1"></circle>
      <circle cx="9" cy="18" r="1"></circle>
      <circle cx="15" cy="18" r="1"></circle>
    </svg>
  </div>
`;

// 1. Render Main Queue View with Live Sync & Drag Handles
function renderQueueView() {
  if (!elements.queueListContainer) return;

  if (elements.queueCountLabel) {
    elements.queueCountLabel.textContent = `${state.queue.length} Songs in der Warteschlange`;
  }

  if (state.queue.length === 0) {
    elements.queueListContainer.innerHTML = `
      <div style="text-align:center; padding: 60px 20px; color:var(--text-muted); border: 2px dashed rgba(255,255,255,0.08); border-radius: var(--radius-lg);">
        <div style="font-size: 3rem; margin-bottom: 12px;">🎵</div>
        <h3 style="color:#fff; font-size:1.1rem; margin-bottom:6px;">Die Warteschlange ist leer</h3>
        <p style="font-size:0.88rem; max-width:400px; margin:0 auto;">Ziehe Songs oder Alben direkt hier hinein oder nutze Rechtsklick &gt; "An Warteschlange anhängen".</p>
      </div>
    `;
    setupQueueContainerDropZone(elements.queueListContainer);
    return;
  }

  const currentIdx = (typeof state.queueIndex === 'number' && state.queueIndex >= 0) ? state.queueIndex : 0;
  const currentTrack = state.queue[currentIdx] || state.selectedTrack;
  const upcomingTracks = state.queue.slice(currentIdx + 1);

  let html = '';

  // Now Playing Card
  if (currentTrack) {
    const coverUrl = currentTrack.cover_url || (currentTrack.file_path ? `/api/track/cover?path=${encodeURIComponent(currentTrack.file_path)}` : '');
    html += `
      <div class="queue-section-heading">Läuft gerade</div>
      <div class="queue-now-playing-card">
        <div class="queue-now-playing-cover">
          ${coverUrl ? `<img src="${coverUrl}" loading="lazy" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
          <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center; background:rgba(255,255,255,0.05);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:28px; height:28px; color:var(--primary-light);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
        </div>
        <div class="queue-now-playing-info">
          <span class="queue-badge-playing">
            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Aktueller Titel
          </span>
          <div class="queue-now-playing-title">${escapeHtml(currentTrack.title || 'Unbekannter Titel')}</div>
          <div class="queue-now-playing-artist">${escapeHtml(currentTrack.artist || 'Unbekannt')}${currentTrack.album ? ` • ${escapeHtml(currentTrack.album)}` : ''}</div>
        </div>
      </div>
    `;
  }

  // Upcoming Tracks List
  html += `<div class="queue-section-heading">Nächste Titel (${upcomingTracks.length})</div>`;

  if (upcomingTracks.length === 0) {
    html += `
      <div style="padding: 24px 16px; color:var(--text-muted); font-size:0.88rem; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); text-align:center;">
        Keine weiteren Titel in der Warteschlange. Ziehe Songs oder Alben hier hinein!
      </div>
    `;
  } else {
    html += upcomingTracks.map((t, idx) => {
      const realIdx = currentIdx + 1 + idx;
      const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
      return `
        <div class="queue-item" draggable="true" data-queue-index="${realIdx}">
          <div class="queue-item-left">
            ${GRABBER_SVG}
            <span class="queue-item-index">${idx + 1}</span>
            <div class="queue-item-cover">
              ${coverUrl ? `<img src="${coverUrl}" loading="lazy" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
              <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px; height:20px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              </div>
            </div>
            <div class="queue-item-info">
              <div class="queue-item-title">${escapeHtml(t.title || 'Unbekannt')}</div>
              <div class="queue-item-artist">${escapeHtml(t.artist || 'Unbekannt')}${t.album ? ` • ${escapeHtml(t.album)}` : ''}</div>
            </div>
          </div>
          <div class="queue-item-right">
            <span class="queue-item-duration">${t.duration_str || '00:00'}</span>
            <button class="queue-item-remove" data-remove-idx="${realIdx}" title="Aus Warteschlange entfernen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  elements.queueListContainer.innerHTML = html;

  // Setup click & drag events
  setupQueueItemsDragAndClick(elements.queueListContainer, '.queue-item', 'data-queue-index');
  setupQueueContainerDropZone(elements.queueListContainer);
}

// 2. Render Side Queue List with Live Sync & Grabbers
function renderSideQueueList() {
  if (!elements.sideQueueList) return;
  if (elements.sideQueueSubtitle) {
    elements.sideQueueSubtitle.textContent = `${state.queue.length} Songs`;
  }

  if (state.queue.length === 0) {
    elements.sideQueueList.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.85rem; border:1px dashed rgba(255,255,255,0.1); border-radius:var(--radius-md);">
        Warteschlange ist leer.<br><span style="font-size:0.78rem; color:var(--text-dim);">Songs oder Alben hier ablegen</span>
      </div>
    `;
    setupQueueContainerDropZone(elements.sideQueueList);
    return;
  }

  elements.sideQueueList.innerHTML = state.queue.map((t, idx) => {
    const isCur = idx === state.queueIndex;
    const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
    return `
      <div class="side-queue-item ${isCur ? 'active' : ''}" draggable="true" data-queue-idx="${idx}">
        <div class="side-queue-left">
          ${GRABBER_SVG}
          <div class="side-queue-cover">
            ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
            <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px; height:20px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
            </div>
          </div>
          <div class="side-queue-info">
            <div class="side-queue-title">${escapeHtml(t.title || 'Unbekannter Titel')}</div>
            <div class="side-queue-artist">${escapeHtml(t.artist || 'Unbekannt')}</div>
          </div>
        </div>
        <button class="side-queue-remove" data-remove-idx="${idx}" title="Entfernen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;
  }).join('');

  setupQueueItemsDragAndClick(elements.sideQueueList, '.side-queue-item', 'data-queue-idx');
  setupQueueContainerDropZone(elements.sideQueueList);
}

// 3. Render Fullscreen Queue List
function renderFsQueueList() {
  if (!elements.fsQueueList) return;
  if (elements.fsQueueSubtitle) {
    elements.fsQueueSubtitle.textContent = `${state.queue.length} Songs`;
  }

  if (state.queue.length === 0) {
    elements.fsQueueList.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.82rem;">
        Warteschlange ist leer.
      </div>
    `;
    return;
  }

  elements.fsQueueList.innerHTML = state.queue.map((t, idx) => {
    const isCur = idx === state.queueIndex;
    const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
    return `
      <div class="fs-queue-item ${isCur ? 'active' : ''}" draggable="true" data-queue-idx="${idx}">
        <div class="fs-queue-left">
          ${GRABBER_SVG}
          <div class="fs-queue-cover">
            ${coverUrl ? `<img src="${coverUrl}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
            <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px; height:18px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
            </div>
          </div>
          <div class="fs-queue-info">
            <div class="fs-queue-title">${escapeHtml(t.title || 'Unbekannt')}</div>
            <div class="fs-queue-artist">${escapeHtml(t.artist || 'Unbekannt')}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  setupQueueItemsDragAndClick(elements.fsQueueList, '.fs-queue-item', 'data-queue-idx');
  setupQueueContainerDropZone(elements.fsQueueList);
}

// Helper: Setup Drag & Drop Reordering & Click-to-play on Queue Items
function setupQueueItemsDragAndClick(container, selector, indexAttr) {
  const items = container.querySelectorAll(selector);
  items.forEach(item => {
    const idx = parseInt(item.getAttribute(indexAttr), 10);

    // Play track on click (if not clicking remove or grabber)
    item.addEventListener('click', (e) => {
      if (e.target.closest('.queue-item-remove') || e.target.closest('.side-queue-remove') || e.target.closest('.queue-drag-handle')) return;
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
      }
    });

    // Remove buttons
    const removeBtn = item.querySelector('.queue-item-remove, .side-queue-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rIdx = parseInt(removeBtn.getAttribute('data-remove-idx'), 10);
        state.queue.splice(rIdx, 1);
        if (state.queueIndex > rIdx) state.queueIndex--;
        updateAllQueueViews();
        showToast('Titel aus Warteschlange entfernt.');
      });
    }

    // Drag events for queue reordering
    item.addEventListener('dragstart', (e) => {
      draggedQueueIndex = idx;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'queue-reorder', index: idx }));
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      container.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      draggedQueueIndex = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        item.classList.add('drag-over-top');
        item.classList.remove('drag-over-bottom');
      } else {
        item.classList.add('drag-over-bottom');
        item.classList.remove('drag-over-top');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove('drag-over-top', 'drag-over-bottom');

      let dropTargetIdx = idx;
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY >= mid) {
        dropTargetIdx++;
      }

      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
        if (data.type === 'queue-reorder' && typeof data.index === 'number') {
          const fromIdx = data.index;
          if (fromIdx !== dropTargetIdx && fromIdx !== dropTargetIdx - 1) {
            const moved = state.queue.splice(fromIdx, 1)[0];
            const insertAt = (fromIdx < dropTargetIdx) ? (dropTargetIdx - 1) : dropTargetIdx;
            state.queue.splice(insertAt, 0, moved);

            // Update queueIndex if current playing was moved
            if (state.queueIndex === fromIdx) {
              state.queueIndex = insertAt;
            } else if (fromIdx < state.queueIndex && insertAt >= state.queueIndex) {
              state.queueIndex--;
            } else if (fromIdx > state.queueIndex && insertAt <= state.queueIndex) {
              state.queueIndex++;
            }

            updateAllQueueViews();
            showToast('Warteschlange neu sortiert.');
          }
        } else if (data.type === 'track' && data.track) {
          state.queue.splice(dropTargetIdx, 0, data.track);
          updateAllQueueViews();
          showToast(`🎵 "${data.track.title}" in Warteschlange eingefügt.`);
        } else if (data.type === 'album' && Array.isArray(data.tracks)) {
          state.queue.splice(dropTargetIdx, 0, ...data.tracks);
          updateAllQueueViews();
          showToast(`💿 Album "${data.albumTitle}" (${data.tracks.length} Songs) in Warteschlange eingefügt.`);
        }
      } catch (err) {
        console.warn('Drop error:', err);
      }
    });
  });
}

// Helper: Setup Container Drop Zone for Dragging Songs or Albums into Empty/End of Queue
function setupQueueContainerDropZone(targetEl) {
  if (!targetEl || targetEl._dropZoneAttached) return;
  targetEl._dropZoneAttached = true;

  targetEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    targetEl.classList.add('drag-target-active');
  });

  targetEl.addEventListener('dragleave', () => {
    targetEl.classList.remove('drag-target-active');
  });

  targetEl.addEventListener('drop', (e) => {
    e.preventDefault();
    targetEl.classList.remove('drag-target-active');

    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.type === 'track' && data.track) {
        state.queue.push(data.track);
        updateAllQueueViews();
        showToast(`🎵 "${data.track.title}" zur Warteschlange hinzugefügt.`);
      } else if (data.type === 'album' && Array.isArray(data.tracks)) {
        state.queue.push(...data.tracks);
        updateAllQueueViews();
        showToast(`💿 Album "${data.albumTitle}" (${data.tracks.length} Songs) zur Warteschlange hinzugefügt.`);
      }
    } catch (err) {
      console.warn('Queue container drop error:', err);
    }
  });
}

// Setup Global Drop Zones on Sidebar "Warteschlange" nav item and bottom bar queue button
function setupGlobalQueueDropTargets() {
  const dropTargets = [elements.navBtnQueue, elements.btnPlayerQueueToggle].filter(Boolean);
  dropTargets.forEach(target => {
    target.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      target.classList.add('drag-target-active');
    });

    target.addEventListener('dragleave', () => {
      target.classList.remove('drag-target-active');
    });

    target.addEventListener('drop', (e) => {
      e.preventDefault();
      target.classList.remove('drag-target-active');

      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
        if (data.type === 'track' && data.track) {
          state.queue.push(data.track);
          updateAllQueueViews();
          showToast(`🎵 "${data.track.title}" zur Warteschlange hinzugefügt.`);
        } else if (data.type === 'album' && Array.isArray(data.tracks)) {
          state.queue.push(...data.tracks);
          updateAllQueueViews();
          showToast(`💿 Album "${data.albumTitle}" (${data.tracks.length} Songs) zur Warteschlange hinzugefügt.`);
        }
      } catch (err) {}
    });
  });
}

// 4. Attach HTML5 Dragstart on all Song Cards, Album Cards, and Table Rows
function makeSongCardDraggable(card, track) {
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'track', track: track }));
  });
}

function makeAlbumCardDraggable(card, albumTitle, artistName) {
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', (e) => {
    const albTitle = (albumTitle || '').trim().toLowerCase();
    const artName = (artistName || '').trim().toLowerCase();
    const albumTracks = state.tracks.filter(t => {
      const matchAlb = (t.album || '').trim().toLowerCase() === albTitle;
      if (!matchAlb) return false;
      if (artName && artName !== 'unbekannt' && artName !== 'various artists') {
        return (t.artist || '').trim().toLowerCase() === artName;
      }
      return true;
    });
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'album',
      albumTitle: albumTitle,
      artist: artistName,
      tracks: albumTracks
    }));
  });
}


// ==========================================================================
// Robust Universal Live Queue & Drag & Drop System
// ==========================================================================

const GRABBER_ICON_HTML = `
  <div class="queue-drag-handle" title="Reihenfolge durch Ziehen ändern">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
      <circle cx="9" cy="6" r="1.2"></circle>
      <circle cx="15" cy="6" r="1.2"></circle>
      <circle cx="9" cy="12" r="1.2"></circle>
      <circle cx="15" cy="12" r="1.2"></circle>
      <circle cx="9" cy="18" r="1.2"></circle>
      <circle cx="15" cy="18" r="1.2"></circle>
    </svg>
  </div>
`;

function updateAllQueueViews() {
  if (state.activeView === 'queue') {
    renderQueueView();
  }
  if (state.sideQueueVisible) {
    renderSideQueueList();
  }
  if (state.fsQueueVisible) {
    renderFsQueueList();
  }
  updateBadgeCounts();
  preloadNextTrack();
}
window.updateAllQueueViews = updateAllQueueViews;

// 1. RENDER MAIN QUEUE VIEW
function renderQueueView() {
  if (!elements.queueListContainer) return;

  const currentTrack = state.selectedTrack || (state.queue && state.queue[state.queueIndex]);
  const currentIdx = (typeof state.queueIndex === 'number' && state.queueIndex >= 0) ? state.queueIndex : 0;
  const upcomingTracks = state.queue ? state.queue.slice(currentIdx + 1) : [];

  if (elements.queueCountLabel) {
    const totalCount = (currentTrack ? 1 : 0) + upcomingTracks.length;
    elements.queueCountLabel.textContent = `${totalCount} Songs in der Warteschlange`;
  }

  if (!currentTrack && upcomingTracks.length === 0) {
    elements.queueListContainer.innerHTML = `
      <div style="text-align:center; padding: 60px 20px; color:var(--text-muted); border: 2px dashed rgba(255,255,255,0.08); border-radius: var(--radius-lg);">
        <div style="font-size: 3rem; margin-bottom: 12px;">🎵</div>
        <h3 style="color:#fff; font-size:1.1rem; margin-bottom:6px;">Die Warteschlange ist leer</h3>
        <p style="font-size:0.88rem; max-width:420px; margin:0 auto;">Ziehe Songs oder ganze Alben direkt per Maus hier hinein oder klicke auf einen Titel zum Abspielen.</p>
      </div>
    `;
    return;
  }

  let html = '';

  // Läuft gerade (Current Playing Hero Card)
  if (currentTrack) {
    const coverUrl = currentTrack.cover_url || (currentTrack.file_path ? `/api/track/cover?path=${encodeURIComponent(currentTrack.file_path)}` : '');
    html += `
      <div class="queue-section-heading">Läuft gerade</div>
      <div class="queue-now-playing-card">
        <div class="queue-now-playing-cover">
          ${coverUrl ? `<img src="${coverUrl}" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
          <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center; background:rgba(255,255,255,0.05);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:28px; height:28px; color:var(--primary-light);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
        </div>
        <div class="queue-now-playing-info">
          <span class="queue-badge-playing">
            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Aktueller Titel
          </span>
          <div class="queue-now-playing-title">${escapeHtml(currentTrack.title || 'Unbekannter Titel')}</div>
          <div class="queue-now-playing-artist">${escapeHtml(currentTrack.artist || 'Unbekannt')}${currentTrack.album ? ` • ${escapeHtml(currentTrack.album)}` : ''}</div>
        </div>
      </div>
    `;
  }

  // Nächste Titel
  html += `<div class="queue-section-heading">Nächste Titel (${upcomingTracks.length})</div>`;

  if (upcomingTracks.length === 0) {
    html += `
      <div style="padding: 24px 16px; color:var(--text-muted); font-size:0.88rem; background:var(--bg-surface); border:1px dashed var(--border-color); border-radius:var(--radius-md); text-align:center;">
        Keine weiteren Titel in der Warteschlange. Ziehe Songs oder Alben hier hinein!
      </div>
    `;
  } else {
    html += upcomingTracks.map((t, idx) => {
      const realIdx = currentIdx + 1 + idx;
      const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
      return `
        <div class="queue-item" draggable="true" data-queue-index="${realIdx}">
          <div class="queue-item-left">
            ${GRABBER_ICON_HTML}
            <span class="queue-item-index">${idx + 1}</span>
            <div class="queue-item-cover">
              ${coverUrl ? `<img src="${coverUrl}" alt="Cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
              <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px; height:20px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              </div>
            </div>
            <div class="queue-item-info">
              <div class="queue-item-title">${escapeHtml(t.title || 'Unbekannt')}</div>
              <div class="queue-item-artist">${escapeHtml(t.artist || 'Unbekannt')}${t.album ? ` • ${escapeHtml(t.album)}` : ''}</div>
            </div>
          </div>
          <div class="queue-item-right">
            <span class="queue-item-duration">${t.duration_str || '00:00'}</span>
            <button class="queue-item-remove" data-remove-idx="${realIdx}" title="Aus Warteschlange entfernen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  elements.queueListContainer.innerHTML = html;

  // Listeners on main queue items
  elements.queueListContainer.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.queue-item-remove') || e.target.closest('.queue-drag-handle')) return;
      const idx = parseInt(item.getAttribute('data-queue-index'), 10);
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
      }
    });
  });

  elements.queueListContainer.querySelectorAll('.queue-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-remove-idx'), 10);
      state.queue.splice(idx, 1);
      if (state.queueIndex > idx) state.queueIndex--;
      updateAllQueueViews();
      showToast('Titel aus Warteschlange entfernt.');
    });
  });
}

// 2. RENDER SIDEBAR QUEUE VIEW
function renderSideQueueList() {
  if (!elements.sideQueueList) return;

  const currentTrack = state.selectedTrack || (state.queue && state.queue[state.queueIndex]);
  const currentIdx = (typeof state.queueIndex === 'number' && state.queueIndex >= 0) ? state.queueIndex : 0;
  const upcomingTracks = state.queue ? state.queue.slice(currentIdx + 1) : [];

  if (elements.sideQueueSubtitle) {
    const totalCount = (currentTrack ? 1 : 0) + upcomingTracks.length;
    elements.sideQueueSubtitle.textContent = `${totalCount} Songs`;
  }

  if (!currentTrack && upcomingTracks.length === 0) {
    elements.sideQueueList.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.85rem; border:1px dashed rgba(255,255,255,0.1); border-radius:var(--radius-md);">
        Warteschlange ist leer.<br><span style="font-size:0.78rem; color:var(--text-dim);">Songs oder Alben hier hineinziehen</span>
      </div>
    `;
    return;
  }

  let html = '';

  // Now playing in sidebar
  if (currentTrack) {
    const coverUrl = currentTrack.cover_url || (currentTrack.file_path ? `/api/track/cover?path=${encodeURIComponent(currentTrack.file_path)}` : '');
    html += `
      <div class="side-queue-section-heading">Läuft gerade</div>
      <div class="side-queue-now-playing-card">
        <div class="side-queue-now-playing-cover">
          ${coverUrl ? `<img src="${coverUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
          <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px; height:20px; color:var(--primary-light);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
        </div>
        <div class="side-queue-info">
          <div class="side-queue-title" style="color:var(--primary-light); font-weight:800;">${escapeHtml(currentTrack.title || 'Unbekannter Titel')}</div>
          <div class="side-queue-artist">${escapeHtml(currentTrack.artist || 'Unbekannt')}</div>
        </div>
      </div>
    `;
  }

  // Upcoming in sidebar
  html += `<div class="side-queue-section-heading">Nächste Titel (${upcomingTracks.length})</div>`;

  if (upcomingTracks.length === 0) {
    html += `
      <div style="padding: 16px 10px; color:var(--text-muted); font-size:0.8rem; text-align:center; border:1px dashed rgba(255,255,255,0.08); border-radius:var(--radius-md);">
        Keine weiteren Titel. Ziehe Songs hierhin!
      </div>
    `;
  } else {
    html += upcomingTracks.map((t, idx) => {
      const realIdx = currentIdx + 1 + idx;
      const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
      return `
        <div class="side-queue-item" draggable="true" data-queue-idx="${realIdx}">
          <div class="side-queue-left">
            ${GRABBER_ICON_HTML}
            <div class="side-queue-cover">
              ${coverUrl ? `<img src="${coverUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
              <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px; height:18px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              </div>
            </div>
            <div class="side-queue-info">
              <div class="side-queue-title">${escapeHtml(t.title || 'Unbekannter Titel')}</div>
              <div class="side-queue-artist">${escapeHtml(t.artist || 'Unbekannt')}</div>
            </div>
          </div>
          <button class="side-queue-remove" data-remove-idx="${realIdx}" title="Entfernen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
    }).join('');
  }

  elements.sideQueueList.innerHTML = html;

  elements.sideQueueList.querySelectorAll('.side-queue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.side-queue-remove') || e.target.closest('.queue-drag-handle')) return;
      const idx = parseInt(item.getAttribute('data-queue-idx'), 10);
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
      }
    });
  });

  elements.sideQueueList.querySelectorAll('.side-queue-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-remove-idx'), 10);
      state.queue.splice(idx, 1);
      if (state.queueIndex > idx) state.queueIndex--;
      updateAllQueueViews();
    });
  });
}

// 3. RENDER FULLSCREEN QUEUE VIEW
function renderFsQueueList() {
  if (!elements.fsQueueList) return;

  const currentTrack = state.selectedTrack || (state.queue && state.queue[state.queueIndex]);
  const currentIdx = (typeof state.queueIndex === 'number' && state.queueIndex >= 0) ? state.queueIndex : 0;
  const upcomingTracks = state.queue ? state.queue.slice(currentIdx + 1) : [];

  if (elements.fsQueueSubtitle) {
    const totalCount = (currentTrack ? 1 : 0) + upcomingTracks.length;
    elements.fsQueueSubtitle.textContent = `${totalCount} Songs`;
  }

  if (!currentTrack && upcomingTracks.length === 0) {
    elements.fsQueueList.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.82rem;">
        Warteschlange ist leer.
      </div>
    `;
    return;
  }

  let html = '';

  if (currentTrack) {
    const coverUrl = currentTrack.cover_url || (currentTrack.file_path ? `/api/track/cover?path=${encodeURIComponent(currentTrack.file_path)}` : '');
    html += `
      <div class="fs-queue-section-heading">Läuft gerade</div>
      <div class="fs-queue-now-playing-card">
        <div class="fs-queue-now-playing-cover">
          ${coverUrl ? `<img src="${coverUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
          <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; height:16px; color:var(--primary-light);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
        </div>
        <div class="fs-queue-info">
          <div class="fs-queue-title" style="color:var(--primary-light); font-weight:800;">${escapeHtml(currentTrack.title || 'Unbekannter Titel')}</div>
          <div class="fs-queue-artist">${escapeHtml(currentTrack.artist || 'Unbekannt')}</div>
        </div>
      </div>
    `;
  }

  html += `<div class="fs-queue-section-heading">Nächste Titel (${upcomingTracks.length})</div>`;

  if (upcomingTracks.length === 0) {
    html += `
      <div style="padding:14px 8px; color:var(--text-muted); font-size:0.75rem; text-align:center;">
        Keine weiteren Titel.
      </div>
    `;
  } else {
    html += upcomingTracks.map((t, idx) => {
      const realIdx = currentIdx + 1 + idx;
      const coverUrl = t.cover_url || (t.file_path ? `/api/track/cover?path=${encodeURIComponent(t.file_path)}` : '');
      return `
        <div class="fs-queue-item" draggable="true" data-queue-idx="${realIdx}">
          <div class="fs-queue-left">
            ${GRABBER_ICON_HTML}
            <div class="fs-queue-cover">
              ${coverUrl ? `<img src="${coverUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
              <div style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; height:16px; color:var(--text-dim);"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              </div>
            </div>
            <div class="fs-queue-info">
              <div class="fs-queue-title">${escapeHtml(t.title || 'Unbekannt')}</div>
              <div class="fs-queue-artist">${escapeHtml(t.artist || 'Unbekannt')}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  elements.fsQueueList.innerHTML = html;

  elements.fsQueueList.querySelectorAll('.fs-queue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.queue-drag-handle')) return;
      const idx = parseInt(item.getAttribute('data-queue-idx'), 10);
      if (state.queue[idx]) {
        state.queueIndex = idx;
        selectTrack(state.queue[idx], true);
      }
    });
  });
}

// 4. DOCUMENT-LEVEL DELEGATED DRAG & DROP ENGINE
function initDocumentDragAndDrop() {
  if (window._dndInitialized) return;
  window._dndInitialized = true;

  document.addEventListener('dragstart', (e) => {
    const queueItem = e.target.closest('.queue-item, .side-queue-item, .fs-queue-item');
    const songCard = e.target.closest('.song-card');
    const tableRow = e.target.closest('tr[data-track-id]');
    const albumCard = e.target.closest('.album-card');

    if (queueItem) {
      const qIdx = parseInt(queueItem.getAttribute('data-queue-index') || queueItem.getAttribute('data-queue-idx'), 10);
      queueItem.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'queue-reorder', index: qIdx }));
      return;
    }

    if (songCard || tableRow) {
      const el = songCard || tableRow;
      const trackId = el.getAttribute('data-track-id');
      const track = state.tracks.find(t => (t.id || t.file_path) === trackId);
      if (track) {
        el.classList.add('dragging-source');
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'track', track: track }));
      }
      return;
    }

    if (albumCard) {
      const albumTitle = albumCard.getAttribute('data-album') || '';
      const artistName = albumCard.getAttribute('data-artist') || '';
      const albTitle = albumTitle.trim().toLowerCase();
      const artName = artistName.trim().toLowerCase();
      const albumTracks = state.tracks.filter(t => {
        const matchAlb = (t.album || '').trim().toLowerCase() === albTitle;
        if (!matchAlb) return false;
        if (artName && artName !== 'unbekannt' && artName !== 'various artists') {
          return (t.artist || '').trim().toLowerCase() === artName;
        }
        return true;
      });
      albumCard.classList.add('dragging-source');
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'album',
        albumTitle: albumTitle,
        artist: artistName,
        tracks: albumTracks
      }));
      return;
    }
  });

  document.addEventListener('dragend', () => {
    document.querySelectorAll('.dragging, .dragging-source, .drag-over-top, .drag-over-bottom, .drag-target-active').forEach(el => {
      el.classList.remove('dragging', 'dragging-source', 'drag-over-top', 'drag-over-bottom', 'drag-target-active');
    });
  });

  document.addEventListener('dragover', (e) => {
    const queueItem = e.target.closest('.queue-item, .side-queue-item, .fs-queue-item');
    const queueDropArea = e.target.closest('#queueListContainer, #sideQueueList, #sideQueueWrapper, #fsQueueList, #navBtnQueue, #btnPlayerQueueToggle');

    if (queueItem) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = queueItem.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        queueItem.classList.add('drag-over-top');
        queueItem.classList.remove('drag-over-bottom');
      } else {
        queueItem.classList.add('drag-over-bottom');
        queueItem.classList.remove('drag-over-top');
      }
    } else if (queueDropArea) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      queueDropArea.classList.add('drag-target-active');
    }
  });

  document.addEventListener('dragleave', (e) => {
    const queueItem = e.target.closest('.queue-item, .side-queue-item, .fs-queue-item');
    const queueDropArea = e.target.closest('#queueListContainer, #sideQueueList, #sideQueueWrapper, #fsQueueList, #navBtnQueue, #btnPlayerQueueToggle');
    if (queueItem) {
      queueItem.classList.remove('drag-over-top', 'drag-over-bottom');
    }
    if (queueDropArea && !queueDropArea.contains(e.relatedTarget)) {
      queueDropArea.classList.remove('drag-target-active');
    }
  });

  document.addEventListener('drop', (e) => {
    const queueItem = e.target.closest('.queue-item, .side-queue-item, .fs-queue-item');
    const queueDropArea = e.target.closest('#queueListContainer, #sideQueueList, #sideQueueWrapper, #fsQueueList, #navBtnQueue, #btnPlayerQueueToggle');

    if (!queueItem && !queueDropArea) return;

    e.preventDefault();
    document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-target-active').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-target-active');
    });

    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);

      if (queueItem) {
        const itemIdx = parseInt(queueItem.getAttribute('data-queue-index') || queueItem.getAttribute('data-queue-idx'), 10);
        let dropTargetIdx = itemIdx;
        const rect = queueItem.getBoundingClientRect();
        if (e.clientY >= rect.top + rect.height / 2) {
          dropTargetIdx++;
        }

        if (data.type === 'queue-reorder' && typeof data.index === 'number') {
          const fromIdx = data.index;
          if (fromIdx !== dropTargetIdx && fromIdx !== dropTargetIdx - 1) {
            const moved = state.queue.splice(fromIdx, 1)[0];
            const insertAt = (fromIdx < dropTargetIdx) ? (dropTargetIdx - 1) : dropTargetIdx;
            state.queue.splice(insertAt, 0, moved);

            if (state.queueIndex === fromIdx) {
              state.queueIndex = insertAt;
            } else if (fromIdx < state.queueIndex && insertAt >= state.queueIndex) {
              state.queueIndex--;
            } else if (fromIdx > state.queueIndex && insertAt <= state.queueIndex) {
              state.queueIndex++;
            }
            updateAllQueueViews();
            showToast('Warteschlange neu sortiert.');
          }
        } else if (data.type === 'track' && data.track) {
          state.queue.splice(dropTargetIdx, 0, data.track);
          updateAllQueueViews();
          showToast(`🎵 "${data.track.title}" in Warteschlange eingefügt.`);
        } else if (data.type === 'album' && Array.isArray(data.tracks)) {
          state.queue.splice(dropTargetIdx, 0, ...data.tracks);
          updateAllQueueViews();
          showToast(`💿 Album "${data.albumTitle}" (${data.tracks.length} Songs) in Warteschlange eingefügt.`);
        }
      } else if (queueDropArea) {
        // Dropped into container or nav button
        if (data.type === 'track' && data.track) {
          state.queue.push(data.track);
          updateAllQueueViews();
          showToast(`🎵 "${data.track.title}" zur Warteschlange hinzugefügt.`);
        } else if (data.type === 'album' && Array.isArray(data.tracks)) {
          state.queue.push(...data.tracks);
          updateAllQueueViews();
          showToast(`💿 Album "${data.albumTitle}" (${data.tracks.length} Songs) zur Warteschlange hinzugefügt.`);
        }
      }
    } catch (err) {
      console.warn('Queue drop handler error:', err);
    }
  });
}

// Call initDocumentDragAndDrop immediately
initDocumentDragAndDrop();


// Helper to set playlist/album context queue when clicking a song
let pendingPlaylistPlayAction = null;

function handlePlaylistTrackPlay(track, playlistTracks, clickedIdx = -1) {
  if (!track || !Array.isArray(playlistTracks) || playlistTracks.length === 0) {
    if (track) selectTrack(track, true);
    return;
  }

  let idx = clickedIdx;
  if (idx < 0) {
    idx = playlistTracks.findIndex(t => (t.id || t.file_path) === (track.id || track.file_path));
    if (idx < 0) idx = 0;
  }

  const subsequentTracks = playlistTracks.slice(idx);

  // If queue is empty or has only the current track
  if (!state.queue || state.queue.length === 0) {
    state.queue = [...subsequentTracks];
    state.queueIndex = 0;
    selectTrack(track, true);
    updateAllQueueViews();
    return;
  }

  // If there are already songs in queue, ask user whether to replace or append
  pendingPlaylistPlayAction = {
    track,
    playlistTracks,
    subsequentTracks
  };

  const queueModal = $('queueConfirmModal');
  const queueText = $('queueConfirmText');
  if (queueText) {
    queueText.textContent = `In der Warteschlange befinden sich bereits ${state.queue.length} Song(s). Möchtest du die Warteschlange ersetzen oder ${subsequentTracks.length} Song(s) ab "${track.title}" anhängen?`;
  }
  if (queueModal) {
    queueModal.classList.add('open');
  } else {
    // Fallback if modal not in DOM: replace queue
    state.queue = [...subsequentTracks];
    state.queueIndex = 0;
    selectTrack(track, true);
    updateAllQueueViews();
  }
}
window.handlePlaylistTrackPlay = handlePlaylistTrackPlay;

function playTrackWithContext(track, trackList = null) {
  if (!track) return;
  if (Array.isArray(trackList) && trackList.length > 0) {
    state.queue = [...trackList];
    const foundIdx = state.queue.findIndex(t => (t.id || t.file_path) === (track.id || track.file_path));
    state.queueIndex = foundIdx >= 0 ? foundIdx : 0;
  } else {
    if (!state.queue || state.queue.length === 0) {
      state.queue = [track];
      state.queueIndex = 0;
    } else {
      const existingIdx = state.queue.findIndex(t => (t.id || t.file_path) === (track.id || track.file_path));
      if (existingIdx >= 0) {
        state.queueIndex = existingIdx;
      } else {
        state.queue.splice(state.queueIndex + 1, 0, track);
        state.queueIndex++;
      }
    }
  }
  selectTrack(track, true);
}
window.playTrackWithContext = playTrackWithContext;


// ==========================================================================
// Enhanced Album Card Rendering with Play Button & Universal Drag Support
// ==========================================================================

function renderAlbumsGrid() {
  if (!elements.albumsGrid) return;
  const albumMap = new Map();

  getFilteredTracks().forEach(t => {
    const alb = (t.album || 'Unbekanntes Album').trim();
    const key = `${alb}____${t.artist || ''}`;
    if (!albumMap.has(key)) {
      albumMap.set(key, { title: alb, artist: t.artist || 'Unbekannt', tracks: [], firstTrack: t });
    }
    albumMap.get(key).tracks.push(t);
  });

  const sortedAlbums = Array.from(albumMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  
  const q = state.searchQuery ? state.searchQuery.toLowerCase().trim() : '';
  const filteredAlbums = sortedAlbums.filter(a => {
    if (!q) return true;
    if (a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)) return true;
    return a.tracks.some(t => (t.title && t.title.toLowerCase().includes(q)));
  });

  if (elements.albumsCountLabel) {
    elements.albumsCountLabel.textContent = `${filteredAlbums.length} Alben in der Mediathek`;
  }

  if (filteredAlbums.length === 0) {
    elements.albumsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding: 48px 16px; color:var(--text-muted);">
        <p>Keine Alben gefunden.</p>
      </div>
    `;
    return;
  }

  elements.albumsGrid._allData = filteredAlbums;
  elements.albumsGrid._renderedCount = 0;
  elements.albumsGrid.innerHTML = '';

  function appendAlbumsChunk() {
    const start = elements.albumsGrid._renderedCount;
    const end = Math.min(start + 60, elements.albumsGrid._allData.length);
    if (start >= end) return;

    const chunk = elements.albumsGrid._allData.slice(start, end);
    const html = chunk.map(a => `
      <div class="album-card" draggable="true" data-album="${escapeHtml(a.title)}" data-artist="${escapeHtml(a.artist)}">
        <div class="album-cover">
          <img src="${escapeHtml(getTrackCoverUrl(a.firstTrack))}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; background:rgba(255,255,255,0.05);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:36px; height:36px; color:var(--text-dim);"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
          </div>
          <button class="album-card-play-btn" title="Album abspielen" data-album="${escapeHtml(a.title)}">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
        </div>
        <div class="card-title">${escapeHtml(a.title)}</div>
        <div class="card-meta">${escapeHtml(a.artist)} • ${a.tracks.length} Songs</div>
      </div>
    `).join('');

    elements.albumsGrid.insertAdjacentHTML('beforeend', html);
    elements.albumsGrid._renderedCount = end;

    const cards = elements.albumsGrid.querySelectorAll(`.album-card:nth-child(n+${start + 1})`);
    cards.forEach(card => {
      const albTitle = card.getAttribute('data-album');
      const artName = card.getAttribute('data-artist');
      const albObj = albumMap.get(`${albTitle}____${artName}`) || albumMap.get(`${albTitle}____`) || { title: albTitle, artist: artName, tracks: [] };

      makeAlbumCardDraggable(card, albTitle, artName);

      // Right-Click Context Menu on Album Cards
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAlbumContextMenu(e.clientX, e.clientY, albObj);
      });

      // Click on Play Button vs Click on Card Body
      card.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.album-card-play-btn');
        if (playBtn) {
          e.stopPropagation();
          if (albObj && albObj.tracks && albObj.tracks.length > 0) {
            playTrackWithContext(albObj.tracks[0], albObj.tracks);
            showToast(`▶ Album "${albTitle}" wird abgespielt.`);
          }
          return;
        }
        openAlbumDetail({ title: albTitle, artist: artName, tracks: albObj.tracks });
      });
    });
  }

  appendAlbumsChunk();
  attachScrollObserver(elements.albumsGrid, appendAlbumsChunk);
}
window.renderAlbumsGrid = renderAlbumsGrid;


// ==========================================================================
// Strict Queue Playback Controller (End playback when queue finishes)
// ==========================================================================

function playNextTrack() {
  if (state.repeat === 'one') {
    if (elements.audioElement) {
      elements.audioElement.currentTime = 0;
      elements.audioElement.play().catch(() => {});
    }
    return;
  }

  // 1. If there are more tracks in queue, advance to the next track
  if (Array.isArray(state.queue) && state.queue.length > 0 && state.queueIndex + 1 < state.queue.length) {
    state.queueIndex++;
    selectTrack(state.queue[state.queueIndex], true);
    updateAllQueueViews();
    return;
  }

  // 2. Repeat all mode: loop back to index 0
  if (state.repeat === 'all' && Array.isArray(state.queue) && state.queue.length > 0) {
    state.queueIndex = 0;
    selectTrack(state.queue[0], true);
    updateAllQueueViews();
    return;
  }

  // 3. When the queue has finished (no more tracks): STOP PLAYBACK COMPLETELY
  if (elements.audioElement) {
    elements.audioElement.pause();
    elements.audioElement.currentTime = 0;
  }
  updatePlayPauseUI(false);
  updateAllQueueViews();
  showToast('🏁 Warteschlange beendet.');
}
window.playNextTrack = playNextTrack;


// ==========================================================================
// Playlist Drag & Drop Ingestion & Two-Way Plex Synchronization
// ==========================================================================

async function addTracksToPlaylistDirect(playlistId, trackList) {
  if (!playlistId || !Array.isArray(trackList) || trackList.length === 0) return;
  const trackIds = trackList.map(t => t.id || t.file_path);
  
  try {
    const res = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_ids: trackIds })
    });
    if (res.ok) {
      const data = await res.json();
      const pl = state.playlists.find(p => p.id === playlistId);
      if (pl) {
        pl.track_ids = data.playlist.track_ids || [...(pl.track_ids || []), ...trackIds];
        renderPlaylists();
      }
      const syncMsg = data.plex_synced ? ' & mit Plex synchronisiert 📺' : '';
      showToast(`✨ ${trackList.length} Song(s) zu "${pl ? pl.name : 'Playlist'}" hinzugefügt${syncMsg}!`);
      
      if (state.activeView === 'playlist_detail' && state.selectedPlaylist && state.selectedPlaylist.id === playlistId) {
        openPlaylistDetail(state.selectedPlaylist);
      }
    }
  } catch (err) {
    showToast('Fehler beim Hinzufügen zur Playlist.');
  }
}
window.addTracksToPlaylistDirect = addTracksToPlaylistDirect;

// Setup Playlist Nav Items Drop Targets
function setupPlaylistNavDropTargets() {
  if (!elements.playlistNavList) return;

  elements.playlistNavList.querySelectorAll('.nav-item').forEach(item => {
    const plId = item.getAttribute('data-playlist-id');
    if (!plId) return;

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      item.classList.add('drag-target-active');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-target-active');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-target-active');

      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const data = JSON.parse(raw);

        if (data.type === 'track' && data.track) {
          addTracksToPlaylistDirect(plId, [data.track]);
        } else if (data.type === 'album' && Array.isArray(data.tracks)) {
          addTracksToPlaylistDirect(plId, data.tracks);
        }
      } catch (err) {
        console.warn('Playlist drop error:', err);
      }
    });
  });
}

// Hook setupPlaylistNavDropTargets into renderPlaylists
const originalRenderPlaylists = renderPlaylists;
renderPlaylists = function() {
  originalRenderPlaylists.apply(this, arguments);
  setupPlaylistNavDropTargets();
};

// Ensure Artists cannot be dragged
document.addEventListener('dragstart', (e) => {
  if (e.target.closest('.artist-card') && !e.target.closest('.song-card') && !e.target.closest('.album-card')) {
    e.preventDefault();
  }
}, true);


// ==========================================================================
// Playlist Auto-Import & Exact Track Order Engine
// ==========================================================================

async function fetchPlaylists() {
  try {
    const playlistsMap = new Map();

    // 1. Fetch local playlists
    try {
      const res = await fetch('/api/playlists');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data.playlists) ? data.playlists : []);
        list.forEach(p => { if (p && p.id) playlistsMap.set(p.id, p); });
      }
    } catch (_) {}

    // 2. Fetch Host playlists if Host is connected
    const hostBase = getHostBaseUrl();
    if (hostBase) {
      try {
        const hRes = await fetch(getApiEndpoint('/api/playlists'));
        if (hRes.ok) {
          const hData = await hRes.json();
          const hList = Array.isArray(hData) ? hData : (Array.isArray(hData.playlists) ? hData.playlists : []);
          hList.forEach(p => {
            if (p && p.id) {
              const pid = p.id.startsWith('host_') || p.id.startsWith('plex_') ? p.id : `host_${p.id}`;
              playlistsMap.set(pid, { ...p, id: pid, source: p.source || 'host' });
            }
          });
        }
      } catch (_) {}
    }

    // 3. Fetch Plex playlists directly (via Host or direct Plex)
    try {
      const pRes = await fetch(getPlexApiUrl('/api/plex/playlists'));
      if (pRes.ok) {
        const pData = await pRes.json();
        const pList = Array.isArray(pData) ? pData : (Array.isArray(pData.playlists) ? pData.playlists : []);
        pList.forEach(p => {
          if (p && (p.id || p.plex_key)) {
            const pid = p.id ? (String(p.id).startsWith('plex_') ? p.id : `plex_${p.id}`) : `plex_${p.plex_key}`;
            playlistsMap.set(pid, {
              ...p,
              id: pid,
              source: 'plex',
              track_count: (p.track_ids ? p.track_ids.length : 0) || p.track_count || 0
            });
          }
        });
      }
    } catch (_) {}

    state.playlists = Array.from(playlistsMap.values());
    try { setStoredItem('saved_playlists', JSON.stringify(state.playlists)); } catch (_) {}
    renderPlaylists();
  } catch (err) {
    console.warn('Error fetching playlists:', err);
  }
}
window.fetchPlaylists = fetchPlaylists;

async function openPlaylistDetail(pl) {
  state.selectedPlaylist = pl;
  if (elements.playlistDetailTitle) elements.playlistDetailTitle.textContent = pl.name;
  if (elements.playlistSourceBadge) elements.playlistSourceBadge.textContent = pl.source ? pl.source.toUpperCase() + ' PLAYLIST' : 'PLAYLIST';

  // Render Playlist Cover Hero Banner
  const coverWrapper = elements.playlistDetailCoverWrapper || $('playlistDetailCoverWrapper');
  const updateCoverDisplay = () => {
    if (!coverWrapper) return;
    const coverUrl = getPlaylistCoverUrl(pl);
    if (coverUrl) {
      coverWrapper.innerHTML = `
        <img src="${coverUrl}" class="detail-hero-cover-img" alt="${escapeHtml(pl.name)}" onerror="this.style.display='none'; const fb = this.parentElement.querySelector('.detail-hero-cover-fallback'); if(fb) fb.style.display='flex';" />
        <div class="detail-hero-cover-fallback" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      `;
    } else {
      coverWrapper.innerHTML = `
        <div class="detail-hero-cover-fallback">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      `;
    }
  };

  updateCoverDisplay();

  let plTracks = [];
  const hostBase = getHostBaseUrl();
  const token = getHostToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  const isPlexViaHost = Boolean(hostBase);

  // 1. If playlist is from Plex, fetch fresh tracks directly from Plex in exact order!
  const isPlex = pl.source === 'plex' || (pl.id && String(pl.id).startsWith('plex_')) || pl.plex_key;
  if (isPlex && (pl.id || pl.plex_key)) {
    try {
      const cleanId = String(pl.plex_key || pl.id).replace(/^host:\/\//, '').replace(/^plex_/, '').replace(/^plex:\/\//, '');
      const res = await fetch(getPlexApiUrl(`/api/plex/playlists/${cleanId}/tracks`));
      if (res.ok) {
        const fetched = await res.json();
        const rawTrackList = Array.isArray(fetched) ? fetched : (fetched.tracks || []);
        if (rawTrackList.length > 0) {
          const trackList = rawTrackList.map(t => {
            if (isPlexViaHost && hostBase) {
              const rKey = t.plex_key || String(t.host_id || t.id).replace(/^plex_/, '');
              return {
                ...t,
                id: `host://plex_${rKey}`,
                host_id: `plex_${rKey}`,
                plex_key: rKey,
                source: 'host',
                source_category: 'plex',
                stream_url: `${hostBase}/api/plex/stream/${rKey}${tokenParam}`,
                cover_url: `${hostBase}/api/plex/cover/${rKey}${tokenParam}`
              };
            }
            return t;
          });

          plTracks = trackList;
          pl.track_ids = trackList.map(t => t.id || t.host_id || t.file_path);
          pl.track_count = trackList.length;

          // Merge newly fetched tracks into state.tracks for playback & search
          const existingIds = new Set(state.tracks.map(t => t.id || t.file_path));
          const newTracks = trackList.filter(t => !existingIds.has(t.id) && !existingIds.has(t.file_path));
          if (newTracks.length > 0) {
            state.tracks = [...state.tracks, ...newTracks];
            updateBadgeCounts();
          }
          updateCoverDisplay();
        }
      }
    } catch (e) {
      console.warn('Error fetching Plex playlist tracks:', e);
    }
  }

  // 2. If not fetched from Plex or local playlist, map pl.track_ids in EXACT preserved order:
  if (plTracks.length === 0 && Array.isArray(pl.track_ids) && pl.track_ids.length > 0) {
    const trackMap = new Map();
    state.tracks.forEach(t => {
      if (t.id) trackMap.set(String(t.id), t);
      if (t.file_path) trackMap.set(String(t.file_path), t);
      if (t.host_id) trackMap.set(String(t.host_id), t);
      if (t.plex_key) {
        trackMap.set(String(t.plex_key), t);
        trackMap.set(`plex_${t.plex_key}`, t);
        trackMap.set(`host://plex_${t.plex_key}`, t);
        trackMap.set(`plex://${t.plex_key}`, t);
      }
      if (t.id && String(t.id).startsWith('host://')) {
        const sub = String(t.id).replace('host://', '');
        trackMap.set(sub, t);
        if (sub.startsWith('plex_')) {
          trackMap.set(sub.replace('plex_', ''), t);
        }
      }
    });

    plTracks = pl.track_ids
      .map(id => {
        const sId = String(id);
        return trackMap.get(sId) ||
               trackMap.get(`host://${sId}`) ||
               trackMap.get(`plex_${sId}`) ||
               trackMap.get(sId.replace(/^host:\/\//, '')) ||
               trackMap.get(sId.replace(/^plex_/, '')) ||
               trackMap.get(sId.replace(/^plex:\/\//, ''));
      })
      .filter(Boolean);

    updateCoverDisplay();
  }

  if (elements.playlistDetailMeta) elements.playlistDetailMeta.textContent = `${plTracks.length} Songs`;

  // Render tracks in exact playlist order with handlePlaylistTrackPlay
  renderTracksTable(elements.playlistDetailTracksBody, plTracks, (clickedTrack, clickedIdx) => {
    handlePlaylistTrackPlay(clickedTrack, plTracks, clickedIdx);
  });

  if (elements.btnPlayPlaylistAll) {
    elements.btnPlayPlaylistAll.onclick = () => {
      if (plTracks.length > 0) {
        handlePlaylistTrackPlay(plTracks[0], plTracks, 0);
      }
    };
  }

  if (elements.btnDeletePlaylist) {
    elements.btnDeletePlaylist.onclick = async () => {
      if (confirm(`Möchtest du die Playlist "${pl.name}" wirklich löschen?`)) {
        await deletePlaylist(pl.id);
      }
    };
  }

  switchView('playlist_detail');
}
window.openPlaylistDetail = openPlaylistDetail;


// ==========================================================================
// Multi-Token Search Engine ("KünstlerX TitelY") & Hub Manager
// ==========================================================================

function matchTrackMultiTokens(track, tokens) {
  if (!tokens || tokens.length === 0) return true;
  const title = (track.title || '').toLowerCase();
  const artist = (track.artist || '').toLowerCase();
  const album = (track.album || '').toLowerCase();
  const genre = (track.genre || '').toLowerCase();
  const path = (track.file_path || '').toLowerCase();
  const fullText = `${title} ${artist} ${album} ${genre} ${path}`;
  
  return tokens.every(tok => fullText.includes(tok));
}

function handleGlobalSearchInput(query) {
  const clean = (query || '').trim();
  state.searchQuery = clean;

  if (elements.clearSearchBtn) {
    elements.clearSearchBtn.style.display = clean ? 'block' : 'none';
  }

  if (clean.length > 0) {
    if (state.activeView !== 'search') {
      state.previousView = state.activeView;
      switchView('search');
    }
    renderGlobalSearchResults(clean);
  } else {
    if (state.activeView === 'search') {
      switchView(state.previousView || 'songs');
    } else {
      updateActiveView();
    }
  }
}

function renderGlobalSearchResults(query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  
  // 1. Matching Tracks
  const matchingTracks = state.tracks.filter(t => matchTrackMultiTokens(t, tokens));
  
  // 2. Matching Artists
  const allArtistsMap = new Map();
  state.tracks.forEach(t => {
    const art = (t.artist || 'Unbekannter Interpret').trim();
    if (!allArtistsMap.has(art)) allArtistsMap.set(art, []);
    allArtistsMap.get(art).push(t);
  });
  
  const matchingArtists = [];
  allArtistsMap.forEach((tracks, artistName) => {
    const artLower = artistName.toLowerCase();
    if (tokens.every(tok => artLower.includes(tok)) || tracks.some(t => matchTrackMultiTokens(t, tokens))) {
      matchingArtists.push({ name: artistName, tracks, count: tracks.length });
    }
  });

  // 3. Matching Albums
  const allAlbumsMap = new Map();
  state.tracks.forEach(t => {
    const alb = (t.album || 'Unbekanntes Album').trim();
    const art = (t.artist || 'Unbekannter Interpret').trim();
    const key = `${alb}___${art}`;
    if (!allAlbumsMap.has(key)) allAlbumsMap.set(key, { title: alb, artist: art, tracks: [] });
    allAlbumsMap.get(key).tracks.push(t);
  });

  const matchingAlbums = [];
  allAlbumsMap.forEach((albObj) => {
    const fullAlbText = `${albObj.title} ${albObj.artist}`.toLowerCase();
    if (tokens.every(tok => fullAlbText.includes(tok)) || albObj.tracks.some(t => matchTrackMultiTokens(t, tokens))) {
      matchingAlbums.push({
        title: albObj.title,
        artist: albObj.artist,
        tracks: albObj.tracks,
        cover_url: albObj.tracks[0]?.cover_url || ''
      });
    }
  });

  const totalResults = matchingTracks.length + matchingArtists.length + matchingAlbums.length;
  
  const searchEmptyState = document.getElementById('searchEmptyState');
  const searchResultsContent = document.getElementById('searchResultsContent');
  const searchViewSubtitle = document.getElementById('searchViewSubtitle');

  if (searchViewSubtitle) {
    searchViewSubtitle.textContent = `${matchingTracks.length} Songs • ${matchingArtists.length} Künstler • ${matchingAlbums.length} Alben für "${query}"`;
  }

  if (totalResults === 0) {
    if (searchEmptyState) searchEmptyState.classList.remove('hidden');
    if (searchResultsContent) searchResultsContent.classList.add('hidden');
    return;
  }

  if (searchEmptyState) searchEmptyState.classList.add('hidden');
  if (searchResultsContent) searchResultsContent.classList.remove('hidden');

  // --- TOP RESULT (Bester Treffer) ---
  const heroCard = document.getElementById('searchHeroCard');
  if (heroCard) {
    // Prefer exact artist match, then exact album match, then top track
    const exactArtist = matchingArtists.find(a => a.name.toLowerCase() === query.toLowerCase()) || matchingArtists[0];
    const exactAlbum = matchingAlbums.find(a => a.title.toLowerCase() === query.toLowerCase()) || matchingAlbums[0];
    const topTrack = matchingTracks[0];

    if (exactArtist && (exactArtist.name.toLowerCase() === query.toLowerCase() || (!topTrack && exactArtist))) {
      heroCard.innerHTML = `
        <div style="width:92px; height:92px; border-radius:50%; background:var(--primary-light); color:#fff; display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:800; margin-bottom:16px;">
          ${escapeHtml(exactArtist.name.charAt(0).toUpperCase())}
        </div>
        <h2 class="search-hero-title">${escapeHtml(exactArtist.name)}</h2>
        <div class="search-hero-badge-row">
          <span class="search-hero-type-badge">Künstler</span>
          <span class="search-hero-subtitle">${exactArtist.count} Titel</span>
        </div>
        <button class="search-hero-play-btn" title="Künstler abspielen">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
        </button>
      `;
      heroCard.onclick = (e) => {
        if (e.target.closest('.search-hero-play-btn')) {
          if (exactArtist.tracks.length > 0) playTrackWithContext(exactArtist.tracks[0], exactArtist.tracks);
        } else {
          openArtistDetail(exactArtist.name);
        }
      };
    } else if (topTrack) {
      const coverHtml = topTrack.cover_url 
        ? `<img class="search-hero-cover" src="${topTrack.cover_url}" alt="Cover" />` 
        : `<div class="search-hero-cover" style="background:var(--bg-surface-active); display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`;
      
      heroCard.innerHTML = `
        ${coverHtml}
        <h2 class="search-hero-title">${escapeHtml(topTrack.title)}</h2>
        <div class="search-hero-badge-row">
          <span class="search-hero-type-badge">Song</span>
          <span class="search-hero-subtitle">${escapeHtml(topTrack.artist)} • ${escapeHtml(topTrack.album || '')}</span>
        </div>
        <button class="search-hero-play-btn" title="Song abspielen">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
        </button>
      `;
      heroCard.onclick = () => {
        playTrackWithContext(topTrack, matchingTracks);
      };
    }
  }

  // --- QUICK SONGS (Top 4) ---
  const quickTracksList = document.getElementById('searchQuickTracksList');
  if (quickTracksList) {
    const quick4 = matchingTracks.slice(0, 4);
    quickTracksList.innerHTML = quick4.map((t, idx) => `
      <div class="search-quick-track-item" data-id="${t.id || t.file_path}">
        <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
          <img src="${t.cover_url || ''}" onerror="this.style.display='none'" style="width:40px; height:40px; border-radius:4px; object-fit:cover; background:var(--bg-surface);" />
          <div style="min-width:0; flex:1;">
            <div style="font-weight:700; color:#fff; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.title)}</div>
            <div style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.artist)}</div>
          </div>
        </div>
        <span style="font-size:0.8rem; color:var(--text-dim); margin-left:12px;">${t.duration_str || ''}</span>
      </div>
    `).join('');

    quickTracksList.querySelectorAll('.search-quick-track-item').forEach((item, i) => {
      item.addEventListener('click', () => {
        playTrackWithContext(quick4[i], matchingTracks);
      });
    });
  }

  // --- ARTISTS GRID ---
  const artistsSection = document.getElementById('searchArtistsSection');
  const artistsGrid = document.getElementById('searchArtistsGrid');
  if (artistsGrid && artistsSection) {
    if (matchingArtists.length === 0) {
      artistsSection.classList.add('hidden');
    } else {
      artistsSection.classList.remove('hidden');
      artistsGrid.innerHTML = matchingArtists.slice(0, 12).map(a => `
        <div class="artist-card" data-artist="${escapeHtml(a.name)}">
          <div class="artist-avatar">
            <span>${escapeHtml(a.name.charAt(0).toUpperCase())}</span>
          </div>
          <span class="artist-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
          <span class="artist-count">${a.count} Titel</span>
        </div>
      `).join('');

      artistsGrid.querySelectorAll('.artist-card').forEach(card => {
        card.addEventListener('click', () => {
          const artistName = card.getAttribute('data-artist');
          if (artistName) openArtistDetail(artistName);
        });
      });
    }
  }

  // --- ALBUMS GRID ---
  const albumsSection = document.getElementById('searchAlbumsSection');
  const albumsGrid = document.getElementById('searchAlbumsGrid');
  if (albumsGrid && albumsSection) {
    if (matchingAlbums.length === 0) {
      albumsSection.classList.add('hidden');
    } else {
      albumsSection.classList.remove('hidden');
      albumsGrid.innerHTML = matchingAlbums.slice(0, 12).map(alb => `
        <div class="album-card" data-album="${escapeHtml(alb.title)}" data-artist="${escapeHtml(alb.artist)}">
          <div class="album-cover-wrapper">
            <img class="album-cover" src="${alb.cover_url}" onerror="this.style.display='none'" alt="Cover" />
            <div class="album-cover-fallback">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
            </div>
            <button class="album-card-play-btn" title="Album abspielen">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
            </button>
          </div>
          <span class="album-title" title="${escapeHtml(alb.title)}">${escapeHtml(alb.title)}</span>
          <span class="album-artist" title="${escapeHtml(alb.artist)}">${escapeHtml(alb.artist)}</span>
        </div>
      `).join('');

      albumsGrid.querySelectorAll('.album-card').forEach(card => {
        const albTitle = card.getAttribute('data-album');
        const artName = card.getAttribute('data-artist');
        const found = matchingAlbums.find(a => a.title === albTitle && a.artist === artName) || { title: albTitle, artist: artName, tracks: [] };

        makeAlbumCardDraggable(card, albTitle, artName);

        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openAlbumContextMenu(e.clientX, e.clientY, found);
        });

        card.addEventListener('click', (e) => {
          if (e.target.closest('.album-card-play-btn')) {
            if (found && found.tracks && found.tracks.length > 0) {
              playTrackWithContext(found.tracks[0], found.tracks);
              showToast(`▶ Album "${albTitle}" wird abgespielt.`);
            }
          } else if (found) {
            openAlbumDetail(found);
          }
        });
      });
    }
  }

  // --- ALL MATCHING SONGS GRID ---
  const songsSection = document.getElementById('searchSongsSection');
  const songsGrid = document.getElementById('searchSongsGrid');
  if (songsGrid && songsSection) {
    if (matchingTracks.length === 0) {
      songsSection.classList.add('hidden');
    } else {
      songsSection.classList.remove('hidden');
      renderVirtualSongsGrid(songsGrid, matchingTracks);
    }
  }
}

// Hook searchInput to handleGlobalSearchInput
if (elements.searchInput) {
  elements.searchInput.addEventListener('input', (e) => {
    handleGlobalSearchInput(e.target.value);
  });
}
if (elements.clearSearchBtn) {
  elements.clearSearchBtn.addEventListener('click', () => {
    if (elements.searchInput) elements.searchInput.value = '';
    handleGlobalSearchInput('');
  });
}


// ==========================================================================
// Robust View Manager (Includes Dedicated Search Hub) & Auto-Sync Engine
// ==========================================================================

function switchView(viewName, data = null, pushHistory = true) {
  state.previousView = state.activeView;
  state.activeView = viewName;

  if (pushHistory) {
    state.navHistory = state.navHistory.slice(0, state.navHistoryIndex + 1);
    state.navHistory.push(viewName);
    state.navHistoryIndex = state.navHistory.length - 1;
  }

  // Update Sidebar Nav Item Highlighting
  if (elements.navBtnSongs) elements.navBtnSongs.classList.toggle('active', viewName === 'songs');
  if (elements.navBtnHostSource) elements.navBtnHostSource.classList.toggle('active', viewName === 'host');
  if (elements.navBtnPlexSource) elements.navBtnPlexSource.classList.toggle('active', viewName === 'plex');
  if (elements.navBtnLocalSource) elements.navBtnLocalSource.classList.toggle('active', viewName === 'local');
  if (elements.navBtnArtists) elements.navBtnArtists.classList.toggle('active', viewName === 'artists' || viewName === 'artist_detail');
  if (elements.navBtnAlbums) elements.navBtnAlbums.classList.toggle('active', viewName === 'albums' || viewName === 'album_detail');
  if (elements.navBtnFavorites) elements.navBtnFavorites.classList.toggle('active', viewName === 'favorites');
  if (elements.navBtnQueue) elements.navBtnQueue.classList.toggle('active', viewName === 'queue');
  if (elements.btnPlayerLyricsToggle) elements.btnPlayerLyricsToggle.classList.toggle('active', viewName === 'lyrics');

  // Hide all views and show target view
  const allViews = [
    elements.viewSongs,
    elements.viewArtists,
    elements.viewArtistDetail,
    elements.viewAlbums,
    elements.viewAlbumDetail,
    elements.viewPlaylistDetail,
    elements.viewQueue,
    elements.viewLyrics,
    document.getElementById('viewSearch')
  ];

  allViews.forEach(v => {
    if (v) v.classList.remove('active');
  });

  if (viewName === 'songs') {
    state.activeSource = 'all';
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = 'Alle Titel';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${getFilteredTracks().length} Titel in der Mediathek`;
    renderTracksTable();
  } else if (viewName === 'host') {
    state.activeSource = 'host';
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = 'Tonarr Host';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${getFilteredTracks().length} Titel vom Host Server`;
    renderTracksTable();
  } else if (viewName === 'plex') {
    state.activeSource = 'plex';
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = 'Plex Mediathek';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${getFilteredTracks().length} Plex Titel`;
    renderTracksTable();
  } else if (viewName === 'local') {
    state.activeSource = 'local';
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = 'Lokale Musik';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${getFilteredTracks().length} lokale Titel`;
    renderTracksTable();
  } else if (viewName === 'search') {
    const searchV = document.getElementById('viewSearch');
    if (searchV) searchV.classList.add('active');
    renderGlobalSearchResults(state.searchQuery || '');
  } else if (viewName === 'favorites') {
    if (elements.viewSongs) elements.viewSongs.classList.add('active');
    if (elements.songsViewTitle) elements.songsViewTitle.textContent = '❤️ Favoriten';
    if (elements.songsViewSubtitle) elements.songsViewSubtitle.textContent = `${state.favorites.size} Lieblingstitel`;
    renderTracksTable();
  } else if (viewName === 'artists') {
    if (elements.viewArtists) elements.viewArtists.classList.add('active');
    renderArtistsGrid();
  } else if (viewName === 'artist_detail') {
    if (elements.viewArtistDetail) elements.viewArtistDetail.classList.add('active');
    if (data) openArtistDetail(data);
  } else if (viewName === 'albums') {
    if (elements.viewAlbums) elements.viewAlbums.classList.add('active');
    renderAlbumsGrid();
  } else if (viewName === 'album_detail') {
    if (elements.viewAlbumDetail) elements.viewAlbumDetail.classList.add('active');
    if (data) openAlbumDetail(data);
  } else if (viewName === 'playlist_detail') {
    if (elements.viewPlaylistDetail) elements.viewPlaylistDetail.classList.add('active');
    if (data) openPlaylistDetail(data);
  } else if (viewName === 'queue') {
    if (elements.viewQueue) elements.viewQueue.classList.add('active');
    renderQueueView();
  } else if (viewName === 'lyrics') {
    if (elements.viewLyrics) elements.viewLyrics.classList.add('active');
    renderInPlayerLyrics();
  }
}
window.switchView = switchView;

// Automatic Two-Way Playlist Synchronization
async function syncAllPlaylistsAutomatically() {
  showToast('🔄 Synchronisiere alle Playlists automatisch...');
  try {
    const res = await fetch(getPlexApiUrl('/api/plex/playlists/sync-all'), { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.playlists)) {
        state.playlists = data.playlists;
        try { setStoredItem('saved_playlists', JSON.stringify(state.playlists)); } catch (_) {}
        renderPlaylists();
      }
      if (Array.isArray(data.new_tracks) && data.new_tracks.length > 0) {
        const existingIds = new Set(state.tracks.map(t => t.id || t.file_path));
        const toAdd = data.new_tracks.filter(t => !existingIds.has(t.id) && !existingIds.has(t.file_path));
        if (toAdd.length > 0) {
          state.tracks = [...state.tracks, ...toAdd];
          updateBadgeCounts();
          renderTracksTable();
          renderArtistsGrid();
          renderAlbumsGrid();
        }
      }
      showToast(`✨ ${data.count || state.playlists.length} Playlists automatisch synchronisiert!`);
    } else {
      await fetchPlaylists();
    }
  } catch (err) {
    console.warn('Auto playlist sync error:', err);
    await fetchPlaylists();
  }
}
window.syncAllPlaylistsAutomatically = syncAllPlaylistsAutomatically;

// Hook Import button to sync all automatically
if (elements.btnImportPlaylists) {
  elements.btnImportPlaylists.onclick = () => {
    syncAllPlaylistsAutomatically();
  };
}

// Auto-run playlist sync on boot
setTimeout(() => {
  syncAllPlaylistsAutomatically();
}, 800);


// ==========================================================================
// Universal Auto-Import & Two-Way Sync for ALL Playlists
// ==========================================================================

async function autoImportAllPlaylists(showToastNotification = false) {
  if (showToastNotification) {
    showToast('🔄 Synchronisiere alle Playlists automatisch...');
  }

  // 1. Restore cached playlists from localStorage immediately
  try {
    const cached = getStoredItem('saved_playlists');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.playlists = parsed;
        renderPlaylists();
      }
    }
  } catch (e) {}

  let importedCount = 0;

  // 2. Fetch and sync ALL Plex Playlists
  try {
    const res = await fetch(getPlexApiUrl('/api/plex/playlists'));
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data.playlists) ? data.playlists : []);
      if (list.length > 0) {
        const hostBase = getHostBaseUrl();
        const token = getHostToken();
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
        const isPlexViaHost = Boolean(hostBase);

        for (const p of list) {
          try {
            const cleanId = String(p.plex_key || p.id || '').replace(/^host:\/\//, '').replace(/^plex_/, '').replace(/^plex:\/\//, '');
            if (!cleanId) continue;
            
            const tRes = await fetch(getPlexApiUrl(`/api/plex/playlists/${cleanId}/tracks`));
            let rawTracks = [];
            if (tRes.ok) {
              const resData = await tRes.json();
              rawTracks = Array.isArray(resData) ? resData : (Array.isArray(resData.tracks) ? resData.tracks : []);
            }

            const importedTracks = rawTracks.map(t => {
              if (isPlexViaHost && hostBase) {
                const rKey = t.plex_key || String(t.host_id || t.id).replace(/^plex_/, '');
                return {
                  ...t,
                  id: `host://plex_${rKey}`,
                  host_id: `plex_${rKey}`,
                  plex_key: rKey,
                  source: 'host',
                  source_category: 'plex',
                  stream_url: `${hostBase}/api/plex/stream/${rKey}${tokenParam}`,
                  cover_url: `${hostBase}/api/plex/cover/${rKey}${tokenParam}`
                };
              }
              return t;
            });

            if (importedTracks.length > 0) {
              const existingIds = new Set(state.tracks.map(t => t.id || t.file_path));
              const newTracks = importedTracks.filter(t => !existingIds.has(t.id) && !existingIds.has(t.file_path));
              if (newTracks.length > 0) {
                state.tracks = [...state.tracks, ...newTracks];
                updateBadgeCounts();
              }
            }

            const trackIds = importedTracks.map(t => t.id || t.host_id || t.file_path);
            const pid = p.id ? (String(p.id).startsWith('plex_') ? p.id : `plex_${p.id}`) : `plex_${cleanId}`;

            const plObj = {
              id: pid,
              name: p.name || 'Plex Playlist',
              source: 'plex',
              track_ids: trackIds,
              track_count: trackIds.length || p.track_count || 0,
              thumb: p.thumb || '',
              composite: p.composite || '',
              cover_url: getPlaylistCoverUrl(p)
            };

            const existingIdx = state.playlists.findIndex(pl => pl.id === pid);
            if (existingIdx >= 0) {
              state.playlists[existingIdx] = plObj;
            } else {
              state.playlists.push(plObj);
            }
            importedCount++;
          } catch (errP) {
            console.warn(`Error auto-importing Plex playlist ${p.name}:`, errP);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Plex playlists auto-fetch error:', err);
  }

  // 3. Fetch and sync ALL Spotify Playlists (if connected)
  try {
    const sRes = await fetch('/api/spotify/playlists');
    if (sRes.ok) {
      const sList = await sRes.json();
      if (Array.isArray(sList) && sList.length > 0) {
        for (const p of sList) {
          try {
            const cleanId = String(p.id || '').replace('spotify_', '');
            if (!cleanId) continue;
            const tRes = await fetch(`/api/spotify/playlists/${cleanId}/tracks`);
            let importedTracks = [];
            if (tRes.ok) {
              importedTracks = await tRes.json();
            }
            const trackIds = Array.isArray(importedTracks) ? importedTracks.map(t => t.id || t.file_path) : [];
            const pid = p.id.startsWith('spotify_') ? p.id : `spotify_${p.id}`;

            const existingIdx = state.playlists.findIndex(pl => pl.id === pid);
            const plObj = {
              id: pid,
              name: p.name || 'Spotify Playlist',
              source: 'spotify',
              track_ids: trackIds,
              track_count: trackIds.length
            };

            if (existingIdx >= 0) {
              state.playlists[existingIdx] = plObj;
            } else {
              state.playlists.push(plObj);
            }
            importedCount++;
          } catch (errS) {}
        }
      }
    }
  } catch (err) {}

  // 4. Save to persistent cache & render immediately
  try {
    setStoredItem('saved_playlists', JSON.stringify(state.playlists));
  } catch (e) {}

  renderPlaylists();
  
  if (showToastNotification || importedCount > 0) {
    showToast(`✨ ${state.playlists.length} Playlists automatisch synchronisiert!`);
  }
}
window.autoImportAllPlaylists = autoImportAllPlaylists;

// Hook Import button in playlist header to trigger auto-import
if (elements.btnImportPlaylists) {
  elements.btnImportPlaylists.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    autoImportAllPlaylists(true);
  };
}

// Auto-run playlist sync on boot & after tracks load
setTimeout(() => {
  autoImportAllPlaylists(false);
}, 600);


// Playlist Drag-and-Drop Reordering Engine
// ==========================================================================

function renderPlaylists() {
  if (!elements.playlistNavList) return;
  if (!Array.isArray(state.playlists) || state.playlists.length === 0) {
    elements.playlistNavList.innerHTML = `<span style="font-size:0.75rem; color:var(--text-dim); padding:6px 12px;">Keine Playlists</span>`;
    return;
  }

  elements.playlistNavList.innerHTML = state.playlists.map(p => {
    const isPlex = p.source === 'plex';
    const isSpotify = p.source === 'spotify';
    const badge = isPlex ? '📺' : (isSpotify ? '🟢' : '');
    const coverUrl = getPlaylistCoverUrl(p);
    const count = (p.track_ids || []).length || p.track_count || 0;

    return `
      <button class="nav-item playlist-nav-item" draggable="true" data-playlist-id="${p.id}" title="${escapeHtml(p.name)}">
        <div class="playlist-nav-cover-wrap" style="width:28px; height:28px; border-radius:4px; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.06); box-shadow:0 2px 6px rgba(0,0,0,0.35); position:relative;">
          ${coverUrl ? `<img class="playlist-nav-thumb" src="${coverUrl}" alt="" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" style="width:100%; height:100%; object-fit:cover;" />` : ''}
          <div class="playlist-nav-fallback" style="${coverUrl ? 'display:none;' : 'display:flex;'} width:100%; height:100%; align-items:center; justify-content:center; background:linear-gradient(135deg, rgba(139,92,246,0.35), rgba(236,72,153,0.35)); font-size:11px; font-weight:700; color:#fff;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px; opacity:0.85;"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
        </div>
        <span class="playlist-nav-name">${escapeHtml(p.name)}</span>
        ${badge ? `<span class="playlist-source-tag">${badge}</span>` : ''}
        <span class="nav-count">${count}</span>
      </button>
    `;
  }).join('');

  setupPlaylistSidebarInteractions();
}
window.renderPlaylists = renderPlaylists;

let draggedPlaylistId = null;

function setupPlaylistSidebarInteractions() {
  if (!elements.playlistNavList) return;

  const items = elements.playlistNavList.querySelectorAll('.playlist-nav-item');
  items.forEach(item => {
    const pid = item.getAttribute('data-playlist-id');
    const pl = state.playlists.find(p => p.id === pid);

    // Click to Open Playlist Detail
    item.addEventListener('click', (e) => {
      if (item.classList.contains('dragging-playlist')) return;
      if (pl) openPlaylistDetail(pl);
    });

    // Drag to Reorder Playlists in Sidebar
    item.addEventListener('dragstart', (e) => {
      draggedPlaylistId = pid;
      item.classList.add('dragging-playlist');
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'playlist-reorder', playlistId: pid }));
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      draggedPlaylistId = null;
      items.forEach(it => it.classList.remove('dragging-playlist', 'playlist-drag-over-top', 'playlist-drag-over-bottom', 'drag-target-active'));
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      
      if (draggedPlaylistId) {
        // Playlist reordering indicator
        e.dataTransfer.dropEffect = 'move';
        const rect = item.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
          item.classList.add('playlist-drag-over-top');
          item.classList.remove('playlist-drag-over-bottom');
        } else {
          item.classList.add('playlist-drag-over-bottom');
          item.classList.remove('playlist-drag-over-top');
        }
      } else {
        // Song / Album Ingestion indicator
        e.dataTransfer.dropEffect = 'copy';
        item.classList.add('drag-target-active');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('playlist-drag-over-top', 'playlist-drag-over-bottom', 'drag-target-active');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const isTop = item.classList.contains('playlist-drag-over-top');
      item.classList.remove('playlist-drag-over-top', 'playlist-drag-over-bottom', 'drag-target-active', 'dragging-playlist');

      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const data = JSON.parse(raw);

        // Case 1: Reordering Playlists
        if (data.type === 'playlist-reorder' && data.playlistId) {
          const fromId = data.playlistId;
          const toId = pid;
          if (fromId === toId) return;

          const fromIdx = state.playlists.findIndex(p => p.id === fromId);
          const toIdx = state.playlists.findIndex(p => p.id === toId);
          if (fromIdx >= 0 && toIdx >= 0) {
            const [moved] = state.playlists.splice(fromIdx, 1);
            const insertIdx = isTop ? toIdx : toIdx + 1;
            state.playlists.splice(insertIdx > fromIdx ? insertIdx - 1 : insertIdx, 0, moved);
            
            try {
              setStoredItem('saved_playlists', JSON.stringify(state.playlists));
            } catch (err) {}
            
            renderPlaylists();
          }
          return;
        }

        // Case 2: Ingesting Songs/Albums into Playlist
        if (data.type === 'track' && data.track) {
          addTracksToPlaylistDirect(pid, [data.track]);
        } else if (data.type === 'album' && Array.isArray(data.tracks)) {
          addTracksToPlaylistDirect(pid, data.tracks);
        }
      } catch (err) {
        console.warn('Playlist drop error:', err);
      }
    });
  });
}


// ==========================================================================
// Modern Tabbed Settings & Plex Library Section Manager
// ==========================================================================

// 1. Settings Sidebar Tab Switching & Expandable Sources Menu
window.toggleSourceAccordion = function(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const isCollapsed = card.classList.contains('collapsed');
  card.classList.toggle('collapsed');

  // Update subtab indicator active styling
  document.querySelectorAll('.settings-subtab-btn').forEach(btn => {
    if (btn.getAttribute('data-source-target') === cardId) {
      btn.classList.toggle('active', isCollapsed);
    }
  });
};

document.addEventListener('click', (e) => {
  // Check if arrow toggle on Sources group was clicked
  if (e.target.closest('#sourcesGroupArrow')) {
    e.stopPropagation();
    const group = document.getElementById('settingsSourcesGroup');
    if (group) group.classList.toggle('collapsed');
    return;
  }

  // Settings Top-level tab buttons
  const tabBtn = e.target.closest('.settings-tab-btn');
  if (tabBtn) {
    const targetId = tabBtn.getAttribute('data-tab');
    document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
    tabBtn.classList.add('active');
    const pane = document.getElementById(targetId);
    if (pane) pane.classList.add('active');

    if (targetId === 'tabSources' || targetId === 'tab-plex') {
      loadPlexSections();
    }
    return;
  }

  // Sources Subtab navigation buttons
  const subtabBtn = e.target.closest('.settings-subtab-btn');
  if (subtabBtn) {
    const targetCardId = subtabBtn.getAttribute('data-source-target');
    // Ensure Tab Sources is active
    const tabBtnSources = document.getElementById('tabBtnSources');
    if (tabBtnSources) {
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
      tabBtnSources.classList.add('active');
      const pane = document.getElementById('tabSources');
      if (pane) pane.classList.add('active');
    }

    // Expand the target accordion card
    const targetCard = document.getElementById(targetCardId);
    if (targetCard) {
      targetCard.classList.remove('collapsed');
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    document.querySelectorAll('.settings-subtab-btn').forEach(b => b.classList.remove('active'));
    subtabBtn.classList.add('active');

    if (targetCardId === 'sourceCardPlex') {
      loadPlexSections();
    }
  }
});

// Wire up Host/Plex sync toggles for instant persistence
if (elements.plexViaHostToggle) {
  elements.plexViaHostToggle.addEventListener('change', (e) => {
    setStoredItem('plex_via_host', e.target.checked ? 'true' : 'false');
    saveAllSettings();
    showToast(e.target.checked ? 'Plex wird nun über den Tonarr Host synchronisiert.' : 'Plex wird direkt synchronisiert.');
    loadPlexSections();
  });
}

if (elements.preferPlexMetadataToggle) {
  elements.preferPlexMetadataToggle.addEventListener('change', (e) => {
    setStoredItem('prefer_plex_metadata', e.target.checked ? 'true' : 'false');
    saveAllSettings();
    showToast(e.target.checked ? 'Plex-Metadaten werden bevorzugt.' : 'Lokale ID3-Tags werden bevorzugt.');
  });
}

if (elements.plexAsOnlyPlayerSourceToggle) {
  elements.plexAsOnlyPlayerSourceToggle.addEventListener('change', async (e) => {
    const val = e.target.checked;
    setStoredItem('plex_as_only_player_source', val ? 'true' : 'false');
    if (state.config) state.config.plex_as_only_player_source = val;
    saveAllSettings();
    syncConfigToBackend(true);

    const hostBase = getHostBaseUrl();
    if (hostBase) {
      try {
        await fetch(`${hostBase}/api/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plex_as_only_player_source: val,
            folder_source_for_creator_and_manager_only: val
          })
        });
      } catch (err) {}
    }

    if (val) {
      state.tracks = state.tracks.filter(t => isPlexTrack(t));
      if (state.activeSource === 'local') state.activeSource = 'all';
      showToast('📺 Plex als einzige Player-Quelle aktiviert!');
      if (elements.btnSyncPlexLibrary) {
        elements.btnSyncPlexLibrary.click();
      } else if (hostBase) {
        syncHostLibrary().catch(() => {});
      }
    } else {
      showToast('📁 Lokale Musikordner wieder für Player aktiviert.');
      await scanMusicFolders();
    }
    updateBadgeCounts();
    renderTracksTable();
    renderArtistsGrid();
    renderAlbumsGrid();
  });
}

// 2. Plex Library Section Loader
async function loadPlexSections() {
  const select = document.getElementById('plexSectionSelect');
  if (!select) return;

  if (!select.options || select.options.length <= 1) {
    select.innerHTML = '<option value="">⏳ Lade Musik-Mediatheken...</option>';
  }

  try {
    const res = await fetch(getPlexApiUrl('/api/plex/sections'));
    if (res.ok) {
      const data = await res.json();
      const sections = data.sections || [];
      const selected = String(data.selected_section || getStoredItem('plex_section') || '');

      if (sections.length === 0) {
        select.innerHTML = '<option value="">Keine Musik-Mediathek gefunden</option>';
        return;
      }

      select.innerHTML = sections.map(s => {
        const isSel = String(s.key) === selected ? 'selected' : '';
        return `<option value="${s.key}" ${isSel}>🎵 ${escapeHtml(s.title)} (${escapeHtml(s.type || 'Musik')})</option>`;
      }).join('');

      select.onchange = async () => {
        const chosenKey = select.value;
        if (chosenKey) {
          try {
            setStoredItem('plex_section', chosenKey);
            await fetch(getPlexApiUrl('/api/plex/set-section'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ section_id: chosenKey })
            });
            showToast('✅ Plex-Mediathek ausgewählt! Synchronisiere Songs...');
            if (elements.btnSyncPlexLibrary) elements.btnSyncPlexLibrary.click();
          } catch (e) {
            showToast('Fehler beim Auswählen der Mediathek.');
          }
        }
      };
    } else {
      select.innerHTML = '<option value="">Server nicht erreichbar</option>';
    }
  } catch (err) {
    select.innerHTML = '<option value="">Fehler beim Laden der Mediatheken</option>';
  }
}
window.loadPlexSections = loadPlexSections;

const btnRefreshSections = document.getElementById('btnRefreshPlexSections');
if (btnRefreshSections) {
  btnRefreshSections.addEventListener('click', () => {
    loadPlexSections();
    showToast('🔄 Plex-Mediatheken aktualisiert');
  });
}

// Update Plex connection badge and containers
function updatePlexAuthStatusUI(connected, serverInfo = '') {
  updateAuthUI();
  checkPlexLiveStatus();
}
window.updatePlexAuthStatusUI = updatePlexAuthStatusUI;
