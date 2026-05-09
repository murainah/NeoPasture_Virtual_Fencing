import time
import json
import threading
from flask import Flask, render_template, jsonify, request, Response, stream_with_context
from simulation import VirtualFence, HerdSimulator

# ── Fence configuration ───────────────────────────────────────────────────
# Centre point (decimal degrees)
FENCE_CENTER_LAT =  6.8194   # 6.8194 N
FENCE_CENTER_LNG =  3.9173   # 3.9173 E

# Fence dimensions in metres  <-- CHANGE THESE to resize the paddock
FENCE_WIDTH_M  = 800   # east-west  width  in metres
FENCE_HEIGHT_M = 600   # north-south height in metres

import math as _math
_LAT_DEG_PER_M = 1 / 111_320
_LNG_DEG_PER_M = 1 / (111_320 * _math.cos(_math.radians(FENCE_CENTER_LAT)))

_half_h = (FENCE_HEIGHT_M / 2) * _LAT_DEG_PER_M
_half_w = (FENCE_WIDTH_M  / 2) * _LNG_DEG_PER_M

DEFAULT_FENCE = VirtualFence(
    south = FENCE_CENTER_LAT - _half_h,
    west  = FENCE_CENTER_LNG - _half_w,
    north = FENCE_CENTER_LAT + _half_h,
    east  = FENCE_CENTER_LNG + _half_w,
)

app = Flask(__name__)
simulator = HerdSimulator(DEFAULT_FENCE)

# ── Background simulation loop ────────────────────────────────────────────
TICK_INTERVAL = 0.8  # seconds between ticks at speed=1

def simulation_loop():
    while True:
        simulator.tick()
        interval = TICK_INTERVAL / max(0.1, simulator.speed)
        time.sleep(interval)

thread = threading.Thread(target=simulation_loop, daemon=True)
thread.start()

# ── Routes ────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/state")
def get_state():
    """SSE endpoint: streams simulation state as JSON events."""
    def generate():
        while True:
            state = simulator.get_state()
            yield f"data: {json.dumps(state)}\n\n"
            time.sleep(0.8)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/fence", methods=["POST"])
def update_fence():
    """Update the virtual fence boundary in real-time."""
    data = request.get_json(force=True)
    try:
        south = float(data["south"])
        west  = float(data["west"])
        north = float(data["north"])
        east  = float(data["east"])
    except (KeyError, TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    if south >= north or west >= east:
        return jsonify({"error": "Invalid bounds: south must be < north and west must be < east"}), 400

    simulator.update_fence(south, west, north, east)
    return jsonify({"status": "ok", "fence": simulator.fence.to_dict()})


@app.route("/api/speed", methods=["POST"])
def update_speed():
    """Update simulation speed (0.1 – 5.0×)."""
    data = request.get_json(force=True)
    try:
        speed = float(data["speed"])
    except (KeyError, TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    simulator.set_speed(speed)
    return jsonify({"status": "ok", "speed": simulator.speed})


if __name__ == "__main__":
    print(" NeoPasture Virtual Fencing System starting…")
    print("    Open http://127.0.0.1:5000 in your browser")
    app.run(debug=False, threaded=True, port=5001)