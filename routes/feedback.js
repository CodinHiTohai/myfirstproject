const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// ─── POST /api/feedback ───────────────────────────────────────────────────────
// Saves a new feedback entry. Public endpoint (no auth required).
// Body: { name, phone, message, type }
router.post('/', async (req, res) => {
    const db = req.app.get('db');
    const { name, phone, message, type } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    const validTypes = ['bug', 'suggestion', 'complaint', 'praise'];
    const feedbackType = validTypes.includes(type) ? type : 'suggestion';

    try {
        const [result] = await db.query(
            'INSERT INTO feedback (name, phone, message, type) VALUES (?, ?, ?, ?)',
            [name || null, phone || null, message, feedbackType]
        );

        res.status(201).json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Submit feedback error:', error);
        res.status(500).json({ error: 'Database error saving feedback.' });
    }
});

// ─── GET /api/feedback/all ────────────────────────────────────────────────────
// Returns all feedback. Protected (admin token required).
router.get('/all', authenticateToken, async (req, res) => {
    const db = req.app.get('db');

    try {
        const [feedback] = await db.query(
            'SELECT * FROM feedback ORDER BY created_at DESC'
        );

        res.json(feedback);
    } catch (error) {
        console.error('Get all feedback error:', error);
        res.status(500).json({ error: 'Database error retrieving feedback.' });
    }
});

module.exports = router;
