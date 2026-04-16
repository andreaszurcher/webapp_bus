import os
from datetime import datetime, timezone
from typing import Any

import httpx

ENTUR_GEOCODER_URL = "https://api.entur.io/geocoder/v1/reverse"
ENTUR_JOURNEY_URL = "https://api.entur.io/journey-planner/v3/graphql"

ET_CLIENT_NAME = os.getenv("ET_CLIENT_NAME", "andreas-bustrack")

HEADERS = {
    "ET-Client-Name": ET_CLIENT_NAME,
    "Accept": "application/json",
}


async def find_nearby_stops(lat: float, lon: float) -> list[dict[str, Any]]:
    params = {
        "point.lat": lat,
        "point.lon": lon,
        "boundary.circle.radius": 1000,
        "size": 10,
        "layers": "venue",
        "lang": "no",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            ENTUR_GEOCODER_URL,
            params=params,
            headers=HEADERS,
        )
        response.raise_for_status()
        data = response.json()

    features = data.get("features", [])

    def distance_of(feature: dict[str, Any]) -> float:
        props = feature.get("properties", {})
        value = props.get("distance")
        return float(value) if value is not None else float("inf")

    features.sort(key=distance_of)

    stops = []
    for feature in features:
        props = feature.get("properties", {})
        stop_id = props.get("id")
        name = props.get("label") or props.get("name")

        if stop_id and name:
            coords = feature.get("geometry", {}).get("coordinates", [])
            raw_distance = props.get("distance")
            stops.append({
                "id": stop_id,
                "name": name,
                "distance": round(float(raw_distance) * 1000) if raw_distance is not None else None,
                "lat": coords[1] if len(coords) >= 2 else None,
                "lon": coords[0] if len(coords) >= 2 else None,
            })

    return stops


async def find_next_departure_for_line(
    stop_id: str,
    line: str,
    destination_contains: str | None = None,
    destination_excludes: str | None = None,
) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    start_time = now.strftime("%Y-%m-%dT%H:%M:%S+00:00")

    query = """
    query NextDepartures($stopId: String!, $startTime: DateTime!) {
      stopPlace(id: $stopId) {
        id
        name
        estimatedCalls(
          startTime: $startTime
          timeRange: 72100
          numberOfDepartures: 20
        ) {
          expectedDepartureTime
          aimedDepartureTime
          destinationDisplay {
            frontText
          }
          serviceJourney {
            journeyPattern {
              line {
                publicCode
              }
            }
          }
        }
      }
    }
    """

    payload = {
        "query": query,
        "variables": {"stopId": stop_id, "startTime": start_time},
    }

    headers = {
        **HEADERS,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            ENTUR_JOURNEY_URL,
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()

    if "errors" in data:
        raise RuntimeError(str(data["errors"]))

    stop_place = data.get("data", {}).get("stopPlace")
    if not stop_place:
        return None

    calls = stop_place.get("estimatedCalls", [])
    if not calls:
        return None

    now = datetime.now(timezone.utc)

    for call in calls:
        public_code = (
            call.get("serviceJourney", {})
            .get("journeyPattern", {})
            .get("line", {})
            .get("publicCode")
        )

        if str(public_code) != str(line):
            continue

        front_text = (call.get("destinationDisplay", {}) or {}).get("frontText", "")

        if destination_contains and destination_contains.lower() not in front_text.lower():
            continue

        if destination_excludes and destination_excludes.lower() in front_text.lower():
            continue

        departure_time = call.get("expectedDepartureTime") or call.get("aimedDepartureTime")
        if not departure_time:
            continue

        destination = (
            call.get("destinationDisplay", {}) or {}
        ).get("frontText", "")

        departure_dt = _parse_iso_datetime(departure_time)
        minutes_until = max(0, int((departure_dt - now).total_seconds() // 60))

        return {
            "line": str(public_code),
            "destination": destination,
            "expected_departure_time": departure_time,
            "minutes_until_departure": minutes_until,
        }

    return None


def _parse_iso_datetime(value: str) -> datetime:
    if value.endswith("Z"):
        value = value.replace("Z", "+00:00")
    return datetime.fromisoformat(value)