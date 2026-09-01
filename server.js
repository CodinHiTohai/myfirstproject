require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MySQL Database Connection ────────────────────────────────────
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'govind',
    database: process.env.DB_NAME || 'eyein',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false // Required for Aiven/Cloud DBs
    }
});

// Test connection & run schema migrations
pool.getConnection()
    .then(async conn => {
        console.log('✅ Connected to MySQL Database');

        // Migration 1: stops column on routes
        try {
            await conn.query('ALTER TABLE routes ADD COLUMN stops VARCHAR(500) DEFAULT NULL');
            console.log('✅ Schema migrated: stops column added');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.log('Schema migration notice (stops):', err.message);
            }
        }

        // Migration 2: status column on drivers
        try {
            await conn.query("ALTER TABLE drivers ADD COLUMN status ENUM('active','blocked') DEFAULT 'active'");
            console.log('✅ Schema migrated: drivers.status column added');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.log('Schema migration notice (drivers.status):', err.message);
            }
        }

        // Migration 3: avg_rating column on drivers
        try {
            await conn.query('ALTER TABLE drivers ADD COLUMN avg_rating DECIMAL(3,1) DEFAULT 0');
            console.log('✅ Schema migrated: drivers.avg_rating column added');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.log('Schema migration notice (drivers.avg_rating):', err.message);
            }
        }

        // Migration 4: total_ratings column on drivers
        try {
            await conn.query('ALTER TABLE drivers ADD COLUMN total_ratings INT DEFAULT 0');
            console.log('✅ Schema migrated: drivers.total_ratings column added');
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                console.log('Schema migration notice (drivers.total_ratings):', err.message);
            }
        }

        // Migration 5: feedback table
        try {
            await conn.query(`
                CREATE TABLE IF NOT EXISTS feedback (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    name        VARCHAR(100),
                    phone       VARCHAR(15),
                    message     TEXT NOT NULL,
                    type        ENUM('bug','suggestion','complaint','praise') DEFAULT 'suggestion',
                    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Schema migrated: feedback table ready');
        } catch (err) {
            if (err.code !== 'ER_TABLE_EXISTS_ERROR') {
                console.log('Schema migration notice (feedback):', err.message);
            }
        }

        // Migration 6: road_hazards table (Pothole, Borehole, Breaker, Breakdown Detection)
        try {
            await conn.query(`
                CREATE TABLE IF NOT EXISTS road_hazards (
                    id           INT AUTO_INCREMENT PRIMARY KEY,
                    hazard_type  VARCHAR(50) NOT NULL,
                    severity     ENUM('low','medium','high','critical') DEFAULT 'high',
                    distance     DECIMAL(5,1) DEFAULT 0,
                    lat          DECIMAL(10,7) DEFAULT NULL,
                    lng          DECIMAL(10,7) DEFAULT NULL,
                    speed        DECIMAL(5,1) DEFAULT 0,
                    source       VARCHAR(50) DEFAULT 'user_report',
                    notes        TEXT DEFAULT NULL,
                    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            // Ensure hazard_type is VARCHAR(50) if table was already created
            try {
                await conn.query('ALTER TABLE road_hazards MODIFY COLUMN hazard_type VARCHAR(50) NOT NULL');
            } catch (e) {}
            console.log('✅ Schema migrated: road_hazards table ready (supports borehole & all hazards)');
        } catch (err) {
            if (err.code !== 'ER_TABLE_EXISTS_ERROR') {
                console.log('Schema migration notice (road_hazards):', err.message);
            }
        }

        conn.release();
    })
    .catch(err => {
        console.error('❌ MySQL Connection Failed:', err.message);
    });

// Make io and db accessible to routes
app.set('io', io);
app.set('db', pool);

// ─── API Routes ──────────────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const routeRoutes    = require('./routes/routes');
const adminRoutes    = require('./routes/admin');
const feedbackRoutes = require('./routes/feedback');
const hazardRoutes   = require('./routes/hazards');

app.use('/api/auth',     authRoutes);
app.use('/api/routes',   routeRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/hazards',  hazardRoutes);

// ─── GET /api/user-rides?phone=X ─────────────────────────────────
// Returns up to 20 most recent rides for a passenger phone number.
app.get('/api/user-rides', async (req, res) => {
    const db = req.app.get('db');
    const { phone } = req.query;

    if (!phone) {
        return res.status(400).json({ error: 'Phone query parameter is required.' });
    }

    try {
        const [rides] = await pool.query(
            'SELECT * FROM ride_history WHERE passenger_phone = ? ORDER BY created_at DESC LIMIT 20',
            [phone]
        );
        res.json({ rides });
    } catch (error) {
        console.error('User rides error:', error);
        res.status(500).json({ error: 'Database error fetching rides.' });
    }
});

// ─── Socket.io ─────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Driver joins their specific route room to listen for requests
    socket.on('join-driver-room', (routeId) => {
        socket.join(`driver_${routeId}`);
        console.log(`Driver joined room: driver_${routeId}`);
    });

    // User requests a ride
    socket.on('request-ride', (data) => {
        // data = { routeId, userId, name, phone, passengers, seats, seatNumbers }
        const { routeId, name, phone, passengers, seats, seatNumbers } = data;
        console.log(`Ride requested for route ${routeId} by ${name} — ${passengers} log, ${seats} seats, selected: ${seatNumbers || 'any'}`);
        // Relay to driver
        io.to(`driver_${routeId}`).emit('incoming-ride-request', {
            userId: socket.id,
            name,
            phone,
            passengers,
            seats,
            seatNumbers: seatNumbers || [],
            routeId
        });
    });

    // Driver accepts ride
    socket.on('accept-ride', (data) => {
        // data = { userId, routeId, driverName, vehicleNumber }
        io.to(data.userId).emit('ride-accepted', data);
    });

    // Driver rejects ride
    socket.on('reject-ride', (data) => {
        // data = { userId, routeId }
        io.to(data.userId).emit('ride-rejected', data);
    });

    // Driver sends live GPS location
    socket.on('driver-location-update', async (data) => {
        // data = { routeId, lat, lng }
        try {
            const [result] = await pool.query(
                'UPDATE routes SET current_lat = ?, current_lng = ? WHERE id = ?',
                [data.lat, data.lng, data.routeId]
            );

            if (result.affectedRows > 0) {
                // Broadcast location to anyone listening
                io.emit('location-updated', { routeId: data.routeId, lat: data.lat, lng: data.lng });
            }
        } catch (error) {
            console.error('Error updating driver location:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

// ─── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 Eye In server running at http://localhost:${PORT}`);
    console.log(`📊 Admin login: username=admin, password=admin123`);
    console.log(`🚗 Driver login: phone=9876543210, password=driver123`);
    console.log(`\n📂 Pages:`);
    console.log(`   Home:     http://localhost:${PORT}/`);
    console.log(`   Driver:   http://localhost:${PORT}/driver-login.html`);
    console.log(`   Admin:    http://localhost:${PORT}/admin-login.html`);
});
