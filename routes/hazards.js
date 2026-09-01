const express = require('express');
const router = express.Router();

/**
 * Helper: Calculate Haversine distance in meters between 2 coordinates
 */
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of Earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

/**
 * POST /api/hazards/quick-report
 * 1-Tap Crowdsourced report from driver/passenger without camera.
 * Body: { hazard_type: 'pothole'|'speed_breaker'|'stalled_vehicle'|'obstacle', lat, lng, severity, notes }
 */
router.post('/quick-report', async (req, res) => {
    const db = req.app.get('db');
    const io = req.app.get('io');
    const { hazard_type, lat, lng, severity = 'high', notes = '1-Tap User Report' } = req.body;

    if (!hazard_type) {
        return res.status(400).json({ error: 'hazard_type is required.' });
    }

    try {
        const [result] = await db.query(
            `INSERT INTO road_hazards (hazard_type, severity, distance, lat, lng, speed, source, notes)
             VALUES (?, ?, 0, ?, ?, 0, 'user_report', ?)`,
            [hazard_type, severity, lat || null, lng || null, notes]
        );

        const hazardData = {
            id: result.insertId,
            hazard_type,
            severity,
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null,
            source: 'user_report',
            notes,
            confirmations: 1,
            created_at: new Date()
        };

        if (io) {
            io.emit('road-hazard-alert', hazardData);
        }

        res.status(201).json({ success: true, message: 'Hazard reported successfully!', hazard: hazardData });
    } catch (err) {
        console.error('Error in quick-report:', err);
        res.status(500).json({ error: 'Failed to submit hazard report.' });
    }
});

/**
 * POST /api/hazards/sensor-bump
 * Auto-logged by phone Accelerometer Sensor on bump/jerk
 */
router.post('/sensor-bump', async (req, res) => {
    const db = req.app.get('db');
    const io = req.app.get('io');
    const { lat, lng, z_force, speed } = req.body;

    try {
        const [result] = await db.query(
            `INSERT INTO road_hazards (hazard_type, severity, distance, lat, lng, speed, source, notes)
             VALUES ('pothole', 'high', 0, ?, ?, ?, 'sensor_bump', ?)`,
            [lat || null, lng || null, speed || 0, `Auto detected bump (Z-force: ${z_force || '18'} m/s²)`]
        );

        const hazardData = {
            id: result.insertId,
            hazard_type: 'pothole',
            severity: 'high',
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null,
            speed: speed || 0,
            source: 'sensor_bump',
            notes: `Auto detected bump (${z_force} m/s²)`,
            created_at: new Date()
        };

        if (io) {
            io.emit('road-hazard-alert', hazardData);
        }

        res.status(201).json({ success: true, hazard: hazardData });
    } catch (err) {
        console.error('Error in sensor-bump:', err);
        res.status(500).json({ error: 'Failed to record sensor bump.' });
    }
});

/**
 * GET /api/hazards/nearby
 * Returns hazards within radiusKm, with precise distance_meters from driver
 */
router.get('/nearby', async (req, res) => {
    const db = req.app.get('db');
    const { lat, lng, radiusKm = 10 } = req.query;

    try {
        const [hazards] = await db.query(
            'SELECT * FROM road_hazards ORDER BY created_at DESC LIMIT 100'
        );

        if (lat && lng) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);

            // Compute distance in meters for each hazard
            const processed = hazards.map(h => {
                if (h.lat && h.lng) {
                    const distMeters = getDistanceMeters(userLat, userLng, parseFloat(h.lat), parseFloat(h.lng));
                    return { ...h, distance_meters: distMeters };
                }
                return { ...h, distance_meters: 99999 };
            })
            .filter(h => h.distance_meters <= (parseFloat(radiusKm) * 1000))
            .sort((a, b) => a.distance_meters - b.distance_meters);

            return res.json({ hazards: processed });
        }

        res.json({ hazards });
    } catch (err) {
        console.error('Error fetching nearby hazards:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

/**
 * POST /api/hazards/seed-samples
 * Seeds realistic sample potholes, speed breakers, and stalled cars around given coordinates
 */
router.post('/seed-samples', async (req, res) => {
    const db = req.app.get('db');
    const { lat = 28.6139, lng = 77.2090 } = req.body;
    const baseLat = parseFloat(lat);
    const baseLng = parseFloat(lng);

    const sampleHazards = [
        { type: 'pothole', severity: 'critical', dLat: 0.0006, dLng: 0.0004, note: 'Bada Gaddha (Deep pothole in middle lane)' },
        { type: 'speed_breaker', severity: 'medium', dLat: 0.0012, dLng: 0.0008, note: 'Unmarked Speed Breaker near crossroad' },
        { type: 'stalled_vehicle', severity: 'critical', dLat: 0.0019, dLng: 0.0013, note: 'Kharab Truck (Broken truck on right lane)' },
        { type: 'pothole', severity: 'high', dLat: -0.0007, dLng: -0.0005, note: 'Gaddha near bridge entry' },
        { type: 'obstacle', severity: 'medium', dLat: 0.0026, dLng: 0.0018, note: 'Road Construction & Sand pile' }
    ];

    try {
        for (const h of sampleHazards) {
            await db.query(
                `INSERT INTO road_hazards (hazard_type, severity, distance, lat, lng, speed, source, notes)
                 VALUES (?, ?, 0, ?, ?, 0, 'sample_dataset', ?)`,
                [h.type, h.severity, baseLat + h.dLat, baseLng + h.dLng, h.note]
            );
        }
        res.json({ success: true, message: `Seeded ${sampleHazards.length} realistic road hazards around current location!` });
    } catch (err) {
        console.error('Error seeding hazards:', err);
        res.status(500).json({ error: 'Failed to seed sample hazards.' });
    }
});

module.exports = router;
