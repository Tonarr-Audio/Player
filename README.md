# SoundSphere Player 🎵

A modern, high-performance web and desktop music player built for seamless playback, dynamic audio visualizations, and advanced synchronized lyrics display (including Romanization, Furigana, and multi-language translations).

SoundSphere Player connects natively to your **SoundSphere Host** instance to stream your music library, access high-resolution artwork, and fetch synchronized lyrics in real time.

---

## ✨ Features

- **Host Library Sync**: Direct integration with [SoundSphere Host](https://github.com/Tonarr-Audio/Host) via REST API. Stream your high-fidelity music library anywhere on your home network or across the web.
- **Synchronized Lyrics**:
  - Word-by-word and line-by-line sync.
  - Multi-line romanization (Romaji / Pinyin) & Furigana annotations.
  - Side-by-side translation support.
  - Direct lyrics fallback to LRCLIB, NetEase, and QQ Music.
- **Audio Visualizer**: High-framerate canvas audio visualizers responsive to playback frequencies.
- **Clean & Responsive UI**: Glassmorphic dark design optimized for desktop screens and touch interfaces.
- **Desktop & Web Ready**: Run as a standalone Windows desktop app (`SoundSphere-Player.exe`) or host as a lightweight static web application.

---

## 🚀 Getting Started

### 1. Standalone Windows Desktop App (.exe)
Download the latest pre-compiled release from the [Releases](https://github.com/Tonarr-Audio/Player/releases) section:
1. Download `SoundSphere-Player-v1.0.0-windows.zip`.
2. Extract the archive.
3. Run `SoundSphere-Player.exe`.

### 2. Running as a Web App
SoundSphere Player consists of static web assets (`index.html`, `app.js`, `style.css`). You can open `index.html` directly in any modern browser or host it with any static web server (such as Nginx, Caddy, or Python `http.server`):
```bash
python -m http.server 8080
```
Then visit `http://localhost:8080` in your browser.

---

## ⚙️ Connecting to SoundSphere Host

To stream music and fetch artwork/lyrics from your server:
1. Open **Settings** (⚙️ gear icon) in the Player.
2. In the **SoundSphere Host** section:
   - Enter your **Host URL** (e.g. `http://192.168.1.100:8765` or your domain).
   - Enter your **API Token** (if configured on the host).
3. Click **Verbindung testen** (Test Connection) to verify the connection.
4. Click **Bibliothek synchronisieren** (Sync Library) to load all tracks from your Host library.

---

## 🛠️ Project Structure

```
.
├── index.html        # Main player UI layout and modal dialogs
├── app.js            # Core playback, audio engine, lyrics sync & Host API client
├── style.css         # Modern glassmorphic styles and animations
└── README.md
```

---

## 📄 License
MIT License. Part of the [Tonarr-Audio](https://github.com/Tonarr-Audio) ecosystem.
