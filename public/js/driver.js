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

    // Update new navbar elements
    const namePill = document.getElementById('driverNamePill');
    const vehiclePill = document.getElementById('driverVehiclePill');
    if (namePill) namePill.textContent = driverData.name;
    if (vehiclePill) vehiclePill.textContent = `${driverData.vehicle_number} • ${driverData.vehicle_type || ''}`;

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
        const saveIndicator = document.getElementById('savedBadge');
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
    const saveIndicator = document.getElementById('savedBadge');
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
    const saveIndicator = document.getElementById('savedBadge');
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
    // Show loading tip (correct element ID from HTML)
    const loader = document.getElementById('mapLoadingTip');
    if (loader) loader.style.display = 'block';
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        const addr = data.address || {};
        const placeName = data.name || addr.neighbourhood || addr.suburb || addr.road || addr.village || addr.town || addr.city || addr.state || 'Current Location';
        const el = document.getElementById(inputId);
        if (el) el.value = placeName;
    } catch (err) {
        console.error('Geocoding failed:', err);
        // Don't show error toast — silently skip
    } finally {
        if (loader) loader.style.display = 'none';
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

    if (!start_location || !end_location) {
        showToast('⚠️ Start aur End location zaroori hai!', 'warning');
        return;
    }
    if (!fare || parseFloat(fare) <= 0) {
        showToast('⚠️ Fare sahi daalo!', 'warning');
        return;
    }
    if (!total_seats || parseInt(total_seats) <= 0) {
        showToast('⚠️ Total seats sahi daalo!', 'warning');
        return;
    }

    // Use available coords or safe defaults (don't block on GPS)
    const startLat = selectedStartCoords ? selectedStartCoords.lat : 25.0961;
    const startLng = selectedStartCoords ? selectedStartCoords.lng : 85.3131;

    const btn = document.getElementById('goLiveBtn');
    const origHTML = btn.innerHTML;
    btn.innerHTML = '⏳ Going Live...';
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
                stops: stops || null,
                fare,
                total_seats,
                lat: startLat,
                lng: startLng
            })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Go Live fail hua. Server error.');

        currentRoute = data;

        // ✅ AUTO-SAVE preferences whenever driver goes live
        const prefs = { startLocation: start_location, endLocation: end_location, stops, fare, totalSeats: total_seats, savedAt: new Date().toLocaleString('hi-IN') };
        localStorage.setItem('driverRoutePrefs', JSON.stringify(prefs));

        // Update saved badge
        const savedBadge = document.getElementById('savedBadge');
        if (savedBadge) {
            savedBadge.style.display = 'flex';
            const span = savedBadge.querySelector('span');
            if (span) span.textContent = `Auto-saved`;
        }

        activateLiveMode();
        showToast('🟢 Ab aap LIVE hain! Route save ho gaya.', 'success');

    } catch (err) {
        console.error('Go live error:', err);
        showToast('❌ ' + err.message, 'error');
        btn.innerHTML = origHTML;
        btn.disabled = false;
    }
}

// ─── Activate Live Mode ────────────────────────────────────────
function activateLiveMode() {
    // Update status pill (new navbar)
    const pill = document.getElementById('statusPill');
    const pillText = document.getElementById('statusText');
    if (pill) { pill.className = 'status-pill live'; }
    if (pillText) pillText.textContent = 'LIVE';

    // Update stats
    updateStats();

    // Enable seat controls
    const fillBtn = document.getElementById('fillBtn'); if (fillBtn) fillBtn.disabled = false;
    const emptyBtn = document.getElementById('emptyBtn'); if (emptyBtn) emptyBtn.disabled = false;
    const endRideBtn = document.getElementById('endRideBtn'); if (endRideBtn) endRideBtn.disabled = false;
    const simulateBtn = document.getElementById('simulateBtn'); if (simulateBtn) simulateBtn.disabled = false;

    // Update go live btn
    const goLiveBtn = document.getElementById('goLiveBtn');
    goLiveBtn.innerHTML = '🔄 Update Route';
    goLiveBtn.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
    goLiveBtn.disabled = false;

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
    const mapSection = document.getElementById('mapTopBar'); if (mapSection) mapSection.style.display = 'flex';
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
    if (typeof stopRRTimer === 'function') stopRRTimer();

    if (!currentRequest || !currentRoute) return;

    // Hide bottom sheet
    const modal = document.getElementById('rideRequestModal');
    if (modal) modal.classList.remove('open');

    const reqUserId = currentRequest.userId;
    const reqName = currentRequest.name;
    const reqSeats = currentRequest.seats;

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

        try {
            const res = await fetch(`/api/routes/${currentRoute.id}/seats`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverAuthToken}` },
                body: JSON.stringify({ action: 'fill', count: currentRequest.seats })
            });

            if (res.ok) {
                const data = await res.json();
                currentRoute.filled_seats = data.filled_seats;
                currentRoute.total_seats = data.total_seats;
                updateStats();
                renderDriverSeatGrid();
                showToast(`✅ ${reqName} ki ride accept! ${reqSeats} seat(s) filled.`, 'success');
            } else {
                showToast('Accept hua, par seats update nahi hua.', 'warning');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }

        // Turn marker green (accepted) in queue and map
        if (typeof updateQueueStatus === 'function') updateQueueStatus(reqUserId, 'accepted');

    } else {
        socket.emit('reject-ride', { userId: currentRequest.userId, routeId: currentRoute.id });
        showToast(`❌ ${reqName} ki ride reject kar di`, 'info');

        // Remove from queue and map on rejection
        if (typeof removePassengerFromMap === 'function') removePassengerFromMap(reqUserId);
        if (typeof passengerQueue !== 'undefined' && passengerQueue) delete passengerQueue[reqUserId];
        if (typeof renderPassengerQueue === 'function') renderPassengerQueue();
    }

    currentRequest = null;
}

// ─── Update Stats ────────────────────────────────────────────
function updateStats() {
    if (!currentRoute) return;
    const empty = currentRoute.total_seats - currentRoute.filled_seats;
    const st = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    st('statEmpty', empty);
    st('statFilled', currentRoute.filled_seats);
    st('statFare', `₹${currentRoute.fare}`);
    st('filledCount', currentRoute.filled_seats);
    st('totalCount', currentRoute.total_seats);
}

// ─── Render Driver Seat Grid (Premium UI) ──────────────────────
function renderDriverSeatGrid() {
    if (!currentRoute) return;

    const container = document.getElementById('driverSeatGrid');

    // Ensure sizes aren't coerced into strings
    const total_seats = Number(currentRoute.total_seats);
    const filled_seats = Number(currentRoute.filled_seats);

    // Read ACTUAL registered vehicle type from session (prevent 10-seat Tuk-Tuks becoming buses)
    let vehicleType = driverData && driverData.vehicle_type ? driverData.vehicle_type : 'auto';

    container.innerHTML = generateSeatLayout(vehicleType, total_seats, filled_seats, [], true);

    // Attach click listeners to the realistic seats
    const seats = container.querySelectorAll('.rseat');
    seats.forEach(seat => {
        seat.addEventListener('click', () => handleDriverSeatClick(seat));
    });
}

function handleDriverSeatClick(seatElement) {
    if (seatElement.classList.contains('driver')) return; // Can't toggle driver seat

    // If it's empty, we fill it. If it's filled, we empty it.
    if (seatElement.classList.contains('empty')) {
        updateSeat('fill', 1);
    } else if (seatElement.classList.contains('filled')) {
        updateSeat('empty', 1);
    }
}

// ─── Shared Layout Generators (Mirroring user.js) ────────────

function generateSeatLayout(type, total, filled, selectedIds = [], isDriverView = false) {
    if (type === 'auto') return generateAutoLayout(total, filled, selectedIds, isDriverView);
    if (type === 'car') return generateCarLayout(total, filled, selectedIds, isDriverView);
    if (type === 'bus') return generateBusLayout(total, filled, selectedIds, isDriverView);
    return ''; // fallback
}

function generateAutoLayout(total, filled, selectedIds, isDriverView) {
    let frontSeats = '';
    let middleSeats = '';
    let backSeats = '';
    const driverBadge = `<div class="driver-badge-real"><span class="driver-wheel">🛞</span> Driver</div>`;

    let currentSeatNum = 1;

    // Front row (up to 2 seats)
    for (let i = 0; i < 2 && currentSeatNum <= total; i++) {
        let state = currentSeatNum <= filled ? 'filled' : 'empty';
        if (selectedIds.includes(currentSeatNum.toString())) state = 'selected';
        frontSeats += renderRealisticSeat(currentSeatNum, state);
        currentSeatNum++;
    }

    // Middle row - up to 4 seats (Used if total > 6)
    if (total > 6) {
        for (let i = 0; i < 4 && currentSeatNum <= total; i++) {
            let state = currentSeatNum <= filled ? 'filled' : 'empty';
            if (selectedIds.includes(currentSeatNum.toString())) state = 'selected';
            middleSeats += renderRealisticSeat(currentSeatNum, state);
            currentSeatNum++;
        }
    }

    // Back row (up to 4 seats)
    for (let i = 0; i < 4 && currentSeatNum <= total; i++) {
        let state = currentSeatNum <= filled ? 'filled' : 'empty';
        if (selectedIds.includes(currentSeatNum.toString())) state = 'selected';
        backSeats += renderRealisticSeat(currentSeatNum, state);
        currentSeatNum++;
    }

    const isMegaAuto = total > 6;
    const overlayScale = isMegaAuto ? 'transform: scale(0.85); transform-origin: top center;' : '';
    const rowGap = isMegaAuto ? '2px' : '6px';
    const svgScale = isMegaAuto ? 'transform: scaleY(1.1); transform-origin: top center;' : '';

    return `
        <div class="realistic-vehicle auto-vehicle">
            <div class="auto-body-wrap">
                <svg class="auto-svg" viewBox="0 0 260 320" xmlns="http://www.w3.org/2000/svg" style="${svgScale}">
                    <path d="M40 80 Q 130 10 220 80 L 240 280 C 240 310, 20 310, 20 280 Z" fill="#f59e0b" opacity="0.15" stroke="#d97706" stroke-width="3"/>
                    <path d="M50 85 Q 130 30 210 85 L 220 140 L 40 140 Z" fill="rgba(0,0,0,0.4)" />
                    <rect x="110" y="290" width="40" height="20" rx="10" fill="#333"/>
                    <rect x="10" y="240" width="20" height="40" rx="5" fill="#222"/>
                    <rect x="230" y="240" width="20" height="40" rx="5" fill="#222"/>
                    <path d="M80 120 C 130 90, 180 120, 180 120" stroke="#f1f5f9" stroke-width="4" fill="transparent"/>
                </svg>
                <div class="auto-driver-area">${driverBadge}</div>
                <div class="auto-seats-overlay" style="${overlayScale}">
                    ${frontSeats ? `<div class="auto-seat-row front-row">${frontSeats}</div>` : ''}
                    ${middleSeats ? `<div class="auto-seat-row middle-row" style="margin-top: ${rowGap}; gap: 6px;">${middleSeats}</div>` : ''}
                    ${backSeats ? `<div class="auto-seat-row back-row" style="margin-top: ${rowGap}; gap: 6px;">${backSeats}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

function generateCarLayout(total, filled, selectedIds, isDriverView) {
    let seatsHTML = '';
    const driverBadge = `<div class="driver-badge-real" style="padding: 4px 8px; font-size: 0.65rem;"><span class="driver-wheel">🛞</span></div>`;

    let currentSeatNum = 1;

    // Front passenger seat
    let frontSeatHTML = '';
    if (total > 0) {
        let state = currentSeatNum <= filled ? 'filled' : 'empty';
        if (selectedIds.includes(currentSeatNum.toString())) state = 'selected';
        frontSeatHTML = renderRealisticSeat(currentSeatNum, state);
        currentSeatNum++;
    }

    // Back seats (up to 3)
    let backSeatsHTML = '';
    for (let i = 1; i < total && i < 4; i++) {
        let state = currentSeatNum <= filled ? 'filled' : 'empty';
        if (selectedIds.includes(currentSeatNum.toString())) state = 'selected';
        backSeatsHTML += renderRealisticSeat(currentSeatNum, state);
        currentSeatNum++;
    }

    return `
        <div class="realistic-vehicle car-vehicle">
            <div class="car-body-wrap">
                <svg class="car-svg" viewBox="0 0 240 360" xmlns="http://www.w3.org/2000/svg">
                    <rect x="20" y="20" width="200" height="320" rx="40" fill="#10b981" opacity="0.1" stroke="#059669" stroke-width="2"/>
                    <path d="M 40 100 C 40 60, 200 60, 200 100 L 210 180 L 30 180 Z" fill="rgba(0,0,0,0.3)"/>
                    <path d="M 30 190 L 210 190 L 190 280 C 190 300, 50 300, 50 280 Z" fill="rgba(0,0,0,0.3)"/>
                    <rect x="10" y="60" width="10" height="50" rx="5" fill="#222"/>
                    <rect x="220" y="60" width="10" height="50" rx="5" fill="#222"/>
                    <rect x="10" y="250" width="10" height="50" rx="5" fill="#222"/>
                    <rect x="220" y="250" width="10" height="50" rx="5" fill="#222"/>
                    <line x1="80" y1="20" x2="160" y2="20" stroke="#059669" stroke-width="4" stroke-linecap="round"/>
                    <line x1="80" y1="340" x2="160" y2="340" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>
                </svg>
                <div class="car-driver-area">${driverBadge}</div>
                <div class="car-seats-front">${frontSeatHTML}</div>
                <div class="car-seats-back">${backSeatsHTML}</div>
            </div>
        </div>
    `;
}

function generateBusLayout(total, filled, selectedIds, isDriverView) {
    let rowsHTML = '';
    let currentSeatNum = 1;
    const rows = Math.ceil(total / 4);

    for (let r = 0; r < rows; r++) {
        let leftSeats = '';
        let rightSeats = '';

        for (let i = 0; i < 2; i++) {
            if (currentSeatNum <= total) {
                let state = currentSeatNum <= filled ? 'filled' : 'empty';
                if (selectedIds.includes(currentSeatNum.toString())) state = 'selected';
                leftSeats += renderRealisticSeat(currentSeatNum, state);
                currentSeatNum++;
            } else {
                leftSeats += `<div class="rseat" style="opacity:0"></div>`;
            }
        }

        for (let i = 0; i < 2; i++) {
            if (currentSeatNum <= total) {
                let state = currentSeatNum <= filled ? 'filled' : 'empty';
                if (selectedIds.includes(currentSeatNum.toString())) state = 'selected';
                rightSeats += renderRealisticSeat(currentSeatNum, state);
                currentSeatNum++;
            } else {
                rightSeats += `<div class="rseat" style="opacity:0"></div>`;
            }
        }

        rowsHTML += `
            <div class="bus-seat-row">
                <div class="bus-row-num">${r + 1}</div>
                <div class="bus-left-pair">${leftSeats}</div>
                <div class="bus-aisle-gap"></div>
                <div class="bus-right-pair">${rightSeats}</div>
            </div>
        `;

        if (r === Math.floor(rows / 2) - 1) {
            rowsHTML += `
                <div class="bus-mid-door">
                    <span>🚪</span> Exit
                </div>
            `;
        }
    }

    return `
        <div class="realistic-vehicle bus-vehicle">
            <div class="bus-body-wrap">
                <div class="bus-front">
                    <div class="bus-windshield">
                        <span class="bus-front-lights">🔆</span>
                        <div class="bus-route-display">EYE IN CITY BUS</div>
                        <span class="bus-front-lights">🔆</span>
                    </div>
                    <div class="bus-driver-row">
                        <div class="driver-badge-real"><span class="driver-wheel">🛞</span> Driver</div>
                        <div class="bus-entry-door"><span>🚪</span> Entry</div>
                    </div>
                </div>
                
                <div class="bus-seats-container">
                    ${rowsHTML}
                </div>

                <div class="bus-rear">
                    <div class="bus-rear-window"></div>
                </div>
            </div>
        </div>
    `;
}

function renderRealisticSeat(number, state) {
    let innerContent = '';
    if (state === 'empty') innerContent = `<span class="rseat-icon">💺</span>`;
    if (state === 'filled') innerContent = `<span class="rseat-person">🧑</span>`;
    if (state === 'selected') innerContent = `<span class="rseat-check">✓</span>`;
    if (state === 'driver') innerContent = `<span class="rseat-icon">🛞</span>`;

    return `
        <div class="rseat ${state}" data-seat="${number}">
            <div class="rseat-backrest"></div>
            <div class="rseat-cushion">
                ${innerContent}
            </div>
            ${state !== 'driver' ? `<div class="rseat-number">${number}</div>` : ''}
        </div>
    `;
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
    if (!confirm('Kya aap ride end karna chahte hain?')) return;

    try {
        const res = await fetch(`/api/routes/${currentRoute.id}/end`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${driverAuthToken}`
            }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ride end nahi hua');

        currentRoute = null;
        stopTracking();

        // ── Reset navbar status pill ──
        const pill = document.getElementById('statusPill');
        const pillText = document.getElementById('statusText');
        if (pill) pill.className = 'status-pill offline';
        if (pillText) pillText.textContent = 'Offline';

        // ── Reset stats ──
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setEl('statEmpty', '–');
        setEl('statFilled', '–');
        setEl('statFare', '–');
        setEl('statRequests', '0');
        setEl('filledCount', '0');
        setEl('totalCount', '0');

        // ── Clear seat grid ──
        const seatGrid = document.getElementById('driverSeatGrid');
        if (seatGrid) seatGrid.innerHTML = '';

        // ── Disable seat control buttons ──
        const fb = document.getElementById('fillBtn'); if (fb) fb.disabled = true;
        const eb = document.getElementById('emptyBtn'); if (eb) eb.disabled = true;
        const erb = document.getElementById('endRideBtn'); if (erb) erb.disabled = true;
        const sb = document.getElementById('simulateBtn'); if (sb) sb.disabled = true;

        // ── Reset Go Live button ──
        const goLiveBtn = document.getElementById('goLiveBtn');
        if (goLiveBtn) {
            goLiveBtn.innerHTML = '🟢 Go Live';
            goLiveBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            goLiveBtn.disabled = false;
        }

        // ── Hide map overlay elements ──
        const mapTopBar = document.getElementById('mapTopBar');
        if (mapTopBar) mapTopBar.style.display = 'none';

        // ── Destroy driver map ──
        if (driverMap) {
            driverMap.remove();
            driverMap = null;
            driverMarker = null;
            userMarkers = {};
        }

        // ── Hide passenger queue ──
        const queueSection = document.getElementById('passengerQueueSection');
        if (queueSection) queueSection.style.display = 'none';

        showToast('🛑 Ride successfully end ho gayi!', 'success');

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

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastBox') || document.body;
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
    toast.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3500);
}

// ── Countdown timer for ride request ─────────────────────────
let rrTimerInterval = null;

function startRRTimer() {
    let remaining = 20;
    const timerEl = document.getElementById('rrTimer');
    if (rrTimerInterval) clearInterval(rrTimerInterval);
    rrTimerInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) { clearInterval(rrTimerInterval); rrTimerInterval = null; }
    }, 1000);
}

function stopRRTimer() {
    if (rrTimerInterval) { clearInterval(rrTimerInterval); rrTimerInterval = null; }
    const t = document.getElementById('rrTimer'); if (t) t.textContent = '20';
}

async function resolvePassengerLocation(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        const d = await res.json();
        return d.address.village || d.address.suburb || d.address.neighbourhood || d.address.town || d.address.city || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch(e) { return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
}

// Incoming ride request from user
socket.on('incoming-ride-request', async (data) => {
    if (!currentRoute || data.routeId !== currentRoute.id) return;
    currentRequest = data;

    const availableSeats = currentRoute.total_seats - currentRoute.filled_seats;
    const passengers = data.passengers || data.seats;

    // Fill modal fields
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setText('requestName', data.name);
    setText('requestPhone', data.phone);
    setText('requestPassengers', passengers);
    setText('requestSeatsBadge', data.seats);
    setText('rrAvailSeats', availableSeats);

    // Resolve passenger location name
    const locEl = document.getElementById('requestLocation');
    if (locEl) {
        locEl.textContent = 'Detecting location...';
        if (data.userLat && data.userLng) {
            resolvePassengerLocation(data.userLat, data.userLng).then(name => {
                locEl.textContent = `\ud83d\udccd ${name}`;
            });
        } else { locEl.textContent = 'Location not available'; }
    }

    // Seat numbers
    const seatNumsEl = document.getElementById('requestSeatNumbers');
    if (seatNumsEl && data.seatNumbers && data.seatNumbers.length > 0) {
        seatNumsEl.style.display = 'block';
        seatNumsEl.innerHTML = `\ud83c\udfaf Selected Seats: <strong>${data.seatNumbers.join(', ')}</strong>`;
    } else if (seatNumsEl) { seatNumsEl.style.display = 'none'; }

    // Availability indicator
    const availEl = document.getElementById('availableSeatsInfo');
    if (availEl) {
        if (data.seats > availableSeats) {
            availEl.className = 'rr-avail warn';
            availEl.innerHTML = `\u26a0\ufe0f Sirf ${availableSeats} seat available, par ${data.seats} maangi gayi!`;
        } else {
            availEl.className = 'rr-avail ok';
            availEl.innerHTML = `\u2705 ${availableSeats} seats available hain`;
        }
    }

    // Show bottom sheet + countdown
    const modal = document.getElementById('rideRequestModal');
    modal.classList.add('open');
    const bar = document.getElementById('rrCountdownBar');
    if (bar) { bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = ''; }
    startRRTimer();

    // Auto dismiss after 20 seconds
    requestTimeout = setTimeout(() => respondToRide(false), 20000);

    // Add to passenger queue sidebar
    if (typeof addToQueue === 'function') addToQueue(data);

    // Plot premium marker on map
    if (data.userLat && data.userLng) {
        if (driverMap) {
            if (typeof plotPassengerOnMap === 'function') {
                plotPassengerOnMap(data, 'pending');
            } else {
                // Fallback original marker
                if (userMarkers[data.userId]) driverMap.removeLayer(userMarkers[data.userId]);
                const userIcon = L.divIcon({
                    className: '',
                    html: `<div style="position:relative"><div class="marker-passenger marker-pending">\ud83e\uddd1</div><div class="marker-label">${data.name.split(' ')[0]}</div></div>`,
                    iconSize: [40, 50], iconAnchor: [18, 36]
                });
                userMarkers[data.userId] = L.marker([data.userLat, data.userLng], { icon: userIcon })
                    .addTo(driverMap)
                    .bindPopup(`<div class="pop-name">\ud83e\uddd1 ${data.name}</div><div class="pop-info">\ud83d\udcde ${data.phone}</div><div class="pop-info">\ud83d\udcba ${data.seats} seat(s) \u2022 \u23f3 Pending</div>`);
                if (driverMarker) {
                    const bounds = L.latLngBounds([driverMarker.getLatLng(), [data.userLat, data.userLng]]);
                    driverMap.fitBounds(bounds, { padding: [60, 60] });
                }
            }
        }
    }

    showToast(`\ud83d\udd14 New request from ${data.name}! (${data.seats} seat${data.seats > 1 ? 's' : ''})`, 'warning');
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
