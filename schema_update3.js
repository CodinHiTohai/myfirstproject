// Schema update: Add ride_history table for Ride History & Ratings feature
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'govind',
        database: process.env.DB_NAME || 'eyein',
        port: process.env.DB_PORT || 3306,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const conn = await pool.getConnection();

        // Create ride_history table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS ride_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                route_id INT NOT NULL,
                driver_id INT NOT NULL,
                passenger_name VARCHAR(100) NOT NULL,
                passenger_phone VARCHAR(15) NOT NULL,
                passengers INT DEFAULT 1,
                seats_booked INT DEFAULT 1,
                start_location VARCHAR(200) NOT NULL,
                end_location VARCHAR(200) NOT NULL,
                fare DECIMAL(10,2) NOT NULL,
                vehicle_number VARCHAR(20),
                vehicle_type VARCHAR(20),
                driver_name VARCHAR(100),
                status ENUM('accepted', 'completed', 'cancelled') DEFAULT 'accepted',
                rating INT DEFAULT NULL,
                rating_comment VARCHAR(500) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL DEFAULT NULL
            )
        `);
        console.log('✅ ride_history table created');

        // Add avg_rating column to drivers table
        try {
            await conn.query('ALTER TABLE drivers ADD COLUMN avg_rating DECIMAL(2,1) DEFAULT 0');
            console.log('✅ avg_rating column added to drivers');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ avg_rating column already exists');
            } else {
                throw err;
            }
        }

        // Add total_ratings column to drivers table
        try {
            await conn.query('ALTER TABLE drivers ADD COLUMN total_ratings INT DEFAULT 0');
            console.log('✅ total_ratings column added to drivers');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ total_ratings column already exists');
            } else {
                throw err;
            }
        }

        conn.release();
        console.log('\n✅ Migration complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
