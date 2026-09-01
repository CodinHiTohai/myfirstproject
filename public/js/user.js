// ═══════════════════════════════════════════════════════════════
// Eye In – User Side JavaScript (Complete Rewrite)
// ═══════════════════════════════════════════════════════════════

const socket = io();
let map, markers = {};
let vehiclesData = [];
let userLat = null, userLng = null;
// OTP system removed — direct booking enabled
let selectedFeedbackType = 'suggestion';

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

  // Update route info UI
  const routeText = `${pickup} → ${destination}`;
  const routeInfo = document.getElementById('routeInfo');
  const routePill = document.getElementById('routeInfoPill');
  if (routeInfo) routeInfo.textContent = routeText;
  if (routePill) routePill.textContent = routeText;

  // Init map
  initMap();

  // Search routes
  searchRoutes(pickup, destination);

  // Real-time updates
  setupSocketListeners();

  // Pre-fill saved user info
  prefillUserInfo();
});

// ─── Mobile Tab Switcher ─────────────────────────────────────
function showTab(tab) {
  const vehiclePanel = document.getElementById('vehiclePanel');
  const mapPanel = document.getElementById('mapPanel');
  const tabVehicles = document.getElementById('tabVehicles');
  const tabMap = document.getElementById('tabMap');

  if (tab === 'vehicles') {
    vehiclePanel.classList.remove('hidden');
    mapPanel.classList.add('hidden');
    tabVehicles.classList.add('active');
    tabMap.classList.remove('active');
  } else {
    vehiclePanel.classList.add('hidden');
    mapPanel.classList.remove('hidden');
    tabMap.classList.add('active');
    tabVehicles.classList.remove('active');
    setTimeout(() => { if (map) map.invalidateSize(); }, 100);
  }
}

// ─── Pre-fill saved user info ─────────────────────────────────
function prefillUserInfo() {
  // Will be applied when modal opens
}

// ─── Initialize Leaflet Map ───────────────────────────────────
function initMap() {
  const defaultLat = 25.0961;
  const defaultLng = 85.3131;

  map = L.map('map', {
    zoomControl: true,
    attributionControl: true
  }).setView([defaultLat, defaultLng], 7);

  // Dark map tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors, © CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Watch user location
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
            icon: L.divIcon({ className: 'vehicle-marker', html: '📍', iconSize: [32, 32], iconAnchor: [16, 16] })
          }).addTo(map).bindPopup('<div class="map-popup-title">📍 Aap yahan hain</div>');
        } else {
          myMarker.setLatLng([lat, lng]);
        }
      },
      () => {
        console.log('Geolocation denied. Using default view.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }
}

// ─── Search Routes API ────────────────────────────────────────
async function searchRoutes(pickup, destination) {
  try {
    const res = await fetch(`/api/routes/search?pickup=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(destination)}`);
    const data = await res.json();

    vehiclesData = data;
    renderVehicleList(data);
    renderMapMarkers(data);

  } catch (err) {
    console.error('Error fetching routes:', err);
    document.getElementById('vehicleList').innerHTML = `
      <div class="empty-state-premium">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Something went wrong</div>
        <div class="empty-state-desc">Server se connect nahi ho pa raha. Thodi der baad try karo.</div>
      </div>
    `;
  }
}

// ─── Render Vehicle List ──────────────────────────────────────
function renderVehicleList(vehicles) {
  const container = document.getElementById('vehicleList');
  const countBadge = document.getElementById('vehicleCountBadge');
  const countEl = document.getElementById('vehicleCount');

  if (vehicles.length === 0) {
    if (countBadge) countBadge.style.display = 'none';
    container.innerHTML = `
      <div class="empty-state-premium">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">Koi vehicle nahi mila</div>
        <div class="empty-state-desc">Is route pe abhi koi vehicle available nahi hai.<br>Thodi der baad dobara search karo ya route change karo.</div>
      </div>
    `;
    return;
  }

  if (countBadge) { countBadge.style.display = 'inline-flex'; }
  if (countEl) countEl.textContent = vehicles.length;

  container.innerHTML = vehicles.map((v, index) => {
    const emptySeats = v.total_seats - v.filled_seats;
    const fillPercent = v.total_seats > 0 ? Math.round((v.filled_seats / v.total_seats) * 100) : 0;
    const fillClass = fillPercent < 50 ? 'good' : fillPercent < 80 ? 'medium' : 'low';
    const etaBadge = getETABadge(v);
    const ratingStars = getStarRatingInline(v.avg_rating, v.total_ratings);

    return `
      <div class="vehicle-card" style="animation-delay:${index * 0.08}s" id="vehicle-card-${v.id}" onclick="showVehicleDetail(${v.id})">
        <div class="card-top">
          <div class="card-left">
            <div class="vehicle-type-badge ${v.vehicle_type}">${vehicleEmojis[v.vehicle_type] || '🚗'}</div>
            <div>
              <div class="vehicle-card-name">${capitalize(v.vehicle_type)} – ${v.vehicle_number}</div>
              <div class="vehicle-card-driver">👤 ${v.driver_name}</div>
              <div>${ratingStars}</div>
            </div>
          </div>
          <div class="card-right">
            <div class="fare-badge-premium">₹${v.fare}</div>
            <div class="eta-badge-premium">${etaBadge}</div>
          </div>
        </div>
        <div class="card-route">
          <span class="card-route-from">📍 ${v.start_location}</span>
          <span class="card-route-arrow">→</span>
          <span class="card-route-to">🎯 ${v.end_location}</span>
        </div>
        <div class="seat-bar-wrap">
          <div class="seat-bar-label">
            <span class="available">${emptySeats} seats available</span>
            <span class="total">${v.filled_seats}/${v.total_seats} filled</span>
          </div>
          <div class="seat-progress-track">
            <div class="seat-progress-fill ${fillClass}" style="width:${fillPercent}%"></div>
          </div>
        </div>
        <div class="card-footer">
          <div class="star-rating">${ratingStars}</div>
          <button class="share-btn-card" onclick="event.stopPropagation();shareVehicle(${v.id})">📤 Share</button>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Generate Seat Dots ───────────────────────────────────────
function generateSeatDots(total, filled) {
  let dots = '';
  const maxDots = Math.min(total, 20);
  const filledDots = Math.min(filled, maxDots);
  for (let i = 0; i < maxDots; i++) {
    dots += `<div class="seat-dot ${i < filledDots ? 'filled' : 'empty'}"></div>`;
  }
  if (total > 20) {
    dots += `<span style="font-size:0.75rem;color:var(--text-muted);margin-left:4px;">+${total - 20}</span>`;
  }
  return dots;
}

// ─── Render Map Markers ───────────────────────────────────────
function renderMapMarkers(vehicles) {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  if (vehicles.length === 0) return;

  const bounds = L.latLngBounds();

  vehicles.forEach(v => {
    if (!v.current_lat || !v.current_lng) return;

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
        Fare: ₹${v.fare} | Seats: ${emptySeats} available
      </div>
    `);

    markers[v.id] = marker;
    bounds.extend([v.current_lat, v.current_lng]);
  });

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }
}

// ─── Selected Seats Tracking ──────────────────────────────────
let selectedSeats = {};

// ─── Show Vehicle Detail Modal ────────────────────────────────
function showVehicleDetail(routeId) {
  const vehicle = vehiclesData.find(v => v.id === routeId);
  if (!vehicle) return;

  const emptySeats = vehicle.total_seats - vehicle.filled_seats;
  selectedSeats[routeId] = new Set();
  // OTP state removed

  const seatLayout = generateSeatLayout(vehicle);
  const ratingStars = getStarRating(vehicle.avg_rating, vehicle.total_ratings);

  // Auto-fill from localStorage
  const savedName = localStorage.getItem('eyein_name') || '';
  const savedPhone = localStorage.getItem('eyein_phone') || '';

  document.getElementById('modalBody').innerHTML = `
    <!-- Modal Hero -->
    <div class="modal-hero">
      <div class="modal-hero-top">
        <div class="modal-vehicle-icon ${vehicle.vehicle_type}">${vehicleEmojis[vehicle.vehicle_type] || '🚗'}</div>
        <div>
          <div class="modal-hero-title">${capitalize(vehicle.vehicle_type)} – ${vehicle.vehicle_number}</div>
          <div class="modal-hero-sub">${vehicle.driver_name} • ${vehicle.start_location} → ${vehicle.end_location}</div>
          <div style="margin-top:4px;">${ratingStars}</div>
        </div>
      </div>
      <div class="modal-stats-row">
        <div class="modal-stat-card">
          <div class="modal-stat-val purple">₹${vehicle.fare}</div>
          <div class="modal-stat-lbl">Fare</div>
        </div>
        <div class="modal-stat-card">
          <div class="modal-stat-val ${emptySeats > 0 ? 'green' : 'orange'}">${emptySeats}</div>
          <div class="modal-stat-lbl">Available</div>
        </div>
        <div class="modal-stat-card">
          <div class="modal-stat-val orange">${vehicle.total_seats}</div>
          <div class="modal-stat-lbl">Total</div>
        </div>
      </div>
    </div>

    <div class="modal-body">
      <!-- Driver Profile Link -->
      <div class="driver-profile-link" onclick="showDriverProfile(${vehicle.driver_id || vehicle.id})">
        <div class="driver-profile-left">
          <div class="driver-avatar-sm">🚗</div>
          <div>
            <div class="driver-name-link">${vehicle.driver_name}</div>
            <div class="driver-see-profile">Driver profile dekhein →</div>
          </div>
        </div>
        <span class="driver-arrow">›</span>
      </div>

      <!-- Seat Selection -->
      <div class="seat-section">
        <div class="modal-section-heading">💺 Apni Seat Chuno</div>
        <div class="seat-legend">
          <span class="legend-chip available"><span class="legend-dot"></span>Khaali</span>
          <span class="legend-chip occupied"><span class="legend-dot"></span>Bhari</span>
          <span class="legend-chip selected"><span class="legend-dot"></span>Aapka</span>
          <span class="legend-chip driver"><span class="legend-dot"></span>Driver</span>
        </div>
        ${seatLayout}
        <div class="selection-counter" id="selectionCounter-${routeId}">Seat select karein ☝️</div>
      </div>

      <!-- Booking Form -->
      <div class="booking-section" id="requestFormWrapper-${vehicle.id}">
        <div class="modal-section-heading">🎫 Book Your Ride</div>

        <div class="booking-input-wrap">
          <span class="booking-input-icon">👤</span>
          <input type="text" id="passengerName" class="booking-input" placeholder="Aapka Naam" value="${savedName}" autocomplete="off">
        </div>
        <div class="booking-input-wrap">
          <span class="booking-input-icon">📱</span>
          <span class="phone-prefix">+91</span>
          <input type="tel" id="passengerPhone" class="booking-input" placeholder="Mobile Number" maxlength="10" value="${savedPhone}" autocomplete="off">
        </div>

        <div class="counters-row">
          <div class="counter-card">
            <div class="counter-label">👥 Kitne log?</div>
            <div class="counter-controls">
              <button class="counter-btn" onclick="changePassengers(-1, ${vehicle.id})">−</button>
              <span class="counter-value" id="passengerCount-${vehicle.id}">1</span>
              <button class="counter-btn" onclick="changePassengers(1, ${vehicle.id})">+</button>
            </div>
            <div class="counter-hint">max ${emptySeats}</div>
          </div>
          <div class="counter-card">
            <div class="counter-label">💺 Kitni seats?</div>
            <div class="counter-controls">
              <button class="counter-btn" onclick="changeSeats(-1, ${vehicle.id})">−</button>
              <span class="counter-value" id="requestedSeatsCount-${vehicle.id}">1</span>
              <button class="counter-btn" onclick="changeSeats(1, ${vehicle.id})">+</button>
            </div>
            <div class="counter-hint">max ${emptySeats}</div>
          </div>
        </div>

        <!-- Submit Button (direct booking — no OTP required) -->
        <button class="booking-submit-btn" onclick="submitRideRequest(${vehicle.id}, ${emptySeats})" id="requestBtn-${vehicle.id}">
          🚗 Send Request to Driver
        </button>
      </div>

      <!-- Share Section -->
      <div class="share-section">
        <div class="share-section-title">📤 Dost ke saath share karo</div>
        <div class="share-btns">
          <button class="share-btn-wa" onclick="shareVehicleWhatsApp(${vehicle.id})">
            💬 WhatsApp
          </button>
          <button class="share-btn-copy" onclick="copyVehicleLink(${vehicle.id})">
            🔗 Copy Link
          </button>
        </div>
      </div>
    </div>
  `;

  const modal = document.getElementById('vehicleModal');
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('open'), 10);
}

// ─── Close Modal ──────────────────────────────────────────────
function closeModal() {
  const modal = document.getElementById('vehicleModal');
  modal.classList.remove('open');
  setTimeout(() => { modal.style.display = 'none'; }, 300);
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'vehicleModal') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ─── Toggle Seat Selection ────────────────────────────────────
function toggleSeat(routeId, seatNum, totalEmpty) {
  if (!selectedSeats[routeId]) selectedSeats[routeId] = new Set();

  const seatEl = document.getElementById(`seat-${routeId}-${seatNum}`);
  if (!seatEl) return;

  if (selectedSeats[routeId].has(seatNum)) {
    selectedSeats[routeId].delete(seatNum);
    seatEl.className = 'rseat empty';
    seatEl.innerHTML = `<div class="rseat-backrest"></div><div class="rseat-cushion"><span class="rseat-icon">💺</span></div><div class="rseat-number">${seatNum}</div>`;
  } else {
    if (selectedSeats[routeId].size >= totalEmpty) {
      showToast(`Sirf ${totalEmpty} seats available hain!`, 'error');
      return;
    }
    selectedSeats[routeId].add(seatNum);
    seatEl.className = 'rseat selected';
    seatEl.innerHTML = `<div class="rseat-backrest"></div><div class="rseat-cushion"><span class="rseat-check">✅</span></div><div class="rseat-number">${seatNum}</div>`;
  }

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

// ─── Counter Helpers ──────────────────────────────────────────
function changePassengers(delta, routeId) {
  const el = document.getElementById(`passengerCount-${routeId}`);
  let val = parseInt(el.textContent) + delta;
  const vehicle = vehiclesData.find(v => v.id === routeId);
  const maxSeats = vehicle ? vehicle.total_seats - vehicle.filled_seats : 10;
  if (val < 1) val = 1;
  if (val > maxSeats) val = maxSeats;
  el.textContent = val;
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

// OTP Flow removed — Direct booking enabled without phone verification

// ─── Submit Ride Request ──────────────────────────────────────
function submitRideRequest(routeId, maxSeats) {
  const name = document.getElementById('passengerName')?.value?.trim();
  const phone = document.getElementById('passengerPhone')?.value?.trim();
  const passengers = parseInt(document.getElementById(`passengerCount-${routeId}`)?.textContent || '1');
  const seats = parseInt(document.getElementById(`requestedSeatsCount-${routeId}`)?.textContent || '1');

  if (!name || !phone) {
    showToast('Apna naam aur phone zaroor bharo.', 'error');
    return;
  }

  if (seats > maxSeats) {
    showToast(`Sirf ${maxSeats} seats available hain!`, 'error');
    return;
  }

  // Save to localStorage
  localStorage.setItem('eyein_name', name);
  localStorage.setItem('eyein_phone', phone);

  const seatNumbers = selectedSeats[routeId] ? Array.from(selectedSeats[routeId]).sort((a, b) => a - b) : [];

  const btn = document.getElementById(`requestBtn-${routeId}`);
  if (btn) {
    btn.innerHTML = '⏳ Location le raha hai...';
    btn.disabled = true;
  }

  const sendRequest = (lat, lng) => {
    socket.emit('request-ride', {
      routeId, name, phone, passengers, seats, seatNumbers,
      userLat: lat, userLng: lng
    });
    if (btn) btn.innerHTML = '⌛ Driver ka wait kar raha hai...';
    showToast('Ride request bhej diya! Driver respond karega.', 'info');
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => sendRequest(pos.coords.latitude, pos.coords.longitude),
      () => sendRequest(25.0961, 85.3131),
      { timeout: 5000 }
    );
  } else {
    sendRequest(25.0961, 85.3131);
  }
}

// ─── Share Functions ──────────────────────────────────────────
function shareVehicle(routeId) {
  const vehicle = vehiclesData.find(v => v.id === routeId);
  if (!vehicle) return;
  const text = `🚗 ${capitalize(vehicle.vehicle_type)} available: ${vehicle.start_location} → ${vehicle.end_location}\n💺 ${vehicle.total_seats - vehicle.filled_seats} seats, ₹${vehicle.fare}\n👉 Eye In: ${window.location.origin}`;
  if (navigator.share) {
    navigator.share({ title: 'Eye In – Vehicle Available', text, url: window.location.href });
  } else {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
}

function shareVehicleWhatsApp(routeId) {
  const vehicle = vehiclesData.find(v => v.id === routeId);
  if (!vehicle) return;
  const text = `🚗 ${capitalize(vehicle.vehicle_type)} available: ${vehicle.start_location} → ${vehicle.end_location}\n💺 ${vehicle.total_seats - vehicle.filled_seats} seats, ₹${vehicle.fare}\n👉 Eye In: ${window.location.href}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

function copyVehicleLink(routeId) {
  const vehicle = vehiclesData.find(v => v.id === routeId);
  if (!vehicle) return;
  const text = `${vehicle.start_location} → ${vehicle.end_location} | ${capitalize(vehicle.vehicle_type)} | ₹${vehicle.fare} | ${window.location.href}`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Link copy ho gaya! 📋', 'success');
  }).catch(() => {
    showToast('Copy nahi ho saka. Manually try karo.', 'error');
  });
}

// ─── Driver Profile Modal ─────────────────────────────────────
async function showDriverProfile(driverId) {
  const overlay = document.getElementById('driverProfileModal');
  const body = document.getElementById('driverProfileBody');
  overlay.classList.add('open');
  overlay.style.display = 'flex';

  body.innerHTML = `
    <div class="dprofile-header">
      <button class="dprofile-close" onclick="closeDriverProfile()">✕</button>
      <div class="dprofile-avatar">🚗</div>
      <div class="dprofile-name">Loading...</div>
    </div>
    <div class="dprofile-body" style="text-align:center;padding:24px;color:#64748b;">⏳ Profile load ho rahi hai...</div>
  `;

  try {
    const res = await fetch(`/api/routes/driver/${driverId}/profile`);
    const data = await res.json();

    const reviewsHtml = (data.reviews || []).slice(0, 5).map(r => `
      <div class="dprofile-review">
        <div class="dprofile-review-rating">${'⭐'.repeat(r.rating || 0)} ${r.rating}/5</div>
        <div class="dprofile-review-comment">${r.comment || 'No comment'}</div>
      </div>
    `).join('') || '<div style="color:#475569;font-size:0.82rem;text-align:center;padding:12px;">Abhi koi review nahi hai</div>';

    body.innerHTML = `
      <div class="dprofile-header">
        <button class="dprofile-close" onclick="closeDriverProfile()">✕</button>
        <div class="dprofile-avatar">🚗</div>
        <div class="dprofile-name">${data.name || 'Driver'}</div>
        <div class="dprofile-vehicle">${data.vehicle_number || ''} · ${capitalize(data.vehicle_type || 'vehicle')}</div>
      </div>
      <div class="dprofile-body">
        <div class="dprofile-stat-row">
          <div class="dprofile-stat">
            <div class="dprofile-stat-val" style="color:#f59e0b;">${parseFloat(data.avg_rating || 0).toFixed(1)}</div>
            <div class="dprofile-stat-lbl">Rating</div>
          </div>
          <div class="dprofile-stat">
            <div class="dprofile-stat-val" style="color:#10b981;">${data.total_rides || 0}</div>
            <div class="dprofile-stat-lbl">Rides</div>
          </div>
          <div class="dprofile-stat">
            <div class="dprofile-stat-val" style="color:#a78bfa;">${data.total_ratings || 0}</div>
            <div class="dprofile-stat-lbl">Reviews</div>
          </div>
        </div>
        <div style="font-size:0.82rem;font-weight:600;color:#94a3b8;margin-bottom:10px;">Recent Reviews</div>
        <div class="dprofile-reviews">${reviewsHtml}</div>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `
      <div class="dprofile-header">
        <button class="dprofile-close" onclick="closeDriverProfile()">✕</button>
        <div class="dprofile-avatar">🚗</div>
        <div class="dprofile-name">Driver Profile</div>
      </div>
      <div class="dprofile-body" style="text-align:center;padding:24px;color:#ef4444;">Profile load nahi hua. Try again.</div>
    `;
  }
}

function closeDriverProfile() {
  const overlay = document.getElementById('driverProfileModal');
  overlay.classList.remove('open');
  overlay.style.display = 'none';
}

// ─── Generate Seat Layout by Vehicle Type ─────────────────────
function generateSeatLayout(vehicle) {
  const { id: routeId } = vehicle;
  const total_seats = Number(vehicle.total_seats);
  const filled_seats = Number(vehicle.filled_seats);
  const emptySeats = total_seats - filled_seats;

  if (vehicle.vehicle_type === 'auto') {
    return generateAutoLayout(routeId, total_seats, filled_seats, emptySeats);
  } else if (vehicle.vehicle_type === 'bus') {
    return generateBusLayout(routeId, total_seats, filled_seats, emptySeats);
  } else {
    return generateCarLayout(routeId, total_seats, filled_seats, emptySeats);
  }
}

// ─── Auto Layout ──────────────────────────────────────────────
function generateAutoLayout(routeId, total, filled, emptySeats) {
  let frontSeats = '', middleSeats = '', backSeats = '';
  let currentSeatNum = 1;

  for (let i = 0; i < 2 && currentSeatNum <= total; i++) {
    frontSeats += renderRealisticSeat(routeId, currentSeatNum, filled >= currentSeatNum, emptySeats);
    currentSeatNum++;
  }
  if (total > 6) {
    for (let i = 0; i < 4 && currentSeatNum <= total; i++) {
      middleSeats += renderRealisticSeat(routeId, currentSeatNum, filled >= currentSeatNum, emptySeats);
      currentSeatNum++;
    }
  }
  for (let i = 0; i < 4 && currentSeatNum <= total; i++) {
    backSeats += renderRealisticSeat(routeId, currentSeatNum, filled >= currentSeatNum, emptySeats);
    currentSeatNum++;
  }

  return `
    <div class="realistic-vehicle auto-vehicle">
      <div class="auto-body-wrap">
        <svg class="auto-svg" viewBox="0 0 260 320" xmlns="http://www.w3.org/2000/svg">
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
          <path d="M50 80 Q50 30 130 25 Q210 30 210 80 L210 100 L50 100 Z" fill="url(#autoGrad)" stroke="rgba(245,158,11,0.5)" stroke-width="2"/>
          <rect x="55" y="98" width="6" height="70" rx="3" fill="rgba(245,158,11,0.3)"/>
          <rect x="199" y="98" width="6" height="70" rx="3" fill="rgba(245,158,11,0.3)"/>
          <rect x="40" y="165" width="180" height="120" rx="16" fill="url(#autoGrad)" stroke="rgba(245,158,11,0.4)" stroke-width="2"/>
          <circle cx="130" cy="55" r="14" fill="none" stroke="rgba(245,158,11,0.6)" stroke-width="2.5"/>
          <line x1="130" y1="69" x2="130" y2="90" stroke="rgba(245,158,11,0.5)" stroke-width="2"/>
          <circle cx="130" cy="305" r="14" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
          <circle cx="55" cy="290" r="12" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
          <circle cx="205" cy="290" r="12" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
          <ellipse cx="130" cy="95" rx="10" ry="6" fill="rgba(253,224,71,0.3)" filter="url(#autoGlow)"/>
        </svg>
        <div class="auto-driver-area">
          <div class="driver-badge-real"><span class="driver-wheel">🎡</span><span>Driver</span></div>
        </div>
        <div class="auto-seats-overlay">
          ${frontSeats ? `<div class="auto-seat-row front-row">${frontSeats}</div>` : ''}
          ${middleSeats ? `<div class="auto-seat-row middle-row" style="margin-top:2px;gap:6px;">${middleSeats}</div>` : ''}
          ${backSeats ? `<div class="auto-seat-row back-row" style="margin-top:2px;gap:6px;">${backSeats}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ─── Car Layout ───────────────────────────────────────────────
function generateCarLayout(routeId, total, filled, emptySeats) {
  let backSeats = '';
  for (let i = 2; i <= Math.min(total, 4); i++) {
    backSeats += renderRealisticSeat(routeId, i, i <= filled + 1 && i - 1 < filled, emptySeats);
  }

  return `
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
          <path d="M40 60 Q40 20 120 15 Q200 20 200 60 L210 100 Q215 120 210 140 L210 280 Q210 310 200 330 Q190 350 120 355 Q50 350 40 330 Q30 310 30 280 L30 140 Q25 120 30 100 Z" fill="url(#carGrad)" stroke="rgba(16,185,129,0.4)" stroke-width="2"/>
          <path d="M55 70 Q55 45 120 40 Q185 45 185 70 L185 100 L55 100 Z" fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.3)" stroke-width="1.5"/>
          <path d="M60 290 L180 290 Q175 320 120 325 Q65 320 60 290 Z" fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.3)" stroke-width="1.5"/>
          <ellipse cx="22" cy="108" rx="10" ry="6" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.3)" stroke-width="1"/>
          <ellipse cx="218" cy="108" rx="10" ry="6" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.3)" stroke-width="1"/>
          <ellipse cx="65" cy="30" rx="12" ry="6" fill="rgba(253,224,71,0.2)" filter="url(#carGlow)"/>
          <ellipse cx="175" cy="30" rx="12" ry="6" fill="rgba(253,224,71,0.2)" filter="url(#carGlow)"/>
          <ellipse cx="60" cy="340" rx="10" ry="5" fill="rgba(239,68,68,0.25)" filter="url(#carGlow)"/>
          <ellipse cx="180" cy="340" rx="10" ry="5" fill="rgba(239,68,68,0.25)" filter="url(#carGlow)"/>
        </svg>
        <div class="car-driver-area">
          <div class="driver-badge-real car"><span class="driver-wheel">🎡</span><span>D</span></div>
        </div>
        <div class="car-seats-front">${renderRealisticSeat(routeId, 1, filled >= 1, emptySeats)}</div>
        <div class="car-seats-back">${backSeats}</div>
      </div>
    </div>
  `;
}

// ─── Bus Layout ───────────────────────────────────────────────
function generateBusLayout(routeId, total, filled, emptySeats) {
  const rows = Math.ceil(total / 4);
  let seatNum = 1;
  let rowsHtml = '';

  for (let r = 0; r < rows; r++) {
    let leftSeats = '', rightSeats = '';
    for (let c = 0; c < 2 && seatNum <= total; c++) {
      leftSeats += renderRealisticSeat(routeId, seatNum, seatNum <= filled, emptySeats);
      seatNum++;
    }
    for (let c = 0; c < 2 && seatNum <= total; c++) {
      rightSeats += renderRealisticSeat(routeId, seatNum, seatNum <= filled, emptySeats);
      seatNum++;
    }
    let midDoor = '';
    if (r === Math.floor(rows / 2) - 1 && rows > 3) {
      midDoor = `<div class="bus-mid-door"><span>🚪</span>Emergency Exit</div>`;
    }
    rowsHtml += `
      <div class="bus-seat-row">
        <span class="bus-row-num">${r + 1}</span>
        <div class="bus-left-pair">${leftSeats}</div>
        <div class="bus-aisle-gap"></div>
        <div class="bus-right-pair">${rightSeats}</div>
      </div>${midDoor}
    `;
  }

  const routeVehicle = vehiclesData.find(v => v.id === routeId);
  return `
    <div class="realistic-vehicle bus-vehicle">
      <div class="bus-body-wrap">
        <div class="bus-front">
          <div class="bus-windshield">
            <span class="bus-front-lights">💡</span>
            <span class="bus-route-display">${routeVehicle?.start_location?.substring(0,10) || 'Route'}</span>
            <span class="bus-front-lights">💡</span>
          </div>
          <div class="bus-driver-row">
            <div class="driver-badge-real bus"><span class="driver-wheel">🎡</span><span>Driver</span></div>
            <div class="bus-entry-door"><span>🚪</span>Entry</div>
          </div>
        </div>
        <div class="bus-seats-container">${rowsHtml}</div>
        <div class="bus-rear"><div class="bus-rear-window"></div></div>
      </div>
    </div>
  `;
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

function renderSeat(routeId, seatNum, isFilled, totalEmpty) {
  return renderRealisticSeat(routeId, seatNum, isFilled, totalEmpty);
}

// ─── Socket.io Listeners ──────────────────────────────────────
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
    showToast('Ek vehicle ne apna route khatam kar diya.', 'info');
  });

  socket.on('new-route', (data) => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pickup')) {
      searchRoutes(params.get('pickup'), params.get('destination'));
    }
  });

  socket.on('route-updated', (data) => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pickup')) {
      searchRoutes(params.get('pickup'), params.get('destination'));
    }
  });

  socket.on('location-updated', (data) => {
    const marker = markers[data.routeId];
    if (!marker) return;

    // Smooth animation using lerp
    const currentLatLng = marker.getLatLng();
    const targetLat = data.lat;
    const targetLng = data.lng;
    const steps = 20;
    let step = 0;

    const animate = () => {
      step++;
      const t = step / steps;
      const lat = currentLatLng.lat + (targetLat - currentLatLng.lat) * t;
      const lng = currentLatLng.lng + (targetLng - currentLatLng.lng) * t;
      marker.setLatLng([lat, lng]);
      if (step < steps) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  });

  socket.on('ride-accepted', async (data) => {
    showToast(`✅ Ride Accepted by ${data.driverName || 'Driver'}! They are on the way.`, 'success');

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
      window._lastRideId = historyData.rideId;
    } catch (e) {
      console.error('Failed to save ride history:', e);
    }

    const wrapper = document.getElementById(`requestFormWrapper-${data.routeId}`);
    if (wrapper) {
      wrapper.innerHTML = `
        <div style="padding:20px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:14px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:8px;">✅</div>
          <h4 style="color:#10b981;margin-bottom:6px;font-family:'Outfit',sans-serif;">Ride Confirmed!</h4>
          <p style="font-size:0.85rem;color:#64748b;margin-bottom:16px;">Driver aa raha hai! Map pe live location dekho.</p>
          <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;margin-top:8px;">
            <button class="booking-submit-btn" style="background:linear-gradient(135deg,#f59e0b,#d97706);margin-bottom:10px;" onclick="document.getElementById('ratingSection-${data.routeId}').style.display='block';this.style.display='none';">
              ⭐ Rate Driver (Safar ke baad)
            </button>
            <div id="ratingSection-${data.routeId}" style="display:none;">
              <p style="font-size:0.85rem;font-weight:600;margin-bottom:10px;">⭐ Driver ko rate karo:</p>
              <div id="ratingStars" style="display:flex;gap:10px;justify-content:center;margin-bottom:12px;">
                ${[1,2,3,4,5].map(i => `<span class="rate-star" data-value="${i}" onclick="selectRating(${i})" style="font-size:2rem;cursor:pointer;transition:transform 0.2s;">☆</span>`).join('')}
              </div>
              <div class="booking-input-wrap">
                <span class="booking-input-icon">💬</span>
                <input type="text" id="ratingComment" class="booking-input" placeholder="Comment likhein (optional)">
              </div>
              <button class="booking-submit-btn" onclick="submitRating()">⭐ Rating Submit Karo</button>
            </div>
          </div>
        </div>
      `;
    }
  });

  socket.on('ride-rejected', (data) => {
    showToast('❌ Ride Request Declined. Koi aur vehicle try karo.', 'danger');
    const btn = document.getElementById(`requestBtn-${data.routeId}`);
    if (btn) {
      btn.innerHTML = '🚗 Send Request to Driver';
      btn.disabled = false;
    }
  });
}

// ─── Feedback Functions ───────────────────────────────────────
function openFeedback() {
  const overlay = document.getElementById('feedbackOverlay');
  overlay.classList.add('open');
  overlay.style.display = 'flex';
}

function closeFeedback() {
  const overlay = document.getElementById('feedbackOverlay');
  overlay.classList.remove('open');
  overlay.style.display = 'none';
}

function selectFeedbackType(chip, type) {
  selectedFeedbackType = type;
  document.querySelectorAll('.feedback-type-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
}

async function submitFeedback() {
  const message = document.getElementById('fbMessage')?.value?.trim();
  if (!message) {
    showToast('Message likhna zaroori hai!', 'error');
    return;
  }

  const name = document.getElementById('fbName')?.value?.trim() || 'Anonymous';
  const phone = document.getElementById('fbPhone')?.value?.trim() || '';

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, message, type: selectedFeedbackType })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Feedback bhej diya! Shukriya 🙏', 'success');
      closeFeedback();
      document.getElementById('fbMessage').value = '';
      document.getElementById('fbName').value = '';
      document.getElementById('fbPhone').value = '';
    } else {
      showToast(data.error || 'Feedback submit nahi hua', 'error');
    }
  } catch (err) {
    console.error('Feedback error:', err);
    showToast('Network error. Dobara try karo.', 'error');
  }
}

// ─── User Ride History ────────────────────────────────────────
function openUserHistory() {
  const overlay = document.getElementById('userHistoryModal');
  overlay.classList.add('open');
  overlay.style.display = 'flex';
}

function closeUserHistory() {
  const overlay = document.getElementById('userHistoryModal');
  overlay.classList.remove('open');
  overlay.style.display = 'none';
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'userHistoryModal') closeUserHistory();
});

async function fetchUserHistory() {
  const phone = document.getElementById('userHistoryPhone')?.value?.trim();
  const listContainer = document.getElementById('userHistoryList');

  if (!phone || phone.length < 10) {
    showToast('Valid phone number daalein', 'error');
    return;
  }

  listContainer.style.display = 'block';
  listContainer.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px;">⏳ Rides load ho rahi hain...</div>';
  document.getElementById('userHistoryPhoneSection').style.display = 'none';

  try {
    const res = await fetch(`/api/routes/ride-history/${encodeURIComponent(phone)}`);
    const rides = await res.json();

    if (!rides || rides.length === 0) {
      listContainer.innerHTML = '<div style="text-align:center;color:#64748b;padding:24px;"><div style="font-size:2rem;margin-bottom:8px;">🚌</div><p>Koi rides nahi mili is number pe.</p></div>';
      return;
    }

    listContainer.innerHTML = rides.map(ride => {
      const date = new Date(ride.created_at).toLocaleDateString('hi-IN');
      const statusColor = ride.status === 'completed' ? '#10b981' : '#6366f1';
      return `
        <div class="history-ride-item">
          <div class="history-ride-route">
            <span>📍 ${ride.start_location}</span>
            <span style="color:#334155;">→</span>
            <span>🎯 ${ride.end_location}</span>
          </div>
          <div class="history-ride-meta">
            <span>🚗 ${ride.driver_name} (${ride.vehicle_number})</span>
            <span style="color:#10b981;font-weight:600;">₹${ride.fare}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:0.75rem;">
            <span style="color:#475569;">🗓️ ${date}</span>
            <span style="color:${statusColor};font-weight:600;text-transform:capitalize;">${ride.status}</span>
          </div>
          ${ride.rating ? `<div style="color:#f59e0b;font-size:0.78rem;margin-top:4px;">${'⭐'.repeat(ride.rating)} ${ride.rating}/5</div>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load history:', err);
    listContainer.innerHTML = '<div style="color:#ef4444;text-align:center;padding:20px;">❌ Error loading rides</div>';
  }
}

// ─── Utilities ────────────────────────────────────────────────
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function showToast(msg, type = 'info') {
  const box = document.getElementById('toastBox');
  if (!box) return;
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️', danger: '🚫' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  box.appendChild(toast);
  requestAnimationFrame(() => { toast.classList.add('show'); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ─── ETA Calculation ──────────────────────────────────────────
function getETABadge(vehicle) {
  if (!userLat || !userLng || !vehicle.current_lat || !vehicle.current_lng) return '';
  const distKm = haversineDistance(userLat, userLng, vehicle.current_lat, vehicle.current_lng);
  const avgSpeedKmh = 25;
  const etaMinutes = Math.round((distKm / avgSpeedKmh) * 60);
  if (etaMinutes < 1) return '📍 Paas mein';
  if (etaMinutes > 120) return '';
  return `🕐 ~${etaMinutes} min`;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Star Rating Display ──────────────────────────────────────
function getStarRating(avgRating, totalRatings) {
  if (!totalRatings || totalRatings === 0) {
    return `<span style="font-size:0.72rem;color:#64748b;">Naya Driver</span>`;
  }
  const rating = parseFloat(avgRating) || 0;
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += i <= Math.floor(rating) ? '⭐' : '☆';
  }
  return `<span style="font-size:0.72rem;">${stars} <span style="color:#64748b;">(${rating}/5 · ${totalRatings} rides)</span></span>`;
}

function getStarRatingInline(avgRating, totalRatings) {
  if (!totalRatings || totalRatings === 0) {
    return `<span style="font-size:0.7rem;color:#475569;">New Driver</span>`;
  }
  const rating = parseFloat(avgRating) || 0;
  return `<span style="font-size:0.7rem;color:#f59e0b;">⭐ ${rating.toFixed(1)}</span><span style="font-size:0.68rem;color:#475569;"> (${totalRatings})</span>`;
}

// ─── Rating Selection & Submit ────────────────────────────────
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
      const starsDiv = document.getElementById('ratingStars');
      if (starsDiv) {
        starsDiv.parentElement.innerHTML = `
          <div style="padding:16px;text-align:center;">
            <div style="font-size:2rem;margin-bottom:6px;">🎉</div>
            <p style="font-weight:600;color:#10b981;">Rating submit ho gaya!</p>
            <p style="font-size:0.8rem;color:#64748b;">${'⭐'.repeat(selectedRating)} – Thank you!</p>
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
