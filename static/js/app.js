

// ── State ─────────────────────────────────────────────────────────────────
const animalMarkers  = {};
const animalStatuses = {};        // track previous status for log deduplication
let   heatLayer      = null;
let   heatmapOn      = true;
let   fenceRect      = null;
let   drawControl    = null;
let   lastState      = null;

// ── Map init ──────────────────────────────────────────────────────────────
const map = L.map('map', {
  center: [6.8194, 3.9173],
  zoom: 14,
  zoomControl: true,
  attributionControl: true,
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

// ── Layers ────────────────────────────────────────────────────────────────
const animalLayer = L.layerGroup().addTo(map);
const fenceLayer  = L.featureGroup().addTo(map);

// ── Fence rendering ───────────────────────────────────────────────────────
function drawFence(fence) {
  fenceLayer.clearLayers();

  // Outer boundary
  L.rectangle(
    [[fence.south, fence.west], [fence.north, fence.east]],
    { color: '#38bdf8', weight: 2, fillOpacity: 0.04, dashArray: '4,4' }
  ).addTo(fenceLayer);

  // Warning buffer inner boundary
  L.rectangle(
    [[fence.buf_south, fence.buf_west], [fence.buf_north, fence.buf_east]],
    { color: '#eab308', weight: 1.5, fillOpacity: 0, dashArray: '2,6' }
  ).addTo(fenceLayer);
}

// ── Leaflet.draw setup ────────────────────────────────────────────────────
function initDrawControl() {
  if (drawControl) map.removeControl(drawControl);

  drawControl = new L.Control.Draw({
    draw: {
      rectangle: {
        shapeOptions: { color: '#38bdf8', weight: 2, fillOpacity: 0.06 },
      },
      polyline: false, polygon: false, circle: false,
      circlemarker: false, marker: false,
    },
    edit: { featureGroup: fenceLayer, remove: false },
  });
  map.addControl(drawControl);
}

initDrawControl();

// When a new rectangle is drawn
map.on(L.Draw.Event.CREATED, (e) => {
  if (e.layerType !== 'rectangle') return;
  const b = e.layer.getBounds();
  postFence(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
});

// When the existing fence rectangle is edited
map.on(L.Draw.Event.EDITED, (e) => {
  e.layers.eachLayer((layer) => {
    if (layer instanceof L.Rectangle) {
      const b = layer.getBounds();
      postFence(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
    }
  });
});

// ── API: POST fence ───────────────────────────────────────────────────────
async function postFence(south, west, north, east) {
  try {
    const res = await fetch('/api/fence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ south, west, north, east }),
    });
    const data = await res.json();
    if (!res.ok) console.error('Fence error:', data.error);
    else appendLog('system', `Fence updated: [${south.toFixed(4)}, ${west.toFixed(4)}] → [${north.toFixed(4)}, ${east.toFixed(4)}]`);
  } catch (err) {
    console.error('Fence POST failed:', err);
  }
}

// ── API: POST speed ───────────────────────────────────────────────────────
const speedSlider  = document.getElementById('speed-slider');
const speedDisplay = document.getElementById('speed-display');

speedSlider.addEventListener('input', () => {
  const v = parseFloat(speedSlider.value);
  speedDisplay.textContent = `${v.toFixed(1)}×`;
  debouncedSpeedPost(v);
});

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const debouncedSpeedPost = debounce(async (speed) => {
  try {
    await fetch('/api/speed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed }),
    });
  } catch (err) { console.error('Speed POST failed:', err); }
}, 200);

// ── Heatmap ───────────────────────────────────────────────────────────────
const heatBtn = document.getElementById('heat-toggle');
heatBtn.addEventListener('click', () => {
  heatmapOn = !heatmapOn;
  heatBtn.classList.toggle('active', heatmapOn);
  heatBtn.textContent = heatmapOn ? '🌡 Heatmap ON' : '🌡 Heatmap OFF';
  if (!heatmapOn && heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
});

function updateHeatmap(points) {
  if (!heatmapOn) return;
  if (heatLayer) map.removeLayer(heatLayer);
  heatLayer = L.heatLayer(points, {
    radius: 22, blur: 18, maxZoom: 17,
    gradient: { 0.2: '#064e3b', 0.5: '#a16207', 0.8: '#b91c1c' },
  }).addTo(map);
}

// ── Animal markers ────────────────────────────────────────────────────────
function getMarkerIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px; height:14px; border-radius:50%;
      background:${color};
      border:2px solid rgba(255,255,255,0.4);
      box-shadow:0 0 10px ${color}88;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function updateAnimalMarkers(animals) {
  animals.forEach((a) => {
    const statusKey = statusClass(a.status);

    if (!animalMarkers[a.id]) {
      const marker = L.marker([a.lat, a.lng], { icon: getMarkerIcon(a.color) });
      marker.bindPopup('');
      marker.addTo(animalLayer);
      animalMarkers[a.id] = marker;
    }

    const m = animalMarkers[a.id];
    m.setLatLng([a.lat, a.lng]);
    m.setIcon(getMarkerIcon(a.color));
    m.setPopupContent(`
      <div class="popup-id">${a.id}</div>
      <div style="color:${a.color}">${a.status}</div>
      <div style="color:#5d8aa0;font-size:11px">${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}</div>
    `);

    // Log state changes
    if (animalStatuses[a.id] !== a.status) {
      if (a.status !== 'Green (Safe)') {
        appendLog(statusKey, `${a.id} → ${a.status}`);
      }
      animalStatuses[a.id] = a.status;
    }

    // Update sidebar card
    updateSidebarCard(a, statusKey);
  });
}

// ── Sidebar card update ───────────────────────────────────────────────────
function statusClass(status) {
  if (status.includes('Green'))  return 'green';
  if (status.includes('Yellow')) return 'yellow';
  if (status.includes('Red'))    return 'red';
  return 'green';
}

function updateSidebarCard(a, cls) {
  const card = document.getElementById(`card-${a.id}`);
  if (!card) return;
  card.className = `animal-card status-${cls}`;
  const dot = card.querySelector('.animal-dot');
  dot.style.background  = a.color;
  dot.style.boxShadow   = `0 0 6px ${a.color}`;
  card.querySelector('.animal-status').textContent = a.status;
  card.querySelector('.animal-coords').textContent  = `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}`;
}

// ── Event log ─────────────────────────────────────────────────────────────
const log = document.getElementById('event-log');
const MAX_LOG = 120;

function appendLog(cls, msg) {
  const now = new Date();
  const ts  = now.toTimeString().slice(0, 8);
  const el  = document.createElement('div');
  el.className = `log-entry ${cls}`;
  el.innerHTML = `<span class="log-time">${ts}</span><span class="log-msg">${msg}</span>`;
  log.prepend(el);
  // Trim log
  while (log.children.length > MAX_LOG) log.removeChild(log.lastChild);
}

// ── Sidebar cards builder ─────────────────────────────────────────────────
function buildSidebarCards(animals) {
  const grid = document.getElementById('animal-grid');
  if (grid.children.length === animals.length) return; // already built

  grid.innerHTML = '';
  animals.forEach((a) => {
    const div = document.createElement('div');
    div.className = 'animal-card status-green';
    div.id = `card-${a.id}`;
    div.innerHTML = `
      <div class="animal-dot" style="background:#22c55e;box-shadow:0 0 6px #22c55e"></div>
      <div style="flex:1">
        <div class="animal-id">${a.id}</div>
        <div class="animal-coords">---, ---</div>
      </div>
      <div class="animal-status">Green (Safe)</div>
    `;
    grid.appendChild(div);
  });
}

// ── Fence coord display ───────────────────────────────────────────────────
function updateCoordDisplay(fence) {
  document.getElementById('f-south').textContent = fence.south.toFixed(4);
  document.getElementById('f-west').textContent  = fence.west.toFixed(4);
  document.getElementById('f-north').textContent = fence.north.toFixed(4);
  document.getElementById('f-east').textContent  = fence.east.toFixed(4);
}

// ── SSE stream ────────────────────────────────────────────────────────────
const tickEl = document.getElementById('tick-counter');

function startStream() {
  const es = new EventSource('/api/state');

  es.onmessage = (evt) => {
    const state = JSON.parse(evt.data);
    lastState   = state;

    // Tick counter
    tickEl.textContent = `TICK #${state.tick.toString().padStart(5, '0')}`;

    // Build sidebar on first message
    buildSidebarCards(state.animals);

    // Fence
    drawFence(state.fence);
    updateCoordDisplay(state.fence);

    // Animals
    updateAnimalMarkers(state.animals);

    // Heatmap
    updateHeatmap(state.heatmap);
  };

  es.onerror = () => {
    appendLog('red', 'SSE stream error – retrying…');
    es.close();
    setTimeout(startStream, 3000);
  };
}

// ── Boot ──────────────────────────────────────────────────────────────────
appendLog('system', 'NeoPasture system online');
appendLog('system', 'Draw a rectangle on the map to redefine the fence');
startStream();