/**
 * Eye-In Smart Road Safety Co-Pilot (Camera-Free GPS ADAS)
 * Features:
 * - 1-Tap Quick Crowdsourced Hazard Reporting
 * - Automatic Phone Accelerometer Bump Detection (100% Camera-Free)
 * - GPS Proximity Geofencing & Hindi/English Voice Pre-Alerts (100m & 50m Warnings)
 * - Interactive Leaflet Dark Map with Pulsing Proximity Radar
 * - Automated Test Drive Simulation for Instant Demo
 */

(function () {
    'use strict';

    // ─── STATE & CONFIGURATION ──────────────────────────────────────────
    const state = {
        currentLat: 28.6139,
        currentLng: 77.2090,
        currentSpeed: 38,
        heading: 0,
        voiceEnabled: true,
        voiceLanguage: 'hi-IN',
        hazards: [],
        markers: {},
        testDriving: false,
        testDriveInterval: null,
        lastSpokenId: null,
        lastSpokenTime: 0,
        audioCtx: null
    };

    // DOM Elements
    const speedVal = document.getElementById('speedVal');
    const sensorBadge = document.getElementById('sensorBadge');
    const alertCard = document.getElementById('alertCard');
    const alertIcon = document.getElementById('alertIcon');
    const alertTitle = document.getElementById('alertTitle');
    const alertDesc = document.getElementById('alertDesc');
    const alertDistBadge = document.getElementById('alertDistBadge');
    const hazardCountBadge = document.getElementById('hazardCountBadge');
    const btnTestDrive = document.getElementById('btnTestDrive');
    const btnTestDriveText = document.getElementById('btnTestDriveText');
    const btnVoiceText = document.getElementById('btnVoiceText');
    const toastMsg = document.getElementById('toastMsg');

    let map = null;
    let driverMarker = null;
    let radarCircle = null;

    // ─── AUDIO CHIME SYNTHESIZER ────────────────────────────────────────
    function initAudio() {
        if (!state.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) state.audioCtx = new AudioContext();
        }
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            state.audioCtx.resume();
        }
    }

    function playChime(freq = 780, type = 'sine') {
        try {
            if (!state.voiceEnabled) return;
            initAudio();
            if (!state.audioCtx) return;

            const osc = state.audioCtx.createOscillator();
            const gain = state.audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);
            gain.gain.setValueAtTime(0.25, state.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(state.audioCtx.destination);
            osc.start();
            osc.stop(state.audioCtx.currentTime + 0.2);
        } catch (e) {
            console.warn('Audio chime error:', e);
        }
    }

    // ─── VOICE PRE-ALERT ENGINE (HINDI / ENGLISH) ───────────────────────
    function speakHazardWarning(hazard, distanceMeters) {
        if (!state.voiceEnabled) return;
        const now = Date.now();

        // 5-second cooldown per hazard to avoid repetitive speech
        const speechKey = `${hazard.id || hazard.hazard_type}_${Math.floor(distanceMeters / 25)}`;
        if (state.lastSpokenId === speechKey && (now - state.lastSpeechTime) < 5000) {
            return;
        }

        state.lastSpokenId = speechKey;
        state.lastSpeechTime = now;

        const hazardNames = {
            pothole: { hi: 'गड्ढा', en: 'Pothole' },
            speed_breaker: { hi: 'स्पीड ब्रेकर', en: 'Speed Breaker' },
            stalled_vehicle: { hi: 'खराब गाड़ी', en: 'Broken-down Vehicle' },
            obstacle: { hi: 'सड़क काम या रुकावट', en: 'Road Obstacle' }
        };

        const hName = hazardNames[hazard.hazard_type] || { hi: 'खतरा', en: 'Hazard' };
        let text = '';

        if (state.voiceLanguage === 'hi-IN') {
            if (distanceMeters <= 30) {
                text = `सावधान! तुरंत गति धीमी करें, ${distanceMeters} मीटर आगे ${hName.hi} है!`;
            } else {
                text = `आगे ${distanceMeters} मीटर पर ${hName.hi} है, सावधानी से चलाएं।`;
            }
        } else {
            if (distanceMeters <= 30) {
                text = `Warning! Slow down immediately, ${hName.en} ahead in ${distanceMeters} meters!`;
            } else {
                text = `Caution! ${hName.en} ahead in ${distanceMeters} meters.`;
            }
        }

        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = state.voiceLanguage;
            utterance.rate = 1.05;
            window.speechSynthesis.speak(utterance);
        }
    }

    // ─── INITIALIZE LEAFLET MAP ─────────────────────────────────────────
    function initMap() {
        map = L.map('safetyMap', { zoomControl: false }).setView([state.currentLat, state.currentLng], 16);

        // Dark Theme Tile Layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            maxZoom: 19
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        // Driver Custom Icon
        const driverIcon = L.divIcon({
            className: 'driver-live-pin',
            html: `<div style="width:34px;height:34px;background:#3b82f6;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;box-shadow:0 0 15px #3b82f6;">🚗</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17]
        });

        driverMarker = L.marker([state.currentLat, state.currentLng], { icon: driverIcon }).addTo(map);

        // Pulsing 100m Radar Circle
        radarCircle = L.circle([state.currentLat, state.currentLng], {
            radius: 100,
            color: '#00f2fe',
            fillColor: '#00f2fe',
            fillOpacity: 0.12,
            weight: 1.5
        }).addTo(map);
    }

    // ─── GPS TRACKING & PROXIMITY CALCULATOR ────────────────────────────
    function getDistanceMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c);
    }

    function updateDriverLocation(lat, lng, speed = 35) {
        state.currentLat = lat;
        state.currentLng = lng;
        state.currentSpeed = speed;

        speedVal.innerText = state.currentSpeed;

        if (driverMarker) driverMarker.setLatLng([lat, lng]);
        if (radarCircle) radarCircle.setLatLng([lat, lng]);

        map.panTo([lat, lng], { animate: true, duration: 0.4 });

        checkProximityAlerts();
    }

    function checkProximityAlerts() {
        let closestHazard = null;
        let minDistance = 99999;

        state.hazards.forEach(h => {
            if (h.lat && h.lng) {
                const dist = getDistanceMeters(state.currentLat, state.currentLng, parseFloat(h.lat), parseFloat(h.lng));
                h.distance_meters = dist;

                if (dist < minDistance) {
                    minDistance = dist;
                    closestHazard = h;
                }
            }
        });

        // Trigger Warning when inside 100 meters
        if (closestHazard && minDistance <= 100) {
            alertCard.style.display = 'flex';
            alertDistBadge.innerText = `${minDistance}m`;

            const iconMap = {
                pothole: '🕳️',
                speed_breaker: '〰️',
                stalled_vehicle: '🚨',
                obstacle: '🚧'
            };
            alertIcon.innerText = iconMap[closestHazard.hazard_type] || '⚠️';

            const titleMap = {
                pothole: 'सावधान! आगे गड्ढा है',
                speed_breaker: 'आगे स्पीड ब्रेकर है',
                stalled_vehicle: 'सावधान! खराब गाड़ी खड़ी है',
                obstacle: 'आगे सड़क पर रुकावट है'
            };
            alertTitle.innerText = titleMap[closestHazard.hazard_type] || 'सावधान! आगे खतरा है';
            alertDesc.innerText = `${closestHazard.notes || 'कृपया गति धीमी रखें'}`;

            playChime(minDistance <= 40 ? 900 : 700);
            speakHazardWarning(closestHazard, minDistance);
        } else {
            alertCard.style.display = 'none';
        }
    }

    // ─── FETCH & RENDER HAZARDS ON MAP ──────────────────────────────────
    async function loadNearbyHazards() {
        try {
            const res = await fetch(`/api/hazards/nearby?lat=${state.currentLat}&lng=${state.currentLng}&radiusKm=8`);
            const data = await res.json();
            if (data.hazards) {
                state.hazards = data.hazards;
                hazardCountBadge.innerText = `${state.hazards.length} Hazards Nearby`;
                renderHazardMarkers();
                checkProximityAlerts();
            }
        } catch (e) {
            console.error('Error fetching hazards:', e);
        }
    }

    function renderHazardMarkers() {
        // Clear old markers
        Object.values(state.markers).forEach(m => map.removeLayer(m));
        state.markers = {};

        const iconConfig = {
            pothole: { emoji: '🕳️', color: '#f59e0b', label: 'गड्ढा' },
            speed_breaker: { emoji: '〰️', color: '#3b82f6', label: 'स्पीड ब्रेकर' },
            stalled_vehicle: { emoji: '🚨', color: '#ef4444', label: 'खराब गाड़ी' },
            obstacle: { emoji: '🚧', color: '#a855f7', label: 'सड़क काम' }
        };

        state.hazards.forEach(h => {
            if (!h.lat || !h.lng) return;
            const conf = iconConfig[h.hazard_type] || { emoji: '⚠️', color: '#f59e0b', label: 'खतरा' };

            const customIcon = L.divIcon({
                className: 'hazard-map-pin',
                html: `
                    <div style="background:${conf.color};border:2px solid #fff;border-radius:12px;padding:3px 8px;font-size:0.85rem;color:#000;font-weight:700;box-shadow:0 4px 10px rgba(0,0,0,0.5);display:flex;align-items:center;gap:4px;white-space:nowrap;">
                        <span>${conf.emoji}</span> <span>${conf.label}</span>
                    </div>
                `,
                iconSize: [80, 30],
                iconAnchor: [40, 15]
            });

            const marker = L.marker([parseFloat(h.lat), parseFloat(h.lng)], { icon: customIcon }).addTo(map);
            marker.bindPopup(`
                <div style="font-family: sans-serif; font-size: 0.85rem;">
                    <b style="color: ${conf.color};">${conf.label.toUpperCase()}</b><br>
                    <p style="margin: 4px 0;">${h.notes || '1-Tap Driver Report'}</p>
                    <small style="color: #64748b;">Source: ${h.source || 'Crowdsourced'}</small>
                </div>
            `);
            state.markers[h.id] = marker;
        });
    }

    // ─── 1-TAP QUICK HAZARD REPORTING ───────────────────────────────────
    window.quickReportHazard = async function (type) {
        initAudio();
        playChime(850, 'triangle');

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        const payload = {
            hazard_type: type,
            lat: state.currentLat,
            lng: state.currentLng,
            severity: 'high',
            notes: `1-Tap Driver Report at ${new Date().toLocaleTimeString()}`
        };

        try {
            const res = await fetch('/api/hazards/quick-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast(`✅ ${type === 'pothole' ? 'गड्ढा' : (type === 'speed_breaker' ? 'स्पीड ब्रेकर' : 'खराब गाड़ी')} सेव हो गया!`);
                loadNearbyHazards();
            }
        } catch (e) {
            showToast('⚠️ रिपोर्ट सेव करने में त्रुटि हुई');
        }
    };

    // ─── AUTOMATIC PHONE ACCELEROMETER BUMP SENSOR ──────────────────────
    function initMotionSensor() {
        if ('DeviceMotionEvent' in window) {
            let lastBumpTime = 0;

            window.addEventListener('devicemotion', (event) => {
                const acc = event.accelerationIncludingGravity || event.acceleration;
                if (!acc) return;

                // Vertical Z-axis jerk threshold for severe pothole/bump
                const zForce = Math.abs(acc.z || 0);
                const now = Date.now();

                if (zForce > 18.0 && (now - lastBumpTime) > 6000) {
                    lastBumpTime = now;
                    console.log(`🚨 Auto-detected road bump: Z-Force = ${zForce.toFixed(1)} m/s²`);
                    showToast(`⚡ जर्क डिटेक्ट हुआ! गड्ढा ऑटो-लॉग हुआ (${zForce.toFixed(1)} m/s²)`);

                    // Silently log to server with GPS
                    fetch('/api/hazards/sensor-bump', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            lat: state.currentLat,
                            lng: state.currentLng,
                            z_force: zForce.toFixed(1),
                            speed: state.currentSpeed
                        })
                    }).then(() => loadNearbyHazards());
                }
            });
            sensorBadge.innerHTML = `<i class="fa-solid fa-bolt" style="color:#10b981;"></i> <span>Sensor & GPS Active</span>`;
        }
    }

    // ─── TEST DRIVE SIMULATION ──────────────────────────────────────────
    window.toggleTestDrive = function () {
        initAudio();
        if (state.testDriving) {
            clearInterval(state.testDriveInterval);
            state.testDriving = false;
            btnTestDrive.classList.remove('active');
            btnTestDriveText.innerText = '▶️ Start Test Drive';
            showToast('🛑 Test Drive Paused');
            return;
        }

        state.testDriving = true;
        btnTestDrive.classList.add('active');
        btnTestDriveText.innerText = '⏹️ Stop Test Drive';
        showToast('🚗 Test Drive Active! Watch voice alerts as you approach hazards.');

        // Seed sample hazards ahead if empty
        if (state.hazards.length === 0) {
            window.seedSampleHazards();
        }

        let step = 0;
        const startLat = state.currentLat;
        const startLng = state.currentLng;

        state.testDriveInterval = setInterval(() => {
            step++;
            const simulatedSpeed = 40 + Math.floor(Math.sin(step / 5) * 10);
            const nextLat = startLat + (step * 0.00015);
            const nextLng = startLng + (step * 0.00010);

            updateDriverLocation(nextLat, nextLng, simulatedSpeed);

            if (step >= 40) step = 0; // Loop back
        }, 1000);
    };

    window.seedSampleHazards = async function () {
        try {
            const res = await fetch('/api/hazards/seed-samples', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: state.currentLat, lng: state.currentLng })
            });
            const data = await res.json();
            showToast(`📍 5 Real-world Sample Hazards Loaded!`);
            loadNearbyHazards();
        } catch (e) {
            showToast('Error seeding sample data');
        }
    };

    window.toggleVoiceAlerts = function () {
        state.voiceEnabled = !state.voiceEnabled;
        btnVoiceText.innerText = state.voiceEnabled ? 'Voice: Hindi (ON)' : 'Voice: Muted (OFF)';
        showToast(state.voiceEnabled ? '🔊 Voice Alerts Enabled' : '🔇 Voice Alerts Muted');
    };

    function showToast(msg) {
        toastMsg.innerText = msg;
        toastMsg.style.display = 'block';
        setTimeout(() => { toastMsg.style.display = 'none'; }, 3000);
    }

    // ─── INITIALIZATION ─────────────────────────────────────────────────
    function initGPS() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    updateDriverLocation(pos.coords.latitude, pos.coords.longitude, Math.round((pos.coords.speed || 0) * 3.6));
                    loadNearbyHazards();
                },
                () => {
                    loadNearbyHazards();
                }
            );

            navigator.geolocation.watchPosition(
                (pos) => {
                    if (!state.testDriving) {
                        updateDriverLocation(pos.coords.latitude, pos.coords.longitude, Math.round((pos.coords.speed || 10) * 3.6));
                    }
                },
                null,
                { enableHighAccuracy: true }
            );
        }
    }

    // Initialize all sub-systems
    initMap();
    initGPS();
    initMotionSensor();

})();
