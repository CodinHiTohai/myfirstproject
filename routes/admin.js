const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
// Returns dashboard stats: active routes, total drivers, rides today, all-time rides,
// top routes, rides by vehicle type, and last 10 recent rides.
router.get('/stats', authenticateToken, async (req, res) => {
    const db = req.app.get('db');

    try {
        // Active routes count
        const [[{ active_routes }]] = await db.query(
            "SELECT COUNT(*) AS active_routes FROM routes WHERE status = 'active'"
        );

        // Total drivers count
        const [[{ total_drivers }]] = await db.query(
            'SELECT COUNT(*) AS total_drivers FROM drivers'
        );

        // Rides today
        const [[{ total_rides_today }]] = await db.query(
            "SELECT COUNT(*) AS total_rides_today FROM ride_history WHERE DATE(created_at) = CURDATE()"
        );

        // All-time rides
        const [[{ total_rides_all_time }]] = await db.query(
            'SELECT COUNT(*) AS total_rides_all_time FROM ride_history'
        );

        // Top routes (top 5 by ride count)
        const [top_routes] = await db.query(`
            SELECT CONCAT(start_location, ' → ', end_location) AS route, COUNT(*) AS count
            FROM ride_history
            GROUP BY start_location, end_location
            ORDER BY count DESC
            LIMIT 5
        `);

        // Rides by vehicle type
        const [vehicle_rows] = await db.query(`
            SELECT vehicle_type, COUNT(*) AS count
            FROM ride_history
            GROUP BY vehicle_type
        `);

        const rides_by_vehicle_type = { auto: 0, bus: 0, car: 0 };
        vehicle_rows.forEach(row => {
            const type = (row.vehicle_type || '').toLowerCase();
            if (type in rides_by_vehicle_type) {
                rides_by_vehicle_type[type] = row.count;
            }
        });

        // Recent 10 rides with driver name
        const [recent_rides] = await db.query(`
            SELECT rh.id, rh.route_id, rh.driver_id, rh.passenger_name, rh.passenger_phone,
                   rh.passengers, rh.seats_booked, rh.start_location, rh.end_location,
                   rh.fare, rh.vehicle_number, rh.vehicle_type, rh.driver_name,
                   rh.status, rh.rating, rh.rating_comment, rh.created_at, rh.completed_at
            FROM ride_history rh
            ORDER BY rh.created_at DESC
            LIMIT 10
        `);

        res.json({
            active_routes,
            total_drivers,
            total_rides_today,
            total_rides_all_time,
            top_routes,
            rides_by_vehicle_type,
            recent_rides
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: 'Database error retrieving statistics.' });
    }
});

// ─── GET /api/admin/drivers ───────────────────────────────────────────────────
// Returns all drivers with their stats.
router.get('/drivers', authenticateToken, async (req, res) => {
    const db = req.app.get('db');

    try {
        const [drivers] = await db.query(`
            SELECT
                d.id,
                d.name,
                d.phone,
                d.vehicle_number,
                d.vehicle_type,
                d.avg_rating,
                d.total_ratings,
                d.created_at,
                COALESCE(d.status, 'active') AS status,
                COUNT(rh.id) AS total_rides
            FROM drivers d
            LEFT JOIN ride_history rh ON rh.driver_id = d.id
            GROUP BY d.id
            ORDER BY d.created_at DESC
        `);

        res.json(drivers);
    } catch (error) {
        console.error('Admin get drivers error:', error);
        res.status(500).json({ error: 'Database error retrieving drivers.' });
    }
});

// ─── PATCH /api/admin/drivers/:id/status ─────────────────────────────────────
// Updates a driver's status to 'active' or 'blocked'.
router.patch('/drivers/:id/status', authenticateToken, async (req, res) => {
    const db = req.app.get('db');
    const driverId = parseInt(req.params.id);
    const { status } = req.body;

    if (!status || !['active', 'blocked'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'active' or 'blocked'." });
    }

    try {
        const [result] = await db.query(
            'UPDATE drivers SET status = ? WHERE id = ?',
            [status, driverId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Driver not found.' });
        }

        res.json({ success: true, message: `Driver status updated to '${status}'.` });
    } catch (error) {
        console.error('Admin update driver status error:', error);
        res.status(500).json({ error: 'Database error updating driver status.' });
    }
});

// ─── GET /api/admin/feedback ──────────────────────────────────────────────────
// Returns all feedback submissions.
router.get('/feedback', authenticateToken, async (req, res) => {
    const db = req.app.get('db');

    try {
        const [feedback] = await db.query(
            'SELECT * FROM feedback ORDER BY created_at DESC'
        );

        res.json(feedback);
    } catch (error) {
        console.error('Admin get feedback error:', error);
        res.status(500).json({ error: 'Database error retrieving feedback.' });
    }
});

// ─── GET /api/admin/routes ────────────────────────────────────────────────────
// Returns all active routes with driver info (preserved from original).
router.get('/routes', authenticateToken, async (req, res) => {
    const db = req.app.get('db');

    try {
        const [routes] = await db.query(`
            SELECT r.*, d.name AS driver_name, d.vehicle_number, d.vehicle_type,
                   (r.total_seats - r.filled_seats) AS empty_seats
            FROM routes r
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.status = 'active'
        `);

        res.json(routes);
    } catch (error) {
        console.error('Admin get routes error:', error);
        res.status(500).json({ error: 'Database error retrieving routes.' });
    }
});

// ─── PATCH /api/admin/routes/:id/disable ─────────────────────────────────────
// Disables (makes inactive) a route (preserved from original).
router.patch('/routes/:id/disable', authenticateToken, async (req, res) => {
    const db = req.app.get('db');
    const routeId = parseInt(req.params.id);

    try {
        const [result] = await db.query(
            "UPDATE routes SET status = 'inactive' WHERE id = ?",
            [routeId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const io = req.app.get('io');
        io.emit('route-ended', { routeId });

        res.json({ message: 'Route disabled successfully.' });
    } catch (error) {
        console.error('Admin disable route error:', error);
        res.status(500).json({ error: 'Database error disabling route.' });
    }
});

module.exports = router;
