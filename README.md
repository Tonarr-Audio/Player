# SoundSphere Player 🎵

A modern, high-performance web and desktop music player designed for seamless audio playback, synchronized lyrics, and direct integration with your **SoundSphere Host** music server.

---

## ✨ Current Features

- **Host Library Sync & Streaming**:
  - Direct integration with [SoundSphere Host](https://github.com/Tonarr-Audio/Host) via REST API.
  - Full HTTP range-request audio streaming (seekable playback for MP3, FLAC, M4A, OGG, OPUS, WAV).
  - Automatic album artwork extraction and caching.
  - Browse library by **Songs**, **Artists**, **Albums**, and **Playlists**.
  - Instant search across your entire synchronized music collection.
- **Synchronized Lyrics**:
  - Real-time line-by-line synchronized LRC lyrics display.
  - In-player lyrics sidebar and dedicated immersive Fullscreen Lyrics mode.
  - Seamless fallback to online lyrics providers (LRCLIB) when local or embedded lyrics are not present.
- **Audio Controls & 10-Band Equalizer**:
  - Full playback suite: Play, Pause, Previous, Next, Seekbar, Volume control, Shuffle, and Repeat.
  - Built-in Web Audio API **10-Band Equalizer** with presets (*Flat*, *Bass Boost*, *Vocal Boost*, *Rock*, *Pop*, *Electronic*, *Acoustic*).
  - Native **Media Session API** integration (system notification, lock screen controls, and keyboard media keys).
- **Playlists & Queue Management**:
  - Manage and reorder your active playback queue.
  - Favorite tracks with quick access.
- **Glassmorphic Obsidian Design**:
  - Sleek dark aesthetic with dynamic ambient background glow based on album cover colors.
  - Responsive design optimized for both desktop windows and touch screens.
- **Flexible Deployment**:
  - Standalone portable Windows desktop application (`SoundSphere-Player.exe`).
  - Zero-dependency static web application (`index.html`, `app.js`, `style.css`).

---

## 🔮 Upcoming Features *(Coming Soon)*

- [ ] **Audio Spectrum Visualizer** *(Coming Soon)*: Real-time dynamic frequency audio visualizer bars responsive to playback audio data.
- [ ] **Romanization & Furigana** *(Coming Soon)*: Multi-line Japanese (Romaji / Furigana) and Chinese (Pinyin) pronunciation annotations.
- [ ] **Live Lyric Translations** *(Coming Soon)*: Side-by-side synchronized multi-language lyric translations.

---

## 🚀 Getting Started

### 1. Standalone Windows Desktop App (.exe)
Download the latest pre-compiled release from the [Releases](https://github.com/Tonarr-Audio/Player/releases) section:
1. Download `SoundSphere-Player-v1.0.0-windows.zip`.
2. Extract the archive to any folder.
3. Run `SoundSphere-Player.exe`.

### 2. Running as a Web App
SoundSphere Player consists of static web assets (`index.html`, `app.js`, `style.css`). You can open `index.html` directly in any modern browser or serve it using any HTTP server:
```bash
python -m http.server 8080
```
Then navigate to `http://localhost:8080` in your browser.

---

## ⚙️ Connecting to SoundSphere Host

To stream music and fetch artwork/lyrics from your server:
1. Open **Settings** (⚙️ gear icon) in the Player.
2. In the **SoundSphere Host** section:
   - Enter your **Host URL** (e.g. `http://192.168.1.100:8765` or your domain).
   - Enter your **API Token** (if authentication is enabled on the host).
3. Click **Verbindung testen** (Test Connection) to verify reachability.
4. Click **Bibliothek synchronisieren** (Sync Library) to import your tracks.

---

## 🛠️ Project Structure

```
.
├── index.html        # Main player layout and modal dialogs
├── app.js            # Playback engine, Web Audio equalizer, lyrics sync & Host client
├── style.css         # Modern glassmorphic styles and animations
└── README.md
```

---

## 📄 License
MIT License. Part of the [Tonarr-Audio](https://github.com/Tonarr-Audio) ecosystem.
