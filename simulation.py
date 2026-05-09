import random
import math
import time
from threading import Lock

class VirtualFence:
    """Handles geofencing logic for a rectangular boundary with a 10% warning buffer."""

    def __init__(self, south, west, north, east):
        self.update(south, west, north, east)

    def update(self, south, west, north, east):
        self.south = south
        self.west = west
        self.north = north
        self.east = east
        self._compute_buffer()

    def _compute_buffer(self):
        lat_range = self.north - self.south
        lng_range = self.east - self.west
        buffer_lat = lat_range * 0.1 
        buffer_lng = lng_range * 0.1
        self.buf_south = self.south + buffer_lat
        self.buf_north = self.north - buffer_lat
        self.buf_west = self.west + buffer_lng
        self.buf_east = self.east - buffer_lng

    def center(self):
        return (
            (self.south + self.north) / 2,
            (self.west + self.east) / 2,
        )

    def contains(self, lat, lng):
        return self.south <= lat <= self.north and self.west <= lng <= self.east

    def in_buffer(self, lat, lng):
        """Returns True if inside outer boundary but outside inner (safe) zone."""
        in_outer = self.contains(lat, lng)
        in_inner = (self.buf_south <= lat <= self.buf_north and
                    self.buf_west <= lng <= self.buf_east)
        return in_outer and not in_inner

    def in_safe_zone(self, lat, lng):
        return (self.buf_south <= lat <= self.buf_north and
                self.buf_west <= lng <= self.buf_east)

    def clamp_to_fence(self, lat, lng):
        lat = max(self.south, min(self.north, lat))
        lng = max(self.west, min(self.east, lng))
        return lat, lng

    def to_dict(self):
        return {
            "south": self.south, "west": self.west,
            "north": self.north, "east": self.east,
            "buf_south": self.buf_south, "buf_west": self.buf_west,
            "buf_north": self.buf_north, "buf_east": self.buf_east,
        }


class Animal:
    """Represents a single livestock marker with state tracking."""

    STATUS_GREEN  = "Green (Safe)"
    STATUS_YELLOW = "Yellow (Warning)"
    STATUS_RED    = "Red (Correction)"

    COLOR_MAP = {
        STATUS_GREEN:  "#22c55e",
        STATUS_YELLOW: "#eab308",
        STATUS_RED:    "#ef4444",
    }

    def __init__(self, animal_id, lat, lng):
        self.id = animal_id
        self.lat = lat
        self.lng = lng
        self.status = self.STATUS_GREEN
        self.color = self.COLOR_MAP[self.STATUS_GREEN]
        self.outside_ticks = 0
        self.history = [(lat, lng)]  # for heatmap
        self.vx = random.uniform(-0.0002, 0.0002)  # velocity
        self.vy = random.uniform(-0.0002, 0.0002)

    def update_status(self, fence: VirtualFence):
        if fence.in_safe_zone(self.lat, self.lng):
            self.outside_ticks = 0
            self.status = self.STATUS_GREEN
        elif fence.in_buffer(self.lat, self.lng):
            self.outside_ticks = 0
            self.status = self.STATUS_YELLOW
        else:
            self.outside_ticks += 1
            if self.outside_ticks >= 2:
                self.status = self.STATUS_RED
            else:
                self.status = self.STATUS_YELLOW
        self.color = self.COLOR_MAP[self.status]

    def move(self, fence: VirtualFence, speed: float):
        # Random walk with slight attraction to center when near edge
        cx, cy = fence.center()
        attract_x = (cy - self.lng) * 0.0001
        attract_y = (cx - self.lat) * 0.0001

        self.vx += random.uniform(-0.0003, 0.0003) * speed + attract_x * 0.3
        self.vy += random.uniform(-0.0003, 0.0003) * speed + attract_y * 0.3

        # Dampen velocity
        self.vx *= 0.85
        self.vy *= 0.85

        # Clamp max speed
        max_v = 0.0008 * speed
        self.vx = max(-max_v, min(max_v, self.vx))
        self.vy = max(-max_v, min(max_v, self.vy))

        self.lat += self.vy
        self.lng += self.vx

        # Keep within outer fence with bounce
        if self.lat < fence.south or self.lat > fence.north:
            self.vy *= -0.6
            self.lat, self.lng = fence.clamp_to_fence(self.lat, self.lng)
        if self.lng < fence.west or self.lng > fence.east:
            self.vx *= -0.6
            self.lat, self.lng = fence.clamp_to_fence(self.lat, self.lng)

        self.history.append((self.lat, self.lng))
        if len(self.history) > 200:
            self.history.pop(0)

    def to_dict(self):
        return {
            "id": self.id,
            "lat": round(self.lat, 6),
            "lng": round(self.lng, 6),
            "status": self.status,
            "color": self.color,
        }


class HerdSimulator:
    """Simulates 10 livestock animals (ID-100 to ID-109) moving within a VirtualFence."""

    HERD_SIZE = 10

    def __init__(self, fence: VirtualFence):
        self.fence = fence
        self.speed = 1.0
        self.lock = Lock()
        self.tick_count = 0
        clat, clng = fence.center()
        self.animals = [
            Animal(f"ID-{100 + i}",
                   clat + random.uniform(-0.003, 0.003),
                   clng + random.uniform(-0.003, 0.003))
            for i in range(self.HERD_SIZE)
        ]

    def update_fence(self, south, west, north, east):
        with self.lock:
            self.fence.update(south, west, north, east)
            # Re-clamp all animals to new fence
            for animal in self.animals:
                animal.lat, animal.lng = self.fence.clamp_to_fence(animal.lat, animal.lng)

    def set_speed(self, speed: float):
        with self.lock:
            self.speed = max(0.1, min(5.0, float(speed)))

    def tick(self):
        with self.lock:
            self.tick_count += 1
            for animal in self.animals:
                animal.move(self.fence, self.speed)
                animal.update_status(self.fence)

    def get_state(self):
        with self.lock:
            return {
                "tick": self.tick_count,
                "speed": self.speed,
                "fence": self.fence.to_dict(),
                "animals": [a.to_dict() for a in self.animals],
                "heatmap": [
                    [lat, lng, 0.5]
                    for a in self.animals
                    for lat, lng in a.history[-50:]
                ],
            }