# ![NeoPasture Logo](static/assets/Images/logo.jpeg) NeoPasture — Virtual Fencing System

> ⚠️ **This is a prototype system developed for NeoPasture.**
> It is intended for demonstration, research, and development purposes only and does not represent a production-ready deployment.

A real-time IoT livestock management dashboard built with **Flask**, **Leaflet.js**, and **Server-Sent Events (SSE)**. Simulates a herd of animals inside a configurable geofenced paddock, with live status monitoring, heatmap pasture tracking, and a feedback-loop correction system.

---

## 📋 Table of Contents

1. [Features](#features)
2. [Project Structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Installation & Setup](#installation--setup)
5. [Configuration](#configuration)
   - [Changing the Fence Location](#changing-the-fence-location)
   - [Changing the Fence Size](#changing-the-fence-size)
6. [Running the Application](#running-the-application)
7. [Using the Dashboard](#using-the-dashboard)
8. [API Reference](#api-reference)
9. [System Architecture](#system-architecture)
10. [How the Feedback Loop Works](#how-the-feedback-loop-works)
11. [Troubleshooting](#troubleshooting)

---

## ✨ Features

| Feature | Description |
|---|---|
| **Live Animal Tracking** | 10 livestock markers (ID-100 to ID-109) updated in real-time via SSE |
| **Virtual Fence** | Rectangular geofence with a 10% inner warning buffer zone |
| **Feedback Loop** | Green → Yellow → Red status progression based on boundary violations |
| **Heatmap** | Leaflet.heat pasture-depletion map built from animal movement history |
| **Draw Tool** | Redraw or resize the fence live on the map using Leaflet.draw |
| **Speed Control** | Slider to accelerate or decelerate the simulation (0.1× – 5×) |
| **Event Log** | Colour-coded sidebar log of all status change events |
| **Dark Dashboard** | Industrial monospace dark UI theme |

---

## 📁 Project Structure

```
neopasture/
│
├── app.py                  ← Flask server: routes, SSE stream, REST endpoints
├── simulation.py           ← Core logic: VirtualFence, Animal, HerdSimulator
├── requirements.txt        ← Python dependencies
│
├── templates/
│   └── index.html          ← Main dashboard HTML (Jinja2 template)
│
└── static/
    ├── css/
    │   └── style.css       ← Dark industrial theme (IBM Plex Mono)
    └── js/
        └── app.js          ← Leaflet map, SSE client, API calls, heatmap
```

---

## 🔧 Prerequisites

- **Python 3.8+**
- **pip** (Python package manager)
- A modern web browser (Chrome, Firefox, Edge)
- Internet connection (for map tiles and CDN libraries)

---

## 🚀 Installation & Setup

### 1. Download / Clone the project

```bash
# If using git:
git clone <your-repo-url> neopasture
cd neopasture

# Or simply unzip the downloaded archive:
unzip NeoPasture_Virtual_Fencing.zip
cd neopasture
```

### 2. (Recommended) Create a virtual environment

```bash
python -m venv venv

# Activate on Windows:
venv\Scripts\activate

# Activate on macOS/Linux:
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

`requirements.txt` contains:
```
flask>=3.0.0
```

---

## ⚙️ Configuration

All key settings live at the **top of `app.py`** — no other files need editing for basic configuration.

### Changing the Fence Location

Open `app.py` and edit these two lines:

```python
FENCE_CENTER_LAT =  6.8194   # latitude  in decimal degrees (N = positive)
FENCE_CENTER_LNG =  3.9173   # longitude in decimal degrees (E = positive)
```

| Region | Latitude | Longitude |
|---|---|---|
| Lagos, Nigeria (default) | 6.8194 | 3.9173 |
| Abuja, Nigeria | 9.0765 | 7.3986 |
| Nairobi, Kenya | -1.2921 | 36.8219 |
| London, UK | 51.5074 | -0.1278 |

> **Tip:** Find coordinates for any location at [maps.google.com](https://maps.google.com) — right-click any point and select the coordinates shown.

---

### Changing the Fence Size

Also in `app.py`, edit these two lines (values are in **metres**):

```python
FENCE_WIDTH_M  = 800   # east-west  width  in metres
FENCE_HEIGHT_M = 600   # north-south height in metres
```

The system automatically converts metres to the correct degree offsets using the cosine correction for your latitude, so the fence is always accurate regardless of location.

**Reference sizes:**

| Paddock Type | Width | Height |
|---|---|---|
| Small trial paddock | 200 m | 150 m |
| Standard paddock (default) | 800 m | 600 m |
| Large ranch section | 2000 m | 1500 m |
| Full farm boundary | 5000 m | 4000 m |

> **Note:** If you resize the fence while the simulation is running, animals near the old boundary will be automatically clamped inside the new fence.

---

### Changing the Herd Size

Open `simulation.py` and edit line 149:

```python
HERD_SIZE = 10   # change this number (e.g. 5, 15, 20)
```

Animal IDs are automatically assigned starting from ID-100. A herd of 15 would produce ID-100 through ID-114.

---

## ▶️ Running the Application

```bash
python app.py
```

You should see:
```
🐄  NeoPasture Virtual Fencing System starting…
    Open http://127.0.0.1:5000 in your browser
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.

To stop the server, press `Ctrl + C` in the terminal.

---

## 🖥 Using the Dashboard

### Map Area (right panel)

| Action | How |
|---|---|
| **Pan the map** | Click and drag |
| **Zoom in/out** | Scroll wheel or `+` / `−` buttons |
| **Draw a new fence** | Click the rectangle tool (top-left toolbar) and drag to draw |
| **Edit the fence** | Click the edit (pencil) tool, drag the fence handles, then click Save |
| **View animal details** | Click any coloured dot to see its ID, status, and coordinates |
| **Toggle heatmap** | Click the **🌡 Heatmap ON/OFF** button (bottom-right) |

### Sidebar (left panel)

| Section | Description |
|---|---|
| **Live Herd** | One card per animal showing current status and GPS coordinates |
| **Simulation Speed** | Drag the slider to speed up or slow down all animal movement |
| **Active Fence Bounds** | Live display of the current fence corners in decimal degrees |
| **Status Legend** | Colour key for Green / Yellow / Red states |
| **Event Log** | Timestamped log of every status change, newest first |

### Fence Lines on the Map

| Line style | Meaning |
|---|---|
| Solid blue `━━` | Outer fence boundary — animals must stay inside |
| Dashed yellow `╌╌` | Warning buffer boundary — 10% inset from the outer fence |

---

## 🔌 API Reference

The Flask backend exposes three endpoints:

### `GET /api/state`
**SSE stream** — returns a continuous stream of simulation snapshots.

**Response format (JSON, pushed every ~0.8 s):**
```json
{
  "tick": 142,
  "speed": 1.0,
  "fence": {
    "south": 6.8167, "west": 3.9137,
    "north": 6.8221, "east": 3.9209,
    "buf_south": 6.8173, "buf_west": 3.9144,
    "buf_north": 6.8215, "buf_east": 3.9202
  },
  "animals": [
    { "id": "ID-100", "lat": 6.8190, "lng": 3.9165, "status": "Green (Safe)", "color": "#22c55e" }
  ],
  "heatmap": [[6.8190, 3.9165, 0.5], ...]
}
```

---

### `POST /api/fence`
**Update fence bounds** in real-time.

**Request body:**
```json
{ "south": 6.8167, "west": 3.9137, "north": 6.8221, "east": 3.9209 }
```

**Response:**
```json
{ "status": "ok", "fence": { ... } }
```

**Error (invalid bounds):**
```json
{ "error": "Invalid bounds: south must be < north and west must be < east" }
```

---

### `POST /api/speed`
**Update simulation speed** without restarting.

**Request body:**
```json
{ "speed": 2.5 }
```

Speed is clamped to the range `0.1` – `5.0`.

**Response:**
```json
{ "status": "ok", "speed": 2.5 }
```

---

## 🏗 System Architecture

```
Browser
  │
  ├── GET /              → renders index.html (Jinja2)
  │
  ├── GET /api/state     → SSE stream (JSON push every 0.8 s)
  │     └── EventSource listener in app.js
  │           ├── updates Leaflet markers
  │           ├── redraws fence rectangles
  │           ├── refreshes heatmap layer
  │           └── updates sidebar cards + event log
  │
  ├── POST /api/fence    → called by Leaflet.draw on edit/create
  │
  └── POST /api/speed    → called by speed slider (debounced 200 ms)

Flask (app.py)
  │
  ├── Background thread  → calls simulator.tick() in a loop
  │
  └── HerdSimulator (simulation.py)
        ├── VirtualFence  → boundary math + buffer computation
        └── Animal ×10    → random-walk movement + status state machine
```

---

## 🔄 How the Feedback Loop Works

Each simulation tick, every animal goes through this decision tree:

```
Is the animal inside the inner (safe) zone?
  YES → status = Green (Safe)   | outside_ticks reset to 0
  NO  → Is it still inside the outer fence boundary?
          YES → status = Yellow (Warning) | outside_ticks reset to 0
          NO  → outside_ticks += 1
                  outside_ticks < 2  → status = Yellow (Warning)
                  outside_ticks >= 2 → status = Red (Correction)
```

| Status | Colour | Meaning |
|---|---|---|
| Green (Safe) | 🟢 `#22c55e` | Animal is well within the safe inner zone |
| Yellow (Warning) | 🟡 `#eab308` | Animal is in the 10% buffer — approaching the boundary |
| Red (Correction) | 🔴 `#ef4444` | Animal has been outside the fence for 2+ consecutive ticks |

In a real deployment, the **Red** state would trigger a haptic/audio correction signal on a physical livestock collar.

---

## 🛠 Troubleshooting

**Map tiles not loading**
The map uses OpenStreetMap tiles which require an internet connection. If you're offline, the animal markers and fence will still work but the background map will be blank.

**Animals not visible on screen**
The fence may be outside your current map view. Zoom out, or redraw a new rectangle in your visible area — the backend will immediately move the simulation to match.

**Port 5000 already in use**
Edit the last line of `app.py`:
```python
app.run(debug=False, threaded=True, port=5001)  # change to any free port
```

**SSE stream disconnects**
The client automatically reconnects after 3 seconds. Check the Event Log sidebar for a "SSE stream error – retrying…" message.

**`ModuleNotFoundError: No module named 'flask'`**
You may be outside your virtual environment. Re-run:
```bash
source venv/bin/activate   # macOS/Linux
venv\Scripts\activate      # Windows
pip install -r requirements.txt
```

---

## 📄 License

This project is a **prototype built for NeoPasture**. It is released for educational, research, and internal demonstration purposes. All simulation logic, UI, and system design are property of the NeoPasture project. Adapt freely for further development within the NeoPasture platform.