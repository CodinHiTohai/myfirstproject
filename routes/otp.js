const express = require('express');
const router = express.Router();

// ─── POST /api/otp/send ───────────────────────────────────────────────────────
// Generates a 6-digit OTP, saves it to otp_verifications, and returns it.
// Body: { phone }
router.post('/send', async (req, res) => {
    const db = req.app.get('db');
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: 'Phone number is required.' });
    }

    try {
        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Expire any existing OTPs for this phone
        await db.query(
            'UPDATE otp_verifications SET verified = 1 WHERE phone = ? AND verified = 0',
            [phone]
        );

        // Insert new OTP with 10-minute expiry
        await db.query(
            `INSERT INTO otp_verifications (phone, otp, expires_at, verified)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0)`,
            [phone, otp]
        );

        // In production, send SMS here. For now, log and return OTP for testing.
        console.log(`OTP for ${phone} : ${otp}`);

        res.json({ success: true, message: 'OTP sent', otp });
    } catch (error) {
        console.error('OTP send error:', error);
        res.status(500).json({ error: 'Database error sending OTP.' });
    }
});

// ─── POST /api/otp/verify ─────────────────────────────────────────────────────
// Verifies an OTP for a given phone number.
// Body: { phone, otp }
router.post('/verify', async (req, res) => {
    const db = req.app.get('db');
    const { phone, otp } = req.body;

    if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone and OTP are required.' });
    }

    try {
        // Find a valid, unexpired, unverified OTP
        const [rows] = await db.query(
            `SELECT id FROM otp_verifications
             WHERE phone = ? AND otp = ? AND verified = 0 AND expires_at > NOW()
             ORDER BY created_at DESC
             LIMIT 1`,
            [phone, otp]
        );

        if (rows.length === 0) {
            return res.status(400).json({ verified: false, error: 'Invalid or expired OTP.' });
        }

        // Mark OTP as verified
        await db.query(
            'UPDATE otp_verifications SET verified = 1 WHERE id = ?',
            [rows[0].id]
        );

        res.json({ verified: true });
    } catch (error) {
        console.error('OTP verify error:', error);
        res.status(500).json({ error: 'Database error verifying OTP.' });
    }
});

module.exports = router;
