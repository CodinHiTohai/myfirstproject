// ═══════════════════════════════════════════════════════════════
// Eye In – Driver Side JavaScript
// ═══════════════════════════════════════════════════════════════

const socket = io();
let driverData = null;
let currentRoute = null;
let driverAuthToken = null;
let currentRequest = null;
let watchId = null;
let isSimulating = false;
let simulationInterval = null;
let simulatedLat = 0;
let simulatedLng = 0;

// Setup Map Variables
let setupMap = null;
let setupStartMarker = null;
let setupEndMarker = null;
let pickMode = 'start'; // 'start' or 'end'
let selectedStartCoords = null;
let selectedEndCoords = null;

// Leaflet Map Variables
let driverMap = null;
let driverMarker = null;
let userMarkers = {};

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    driverAuthToken = localStorage.getItem('driverToken');
    const stored = localStorage.getItem('driverData');

    if (!driverAuthToken || !stored) {
        window.location.href = '/driver-login.html';
        return;
    }

    driverData = JSON.parse(stored);
    document.getElementById('driverInfo').textContent = `${driverData.name} • ${driverData.vehicle_number}`;
    
    // Display Rating
    if (driverData.total_ratings > 0) {
        const badge = document.getElementById('driverRatingBadge');
        if (badge) {
            badge.style.display = 'inline-block';
            badge.innerHTML = `⭐ ${parseFloat(driverData.avg_rating).toFixed(1)} <span style="font-weight: normal; opacity: 0.8;">(${driverData.total_ratings})</span>`;
        }
    }

    // Initialize Setup Map
    initSetupMap();

    // Load saved route preferences from localStorage first
    loadSavedRoutePreferences();

    // Check if driver has active route from server
    checkActiveRoute();
});

// ─── Load Saved Route Preferences ───────────────────────────
function loadSavedRoutePreferences() {
    const saved = localStorage.getItem('driverRoutePrefs');
    if (!saved) return;

    try {
        const prefs = JSON.parse(saved);
        if (prefs.startLocation) document.getElementById('startLocation').value = prefs.startLocation;
        if (prefs.endLocation) document.getElementById('endLocation').value = prefs.endLocation;
        if (prefs.stops) document.getElementById('stopsInput').value = prefs.stops;
        if (prefs.fare) document.getElementById('fareInput').value = prefs.fare;
        if (prefs.totalSeats) document.getElementById('seatsInput').value = prefs.totalSeats;

        // Show a saved badge
        const saveIndicator = document.getElementById('savedPrefsBadge');
        if (saveIndicator) {
            saveIndicator.style.display = 'flex';
        }

        showToast(`💾 Pichli route load ho gayi: ${prefs.startLocation} → ${prefs.endLocation}`, 'info');
    } catch (e) {
        console.error('Saved prefs load error:', e);
    }
}

// ─── Save Route Preferences to localStorage ─────────────────
function saveRoutePreferences() {
    const prefs = {
        startLocation: document.getElementById('startLocation').value.trim(),
        endLocation: document.getElementById('endLocation').value.trim(),
        stops: document.getElementById('stopsInput').value.trim(),
        fare: document.getElementById('fareInput').value,
        totalSeats: document.getElementById('seatsInput').value,
        savedAt: new Date().toLocaleString('hi-IN')
    };

    if (!prefs.startLocation || !prefs.endLocation) {
        showToast('Start aur End location fill karein pehle', 'error');
        return;
    }

    localStorage.setItem('driverRoutePrefs', JSON.stringify(prefs));
    showToast(`✅ Route save ho gayi! ${prefs.startLocation} → ${prefs.endLocation}`, 'success');

    // Update badge
    const saveIndicator = document.getElementById('savedPrefsBadge');
    if (saveIndicator) {
        saveIndicator.style.display = 'flex';
        saveIndicator.querySelector('span').textContent = `Saved: ${prefs.startLocation} → ${prefs.endLocation}`;
    }
}

// ─── Clear Saved Preferences ─────────────────────────────────
function clearSavedPreferences() {
    if (!confirm('Kya aap saved route delete karna chahte hain?')) return;
    localStorage.removeItem('driverRoutePrefs');
    document.getElementById('routeForm').reset();
    const saveIndicator = document.getElementById('savedPrefsBadge');
    if (saveIndicator) saveIndicator.style.display = 'none';
    showToast('🗑️ Saved route clear ho gayi', 'info');
}

// ─── Check Active Route from Server ─────────────────────────
async function checkActiveRoute() {
    if (!driverAuthToken) return;

    try {
        const res = await fetch('/api/routes/driver/active', {
            headers: { 'Authorization': `Bearer ${driverAuthToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            if (data && data.id) {
                currentRoute = data;
                activateLiveMode();
                showToast('🟢 Aapki pichli ride abhi bhi active hai!', 'success');
            }
        }
    } catch (err) {
        // Silently fail – this is optional
        console.log('No active route found or network error:', err.message);
    }
}

// ─── Setup Map Initialization ────────────────────────────────
function initSetupMap() {
    setupMap = L.map('setupMap').setView([25.0961, 85.3131], 7); // Bihar

    // High quality, user-friendly map tiles (CartoDB Voyager)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors, © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(setupMap);

    // Initialize Default Draggable Markers
    const startIcon = L.divIcon({ className: 'custom-marker', html: '🟢', iconSize: [28, 28] });
    const endIcon = L.divIcon({ className: 'custom-marker', html: '🔴', iconSize: [28, 28] });

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setupMap.setView([lat, lng], 13);

                setupStartMarker = L.marker([lat, lng], { icon: startIcon, draggable: true }).addTo(setupMap);
                setupEndMarker = L.marker([lat + 0.05, lng + 0.05], { icon: endIcon, draggable: true }).addTo(setupMap); // Offset End

                selectedStartCoords = { lat, lng };
                selectedEndCoords = { lat: lat + 0.05, lng: lng + 0.05 };

                reverseGeocode(lat, lng, 'startLocation');
                reverseGeocode(lat + 0.05, lng + 0.05, 'endLocation');
                bindDragEvents();
            },
            () => { initFallbackMarkers(startIcon, endIcon); },
            { timeout: 5000 }
        );
    } else {
        initFallbackMarkers(startIcon, endIcon);
    }
}

function initFallbackMarkers(startIcon, endIcon) {
    setupStartMarker = L.marker([25.5941, 85.1376], { icon: startIcon, draggable: true }).addTo(setupMap); // Patna
    setupEndMarker = L.marker([25.6100, 85.1500], { icon: endIcon, draggable: true }).addTo(setupMap); // Patna nearby
    selectedStartCoords = { lat: 25.5941, lng: 85.1376 };
    selectedEndCoords = { lat: 25.6100, lng: 85.1500 };
    bindDragEvents();
}

function bindDragEvents() {
    setupStartMarker.on('dragend', async function (e) {
        const coords = e.target.getLatLng();
        selectedStartCoords = { lat: coords.lat, lng: coords.lng };
        await reverseGeocode(coords.lat, coords.lng, 'startLocation');
    });

    setupEndMarker.on('dragend', async function (e) {
        const coords = e.target.getLatLng();
        selectedEndCoords = { lat: coords.lat, lng: coords.lng };
        await reverseGeocode(coords.lat, coords.lng, 'endLocation');
    });
}

async function reverseGeocode(lat, lng, inputId) {
    const loader = document.getElementById('setupMapLoading');
    loader.style.display = 'block';
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        const placeName = data.name || data.address.road || data.address.suburb || data.address.city || data.address.state || "Unknown Location";
        document.getElementById(inputId).value = placeName;
    } catch (err) {
        console.error("Geocoding failed:", err);
        showToast("Failed to fetch address name for this spot.", "error");
    } finally {
        loader.style.display = 'none';
    }
}

// ─── Go Live ──────────────────────────────────────────────────
async function goLive(e) {
    e.preventDefault();

    const start_location = document.getElementById('startLocation').value.trim();
    const end_location = document.getElementById('endLocation').value.trim();
    const stops = document.getElementById('stopsInput').value.trim();
    const fare = document.getElementById('fareInput').value;
    const total_seats = document.getElementById('seatsInput').value;

    const startLat = selectedStartCoords ? selectedStartCoords.lat : null;
    const startLng = selectedStartCoords ? selectedStartCoords.lng : null;

    if (!selectedStartCoords) {
        showToast('Map is still loading location, please wait a second.', 'warning');
        return;
    }

    const btn = document.getElementById('goLiveBtn');
    btn.textContent = 'Going Live...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/routes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${driverAuthToken}`
            },
            body: JSON.stringify({
                start_location,
                end_location,
                stops,
                fare,
                total_seats,
                lat: startLat,
                lng: startLng
            })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to go live');

        currentRoute = data;

        // ✅ AUTO-SAVE preferences whenever driver goes live
        const prefs = { startLocation: start_location, endLocation: end_location, stops, fare, totalSeats: total_seats, savedAt: new Date().toLocaleString('hi-IN') };
        localStorage.setItem('driverRoutePrefs', JSON.stringify(prefs));
        const saveIndicator = document.getElementById('savedPrefsBadge');
        if (saveIndicator) {
            saveIndicator.style.display = 'flex';
            const span = saveIndicator.querySelector('span');
            if (span) span.textContent = `Auto-saved: ${start_location} → ${end_location}`;
        }

        activateLiveMode();
        showToast('🟢 You are now LIVE! Route saved automatically.', 'success');

    } catch (err) {
        showToast(err.message, 'error');
        btn.textContent = '🟢 Go Live';
        btn.disabled = false;
    }
}

// ─── Activate Live Mode ──────────────────────────────────────
function activateLiveMode() {
    // Update status badge
    const badge = document.getElementById('statusBadge');
    badge.textContent = '🟢 LIVE';
    badge.className = 'badge badge-success';

    // Update stats
    updateStats();

    // Enable seat controls
    document.getElementById('fillBtn').disabled = false;
    document.getElementById('emptyBtn').disabled = false;
    document.getElementById('endRideBtn').disabled = false;
    document.getElementById('simulateBtn').disabled = false;

    // Disable route form
    document.getElementById('goLiveBtn').textContent = '✅ Route Active';
    document.getElementById('goLiveBtn').disabled = true;

    // Fill form with current route data
    document.getElementById('startLocation').value = currentRoute.start_location;
    document.getElementById('endLocation').value = currentRoute.end_location;
    document.getElementById('fareInput').value = currentRoute.fare;
    document.getElementById('seatsInput').value = currentRoute.total_seats;
    document.getElementById('stopsInput').value = currentRoute.stops || ''; // Fill stops if available

    // Render seat grid
    renderDriverSeatGrid();

    // Socket: Join driver room to listen for requests
    socket.emit('join-driver-room', currentRoute.id);

    // Initialize Map
    document.getElementById('mapSection').style.display = 'block';
    if (!driverMap) initDriverMap();

    // Start tracking GPS
    startTracking();
}

// ─── Initialize Map ──────────────────────────────────────────
function initDriverMap() {
    let lat = currentRoute.current_lat || 25.0961; // Default Bihar Center
    let lng = currentRoute.current_lng || 85.3131; // Default Bihar Center
    let defaultZoom = 7;

    // Use current route location if valid (fallback not used)
    if (currentRoute.current_lat) {
        defaultZoom = 14;
    }

    driverMap = L.map('driverMap').setView([lat, lng], defaultZoom);

    // High quality, user-friendly map tiles (CartoDB Voyager)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors, © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(driverMap);

    const driverIcon = L.divIcon({
        className: 'custom-driver-marker',
        html: `<div style="font-size: 28px;">🚗</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30]
    });

    driverMarker = L.marker([lat, lng], { icon: driverIcon }).addTo(driverMap)
        .bindPopup("Your Live Location").openPopup();

    // Always Try to get actual location to center map and sync immediately
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const actualLat = position.coords.latitude;
                const actualLng = position.coords.longitude;
                driverMap.setView([actualLat, actualLng], 14);
                driverMarker.setLatLng([actualLat, actualLng]);

                // Immediately broadcast real location to replace any old route coordinates
                if (currentRoute) {
                    socket.emit('driver-location-update', {
                        routeId: currentRoute.id,
                        lat: actualLat,
                        lng: actualLng
                    });
                    currentRoute.current_lat = actualLat;
                    currentRoute.current_lng = actualLng;
                }
            },
            () => {
                console.log("Geolocation access denied or unavailable. Using default map view.");
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
    }
}

// ─── Geolocation Tracking ────────────────────────────────────
function startTracking() {
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser', 'error');
        return;
    }

    document.getElementById('gpsTrackerBadge').style.display = 'flex';

    watchId = navigator.geolocation.watchPosition((position) => {
        if (!currentRoute) return;
        const { latitude, longitude } = position.coords;
        socket.emit('driver-location-update', {
            routeId: currentRoute.id,
            lat: latitude,
            lng: longitude
        });

        if (driverMarker && driverMap) {
            driverMarker.setLatLng([latitude, longitude]);
            driverMap.setView([latitude, longitude]);
        }
    }, (error) => {
        console.error('Error watching position:', error);
    }, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000
    });
}

function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    if (simulationInterval !== null) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        isSimulating = false;
    }
    document.getElementById('gpsTrackerBadge').style.display = 'none';
    const simBtn = document.getElementById('simulateBtn');
    if (simBtn) {
        simBtn.innerText = '📍 Simulate Drive';
        simBtn.style.background = 'var(--primary)';
    }
}

// ─── Simulation ─────────────────────────────────────────────
function toggleSimulation() {
    const btn = document.getElementById('simulateBtn');

    if (isSimulating) {
        // Stop Simulation
        clearInterval(simulationInterval);
        simulationInterval = null;
        isSimulating = false;
        btn.innerText = '📍 Simulate Drive';
        btn.style.background = 'var(--primary)';
        document.getElementById('gpsTrackerBadge').style.display = 'none';

        // Re-start real GPS if possible
        startTracking();
    } else {
        // Start Simulation
        isSimulating = true;
        btn.innerText = '🛑 Stop Simulation';
        btn.style.background = 'var(--danger)';

        // Stop real GPS
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }

        document.getElementById('gpsTrackerBadge').style.display = 'flex';
        document.getElementById('gpsTrackerBadge').innerHTML = '<div class="dot pulse-dot" style="background: white;"></div> Simulating Location';

        // Initialize mock coords (fallback to actual default if needed)
        if (driverMarker) {
            const pos = driverMarker.getLatLng();
            simulatedLat = pos.lat;
            simulatedLng = pos.lng;
        } else {
            simulatedLat = currentRoute.current_lat || 25.0961;
            simulatedLng = currentRoute.current_lng || 85.3131;
        }

        simulationInterval = setInterval(() => {
            if (!currentRoute) return;
            // Move slightly northeast
            simulatedLat += 0.0002;
            simulatedLng += 0.0002;

            socket.emit('driver-location-update', {
                routeId: currentRoute.id,
                lat: simulatedLat,
                lng: simulatedLng
            });

            if (driverMarker && driverMap) {
                driverMarker.setLatLng([simulatedLat, simulatedLng]);
                driverMap.setView([simulatedLat, simulatedLng]);
            }
        }, 2000); // Update every 2 seconds
    }
}

// ─── Ride Requests ───────────────────────────────────────────
async function respondToRide(accepted) {
    clearTimeout(requestTimeout);

    if (!currentRequest || !currentRoute) return; // Use currentRequest and currentRoute

    document.getElementById('rideRequestModal').style.display = 'none'; // Hide modal here

    if (accepted) {
        socket.emit('accept-ride', {
            userId: currentRequest.userId,
            routeId: currentRoute.id,
            driverName: driverData.name,
            vehicleNumber: driverData.vehicle_number,
            driverId: currentRoute.driver_id,
            passengerName: currentRequest.name,
            passengerPhone: currentRequest.phone,
            passengers: currentRequest.passengers || 1,
            seats: currentRequest.seats || 1
        });

        // Automatically update the seats based on requested seats
        try {
            const res = await fetch(`/api/routes/${currentRoute.id}/seats`, { // Use currentRoute.id
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${driverAuthToken}` // Use driverAuthToken
                },
                body: JSON.stringify({ action: 'fill', count: currentRequest.seats }) // Use currentRequest.seats
            });

            if (res.ok) {
                const data = await res.json();
                currentRoute.filled_seats = data.filled_seats;
                currentRoute.total_seats = data.total_seats;
                updateStats();
                renderDriverSeatGrid();
                showToast(`✅ Accepted ride. Filled ${currentRequest.seats} seat(s).`, 'success');
            } else {
                showToast('Accepted ride, but could not update seats automatically.', 'warning');
            }
        } catch (err) {
            console.error(err);
            showToast('Accepted ride, but an error occurred updating seats.', 'error');
        }

    } else {
        socket.emit('reject-ride', {
            userId: currentRequest.userId,
            routeId: currentRoute.id // Use currentRoute.id
        });
        showToast(`❌ You rejected a ride for ${currentRequest.name}`, 'info');
    }

    currentRequest = null; // Clear current request after responding
}

// ─── Update Stats ────────────────────────────────────────────
function updateStats() {
    if (!currentRoute) return;

    const empty = currentRoute.total_seats - currentRoute.filled_seats;
    document.getElementById('statEmptySeats').textContent = empty;
    document.getElementById('statFilledSeats').textContent = currentRoute.filled_seats;
    document.getElementById('statRoute').textContent = `${currentRoute.start_location} → ${currentRoute.end_location}`;
    document.getElementById('statRoute').style.fontSize = '0.9rem';
    document.getElementById('statFare').textContent = `₹${currentRoute.fare}`;
    document.getElementById('filledCount').textContent = currentRoute.filled_seats;
    document.getElementById('totalCount').textContent = currentRoute.total_seats;
}

// ─── Render Driver Seat Grid ─────────────────────────────────
function renderDriverSeatGrid() {
    if (!currentRoute) return;

    const container = document.getElementById('driverSeatGrid');
    const { total_seats, filled_seats } = currentRoute;

    let html = '<div class="seat-grid">';
    html += `<div class="seat-row"><div class="seat driver">🚗 Driver</div></div>`;

    const seatsToShow = Math.min(total_seats, 20);
    for (let i = 0; i < seatsToShow; i += 2) {
        html += '<div class="seat-row">';
        html += `<div class="seat ${i < filled_seats ? 'filled' : 'empty'}">S${i + 1}</div>`;
        if (i + 1 < seatsToShow) {
            html += `<div class="seat ${(i + 1) < filled_seats ? 'filled' : 'empty'}">S${i + 2}</div>`;
        }
        html += '</div>';
    }

    if (total_seats > 20) {
        html += `<div style="text-align:center; color: var(--text-muted); font-size: 0.8rem; margin-top: 8px;">+${total_seats - 20} more seats</div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// ─── Update Seat ─────────────────────────────────────────────
async function updateSeat(action, count = 1) { // Added count parameter
    if (!currentRoute) return;

    try {
        const res = await fetch(`/api/routes/${currentRoute.id}/seats`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${driverAuthToken}`
            },
            body: JSON.stringify({ action, count }) // Pass count to backend
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Update failed');

        currentRoute.filled_seats = data.filled_seats;
        currentRoute.total_seats = data.total_seats;
        updateStats();
        renderDriverSeatGrid();

        const emoji = action === 'fill' ? '🔴' : '🟢';
        showToast(`${emoji} ${count} Seat(s) ${action === 'fill' ? 'filled' : 'emptied'} — ${data.empty_seats} seats available`, 'success');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── End Ride ────────────────────────────────────────────────
async function endRide() {
    if (!currentRoute) return;
    if (!confirm('Are you sure you want to end this ride?')) return;

    try {
        const res = await fetch(`/api/routes/${currentRoute.id}/end`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${driverAuthToken}`
            }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to end ride');

        currentRoute = null;
        stopTracking();

        // Reset UI
        const badge = document.getElementById('statusBadge');
        badge.textContent = 'Offline';
        badge.className = 'badge badge-danger';

        document.getElementById('statEmptySeats').textContent = '–';
        document.getElementById('statFilledSeats').textContent = '–';
        document.getElementById('statRoute').textContent = '–';
        document.getElementById('statFare').textContent = '–';
        document.getElementById('filledCount').textContent = '0';
        document.getElementById('totalCount').textContent = '0';
        document.getElementById('driverSeatGrid').innerHTML = '';

        document.getElementById('fillBtn').disabled = true;
        document.getElementById('emptyBtn').disabled = true;
        document.getElementById('endRideBtn').disabled = true;
        document.getElementById('simulateBtn').disabled = true;

        document.getElementById('goLiveBtn').textContent = '🟢 Go Live';
        document.getElementById('goLiveBtn').disabled = false;

        document.getElementById('mapSection').style.display = 'none';
        if (driverMap) {
            driverMap.remove();
            driverMap = null;
            driverMarker = null;
            userMarkers = {};
        }

        // Clear form
        document.getElementById('routeForm').reset();

        showToast('🛑 Ride ended successfully', 'success');

    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Logout ──────────────────────────────────────────────────
function logout() {
    localStorage.removeItem('driverToken');
    localStorage.removeItem('driverData');
    window.location.href = '/driver-login.html';
}

// ─── Toast ───────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// Incoming ride request from user
socket.on('incoming-ride-request', (data) => {
    if (currentRoute && data.routeId === currentRoute.id) {
        currentRequest = data;

        const availableSeats = currentRoute.total_seats - currentRoute.filled_seats;
        const passengers = data.passengers || data.seats; // fallback if old client

        document.getElementById('requestName').innerText = data.name;
        document.getElementById('requestPhone').innerText = data.phone;
        document.getElementById('requestPassengers').innerText = passengers;
        document.getElementById('requestSeatsBadge').innerText = data.seats;

        // Show selected seat numbers if available
        const seatNumsEl = document.getElementById('requestSeatNumbers');
        if (seatNumsEl && data.seatNumbers && data.seatNumbers.length > 0) {
            seatNumsEl.style.display = 'block';
            seatNumsEl.innerText = `🎯 Selected Seats: ${data.seatNumbers.join(', ')}`;
        } else if (seatNumsEl) {
            seatNumsEl.style.display = 'none';
        }

        document.getElementById('availableSeatsInfo').innerText =
            `✅ Aapki gaadi mein abhi ${availableSeats} seat(s) available hain`;

        // Warn if not enough seats
        if (data.seats > availableSeats) {
            document.getElementById('availableSeatsInfo').style.background = 'rgba(239,68,68,0.1)';
            document.getElementById('availableSeatsInfo').style.borderColor = 'var(--danger)';
            document.getElementById('availableSeatsInfo').style.color = 'var(--danger)';
            document.getElementById('availableSeatsInfo').innerText =
                `⚠️ Sirf ${availableSeats} seat available hai, par ${data.seats} maangi gayi!`;
        } else {
            document.getElementById('availableSeatsInfo').style.background = 'rgba(16,185,129,0.1)';
            document.getElementById('availableSeatsInfo').style.borderColor = 'var(--success)';
            document.getElementById('availableSeatsInfo').style.color = 'var(--success)';
        }

        document.getElementById('rideRequestModal').style.display = 'flex';

        // Auto dismiss after 20 seconds
        requestTimeout = setTimeout(() => {
            respondToRide(false);
        }, 20000);

        // Plot User Marker
        if (data.userLat && data.userLng && driverMap) {
            if (userMarkers[data.userId]) {
                driverMap.removeLayer(userMarkers[data.userId]);
            }

            const userIcon = L.divIcon({
                className: 'custom-user-marker',
                html: `<div style="font-size: 28px; filter: hue-rotate(200deg);">🧍‍♂️</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            });

            userMarkers[data.userId] = L.marker([data.userLat, data.userLng], { icon: userIcon })
                .addTo(driverMap)
                .bindPopup(`Requested by: ${data.name}`).openPopup();

            // Fit bounds
            if (driverMarker) {
                const bounds = L.latLngBounds([driverMarker.getLatLng(), [data.userLat, data.userLng]]);
                driverMap.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }
});

// ─── Autocomplete with Map Integration ───────────────────────
function setupDriverAutocomplete(inputId, suggestionsId, modeType) {
    const input = document.getElementById(inputId);
    const suggestionsBox = document.getElementById(suggestionsId);
    let timeout = null;

    input.addEventListener('input', (e) => {
        clearTimeout(timeout);
        const query = e.target.value.trim();

        if (query.length < 3) {
            suggestionsBox.style.display = 'none';
            return;
        }

        timeout = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5`);
                const data = await res.json();

                if (data.length > 0) {
                    suggestionsBox.innerHTML = data.map(place => {
                        const name = place.display_name.split(',').slice(0, 3).join(',');
                        return `<div class="suggestion-item" data-name="${name}" data-lat="${place.lat}" data-lng="${place.lon}">${name}</div>`;
                    }).join('');
                    suggestionsBox.style.display = 'block';

                    const items = suggestionsBox.querySelectorAll('.suggestion-item');
                    items.forEach(item => {
                        item.addEventListener('click', () => {
                            const name = item.getAttribute('data-name');
                            const lat = parseFloat(item.getAttribute('data-lat'));
                            const lng = parseFloat(item.getAttribute('data-lng'));

                            input.value = name;
                            suggestionsBox.style.display = 'none';

                            // Map Integration
                            if (setupMap) {
                                if (modeType === 'start') {
                                    if (setupStartMarker) setupMap.removeLayer(setupStartMarker);
                                    setupStartMarker = L.marker([lat, lng], {
                                        icon: L.divIcon({ className: 'custom-marker', html: '🔵', iconSize: [24, 24] })
                                    }).addTo(setupMap);
                                    selectedStartCoords = { lat, lng };
                                } else {
                                    if (setupEndMarker) setupMap.removeLayer(setupEndMarker);
                                    setupEndMarker = L.marker([lat, lng], {
                                        icon: L.divIcon({ className: 'custom-marker', html: '🔴', iconSize: [24, 24] })
                                    }).addTo(setupMap);
                                    selectedEndCoords = { lat, lng };
                                }

                                setupMap.setView([lat, lng], 14);

                                if (setupStartMarker && setupEndMarker) {
                                    const bounds = L.latLngBounds([setupStartMarker.getLatLng(), setupEndMarker.getLatLng()]);
                                    setupMap.fitBounds(bounds, { padding: [30, 30] });
                                }
                            }
                        });
                    });
                } else {
                    suggestionsBox.style.display = 'none';
                }
            } catch (err) {
                console.error("Autocomplete error:", err);
            }
        }, 400);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.style.display = 'none';
        }
    });
}

setupDriverAutocomplete('startLocation', 'startSuggestions', 'start');
setupDriverAutocomplete('endLocation', 'endSuggestions', 'end');

// ─── Ride History  ──────────────────────────────────────────────
async function openDriverHistory() {
    document.getElementById('driverHistoryModal').style.display = 'flex';
    const listContainer = document.getElementById('driverHistoryList');
    listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Loading history...</div>';

    try {
        const res = await fetch('/api/routes/driver/ride-history', {
            headers: { 'Authorization': `Bearer ${driverAuthToken}` }
        });
        const rides = await res.json();

        if (rides.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No rides found yet.</div>';
            return;
        }

        listContainer.innerHTML = rides.map(ride => {
            const date = new Date(ride.created_at).toLocaleDateString();
            const ratingHtml = ride.rating 
                ? `<div style="color: #b45309; font-size: 0.85rem; margin-top: 4px;">⭐ ${ride.rating}/5 ${ride.rating_comment ? `– "${ride.rating_comment}"` : ''}</div>`
                : `<div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">No rating yet</div>`;
                
            return `
                <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 12px; background: var(--surface-light);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong>${ride.start_location} → ${ride.end_location}</strong>
                        <span style="color: var(--success); font-weight: 600;">₹${ride.fare}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-secondary);">
                        <span>👤 ${ride.passenger_name} ${ride.passengers > 1 ? `(${ride.passengers} pax)` : ''}</span>
                        <span>🗓️ ${date}</span>
                    </div>
                    ${ratingHtml}
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Failed to load history:', err);
        listContainer.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 20px;">Failed to load history.</div>';
    }
}

function closeDriverHistory() {
    document.getElementById('driverHistoryModal').style.display = 'none';
}
