-- Eye In Database Schema

-- Drivers Table
CREATE TABLE IF NOT EXISTS drivers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  vehicle_number VARCHAR(20) NOT NULL,
  vehicle_type ENUM('auto', 'bus', 'car') NOT NULL DEFAULT 'auto',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Routes Table
CREATE TABLE IF NOT EXISTS routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  driver_id INT NOT NULL,
  start_location VARCHAR(200) NOT NULL,
  end_location VARCHAR(200) NOT NULL,
  fare DECIMAL(10,2) NOT NULL,
  total_seats INT NOT NULL,
  filled_seats INT NOT NULL DEFAULT 0,
  current_lat DECIMAL(10,7) DEFAULT 26.8500,
  current_lng DECIMAL(10,7) DEFAULT 75.7600,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- Admins Table
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

-- Seed Data: Admin (password: admin123)
INSERT IGNORE INTO admins (username, password) VALUES
('admin', '$2a$10$xPBm5JBqPJYfVfVlWQ7QXOzKz0Hk5VxGqKgE8mJOyRcNqW1TJgXbG');

-- Seed Data: Drivers (password: driver123)
INSERT IGNORE INTO drivers (name, phone, password, vehicle_number, vehicle_type) VALUES
('Ramesh Kumar', '9876543210', '$2a$10$xPBm5JBqPJYfVfVlWQ7QXOzKz0Hk5VxGqKgE8mJOyRcNqW1TJgXbG', 'RJ14 AB1234', 'auto'),
('Suresh Sharma', '9876543211', '$2a$10$xPBm5JBqPJYfVfVlWQ7QXOzKz0Hk5VxGqKgE8mJOyRcNqW1TJgXbG', 'RJ20 CD4567', 'bus'),
('Vikram Singh', '9876543212', '$2a$10$xPBm5JBqPJYfVfVlWQ7QXOzKz0Hk5VxGqKgE8mJOyRcNqW1TJgXbG', 'RJ14 EF8901', 'car');

-- Seed Data: Active Routes
INSERT IGNORE INTO routes (driver_id, start_location, end_location, fare, total_seats, filled_seats, current_lat, current_lng, status) VALUES
(1, 'Mithapur', 'Kota Junction', 40, 3, 2, 25.1800, 75.8500, 'active'),
(2, 'Mithapur', 'Dadabari', 25, 40, 12, 25.1750, 75.8450, 'active'),
(3, 'Kota Junction', 'Mithapur', 60, 4, 1, 25.1850, 75.8550, 'active');
