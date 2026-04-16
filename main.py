from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from entur import find_nearby_stops, find_next_departure_for_line

app = FastAPI(title="Bus App Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/next-bus")
async def next_bus(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    line: str = Query(..., description="Bus line number"),
    destination: str | None = Query(None, description="Filter by destination text"),
    exclude_destination: str | None = Query(None, description="Exclude by destination text"),
) -> dict:
    try:
        stops = await find_nearby_stops(lat=lat, lon=lon)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to find nearby stops: {exc}",
        ) from exc

    if not stops:
        raise HTTPException(status_code=404, detail="No nearby stops found")

    for stop in stops:
        try:
            departure = await find_next_departure_for_line(
                stop_id=stop["id"],
                line=line,
                destination_contains=destination,
                destination_excludes=exclude_destination,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to fetch departures: {exc}",
            ) from exc

        if departure:
            return {
                "found": True,
                "stop": stop["name"],
                "stop_id": stop["id"],
                "distance_meters": stop.get("distance"),
                "stop_lat": stop.get("lat"),
                "stop_lon": stop.get("lon"),
                "line": departure["line"],
                "destination": departure["destination"],
                "expected_departure_time": departure["expected_departure_time"],
                "minutes_until_departure": departure["minutes_until_departure"],
            }

    return {
        "found": False,
        "message": f"Fant ingen avgang for linje {line} ved noen av de {len(stops)} nærmeste stoppene.",
    }