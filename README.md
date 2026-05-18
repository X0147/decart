# 🎭 Decart Realtime Studio — NDI & OBS Integration Workspace

Welcome to the ultimate low-latency, real-time video transformation studio powered by **Decart's Lucy-2.1** models. This workspace pipes live video streams (from your camera, virtual camera, or NDI sources), processes them through state-of-the-art AI style transformation, and feeds them back into OBS Studio or network-connected NDI receivers.

---

## 🏗️ Architectural Layout

Depending on your production and hardware pipeline, you can run this workspace in two modes:

```
        ┌────────────────────────────────────────────────────────┐
        │            MODE 1: Browser-based WebRTC Studio         │
        └────────────────────────────────────────────────────────┘
 [OBS Virtual Cam] ──> (Local Web App) ── WebRTC ──> [Decart Realtime API]
                                                            │
 [OBS Scene Capture] <── (Fullscreen Video Feed) <──────────┘

        ┌────────────────────────────────────────────────────────┐
        │         MODE 2: High-Performance Python NDI Bridge     │
        └────────────────────────────────────────────────────────┘
 [OBS NDI Broadcast] ── NDI ──> (Python Bridge) ── WebRTC ──> [Decart API]
                                                                  │
 [OBS NDI Source] <── NDI (Decart Output Stream) <────────────────┘
```

---

## ⚡ Mode 1: Interactive Browser-based Studio (Recommended)

This is the fastest, lowest latency, and most robust setup. It runs locally inside a premium web interface.

### 1. Launch the Studio
The local web server is automatically running in your workspace!
*   **Web URL:** Open **[http://localhost:8000](http://localhost:8000)** in your browser.
*   **Secure API Entry:** Enter your Decart API key in the credentials input. It will be saved securely in your browser's local storage.

### 2. OBS Video Pipeline Configuration
1.  Open **OBS Studio**.
2.  Set up your scene (camera, capture cards, desktop window, etc.).
3.  Click **Start Virtual Camera** in the OBS Control panel (bottom right).
4.  In the Decart Studio web app, select **OBS Virtual Camera** from the video source dropdown.
5.  Click **Start Connection**!
6.  **Piping Transformed Video Back into OBS:**
    *   Click **Fullscreen** on the remote output card in the web app.
    *   In OBS Studio, add a **Window Capture** source and select your web browser window.

---

## 🐍 Mode 2: Bidirectional Python NDI Bridge

For heavy-duty, headless, or local-network broadcast pipelines, use the Python script to intercept NDI network streams and broadcast the AI-transformed output.

### 1. Installation
Ensure your Python environment has the correct dependencies installed:
```bash
python3 -m pip install ndi-python aiortc av numpy decart
```

### 2. Usage
Run the bridge script specifying your target NDI input stream and transformation prompt:
```bash
python3 decart_ndi_bridge.py --api-key "YOUR-DECART-API-KEY" --source "OBS" --prompt "A beautiful Japanese anime style painting, vibrant colors"
```

Once active, it will:
1. Scan your network for NDI sources matching `"OBS"`.
2. Connect and route video frames via a custom `aiortc` media track.
3. Broadcast the returned styled stream as a new network NDI source named **`Decart AI Transformed`**.
4. In OBS, simply add an **NDI Source** and choose `Decart AI Transformed` from the list.

---

## 💻 DistroAV (obs-ndi) & NDI Runtime macOS Setup

If you experience network throttling or speed issues using Homebrew to install the OBS NDI plugin, you can install the universal packages manually:

### Option A: Manual Direct Installers (Recommended & Fast)
1.  **NDI 6 Runtime:** Download and install [NDIRedistV6Apple.pkg](http://ndi.link/NDIRedistV6Apple).
2.  **DistroAV OBS Plugin:** Download and install [distroav-6.2.1-macos-universal.pkg](https://github.com/DistroAV/DistroAV/releases/download/6.2.1/distroav-6.2.1-macos-universal.pkg).
3.  **Restart your Mac** to initialize background network daemons.

### Option B: Homebrew Install
```bash
brew install --cask distroav/distroav/distroav
```

---

## 📁 Workspace Contents

*   📂 **`index.html`** — The premium UI layout built with fluid semantic HTML and live statistics indicators.
*   📂 **`style.css`** — High-fidelity custom dark-mode design system with glowing glassmorphic panels and subtle load micro-animations.
*   📂 **`app.js`** — Main interactive logic featuring local camera polling, local storage keys, custom terminal logging, and native WebRTC fallback handlers.
*   📂 **`decart_ndi_bridge.py`** — Bidirectional NDI-to-NDI broadcast wrapper integrating `NDIlib` with Decart WebRTC endpoints.

---

## 💡 Performance Optimization & Best Practices

> [!IMPORTANT]
> **Bandwidth Constraints:** High-quality realtime video inference relies heavily on stable upload speeds. If you experience visual lag or dropped frames:
> *   **Reduce Resolution:** In the sidebar, select **640x360 (Fast)**.
> *   **Reduce Frame Rate:** Drop the target framerate to **15 FPS**.
> *   **Turn off Audio:** If audio is not required, untick "Transmit Audio Track" to conserve bandwidth.
