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
        const response = await fetch(
          `/api/next-bus?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&line=${encodeURIComponent(line)}`
        );

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