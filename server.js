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
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection
pool.getConnection()
    .then(conn => {
        console.log('✅ Connected to MySQL Database');
        conn.release();
    })
    .catch(err => {
        console.error('❌ MySQL Connection Failed:', err.message);
    });

// Make io and db accessible to routes
app.set('io', io);
app.set('db', pool);

// ─── API Routes ──────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const routeRoutes = require('./routes/routes');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/admin', adminRoutes);

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
        // data = { routeId, userId, name, phone }
        const { routeId, name, phone } = data;
        console.log(`Ride requested for route ${routeId} by ${name}`);
        // Relay to driver
        io.to(`driver_${routeId}`).emit('incoming-ride-request', {
            userId: socket.id, // we use user's socket id to reply back directly
            name,
            phone,
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
