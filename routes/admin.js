const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get all active routes
router.get('/routes', authenticateToken, async (req, res) => {
    const db = req.app.get('db');
    try {
        const query = `
            SELECT r.*, d.name as driver_name, d.vehicle_number, d.vehicle_type, 
                   (r.total_seats - r.filled_seats) as empty_seats
            FROM routes r
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.status = 'active'
        `;
        const [routes] = await db.query(query);
        res.json(routes);
    } catch (error) {
        console.error('Admin get routes error:', error);
        res.status(500).json({ error: 'Database error retrieving routes.' });
    }
});

// Get all drivers
router.get('/drivers', authenticateToken, async (req, res) => {
    const db = req.app.get('db');
    try {
        const [drivers] = await db.query('SELECT id, name, phone, vehicle_number, vehicle_type FROM drivers');
        res.json(drivers);
    } catch (error) {
        console.error('Admin get drivers error:', error);
        res.status(500).json({ error: 'Database error retrieving drivers.' });
    }
});

// Disable a route
router.patch('/routes/:id/disable', authenticateToken, async (req, res) => {
    const db = req.app.get('db');
    const routeId = parseInt(req.params.id);

    try {
        const [result] = await db.query('UPDATE routes SET status = ? WHERE id = ?', ['inactive', routeId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const io = req.app.get('io');
        io.emit('route-ended', { routeId: routeId });

        res.json({ message: 'Route disabled successfully.' });
    } catch (error) {
        console.error('Admin disable route error:', error);
        res.status(500).json({ error: 'Database error disabling route.' });
    }
});

// Get system stats
router.get('/stats', authenticateToken, async (req, res) => {
    const db = req.app.get('db');

    try {
        const [[{ activeRoutes }]] = await db.query("SELECT COUNT(*) as activeRoutes FROM routes WHERE status = 'active'");
        const [[{ totalDrivers }]] = await db.query("SELECT COUNT(*) as totalDrivers FROM drivers");
        const [[{ activeVehicles }]] = await db.query("SELECT COUNT(DISTINCT driver_id) as activeVehicles FROM routes WHERE status = 'active'");

        // Assuming totalVehicles is same as totalDrivers based on previous logic 
        // (1 driver = 1 vehicle in this schema)
        const totalVehicles = totalDrivers;

        res.json({
            activeRoutes,
            totalDrivers,
            totalVehicles,
            activeVehicles
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: 'Database error retrieving statistics.' });
    }
});

module.exports = router;
