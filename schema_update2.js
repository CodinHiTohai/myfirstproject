require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        ssl: { rejectUnauthorized: false }
    });
    try {
        console.log('connected');
        await pool.query('ALTER TABLE routes ADD COLUMN stops VARCHAR(500) DEFAULT NULL');
        console.log('Column added');
    } catch (e) { console.log('Error:', e.message) }
    await pool.end();
    process.exit();
})();
