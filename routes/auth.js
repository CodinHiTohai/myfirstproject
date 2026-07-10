const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Driver Registration
router.post('/driver-register', async (req, res) => {
    const { name, phone, password, vehicle_number, vehicle_type } = req.body;
    const db = req.app.get('db');

    if (!name || !phone || !password || !vehicle_number || !vehicle_type) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        const [existing] = await db.query('SELECT * FROM drivers WHERE phone = ?', [phone]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Phone number already registered.' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const [result] = await db.query(
            'INSERT INTO drivers (name, phone, password, vehicle_number, vehicle_type) VALUES (?, ?, ?, ?, ?)',
            [name, phone, hashedPassword, vehicle_number, vehicle_type]
        );

        const newDriverId = result.insertId;

        const token = jwt.sign(
            { id: newDriverId, name, role: 'driver', vehicle_type, vehicle_number },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            token,
            driver: {
                id: newDriverId,
                name,
                phone,
                vehicle_number,
                vehicle_type,
                avg_rating: 0,
                total_ratings: 0
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Database error occurred during registration.' });
    }
});

// Driver Login
router.post('/driver-login', async (req, res) => {
    const { phone, password } = req.body;
    const db = req.app.get('db');

    try {
        const [drivers] = await db.query('SELECT * FROM drivers WHERE phone = ?', [phone]);

        if (drivers.length === 0) {
            return res.status(401).json({ error: 'Invalid phone number or password.' });
        }

        const driver = drivers[0];
        const validPassword = bcrypt.compareSync(password, driver.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid phone number or password.' });
        }

        const token = jwt.sign(
            { id: driver.id, name: driver.name, role: 'driver', vehicle_type: driver.vehicle_type, vehicle_number: driver.vehicle_number },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            driver: {
                id: driver.id,
                name: driver.name,
                phone: driver.phone,
                vehicle_number: driver.vehicle_number,
                vehicle_type: driver.vehicle_type,
                avg_rating: driver.avg_rating,
                total_ratings: driver.total_ratings
            }
        });
    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({ error: 'Database error occurred during login.' });
    }
});

// Admin Login
router.post('/admin-login', async (req, res) => {
    const { username, password } = req.body;
    const db = req.app.get('db');

    try {
        const [admins] = await db.query('SELECT * FROM admins WHERE username = ?', [username]);

        if (admins.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const admin = admins[0];
        const validPassword = bcrypt.compareSync(password, admin.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { id: admin.id, username: admin.username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, admin: { id: admin.id, username: admin.username } });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Database error occurred during login.' });
    }
});


// ─── POST /api/auth/reset-password ───────────────────────────────────────────
// Called after OTP is verified. Resets driver password.
router.post('/reset-password', async (req, res) => {
    const { phone, newPassword } = req.body;
    const db = req.app.get('db');

    if (!phone || !newPassword) {
        return res.status(400).json({ error: 'Phone and new password are required.' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        // Check OTP was verified for this phone (within last 10 minutes)
        const [otpRows] = await db.query(
            `SELECT * FROM otp_verifications
             WHERE phone = ? AND verified = 1
               AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
             ORDER BY created_at DESC LIMIT 1`,
            [phone]
        );

        if (otpRows.length === 0) {
            return res.status(401).json({ error: 'OTP verify nahi hua. Pehle OTP verify karo.' });
        }

        // Check driver exists
        const [drivers] = await db.query('SELECT * FROM drivers WHERE phone = ?', [phone]);
        if (drivers.length === 0) {
            return res.status(404).json({ error: 'Is phone se koi driver registered nahi hai.' });
        }

        // Hash and update password
        const hashed = bcrypt.hashSync(newPassword, 10);
        await db.query('UPDATE drivers SET password = ? WHERE phone = ?', [hashed, phone]);

        // Invalidate the OTP
        await db.query(
            'UPDATE otp_verifications SET verified = 2 WHERE phone = ? AND verified = 1',
            [phone]
        );

        res.json({ success: true, message: 'Password successfully reset kar diya gaya.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Database error during password reset.' });
    }
});

module.exports = router;

