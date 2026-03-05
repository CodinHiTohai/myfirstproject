// ═══════════════════════════════════════════════════════════════
// Eye In – User Side JavaScript
// ═══════════════════════════════════════════════════════════════

const socket = io();
let map, markers = {};
let vehiclesData = [];

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

    return `
      <div class="vehicle-card" style="animation-delay: ${index * 0.1}s" onclick="showVehicleDetail(${v.id})" id="vehicle-card-${v.id}">
        <div class="card-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="vehicle-icon ${v.vehicle_type}">${vehicleEmojis[v.vehicle_type] || '🚗'}</div>
            <div class="vehicle-info">
              <h3>${capitalize(v.vehicle_type)} – ${v.vehicle_number}</h3>
              <span>${v.driver_name}</span>
            </div>
          </div>
          <div class="fare-badge">₹${v.fare}</div>
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

// ─── Show Vehicle Detail Modal ───────────────────────────────
function showVehicleDetail(routeId) {
  const vehicle = vehiclesData.find(v => v.id === routeId);
  if (!vehicle) return;

  const emptySeats = vehicle.total_seats - vehicle.filled_seats;
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
      <h3>💺 Seat Layout</h3>
      <div class="seat-legend">
        <span><div class="dot green"></div> Empty</span>
        <span><div class="dot red"></div> Filled</span>
      </div>
      ${seatLayout}
    </div>

    <!-- Request Ride Section -->
    <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border-color);">
      <h3 style="margin-bottom: 12px; font-size: 1.1rem;">📝 Request a Ride</h3>
      <div id="requestFormWrapper-${vehicle.id}">
        <input type="text" id="passengerName" placeholder="Your Name (e.g. Rohan)" style="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-primary);" />
        <input type="tel" id="passengerPhone" placeholder="Mobile Number" style="width: 100%; padding: 10px; margin-bottom: 16px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--surface-light); color: var(--text-primary);" />
        <button class="btn btn-primary" style="width: 100%;" onclick="submitRideRequest(${vehicle.id})" id="requestBtn-${vehicle.id}">Send Request</button>
      </div>
    </div>
  `;

  document.getElementById('vehicleModal').style.display = 'flex';
}

function submitRideRequest(routeId) {
  const name = document.getElementById('passengerName').value.trim();
  const phone = document.getElementById('passengerPhone').value.trim();

  if (!name || !phone) {
    alert("Please enter both your name and phone number.");
    return;
  }

  const btn = document.getElementById(`requestBtn-${routeId}`);
  btn.innerText = 'Getting Location...';
  btn.disabled = true;
  btn.style.opacity = '0.7';

  const sendRequest = (lat, lng) => {
    socket.emit('request-ride', {
      routeId: routeId,
      name: name,
      phone: phone,
      userLat: lat,
      userLng: lng
    });
    btn.innerText = 'Waiting for driver...';
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => sendRequest(pos.coords.latitude, pos.coords.longitude),
      (err) => sendRequest(25.0961, 85.3131), // Fallback Bihar center
      { timeout: 5000 }
    );
  } else {
    sendRequest(25.0961, 85.3131);
  }
}

// ─── Generate Seat Layout by Vehicle Type ────────────────────
function generateSeatLayout(vehicle) {
  const { vehicle_type, total_seats, filled_seats } = vehicle;
  let html = '<div class="seat-grid">';

  if (vehicle_type === 'auto') {
    // Auto: Driver row + 2 seats + 1 seat
    html += `<div class="seat-row"><div class="seat driver">🚗 Driver</div></div>`;
    html += `<div class="seat-row">`;
    html += `<div class="seat ${filled_seats >= 1 ? 'filled' : 'empty'}">S1</div>`;
    html += `<div class="seat ${filled_seats >= 2 ? 'filled' : 'empty'}">S2</div>`;
    html += `</div>`;
    html += `<div class="seat-row">`;
    html += `<div class="seat ${filled_seats >= 3 ? 'filled' : 'empty'}">S3</div>`;
    html += `</div>`;
  } else if (vehicle_type === 'bus') {
    // Bus: 2-column layout
    html += `<div class="seat-row"><div class="seat driver">🚌 Driver</div></div>`;
    for (let i = 0; i < total_seats; i += 2) {
      html += `<div class="seat-row">`;
      html += `<div class="seat ${i < filled_seats ? 'filled' : 'empty'}">S${i + 1}</div>`;
      if (i + 1 < total_seats) {
        html += `<div class="seat ${(i + 1) < filled_seats ? 'filled' : 'empty'}">S${i + 2}</div>`;
      }
      html += `</div>`;
    }
  } else {
    // Car: Driver + passenger rows
    html += `<div class="seat-row"><div class="seat driver">🚗 Driver</div>`;
    html += `<div class="seat ${filled_seats >= 1 ? 'filled' : 'empty'}">S1</div></div>`;
    html += `<div class="seat-row">`;
    for (let i = 1; i < total_seats; i++) {
      html += `<div class="seat ${i < filled_seats ? 'filled' : 'empty'}">S${i + 1}</div>`;
    }
    html += `</div>`;
  }

  html += '</div>';
  return html;
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

  socket.on('ride-accepted', (data) => {
    showToast(`✅ Ride Accepted by ${data.driverName || 'Driver'}! They are on the way.`, 'success');

    const wrapper = document.getElementById(`requestFormWrapper-${data.routeId}`);
    if (wrapper) {
      wrapper.innerHTML = `
        <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success); border-radius: 8px; text-align: center;">
          <h4 style="color: var(--success); margin-bottom: 4px;">Ride Confirmed!</h4>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Tracking live location on map. You can close this window now.</p>
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
