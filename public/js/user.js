// ═══════════════════════════════════════════════════════════════
// Eye In – User Side JavaScript
// ═══════════════════════════════════════════════════════════════

const socket = io();
let map, markers = {};
let vehiclesData = [];
let userLat = null, userLng = null; // Store user's location for ETA

// ─── Vehicle Icons ────────────────────────────────────────────
const vehicleEmojis = {
  auto: '🛺',
  bus: '🚌',
  car: '🚗'
};

// ─── Initialize on Page Load ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const pickup = params.get('pickup');
  const destination = params.get('destination');

  if (!pickup || !destination) {
    window.location.href = '/';
    return;
  }

  document.getElementById('routeInfo').textContent = `${pickup} → ${destination}`;

  // Initialize Map
  initMap();

  // Search Routes
  searchRoutes(pickup, destination);

  // Listen for real-time updates
  setupSocketListeners();
});

// ─── Initialize Leaflet Map ──────────────────────────────────
function initMap() {
  // Default fallback center (Bihar)
  const defaultLat = 25.0961;
  const defaultLng = 85.3131;

  map = L.map('map', {
    zoomControl: true,
    attributionControl: true
  }).setView([defaultLat, defaultLng], 7);

  // High quality, user-friendly map tiles (CartoDB Voyager)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors, © CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Try to get actual location and watch it
  if (navigator.geolocation) {
    let myMarker = null;
    navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        userLat = lat;
        userLng = lng;

        if (!myMarker) {
          map.setView([lat, lng], 14);
          myMarker = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'custom-marker', html: '📍', iconSize: [28, 28] }) // User's own location
          }).addTo(map);
        } else {
          myMarker.setLatLng([lat, lng]);
        }
      },
      () => {
        console.log("Geolocation access denied or unavailable. Using default map view.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }
}

// ─── Search Routes API ──────────────────────────────────────
async function searchRoutes(pickup, destination) {
  try {
    const res = await fetch(`/api/routes/search?pickup=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(destination)}`);
    const data = await res.json();

    vehiclesData = data;
    renderVehicleList(data);
    renderMapMarkers(data);

  } catch (err) {
    console.error("Error fetching routes:", err);
    document.getElementById('vehicleList').innerHTML = `
      <div class="empty-state">
        <div class="icon">⚠️</div>
        <h3>Something went wrong</h3>
        <p>Unable to fetch routes. Please try again.</p>
      </div>
    `;
  }
}

// ─── Render Vehicle List ──────────────────────────────────────
function renderVehicleList(vehicles) {
  const container = document.getElementById('vehicleList');

  if (vehicles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <h3>No vehicles found</h3>
        <p>Try searching with a different route.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = vehicles.map((v, index) => {
    const emptySeats = v.total_seats - v.filled_seats;
    const seatDots = generateSeatDots(v.total_seats, v.filled_seats);
    const etaBadge = getETABadge(v);
    const ratingStars = getStarRating(v.avg_rating, v.total_ratings);

    return `
      <div class="vehicle-card" style="animation-delay: ${index * 0.1}s" onclick="showVehicleDetail(${v.id})" id="vehicle-card-${v.id}">
        <div class="card-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="vehicle-icon ${v.vehicle_type}">${vehicleEmojis[v.vehicle_type] || '🚗'}</div>
            <div class="vehicle-info">
              <h3>${capitalize(v.vehicle_type)} – ${v.vehicle_number}</h3>
              <span>${v.driver_name}</span>
              <div style="margin-top: 2px;">${ratingStars}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div class="fare-badge">₹${v.fare}</div>
            ${etaBadge}
          </div>
        </div>
        <div class="card-details">
          <div class="detail-item">
            <span class="label">Route:</span>
            <span>${v.start_location} → ${v.end_location}</span>
          </div>
          <div class="detail-item">
            <span class="label">Seats:</span>
            <span style="color: ${emptySeats > 0 ? 'var(--success)' : 'var(--danger)'}">
              ${emptySeats} empty / ${v.total_seats} total
            </span>
          </div>
        </div>
        <div class="seats-indicator">${seatDots}</div>
      </div>
    `;
  }).join('');
}

// ─── Generate Seat Dots ──────────────────────────────────────
function generateSeatDots(total, filled) {
  let dots = '';
  const maxDots = Math.min(total, 20); // Cap visual dots
  const filledDots = Math.min(filled, maxDots);

  for (let i = 0; i < maxDots; i++) {
    dots += `<div class="seat-dot ${i < filledDots ? 'filled' : 'empty'}"></div>`;
  }

  if (total > 20) {
    dots += `<span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 4px;">+${total - 20}</span>`;
  }

  return dots;
}

// ─── Render Map Markers ──────────────────────────────────────
function renderMapMarkers(vehicles) {
  // Clear existing markers
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  if (vehicles.length === 0) return;

  const bounds = L.latLngBounds();

  vehicles.forEach(v => {
    if (!v.current_lat || !v.current_lng) return; // Skip vehicles without location yet

    const icon = L.divIcon({
      className: 'vehicle-marker',
      html: vehicleEmojis[v.vehicle_type] || '🚗',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    const marker = L.marker([v.current_lat, v.current_lng], { icon })
      .addTo(map)
      .on('click', () => showVehicleDetail(v.id));

    const emptySeats = v.total_seats - v.filled_seats;
    marker.bindPopup(`
      <div class="map-popup-title">${vehicleEmojis[v.vehicle_type]} ${capitalize(v.vehicle_type)} – ${v.vehicle_number}</div>
      <div class="map-popup-info">
        Route: ${v.start_location} → ${v.end_location}<br>
        Fare: ₹${v.fare} | Empty Seats: ${emptySeats}
      </div>
    `);

    markers[v.id] = marker;
    bounds.extend([v.current_lat, v.current_lng]);
  });

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }
}

// ─── Selected Seats Tracking ─────────────────────────────────
let selectedSeats = {}; // { routeId: Set([seatNumber, ...]) }

// ─── Show Vehicle Detail Modal ───────────────────────────────
function showVehicleDetail(routeId) {
  const vehicle = vehiclesData.find(v => v.id === routeId);
  if (!vehicle) return;

  const emptySeats = vehicle.total_seats - vehicle.filled_seats;
  selectedSeats[routeId] = new Set();

  const seatLayout = generateSeatLayout(vehicle);

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-header">
      <div class="vehicle-icon-lg ${vehicle.vehicle_type}">${vehicleEmojis[vehicle.vehicle_type] || '🚗'}</div>
      <div>
        <h2>${capitalize(vehicle.vehicle_type)}</h2>
        <div class="vehicle-num">${vehicle.vehicle_number} • ${vehicle.driver_name}</div>
      </div>
    </div>

    <div class="modal-details">
      <div class="detail-block">
        <div class="detail-label">Route</div>
        <div class="detail-value">${vehicle.start_location} → ${vehicle.end_location}</div>
      </div>
      <div class="detail-block">
        <div class="detail-label">Fare</div>
        <div class="detail-value success">₹${vehicle.fare}</div>
      </div>
      <div class="detail-block">
        <div class="detail-label">Filled Seats</div>
        <div class="detail-value danger">${vehicle.filled_seats}</div>
      </div>
      <div class="detail-block">
        <div class="detail-label">Empty Seats</div>
        <div class="detail-value success">${emptySeats}</div>
      </div>
    </div>

    <div class="seat-layout">
      <h3>💺 Apni Seat Chhune – Tap to Select</h3>
      <div class="seat-legend">
        <span><div class="dot green"></div> Khaali</span>
        <span><div class="dot red"></div> Bhari</span>
        <span><div class="dot blue"></div> Aapka</span>
        <span><div class="dot gray"></div> Driver</span>
      </div>
      ${seatLayout}
      <div class="selection-counter" id="selectionCounter-${routeId}">
        Seat select karein ☝️
      </div>
    </div>

    <!-- Request Ride Section -->
    <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border-color);">
      <h3 style="margin-bottom: 12px; font-size: 1.1rem;">📝 Ride Request</h3>
      <div id="requestFormWrapper-${vehicle.id}">
        <input type="text" id="passengerName" placeholder="Aapka Naam (e.g. Rohan)" style="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-primary);" />
        <input type="tel" id="passengerPhone" placeholder="Mobile Number" style="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-primary);" />

        <!-- Passenger Count -->
        <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px; display: block;">👥 Aap kitne log hain?</label>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <button type="button" onclick="changePassengers(-1, ${vehicle.id})" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-primary); font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">−</button>
          <span id="passengerCount-${vehicle.id}" style="font-size: 1.5rem; font-weight: 700; min-width: 32px; text-align: center;">1</span>
          <button type="button" onclick="changePassengers(1, ${vehicle.id})" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-primary); font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
          <span style="font-size: 0.8rem; color: var(--text-muted);">log (max ${emptySeats} seats available)</span>
        </div>

        <!-- Seats Needed (auto-synced with seat click) -->
        <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px; display: block;">💺 Kitni seats chahiye?</label>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
          <button type="button" onclick="changeSeats(-1, ${vehicle.id})" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-primary); font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">−</button>
          <span id="requestedSeatsCount-${vehicle.id}" style="font-size: 1.5rem; font-weight: 700; min-width: 32px; text-align: center;">1</span>
          <button type="button" onclick="changeSeats(1, ${vehicle.id})" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-primary); font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
          <span style="font-size: 0.8rem; color: var(--text-muted);">seats (max ${emptySeats})</span>
        </div>

        <button class="btn btn-primary" style="width: 100%;" onclick="submitRideRequest(${vehicle.id}, ${emptySeats})" id="requestBtn-${vehicle.id}">🚗 Send Request to Driver</button>
      </div>
    </div>
  `;

  document.getElementById('vehicleModal').style.display = 'flex';
}

// ─── Toggle Seat Selection ───────────────────────────────────
function toggleSeat(routeId, seatNum, totalEmpty) {
  if (!selectedSeats[routeId]) selectedSeats[routeId] = new Set();

  const seatEl = document.getElementById(`seat-${routeId}-${seatNum}`);
  if (!seatEl) return;

  if (selectedSeats[routeId].has(seatNum)) {
    // Deselect
    selectedSeats[routeId].delete(seatNum);
    seatEl.className = 'seat empty';
    seatEl.innerHTML = `<span class="seat-icon">💺</span><span class="seat-num">${seatNum}</span>`;
  } else {
    // Select — check if not exceeding empty seats
    if (selectedSeats[routeId].size >= totalEmpty) {
      showToast(`Sirf ${totalEmpty} seats available hain!`, 'error');
      return;
    }
    selectedSeats[routeId].add(seatNum);
    seatEl.className = 'seat selected';
    seatEl.innerHTML = `<span class="seat-icon">✅</span><span class="seat-num">${seatNum}</span>`;
  }

  // Update selection counter
  const count = selectedSeats[routeId].size;
  const counter = document.getElementById(`selectionCounter-${routeId}`);
  if (counter) {
    if (count > 0) {
      const seatNums = Array.from(selectedSeats[routeId]).sort((a, b) => a - b).join(', ');
      counter.className = 'selection-counter has-selection';
      counter.innerHTML = `<span class="count">${count}</span> seat${count > 1 ? 's' : ''} selected — <strong>Seat ${seatNums}</strong>`;
    } else {
      counter.className = 'selection-counter';
      counter.innerHTML = 'Seat select karein ☝️';
    }
  }

  // Auto-update seat & passenger counters
  const seatsEl = document.getElementById(`requestedSeatsCount-${routeId}`);
  const passengersEl = document.getElementById(`passengerCount-${routeId}`);
  if (seatsEl && count > 0) {
    seatsEl.textContent = count;
    if (passengersEl && parseInt(passengersEl.textContent) > count) {
      passengersEl.textContent = count;
    }
    if (passengersEl && parseInt(passengersEl.textContent) < 1) {
      passengersEl.textContent = 1;
    }
  }
}

// ─── Passenger / Seat Counter Helpers ────────────────────────
function changePassengers(delta, routeId) {
  const el = document.getElementById(`passengerCount-${routeId}`);
  let val = parseInt(el.textContent) + delta;
  const vehicle = vehiclesData.find(v => v.id === routeId);
  const maxSeats = vehicle ? vehicle.total_seats - vehicle.filled_seats : 10;
  if (val < 1) val = 1;
  if (val > maxSeats) val = maxSeats;
  el.textContent = val;
  // Auto-sync seat count if seats < passengers
  const seatsEl = document.getElementById(`requestedSeatsCount-${routeId}`);
  if (parseInt(seatsEl.textContent) < val) seatsEl.textContent = val;
}

function changeSeats(delta, routeId) {
  const el = document.getElementById(`requestedSeatsCount-${routeId}`);
  const passengersEl = document.getElementById(`passengerCount-${routeId}`);
  const vehicle = vehiclesData.find(v => v.id === routeId);
  const maxSeats = vehicle ? vehicle.total_seats - vehicle.filled_seats : 10;
  let val = parseInt(el.textContent) + delta;
  const passengers = parseInt(passengersEl.textContent);
  if (val < passengers) val = passengers;
  if (val < 1) val = 1;
  if (val > maxSeats) val = maxSeats;
  el.textContent = val;
}

function submitRideRequest(routeId, maxSeats) {
  const name = document.getElementById('passengerName').value.trim();
  const phone = document.getElementById('passengerPhone').value.trim();
  const passengers = parseInt(document.getElementById(`passengerCount-${routeId}`).textContent);
  const seats = parseInt(document.getElementById(`requestedSeatsCount-${routeId}`).textContent);

  if (!name || !phone) {
    alert("Apna naam aur phone number zaroor bhare.");
    return;
  }

  if (seats > maxSeats) {
    alert(`Sirf ${maxSeats} seats available hain!`);
    return;
  }

  // Get selected seat numbers
  const seatNumbers = selectedSeats[routeId] ? Array.from(selectedSeats[routeId]).sort((a,b) => a-b) : [];

  const btn = document.getElementById(`requestBtn-${routeId}`);
  btn.innerText = 'Location le raha hai...';
  btn.disabled = true;
  btn.style.opacity = '0.7';

  const sendRequest = (lat, lng) => {
    socket.emit('request-ride', {
      routeId: routeId,
      name: name,
      phone: phone,
      passengers: passengers,
      seats: seats,
      seatNumbers: seatNumbers,
      userLat: lat,
      userLng: lng
    });
    btn.innerText = 'Driver ka wait kar raha hai...';
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => sendRequest(pos.coords.latitude, pos.coords.longitude),
      (err) => sendRequest(25.0961, 85.3131),
      { timeout: 5000 }
    );
  } else {
    sendRequest(25.0961, 85.3131);
  }
}

// ─── Generate Seat Layout by Vehicle Type ────────────────────
function generateSeatLayout(vehicle) {
  const { vehicle_type, total_seats, filled_seats, id: routeId } = vehicle;
  const emptySeats = total_seats - filled_seats;

  if (vehicle_type === 'auto') {
    return generateAutoLayout(routeId, total_seats, filled_seats, emptySeats);
  } else if (vehicle_type === 'bus') {
    return generateBusLayout(routeId, total_seats, filled_seats, emptySeats);
  } else {
    return generateCarLayout(routeId, total_seats, filled_seats, emptySeats);
  }
}

// ─── Auto Layout (3 seats) ───────────────────────────────────
function generateAutoLayout(routeId, total, filled, emptySeats) {
  let seats = '';

  // Driver row
  seats += `<div class="driver-section"><span class="steering">🛺</span> Driver</div>`;

  // Row 1: 1 seat (front passenger) - but auto-rickshaw usually has all back
  // Typical auto: 1 front, 2 back OR 3 back seats
  seats += `<div class="seat-grid">`;

  // Front area: driver side only
  seats += `<div class="seat-row" style="justify-content: center; margin-bottom: 4px;">`;
  seats += renderSeat(routeId, 1, filled >= 1, emptySeats);
  seats += `</div>`;

  // Back row: 2 seats
  seats += `<div class="seat-row" style="justify-content: center;">`;
  seats += renderSeat(routeId, 2, filled >= 2, emptySeats);
  seats += renderSeat(routeId, 3, filled >= 3, emptySeats);
  seats += `</div>`;

  seats += `</div>`;

  return `<div class="vehicle-body">${seats}</div>`;
}

// ─── Car Layout (4 seats) ───────────────────────────────────
function generateCarLayout(routeId, total, filled, emptySeats) {
  let seats = '';

  seats += `<div class="driver-section"><span class="steering">🚗</span> Driver</div>`;
  seats += `<div class="seat-grid">`;

  // Front row: driver (already shown) + 1 front passenger
  seats += `<div class="seat-row" style="justify-content: space-between; width: 100%;">`;
  seats += `<div class="seat driver-seat"><span class="seat-icon">🎡</span><span class="seat-num">D</span></div>`;
  seats += renderSeat(routeId, 1, filled >= 1, emptySeats);
  seats += `</div>`;

  // Back row: 3 seats (or total - 1)
  seats += `<div class="seat-row" style="justify-content: center; margin-top: 6px;">`;
  for (let i = 2; i <= Math.min(total, 4); i++) {
    seats += renderSeat(routeId, i, i <= filled + 1 && i - 1 < filled, emptySeats);
  }
  seats += `</div>`;

  seats += `</div>`;

  return `<div class="vehicle-body">${seats}</div>`;
}

// ─── Bus Layout (2+2 with aisle) ─────────────────────────────
function generateBusLayout(routeId, total, filled, emptySeats) {
  let seats = '';

  seats += `<div class="driver-section"><span class="steering">🚌</span> Driver</div>`;
  seats += `<div class="door-indicator">🚪 Entry Door</div>`;
  seats += `<div class="seat-grid">`;

  // 2+2 seat layout with aisle
  const rows = Math.ceil(total / 4);
  let seatNum = 1;

  for (let r = 0; r < rows; r++) {
    seats += `<div class="seat-row">`;
    // Row label
    seats += `<span class="seat-row-label">${r + 1}</span>`;

    // Left pair
    for (let c = 0; c < 2 && seatNum <= total; c++) {
      const isFilled = seatNum <= filled;
      seats += renderSeat(routeId, seatNum, isFilled, emptySeats);
      seatNum++;
    }

    // Aisle (only if there are right-side seats)
    if (seatNum <= total) {
      seats += `<div class="seat-aisle"></div>`;
    }

    // Right pair
    for (let c = 0; c < 2 && seatNum <= total; c++) {
      const isFilled = seatNum <= filled;
      seats += renderSeat(routeId, seatNum, isFilled, emptySeats);
      seatNum++;
    }

    seats += `</div>`;

    // Add door indicator at mid-point for buses
    if (r === Math.floor(rows / 2) - 1 && rows > 3) {
      seats += `<div class="door-indicator">🚪 Middle Door</div>`;
    }
  }

  seats += `</div>`;

  return `<div class="vehicle-body bus-body">${seats}</div>`;
}

// ─── Render a Single Seat ────────────────────────────────────
function renderSeat(routeId, seatNum, isFilled, totalEmpty) {
  if (isFilled) {
    return `<div class="seat filled" title="Seat ${seatNum} — Bhari hai">
      <span class="seat-icon">🧑</span><span class="seat-num">${seatNum}</span>
    </div>`;
  } else {
    return `<div class="seat empty" id="seat-${routeId}-${seatNum}" 
      onclick="toggleSeat(${routeId}, ${seatNum}, ${totalEmpty})"
      title="Seat ${seatNum} — Khaali hai, click to select">
      <span class="seat-icon">💺</span><span class="seat-num">${seatNum}</span>
    </div>`;
  }
}

// ─── Close Modal ──────────────────────────────────────────────
function closeModal() {
  document.getElementById('vehicleModal').style.display = 'none';
}

// Close on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.id === 'vehicleModal') closeModal();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ─── Socket.io Listeners ─────────────────────────────────────
function setupSocketListeners() {
  socket.on('seat-updated', (data) => {
    const vehicle = vehiclesData.find(v => v.id === data.routeId);
    if (vehicle) {
      vehicle.filled_seats = data.filled_seats;
      vehicle.total_seats = data.total_seats;
      renderVehicleList(vehiclesData);
      showToast(`Seat update: ${capitalize(vehicle.vehicle_type)} ${vehicle.vehicle_number} — ${data.empty_seats} seats available`, 'info');
    }
  });

  socket.on('route-ended', (data) => {
    vehiclesData = vehiclesData.filter(v => v.id !== data.routeId);
    renderVehicleList(vehiclesData);
    renderMapMarkers(vehiclesData);
    showToast('A vehicle has ended its route', 'info');
  });

  socket.on('new-route', (data) => {
    // Refresh the search
    const params = new URLSearchParams(window.location.search);
    searchRoutes(params.get('pickup'), params.get('destination'));
  });

  socket.on('location-updated', (data) => {
    if (markers[data.routeId]) {
      markers[data.routeId].setLatLng([data.lat, data.lng]);
    }
  });

  socket.on('ride-accepted', async (data) => {
    showToast(`✅ Ride Accepted by ${data.driverName || 'Driver'}! They are on the way.`, 'success');

    // Save ride to history
    try {
      const historyRes = await fetch('/api/routes/ride-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: data.routeId,
          driverId: data.driverId,
          passengerName: data.passengerName || 'User',
          passengerPhone: data.passengerPhone || '',
          passengers: data.passengers || 1,
          seats: data.seats || 1
        })
      });
      const historyData = await historyRes.json();
      window._lastRideId = historyData.rideId; // Store for rating
    } catch (e) {
      console.error('Failed to save ride history:', e);
    }

    const wrapper = document.getElementById(`requestFormWrapper-${data.routeId}`);
    if (wrapper) {
      wrapper.innerHTML = `
        <div style="padding: 16px; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success); border-radius: 8px; text-align: center;">
          <h4 style="color: var(--success); margin-bottom: 6px;">✅ Ride Confirmed!</h4>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">Driver aa raha hai! Map pe live location dekho.</p>
          
          <div style="border-top: 1px solid var(--border-color); padding-top: 16px; margin-top: 8px;">
            <p style="font-size: 0.9rem; font-weight: 600; margin-bottom: 10px;">⭐ Driver ko rate karo:</p>
            <div id="ratingStars" style="display: flex; gap: 8px; justify-content: center; margin-bottom: 12px;">
              ${[1, 2, 3, 4, 5].map(i => `<span class="rate-star" data-value="${i}" onclick="selectRating(${i})" style="font-size: 2rem; cursor: pointer; transition: transform 0.2s;">☆</span>`).join('')}
            </div>
            <input type="text" id="ratingComment" placeholder="Comment likhein (optional)" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-primary); margin-bottom: 10px; font-size: 0.85rem;" />
            <button class="btn btn-primary" style="width: 100%; font-size: 0.9rem;" onclick="submitRating()">⭐ Rating Submit Karo</button>
          </div>
        </div>
      `;
    }
  });

  socket.on('ride-rejected', (data) => {
    showToast(`❌ Ride Request Declined. Please try another vehicle.`, 'danger');

    const btn = document.getElementById(`requestBtn-${data.routeId}`);
    if (btn) {
      btn.innerText = 'Send Request';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });
}

// ─── Utilities ─────────────────────────────────────────────── 
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ─── ETA Calculation (Haversine) ─────────────────────────────
function getETABadge(vehicle) {
  if (!userLat || !userLng || !vehicle.current_lat || !vehicle.current_lng) {
    return '';
  }
  const distKm = haversineDistance(userLat, userLng, vehicle.current_lat, vehicle.current_lng);
  const avgSpeedKmh = 25; // Average city speed
  const etaMinutes = Math.round((distKm / avgSpeedKmh) * 60);

  if (etaMinutes < 1) return `<div style="font-size: 0.75rem; color: var(--success); margin-top: 4px; font-weight: 600;">📍 Paas mein</div>`;
  if (etaMinutes > 120) return '';

  return `<div style="font-size: 0.75rem; color: var(--primary); margin-top: 4px; font-weight: 600;">🕐 ~${etaMinutes} min</div>`;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Star Rating Display ─────────────────────────────────────
function getStarRating(avgRating, totalRatings) {
  if (!totalRatings || totalRatings === 0) {
    return `<span style="font-size: 0.72rem; color: var(--text-muted);">Naya Driver</span>`;
  }
  const rating = parseFloat(avgRating) || 0;
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      stars += '⭐';
    } else if (i - 0.5 <= rating) {
      stars += '⭐';
    } else {
      stars += '☆';
    }
  }
  return `<span style="font-size: 0.72rem;">${stars} <span style="color: var(--text-muted);">(${rating}/5 · ${totalRatings} rides)</span></span>`;
}

// ─── Rating Selection & Submit ───────────────────────────────
let selectedRating = 0;

function selectRating(value) {
  selectedRating = value;
  const stars = document.querySelectorAll('.rate-star');
  stars.forEach(star => {
    const v = parseInt(star.getAttribute('data-value'));
    star.textContent = v <= value ? '⭐' : '☆';
    star.style.transform = v <= value ? 'scale(1.2)' : 'scale(1)';
  });
}

async function submitRating() {
  if (!selectedRating || !window._lastRideId) {
    showToast('Pehle star select karo!', 'error');
    return;
  }

  const comment = document.getElementById('ratingComment')?.value || '';

  try {
    const res = await fetch(`/api/routes/ride-history/${window._lastRideId}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: selectedRating, comment })
    });
    const data = await res.json();

    if (res.ok) {
      showToast(`⭐ ${selectedRating}-star rating diya! Shukriya!`, 'success');
      // Replace rating form with thank you
      const starsDiv = document.getElementById('ratingStars');
      if (starsDiv) {
        starsDiv.parentElement.innerHTML = `
          <div style="padding: 12px; text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 6px;">🎉</div>
            <p style="font-weight: 600; color: var(--success);">Rating submit ho gaya!</p>
            <p style="font-size: 0.8rem; color: var(--text-muted);">${'⭐'.repeat(selectedRating)} – Thank you!</p>
          </div>
        `;
      }
    } else {
      showToast(data.error || 'Rating submit nahi ho saka', 'error');
    }
  } catch (e) {
    console.error('Rating submit error:', e);
    showToast('Rating submit mein error aaya', 'error');
  }
}

// ─── User Ride History ─────────────────────────────────────────
function openUserHistory() {
  const modal = document.getElementById('userHistoryModal');
  if(modal) modal.style.display = 'flex';
}

function closeUserHistory() {
  const modal = document.getElementById('userHistoryModal');
  if(modal) modal.style.display = 'none';
}

async function fetchUserHistory() {
  const phone = document.getElementById('userHistoryPhone').value.trim();
  const listContainer = document.getElementById('userHistoryList');
  
  if (!phone || phone.length < 10) {
    showToast('Valid phone number daalein', 'error');
    return;
  }

  listContainer.style.display = 'block';
  listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Fetching rides...</div>';

  try {
    const res = await fetch(`/api/routes/ride-history/${encodeURIComponent(phone)}`);
    const rides = await res.json();

    if (rides.length === 0) {
      listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Koi rides nahi mili is number pe.</div>';
      return;
    }

    listContainer.innerHTML = rides.map(ride => {
      const date = new Date(ride.created_at).toLocaleDateString();
      const ratingHtml = ride.rating 
          ? `<div style="color: #b45309; font-size: 0.85rem; margin-top: 4px;">⭐ ${ride.rating}/5</div>`
          : `<div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">No rating</div>`;
      
      let statusColor = ride.status === 'completed' ? 'var(--success)' : 'var(--primary)';
          
      return `
          <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 12px; background: var(--surface-light); text-align: left;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <strong style="font-size: 0.9rem;">${ride.start_location} → ${ride.end_location}</strong>
                  <span style="color: ${statusColor}; font-weight: 600; font-size: 0.85rem; padding: 2px 6px; background: rgba(59,130,246,0.1); border-radius: 4px; text-transform: capitalize;">${ride.status}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 6px;">
                  <span>🚗 ${ride.driver_name} (${ride.vehicle_number})</span>
                  <span style="font-weight: 600;">₹${ride.fare}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.8rem; color: var(--text-muted);">🗓️ ${date}</span>
                  ${ratingHtml}
              </div>
          </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load history:', err);
    listContainer.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 20px;">Error loading history.</div>';
  }
}
