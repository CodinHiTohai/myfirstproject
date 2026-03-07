const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get driver's active route (for auto-restore on dashboard load)
router.get('/driver/active', authenticateToken, async (req, res) => {
    const db = req.app.get('db');

    try {
        const query = `
            SELECT r.*, d.name as driver_name, d.vehicle_number, d.vehicle_type,
                   (r.total_seats - r.filled_seats) as empty_seats
            FROM routes r
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.driver_id = ? AND r.status = 'active'
            ORDER BY r.created_at DESC
            LIMIT 1
        `;
        const [routes] = await db.query(query, [req.user.id]);

        if (routes.length === 0) {
            return res.status(404).json({ message: 'No active route.' });
        }

        res.json(routes[0]);
    } catch (error) {
        console.error('Get active route error:', error);
        res.status(500).json({ error: 'Database error.' });
    }
});

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
                   d.avg_rating, d.total_ratings,
                   (r.total_seats - r.filled_seats) as empty_seats
            FROM routes r
            JOIN drivers d ON r.driver_id = d.id
            WHERE r.status = 'active'
              AND LOWER(CONCAT(r.start_location, ', ', IFNULL(r.stops, ''), ', ', r.end_location)) LIKE LOWER(?)
              AND LOWER(CONCAT(r.start_location, ', ', IFNULL(r.stops, ''), ', ', r.end_location)) LIKE LOWER(?)
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
    const { start_location, end_location, stops, fare, total_seats, lat, lng } = req.body;
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
                 SET start_location = ?, end_location = ?, stops = ?, fare = ?, total_seats = ?, filled_seats = 0, current_lat = COALESCE(?, current_lat), current_lng = COALESCE(?, current_lng)
                 WHERE id = ?`,
                [start_location, end_location, stops || null, parseFloat(fare), parseInt(total_seats), lat, lng, existingId]
            );

            // Fetch updated record
            const [[updatedRoute]] = await db.query('SELECT * FROM routes WHERE id = ?', [existingId]);

            const io = req.app.get('io');
            io.emit('route-updated', updatedRoute);
            return res.json(updatedRoute);
        }

        // Insert new route
        const [result] = await db.query(
            `INSERT INTO routes (driver_id, start_location, end_location, stops, fare, total_seats, current_lat, current_lng, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [req.user.id, start_location, end_location, stops || null, parseFloat(fare), parseInt(total_seats), lat || 25.0961, lng || 85.3131]
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

        const { action, count } = req.body; // 'fill' or 'empty', optional count (default 1)
        const seatChange = count ? parseInt(count) : 1;
        let newFilledSeats = route.filled_seats;

        if (action === 'fill' && (newFilledSeats + seatChange) <= route.total_seats) {
            newFilledSeats += seatChange;
        } else if (action === 'empty' && (newFilledSeats - seatChange) >= 0) {
            newFilledSeats -= seatChange;
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

// ─── Save ride to history (when driver accepts) ──────────────
router.post('/ride-history', async (req, res) => {
    const db = req.app.get('db');
    const { routeId, driverId, passengerName, passengerPhone, passengers, seats } = req.body;

    try {
        // Get route & driver info
        const [[route]] = await db.query(`
            SELECT r.*, d.name as driver_name, d.vehicle_number, d.vehicle_type
            FROM routes r JOIN drivers d ON r.driver_id = d.id
            WHERE r.id = ?
        `, [routeId]);

        if (!route) return res.status(404).json({ error: 'Route not found' });

        const [result] = await db.query(`
            INSERT INTO ride_history (route_id, driver_id, passenger_name, passenger_phone, passengers, seats_booked, start_location, end_location, fare, vehicle_number, vehicle_type, driver_name, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted')
        `, [routeId, route.driver_id, passengerName, passengerPhone, passengers || 1, seats || 1, route.start_location, route.end_location, route.fare, route.vehicle_number, route.vehicle_type, route.driver_name]);

        res.status(201).json({ rideId: result.insertId, message: 'Ride saved to history' });
    } catch (error) {
        console.error('Save ride history error:', error);
        res.status(500).json({ error: 'Failed to save ride history' });
    }
});

// ─── Get ride history for a passenger (by phone) ─────────────
router.get('/ride-history/:phone', async (req, res) => {
    const db = req.app.get('db');
    const phone = req.params.phone;

    try {
        const [rides] = await db.query(`
            SELECT * FROM ride_history
            WHERE passenger_phone = ?
            ORDER BY created_at DESC
            LIMIT 20
        `, [phone]);

        res.json(rides);
    } catch (error) {
        console.error('Get ride history error:', error);
        res.status(500).json({ error: 'Failed to fetch ride history' });
    }
});

// ─── Get ride history for a driver ───────────────────────────
router.get('/driver/ride-history', authenticateToken, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const [rides] = await db.query(`
            SELECT * FROM ride_history
            WHERE driver_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `, [req.user.id]);

        res.json(rides);
    } catch (error) {
        console.error('Driver ride history error:', error);
        res.status(500).json({ error: 'Failed to fetch driver ride history' });
    }
});

// ─── Submit rating for a ride ────────────────────────────────
router.post('/ride-history/:id/rate', async (req, res) => {
    const db = req.app.get('db');
    const rideId = req.params.id;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    try {
        // Update ride_history with rating
        const [result] = await db.query(`
            UPDATE ride_history SET rating = ?, rating_comment = ?, status = 'completed', completed_at = NOW()
            WHERE id = ? AND rating IS NULL
        `, [rating, comment || null, rideId]);

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'Ride already rated or not found' });
        }

        // Get the driver_id for this ride
        const [[ride]] = await db.query('SELECT driver_id FROM ride_history WHERE id = ?', [rideId]);

        // Recalculate driver's average rating
        const [[stats]] = await db.query(`
            SELECT AVG(rating) as avg_rating, COUNT(rating) as total_ratings
            FROM ride_history
            WHERE driver_id = ? AND rating IS NOT NULL
        `, [ride.driver_id]);

        await db.query(`
            UPDATE drivers SET avg_rating = ?, total_ratings = ? WHERE id = ?
        `, [parseFloat(stats.avg_rating).toFixed(1), stats.total_ratings, ride.driver_id]);

        res.json({ message: 'Rating submitted!', avg_rating: parseFloat(stats.avg_rating).toFixed(1), total_ratings: stats.total_ratings });
    } catch (error) {
        console.error('Rating error:', error);
        res.status(500).json({ error: 'Failed to submit rating' });
    }
});

module.exports = router;
