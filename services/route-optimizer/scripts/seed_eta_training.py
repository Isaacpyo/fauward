"""
Seed the ETA model with synthetic UK delivery trip data.
Generates realistic routes across London, Birmingham, Manchester, Leeds, Bristol.

Usage:
    python scripts/seed_eta_training.py --url https://fauward-production-e19b.up.railway.app
"""

import argparse
import json
import math
import random
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

# UK city hubs with realistic lat/lng
HUBS = [
    {"name": "London Central",     "lat": 51.5074,  "lng": -0.1278},
    {"name": "London East",        "lat": 51.5150,  "lng":  0.0550},
    {"name": "London South",       "lat": 51.4650,  "lng": -0.1150},
    {"name": "London North",       "lat": 51.5700,  "lng": -0.1100},
    {"name": "Birmingham",         "lat": 52.4862,  "lng": -1.8904},
    {"name": "Manchester",         "lat": 53.4808,  "lng": -2.2426},
    {"name": "Leeds",              "lat": 53.8008,  "lng": -1.5491},
    {"name": "Bristol",            "lat": 51.4545,  "lng": -2.5879},
    {"name": "Luton",              "lat": 51.8787,  "lng": -0.4200},
    {"name": "Heathrow",           "lat": 51.4700,  "lng": -0.4543},
    {"name": "Gatwick",            "lat": 51.1537,  "lng": -0.1821},
    {"name": "Leicester",          "lat": 52.6369,  "lng": -1.1398},
    {"name": "Coventry",           "lat": 52.4068,  "lng": -1.5197},
    {"name": "Nottingham",         "lat": 52.9548,  "lng": -1.1581},
    {"name": "Sheffield",          "lat": 53.3811,  "lng": -1.4701},
]

EARTH_RADIUS_KM = 6371.0


def haversine(lat1, lng1, lat2, lng2):
    lat1_r, lng1_r, lat2_r, lng2_r = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2_r - lat1_r
    dlng = lng2_r - lng1_r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def realistic_duration(distance_km, hour, jitter_pct=0.15):
    """Estimate realistic UK road duration with time-of-day effects."""
    base_speed = 50.0  # km/h average UK road speed

    # Rush hour penalty
    if 7 <= hour < 9 or 17 <= hour < 19:
        speed = base_speed * 0.6
    elif 23 <= hour or hour < 5:
        speed = base_speed * 1.2
    elif 12 <= hour < 14:
        speed = base_speed * 0.85
    else:
        speed = base_speed

    base_minutes = (distance_km / speed) * 60.0

    # Random jitter ±15%
    jitter = 1.0 + random.uniform(-jitter_pct, jitter_pct)
    return max(2.0, base_minutes * jitter)


def jitter_location(lat, lng, radius_km=5.0):
    """Add small random offset to simulate delivery addresses near a hub."""
    dlat = random.uniform(-radius_km, radius_km) / 111.0
    dlng = random.uniform(-radius_km, radius_km) / (111.0 * math.cos(math.radians(lat)))
    return lat + dlat, lng + dlng


def generate_rows(n=200, seed=42):
    random.seed(seed)
    rows = []

    # Base date: spread over last 90 days
    base = datetime(2026, 2, 1, tzinfo=timezone.utc)

    for _ in range(n):
        origin_hub = random.choice(HUBS)
        dest_hub = random.choice([h for h in HUBS if h != origin_hub])

        from_lat, from_lng = jitter_location(origin_hub["lat"], origin_hub["lng"])
        to_lat, to_lng = jitter_location(dest_hub["lat"], dest_hub["lng"])

        # Random day and hour weighted toward working hours
        day_offset = random.randint(0, 89)
        hour = random.choices(
            range(24),
            weights=[1,1,1,1,1,2,3,8,8,6,6,6,5,5,5,6,7,8,6,4,3,2,2,1],
            k=1
        )[0]
        minute = random.randint(0, 59)

        departed_at = base + timedelta(days=day_offset, hours=hour, minutes=minute)

        distance_km = haversine(from_lat, from_lng, to_lat, to_lng)
        duration_minutes = realistic_duration(distance_km, hour)

        arrived_at = departed_at + timedelta(minutes=duration_minutes)

        rows.append({
            "fromLat": round(from_lat, 6),
            "fromLng": round(from_lng, 6),
            "toLat": round(to_lat, 6),
            "toLng": round(to_lng, 6),
            "departedAt": departed_at.strftime("%Y-%m-%dT%H:%M:%S"),
            "arrivedAt": arrived_at.strftime("%Y-%m-%dT%H:%M:%S"),
        })

    return rows


def main():
    parser = argparse.ArgumentParser(description="Seed ETA training data")
    parser.add_argument("--url", default="http://localhost:8001", help="Route optimizer base URL")
    parser.add_argument("--rows", type=int, default=200, help="Number of training rows to generate")
    args = parser.parse_args()

    print(f"Generating {args.rows} synthetic UK delivery trips...")
    rows = generate_rows(n=args.rows)

    payload = json.dumps({"rows": rows}).encode("utf-8")
    endpoint = f"{args.url.rstrip('/')}/v1/eta/train"

    print(f"Sending to {endpoint}...")
    try:
        req = urllib.request.Request(
            endpoint,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            print(f"\nOK Training complete")
            print(f"  Rows used : {result.get('rowsUsed')}")
            print(f"  Trained   : {result.get('trained')}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"\nFAIL HTTP {e.code}: {body}")
    except Exception as e:
        print(f"\nFAIL Error: {e}")


if __name__ == "__main__":
    main()
