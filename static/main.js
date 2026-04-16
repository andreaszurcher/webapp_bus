const HOME_LAT = 63.42988354760209;
const HOME_LON = 10.415298400392226;
const HOME_RADIUS_METERS = 400;

let map = null;
let stopMarker = null;
let userMarker = null;

const findBtn = document.getElementById("find-btn");
const lineInput = document.getElementById("line");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

const stopEl = document.getElementById("stop");
const distanceEl = document.getElementById("distance");
const minutesEl = document.getElementById("minutes");
const directionEl = document.getElementById("direction");

findBtn.addEventListener("click", async () => {
  const line = lineInput.value.trim();

  if (!line) {
    showStatus("Skriv inn et bussnummer.");
    hideResult();
    return;
  }

  if (!navigator.geolocation) {
    showStatus("Mobilen støtter ikke posisjon i nettleseren.");
    hideResult();
    return;
  }

  showStatus("Henter posisjon...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      showStatus("Henter bussdata...");

      try {
        const distHome = haversineDistance(lat, lon, HOME_LAT, HOME_LON);
        const atHome = distHome <= HOME_RADIUS_METERS;

        const params = new URLSearchParams({ lat, lon, line });
        if (atHome) {
          params.set("exclude_destination", "Vikåsen");
        } else {
          params.set("destination", "Vikåsen");
        }

        const response = await fetch(`/api/next-bus?${params}`);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Ukjent feil");
        }

        if (!data.found) {
          showStatus(data.message || "Fant ingen avgang.");
          hideResult();
          return;
        }

        stopEl.textContent = data.stop || "-";
        distanceEl.textContent = formatDistance(data.distance_meters);
        minutesEl.textContent = formatMinutes(data.minutes_until_departure);
        directionEl.textContent = data.destination ? `mot ${data.destination}` : "";

        resultEl.classList.remove("hidden");
        showStatus("");

        if (data.stop_lat && data.stop_lon) {
          showMap(lat, lon, data.stop_lat, data.stop_lon, data.stop);
        }
      } catch (error) {
        showStatus(`Feil: ${error.message}`);
        hideResult();
      }
    },
    (error) => {
      let message = "Fikk ikke tak i posisjon.";
      if (error.code === error.PERMISSION_DENIED) {
        message = "Du må tillate posisjon i Safari.";
      }
      showStatus(message);
      hideResult();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    }
  );
});

function showStatus(message) {
  statusEl.textContent = message;
}

function hideResult() {
  resultEl.classList.add("hidden");
}

function formatDistance(distance) {
  if (distance === null || distance === undefined) {
    return "-";
  }

  const meters = Math.round(Number(distance));

  if (meters < 1000) {
    return `${meters} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function showMap(userLat, userLon, stopLat, stopLon, stopName) {
  const midLat = (userLat + stopLat) / 2;
  const midLon = (userLon + stopLon) / 2;

  if (!map) {
    map = L.map("map", { zoomControl: true }).setView([midLat, midLon], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
  } else {
    map.setView([midLat, midLon], 16);
    if (stopMarker) stopMarker.remove();
    if (userMarker) userMarker.remove();
  }

  stopMarker = L.circleMarker([stopLat, stopLon], {
    radius: 10,
    fillColor: "#3b82f6",
    color: "#fff",
    weight: 2,
    fillOpacity: 1,
  }).addTo(map).bindPopup(stopName).openPopup();

  userMarker = L.circleMarker([userLat, userLon], {
    radius: 7,
    fillColor: "#a78bfa",
    color: "#fff",
    weight: 2,
    fillOpacity: 1,
  }).addTo(map).bindPopup("Din posisjon");
}

function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) {
    return "-";
  }

  if (minutes <= 0) {
    return "Nå";
  }

  if (minutes === 1) {
    return "1 min";
  }

  return `${minutes} min`;
}