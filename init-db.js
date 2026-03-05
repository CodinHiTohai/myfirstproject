const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

async function setupCloudDatabase() {
    console.log("Connecting to Database at", process.env.DB_HOST, "...");
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            multipleStatements: true,
            ssl: {
                rejectUnauthorized: false // Cloud DBs often require SSL
            }
        });

        console.log("✅ Custom Connection Successful!");

        const sql = fs.readFileSync('init.sql', 'utf8');
        console.log("Running init.sql queries...");

        await conn.query(sql);
        console.log("🎉 Success! All tables (drivers, routes, admins) created in the Cloud Database.");

        process.exit(0);
    } catch (e) {
        console.error("❌ Error setting up database:");
        console.error(e.message);
        process.exit(1);
    }
}

setupCloudDatabase();
