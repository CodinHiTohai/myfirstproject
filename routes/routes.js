const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Search routes by pickup & destination
router.get('/search', async (req, res) => {
    const { pickup, destination } = req.query;
    const db = req.app.get('db');

    if (!pickup || !destination) {
        return res.status(400).json({ error: 'Pickup and destination are required.' });
    }

    try {
        const query = `
            SELECT r.*, d.name as driver_name, d.vehicle_number, d.vehicle_type, 
                   (r.total_seats - r.filled_seats) as empty_seats
            FROM routes r
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.status = 'active'
              AND LOWER(r.start_location) LIKE LOWER(?)
              AND LOWER(r.end_location) LIKE LOWER(?)
        `;

        const [results] = await db.query(query, [`%${pickup}%`, `%${destination}%`]);
        res.json(results);
    } catch (error) {
        console.error('Search routes error:', error);
        res.status(500).json({ error: 'Database error occurred during search.' });
    }
});

// Get single route details
router.get('/:id', async (req, res) => {
    const db = req.app.get('db');

    try {
        const query = `
            SELECT r.*, d.name as driver_name, d.vehicle_number, d.vehicle_type, 
                   (r.total_seats - r.filled_seats) as empty_seats
            FROM routes r
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.id = ?
        `;

        const [routes] = await db.query(query, [req.params.id]);

        if (routes.length === 0) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        res.json(routes[0]);
    } catch (error) {
        console.error('Get route error:', error);
        res.status(500).json({ error: 'Database error occurred retrieving route.' });
    }
});

// Driver creates/goes live with route
router.post('/', authenticateToken, async (req, res) => {
    const { start_location, end_location, fare, total_seats, lat, lng } = req.body;
    const db = req.app.get('db');

    if (!start_location || !end_location || !fare || !total_seats) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        // Check if driver already has an active route
        const [existingRoutes] = await db.query(
            'SELECT * FROM routes WHERE driver_id = ? AND status = ?',
            [req.user.id, 'active']
        );

        if (existingRoutes.length > 0) {
            // Update existing route
            const existingId = existingRoutes[0].id;
            await db.query(
                `UPDATE routes 
                 SET start_location = ?, end_location = ?, fare = ?, total_seats = ?, filled_seats = 0, current_lat = COALESCE(?, current_lat), current_lng = COALESCE(?, current_lng)
                 WHERE id = ?`,
                [start_location, end_location, parseFloat(fare), parseInt(total_seats), lat, lng, existingId]
            );

            // Fetch updated record
            const [[updatedRoute]] = await db.query('SELECT * FROM routes WHERE id = ?', [existingId]);

            const io = req.app.get('io');
            io.emit('route-updated', updatedRoute);
            return res.json(updatedRoute);
        }

        // Insert new route
        const [result] = await db.query(
            `INSERT INTO routes (driver_id, start_location, end_location, fare, total_seats, current_lat, current_lng, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
            [req.user.id, start_location, end_location, parseFloat(fare), parseInt(total_seats), lat || 25.0961, lng || 85.3131]
        );

        const [[newRoute]] = await db.query('SELECT * FROM routes WHERE id = ?', [result.insertId]);

        const io = req.app.get('io');
        io.emit('new-route', newRoute);

        res.status(201).json(newRoute);
    } catch (error) {
        console.error('Create route error:', error);
        res.status(500).json({ error: 'Database error occurred creating route.' });
    }
});

// Driver updates seat count
router.patch('/:id/seats', authenticateToken, async (req, res) => {
    const db = req.app.get('db');
    const routeId = parseInt(req.params.id);

    try {
        const [routes] = await db.query('SELECT * FROM routes WHERE id = ?', [routeId]);

        if (routes.length === 0) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const route = routes[0];

        if (route.driver_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        const { action } = req.body; // 'fill' or 'empty'
        let newFilledSeats = route.filled_seats;

        if (action === 'fill' && newFilledSeats < route.total_seats) {
            newFilledSeats++;
        } else if (action === 'empty' && newFilledSeats > 0) {
            newFilledSeats--;
        } else {
            return res.status(400).json({ error: 'Invalid action or seat limit reached.' });
        }

        await db.query('UPDATE routes SET filled_seats = ? WHERE id = ?', [newFilledSeats, routeId]);

        const io = req.app.get('io');
        const emptySeats = route.total_seats - newFilledSeats;

        io.emit('seat-updated', {
            routeId: routeId,
            filled_seats: newFilledSeats,
            total_seats: route.total_seats,
            empty_seats: emptySeats
        });

        res.json({
            filled_seats: newFilledSeats,
            total_seats: route.total_seats,
            empty_seats: emptySeats
        });
    } catch (error) {
        console.error('Update seats error:', error);
        res.status(500).json({ error: 'Database error occurred updating seats.' });
    }
});

// Driver ends ride
router.patch('/:id/end', authenticateToken, async (req, res) => {
    const db = req.app.get('db');
    const routeId = parseInt(req.params.id);

    try {
        const [routes] = await db.query('SELECT driver_id FROM routes WHERE id = ?', [routeId]);

        if (routes.length === 0) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        if (routes[0].driver_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        await db.query('UPDATE routes SET status = ? WHERE id = ?', ['inactive', routeId]);

        const io = req.app.get('io');
        io.emit('route-ended', { routeId: routeId });

        res.json({ message: 'Ride ended successfully.' });
    } catch (error) {
        console.error('End ride error:', error);
        res.status(500).json({ error: 'Database error occurred ending ride.' });
    }
});

module.exports = router;
