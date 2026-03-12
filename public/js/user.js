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
  const ratingStars = getStarRating(vehicle.avg_rating, vehicle.total_ratings);

  document.getElementById('modalBody').innerHTML = `
    <!-- Premium Vehicle Header -->
    <div class="vmodal-hero">
      <div class="vmodal-hero-bg ${vehicle.vehicle_type}"></div>
      <div class="vmodal-hero-content">
        <div class="vmodal-vehicle-badge ${vehicle.vehicle_type}">${vehicleEmojis[vehicle.vehicle_type] || '🚗'}</div>
        <div class="vmodal-title-wrap">
          <h2 class="vmodal-title">${capitalize(vehicle.vehicle_type)}</h2>
          <div class="vmodal-subtitle">${vehicle.vehicle_number} • ${vehicle.driver_name}</div>
          <div style="margin-top: 4px;">${ratingStars}</div>
        </div>
      </div>
      <div class="vmodal-quick-stats">
        <div class="vqs-item">
          <span class="vqs-icon">📍</span>
          <span class="vqs-text">${vehicle.start_location} → ${vehicle.end_location}</span>
        </div>
        <div class="vqs-item">
          <span class="vqs-value fare">₹${vehicle.fare}</span>
          <span class="vqs-label">Fare</span>
        </div>
        <div class="vqs-item">
          <span class="vqs-value ${emptySeats > 0 ? 'available' : 'full'}">${emptySeats}</span>
          <span class="vqs-label">Seats Available</span>
        </div>
      </div>
    </div>

    <!-- Seat Selection Section -->
    <div class="seat-selection-section">
      <div class="section-heading">
        <span class="section-heading-icon">💺</span>
        <div>
          <h3>Apni Seat Chuno</h3>
          <p>Tap karke seat select karo</p>
        </div>
      </div>
      <div class="seat-legend-premium">
        <span class="legend-chip available"><span class="legend-dot"></span> Khaali</span>
        <span class="legend-chip occupied"><span class="legend-dot"></span> Bhari</span>
        <span class="legend-chip selected"><span class="legend-dot"></span> Aapka</span>
        <span class="legend-chip driver"><span class="legend-dot"></span> Driver</span>
      </div>
      ${seatLayout}
      <div class="selection-counter" id="selectionCounter-${routeId}">
        Seat select karein ☝️
      </div>
    </div>

    <!-- Premium Booking Card -->
    <div class="booking-card" id="requestFormWrapper-${vehicle.id}">
      <div class="booking-card-header">
        <span class="booking-card-icon">🎫</span>
        <div><h3>Book Your Ride</h3><p>Details bharo aur request bhejo</p></div>
      </div>
      
      <div class="booking-input-group">
        <div class="booking-input-wrap">
          <span class="booking-input-icon">👤</span>
          <input type="text" id="passengerName" class="booking-input" placeholder="Aapka Naam" autocomplete="off" />
        </div>
        <div class="booking-input-wrap">
          <span class="booking-input-icon">📱</span>
          <div class="phone-input-wrap">
            <span class="country-code">+91</span>
            <input type="tel" id="passengerPhone" class="booking-input phone" placeholder="Mobile Number" maxlength="10" autocomplete="off" />
          </div>
        </div>
      </div>

      <div class="booking-counters">
        <div class="counter-card">
          <div class="counter-label">👥 Kitne log?</div>
          <div class="counter-controls">
            <button class="counter-btn minus" onclick="changePassengers(-1, ${vehicle.id})">−</button>
            <span class="counter-value" id="passengerCount-${vehicle.id}">1</span>
            <button class="counter-btn plus" onclick="changePassengers(1, ${vehicle.id})">+</button>
          </div>
          <div class="counter-hint">max ${emptySeats} available</div>
        </div>
        <div class="counter-card">
          <div class="counter-label">💺 Kitni seats?</div>
          <div class="counter-controls">
            <button class="counter-btn minus" onclick="changeSeats(-1, ${vehicle.id})">−</button>
            <span class="counter-value" id="requestedSeatsCount-${vehicle.id}">1</span>
            <button class="counter-btn plus" onclick="changeSeats(1, ${vehicle.id})">+</button>
          </div>
          <div class="counter-hint">max ${emptySeats}</div>
        </div>
      </div>

      <button class="booking-submit-btn" onclick="submitRideRequest(${vehicle.id}, ${emptySeats})" id="requestBtn-${vehicle.id}">
        <span class="booking-btn-content">
          <span class="booking-btn-icon">🚗</span>
          <span>Send Request to Driver</span>
        </span>
        <span class="booking-btn-shine"></span>
      </button>
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
    seatEl.className = 'rseat empty';
    seatEl.innerHTML = `<div class="rseat-backrest"></div><div class="rseat-cushion"><span class="rseat-icon">💺</span></div><div class="rseat-number">${seatNum}</div>`;
  } else {
    // Select — check if not exceeding empty seats
    if (selectedSeats[routeId].size >= totalEmpty) {
      showToast(`Sirf ${totalEmpty} seats available hain!`, 'error');
      return;
    }
    selectedSeats[routeId].add(seatNum);
    seatEl.className = 'rseat selected';
    seatEl.innerHTML = `<div class="rseat-backrest"></div><div class="rseat-cushion"><span class="rseat-check">✅</span></div><div class="rseat-number">${seatNum}</div>`;
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
  const seatNumbers = selectedSeats[routeId] ? Array.from(selectedSeats[routeId]).sort((a, b) => a - b) : [];

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
  const { id: routeId } = vehicle;

  // Safe cast incoming data to prevent `"5" > 6` type string logic issues
  const total_seats = Number(vehicle.total_seats);
  const filled_seats = Number(vehicle.filled_seats);
  const vehicle_type = vehicle.vehicle_type;

  const emptySeats = total_seats - filled_seats;

  if (vehicle_type === 'auto') {
    return generateAutoLayout(routeId, total_seats, filled_seats, emptySeats);
  } else if (vehicle_type === 'bus') {
    return generateBusLayout(routeId, total_seats, filled_seats, emptySeats);
  } else {
    return generateCarLayout(routeId, total_seats, filled_seats, emptySeats);
  }
}

// ─── Auto Layout (Realistic Auto Rickshaw) ───────────────────
function generateAutoLayout(routeId, total, filled, emptySeats) {
  let frontSeats = '';
  let middleSeats = '';
  let backSeats = '';

  let currentSeatNum = 1;
  // Front passenger row (next to driver) - up to 2 seats
  for (let i = 0; i < 2 && currentSeatNum <= total; i++) {
    frontSeats += renderRealisticSeat(routeId, currentSeatNum, filled >= currentSeatNum, emptySeats);
    currentSeatNum++;
  }

  // Middle row - up to 4 seats (Used if total > 6)
  if (total > 6) {
    for (let i = 0; i < 4 && currentSeatNum <= total; i++) {
      middleSeats += renderRealisticSeat(routeId, currentSeatNum, filled >= currentSeatNum, emptySeats);
      currentSeatNum++;
    }
  }

  // Back row - up to 4 seats
  for (let i = 0; i < 4 && currentSeatNum <= total; i++) {
    backSeats += renderRealisticSeat(routeId, currentSeatNum, filled >= currentSeatNum, emptySeats);
    currentSeatNum++;
  }

  const isMegaAuto = total > 6;
  const overlayScale = isMegaAuto ? 'transform: scale(0.85); transform-origin: top center;' : '';
  const rowGap = isMegaAuto ? '2px' : '6px';
  const svgScale = isMegaAuto ? 'transform: scaleY(1.1); transform-origin: top center;' : '';

  let html = `
    <div class="realistic-vehicle auto-vehicle">
      <!-- Auto Rickshaw SVG Shape -->
      <div class="auto-body-wrap">
        <svg class="auto-svg" viewBox="0 0 260 320" xmlns="http://www.w3.org/2000/svg" style="${svgScale}">
          <!-- Auto body outline -->
          <defs>
            <linearGradient id="autoGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgba(245,158,11,0.2)"/>
              <stop offset="100%" stop-color="rgba(245,158,11,0.05)"/>
            </linearGradient>
            <filter id="autoGlow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          
          <!-- Auto roof / canopy -->
          <path d="M50 80 Q50 30 130 25 Q210 30 210 80 L210 100 L50 100 Z" 
            fill="url(#autoGrad)" stroke="rgba(245,158,11,0.5)" stroke-width="2"/>
          
          <!-- Support pillars -->
          <rect x="55" y="98" width="6" height="70" rx="3" fill="rgba(245,158,11,0.3)"/>
          <rect x="199" y="98" width="6" height="70" rx="3" fill="rgba(245,158,11,0.3)"/>
          
          <!-- Main body -->
          <rect x="40" y="165" width="180" height="120" rx="16" 
            fill="url(#autoGrad)" stroke="rgba(245,158,11,0.4)" stroke-width="2"/>
          
          <!-- Handlebar area -->
          <circle cx="130" cy="55" r="14" fill="none" stroke="rgba(245,158,11,0.6)" stroke-width="2.5"/>
          <line x1="130" y1="69" x2="130" y2="90" stroke="rgba(245,158,11,0.5)" stroke-width="2"/>
          
          <!-- Front wheel area -->
          <circle cx="130" cy="305" r="14" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
          <circle cx="130" cy="305" r="5" fill="rgba(255,255,255,0.1)"/>
          
          <!-- Back wheels -->
          <circle cx="55" cy="290" r="12" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
          <circle cx="205" cy="290" r="12" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
          
          <!-- Headlight -->
          <ellipse cx="130" cy="95" rx="10" ry="6" fill="rgba(253,224,71,0.3)" filter="url(#autoGlow)"/>
        </svg>
        
        <!-- Driver area overlaid -->
        <div class="auto-driver-area">
          <div class="driver-badge-real">
            <span class="driver-wheel">🎡</span>
            <span>Driver</span>
          </div>
        </div>
        
        <!-- Seats overlaid on auto body -->
        <div class="auto-seats-overlay" style="${overlayScale}">
          ${frontSeats ? `<div class="auto-seat-row front-row">${frontSeats}</div>` : ''}
          ${middleSeats ? `<div class="auto-seat-row middle-row" style="margin-top: ${rowGap}; gap: 6px;">${middleSeats}</div>` : ''}
          ${backSeats ? `<div class="auto-seat-row back-row" style="margin-top: ${rowGap}; gap: 6px;">${backSeats}</div>` : ''}
        </div>
      </div>
    </div>
  `;
  return html;
}

// ─── Car Layout (Realistic Sedan Top-Down) ───────────────────
function generateCarLayout(routeId, total, filled, emptySeats) {
  let backSeats = '';
  for (let i = 2; i <= Math.min(total, 4); i++) {
    backSeats += renderRealisticSeat(routeId, i, i <= filled + 1 && i - 1 < filled, emptySeats);
  }

  let html = `
    <div class="realistic-vehicle car-vehicle">
      <div class="car-body-wrap">
        <svg class="car-svg" viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="carGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgba(16,185,129,0.15)"/>
              <stop offset="100%" stop-color="rgba(16,185,129,0.05)"/>
            </linearGradient>
            <filter id="carGlow">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          
          <!-- Car body -->
          <path d="M40 60 Q40 20 120 15 Q200 20 200 60 L210 100 Q215 120 210 140 L210 280 Q210 310 200 330 Q190 350 120 355 Q50 350 40 330 Q30 310 30 280 L30 140 Q25 120 30 100 Z" 
            fill="url(#carGrad)" stroke="rgba(16,185,129,0.4)" stroke-width="2"/>
          
          <!-- Windshield -->
          <path d="M55 70 Q55 45 120 40 Q185 45 185 70 L185 100 L55 100 Z" 
            fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.3)" stroke-width="1.5"/>
          
          <!-- Rear windshield -->
          <path d="M60 290 L180 290 Q175 320 120 325 Q65 320 60 290 Z" 
            fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.3)" stroke-width="1.5"/>
          
          <!-- Side mirrors -->
          <ellipse cx="22" cy="108" rx="10" ry="6" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.3)" stroke-width="1"/>
          <ellipse cx="218" cy="108" rx="10" ry="6" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.3)" stroke-width="1"/>
          
          <!-- Headlights -->
          <ellipse cx="65" cy="30" rx="12" ry="6" fill="rgba(253,224,71,0.2)" filter="url(#carGlow)"/>
          <ellipse cx="175" cy="30" rx="12" ry="6" fill="rgba(253,224,71,0.2)" filter="url(#carGlow)"/>
          
          <!-- Tail lights -->
          <ellipse cx="60" cy="340" rx="10" ry="5" fill="rgba(239,68,68,0.25)" filter="url(#carGlow)"/>
          <ellipse cx="180" cy="340" rx="10" ry="5" fill="rgba(239,68,68,0.25)" filter="url(#carGlow)"/>
          
          <!-- Door lines -->
          <line x1="35" y1="160" x2="35" y2="270" stroke="rgba(16,185,129,0.2)" stroke-width="1"/>
          <line x1="205" y1="160" x2="205" y2="270" stroke="rgba(16,185,129,0.2)" stroke-width="1"/>
          
          <!-- Center console line -->
          <line x1="120" y1="110" x2="120" y2="175" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="4,4"/>
        </svg>
        
        <!-- Driver area -->
        <div class="car-driver-area">
          <div class="driver-badge-real car">
            <span class="driver-wheel">🎡</span>
            <span>D</span>
          </div>
        </div>
        
        <!-- Front passenger seat -->
        <div class="car-seats-front">
          ${renderRealisticSeat(routeId, 1, filled >= 1, emptySeats)}
        </div>
        
        <!-- Back row seats -->
        <div class="car-seats-back">
          ${backSeats}
        </div>
      </div>
    </div>
  `;
  return html;
}

// ─── Bus Layout (Realistic Bus Cross-Section) ────────────────
function generateBusLayout(routeId, total, filled, emptySeats) {
  const rows = Math.ceil(total / 4);
  let seatNum = 1;
  let rowsHtml = '';

  for (let r = 0; r < rows; r++) {
    let leftSeats = '';
    let rightSeats = '';

    // Left pair
    for (let c = 0; c < 2 && seatNum <= total; c++) {
      leftSeats += renderRealisticSeat(routeId, seatNum, seatNum <= filled, emptySeats);
      seatNum++;
    }

    // Right pair
    for (let c = 0; c < 2 && seatNum <= total; c++) {
      rightSeats += renderRealisticSeat(routeId, seatNum, seatNum <= filled, emptySeats);
      seatNum++;
    }

    // Mid door
    let midDoor = '';
    if (r === Math.floor(rows / 2) - 1 && rows > 3) {
      midDoor = `<div class="bus-mid-door"><span>🚪</span> Emergency Exit</div>`;
    }

    rowsHtml += `
      <div class="bus-seat-row">
        <span class="bus-row-num">${r + 1}</span>
        <div class="bus-left-pair">${leftSeats}</div>
        <div class="bus-aisle-gap"></div>
        <div class="bus-right-pair">${rightSeats}</div>
      </div>
      ${midDoor}
    `;
  }

  let html = `
    <div class="realistic-vehicle bus-vehicle">
      <div class="bus-body-wrap">
        <!-- Bus front -->
        <div class="bus-front">
          <div class="bus-windshield">
            <span class="bus-front-lights">💡</span>
            <span class="bus-route-display">${vehiclesData.find(v => v.id === routeId)?.start_location?.substring(0, 10) || 'Route'}</span>
            <span class="bus-front-lights">💡</span>
          </div>
          <div class="bus-driver-row">
            <div class="driver-badge-real bus">
              <span class="driver-wheel">🎡</span>
              <span>Driver</span>
            </div>
            <div class="bus-entry-door">
              <span>🚪</span> Entry
            </div>
          </div>
        </div>
        
        <!-- Bus seat rows -->
        <div class="bus-seats-container">
          ${rowsHtml}
        </div>
        
        <!-- Bus rear -->
        <div class="bus-rear">
          <div class="bus-rear-window"></div>
        </div>
      </div>
    </div>
  `;
  return html;
}

// ─── Render a Realistic Single Seat ──────────────────────────
function renderRealisticSeat(routeId, seatNum, isFilled, totalEmpty) {
  if (isFilled) {
    return `<div class="rseat filled" title="Seat ${seatNum} — Bhari hai">
      <div class="rseat-backrest"></div>
      <div class="rseat-cushion"><span class="rseat-person">🧑</span></div>
      <div class="rseat-number">${seatNum}</div>
    </div>`;
  } else {
    return `<div class="rseat empty" id="seat-${routeId}-${seatNum}" 
      onclick="toggleSeat(${routeId}, ${seatNum}, ${totalEmpty})"
      title="Seat ${seatNum} — Khaali hai, tap to select">
      <div class="rseat-backrest"></div>
      <div class="rseat-cushion"><span class="rseat-icon">💺</span></div>
      <div class="rseat-number">${seatNum}</div>
    </div>`;
  }
}

// Legacy renderSeat for compatibility
function renderSeat(routeId, seatNum, isFilled, totalEmpty) {
  return renderRealisticSeat(routeId, seatNum, isFilled, totalEmpty);
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
    if (params.get('pickup')) {
      searchRoutes(params.get('pickup'), params.get('destination'));
    }
  });

  socket.on('route-updated', (data) => {
    // Refresh the search to reflect updated seats, fare, or route details
    const params = new URLSearchParams(window.location.search);
    if (params.get('pickup')) {
      searchRoutes(params.get('pickup'), params.get('destination'));
    }
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
  if (modal) modal.style.display = 'flex';
}

function closeUserHistory() {
  const modal = document.getElementById('userHistoryModal');
  if (modal) modal.style.display = 'none';
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
