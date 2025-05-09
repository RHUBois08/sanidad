const express = require('express');
const bodyParser = require('body-parser');
const { Pool, Client } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

// PostgreSQL connection pool setup
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'sanitary_permits_db',
  password: '1234',
  port: 5432,
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connection config for default 'postgres' database to check/create sanitary_permits_db
const defaultDbConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'sanitary_permits_db',
    password: 'password',
    port: 5432,
};

// Connection config for sanitary_permits_db
const sanitaryDbConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'sanitary_permits_db',
    password: 'password',
    port: 5432,
};

const dbConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'sanitary_permits_db',
    password: 'passsword',
    port: 5432,
};

module.exports = dbConfig;

async function createDatabaseIfNotExists() {
    const client = new Client(defaultDbConfig);
    try {
        await client.connect();
        const res = await client.query("SELECT 1 FROM pg_database WHERE datname='sanitary_permits_db'");
        if (res.rowCount === 0) {
            await client.query('CREATE DATABASE sanitary_permits_db');
            console.log('Database "sanitary_permits_db" created');
        } else {
            console.log('Database "sanitary_permits_db" already exists');
        }
    } catch (err) {
        console.error('Error checking/creating database', err);
        throw err;
    } finally {
        await client.end();
    }
}

async function createTables(pool) {
    const createOwnersTableQuery = `
    CREATE TABLE IF NOT EXISTS owners (
        id SERIAL PRIMARY KEY,
        business_name VARCHAR(255) NOT NULL,
        owner_name VARCHAR(255) NOT NULL,
        applicant_type VARCHAR(255),
        application_date DATE,
        remarks VARCHAR(255),
        status VARCHAR(50),
        address VARCHAR(255) NOT NULL
    );
    `;

    const createClassificationsTableQuery = `
    CREATE TABLE IF NOT EXISTS classifications (
        id SERIAL PRIMARY KEY,
        business_name VARCHAR(255),
        owner_name VARCHAR(255),
        permit_number VARCHAR(255),
        classification VARCHAR(255),
        categories TEXT[]
    );
    `;

    const createEmployeesTableQuery = `
    CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        business_name VARCHAR(255),
        owner_name VARCHAR(255),
        no INTEGER,
        employee_name VARCHAR(255),
        address VARCHAR(255),
        health_cert_no VARCHAR(255),
        remarks VARCHAR(255),
        date_of_xray DATE
    );
    `;

    try {
        await pool.query(createOwnersTableQuery);
        console.log('Table "owners" is ready');
        await pool.query(createClassificationsTableQuery);
        console.log('Table "classifications" is ready');
        await pool.query(createEmployeesTableQuery);
        console.log('Table "employees" is ready');
    } catch (err) {
        console.error('Error creating tables', err);
        throw err;
    }
}

async function init() {
    try {
        await createDatabaseIfNotExists();
        // Connect to sanitary_permits_db after ensuring it exists
        const pool = new Pool(sanitaryDbConfig);
        await createTables(pool);

        // API to get all owners (include all relevant columns)
        app.get('/api/owners', async (req, res) => {
            try {
                const result = await pool.query(
                    `SELECT id, business_name, owner_name, applicant_type, application_date, remarks, status, address
                     FROM owners
                     ORDER BY id DESC`
                );
                res.json(result.rows);
            } catch (err) {
                console.error('Error fetching owners', err);
                res.status(500).json({ error: err.message || 'Internal server error' });
            }
        });

        // API to add a new owner
        app.post('/api/owners', async (req, res) => {
            const { businessName, ownerName, applicantType, applicationDate, remarks, status, address } = req.body;
            if (!businessName || !ownerName || !address) {
                return res.status(400).json({ error: 'Missing required fields: businessName, ownerName, or address' });
            }
            try {
                const insertQuery = `
                    INSERT INTO owners (business_name, owner_name, applicant_type, application_date, remarks, status, address)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *;
                `;
                const values = [businessName, ownerName, applicantType, applicationDate, remarks, status, address];
                const result = await pool.query(insertQuery, values);
                res.status(201).json(result.rows[0]);
            } catch (err) {
                console.error('Error inserting owner', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to delete an owner by businessName and ownerName
        app.post('/api/owners/delete', async (req, res) => {
            const { businessName, ownerName } = req.body;
            if (!businessName || !ownerName) {
                return res.status(400).json({ error: 'Missing required fields: businessName or ownerName' });
            }
            try {
                const deleteQuery = `
                    DELETE FROM owners
                    WHERE business_name = $1 AND owner_name = $2;
                `;
                await pool.query(deleteQuery, [businessName, ownerName]);
                res.json({ message: 'Owner deleted successfully' });
            } catch (err) {
                console.error('Error deleting owner', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to save or update classification data
        app.post('/api/classifications/save', async (req, res) => {
            const { businessName, ownerName, permitNumber, classification, linkable_texts } = req.body;
            if (!businessName || !ownerName || !permitNumber || !classification) {
                return res.status(400).json({ error: 'Missing required fields: businessName, ownerName, permitNumber, or classification' });
            }
            try {
                // Check if record exists
                const existingQuery = `
                    SELECT id FROM classifications
                    WHERE business_name = $1 AND owner_name = $2
                `;
                const existingResult = await pool.query(existingQuery, [businessName, ownerName]);
                if (existingResult.rowCount > 0) {
                    // Update existing record
                    const updateQuery = `
                        UPDATE classifications
                        SET permit_number = $1, classification = $2, categories = $3
                        WHERE business_name = $4 AND owner_name = $5
                    `;
                    await pool.query(updateQuery, [permitNumber, classification, linkable_texts, businessName, ownerName]);
                } else {
                    // Insert new record
                    const insertQuery = `
                        INSERT INTO classifications (business_name, owner_name, permit_number, classification, categories)
                        VALUES ($1, $2, $3, $4, $5)
                    `;
                    await pool.query(insertQuery, [businessName, ownerName, permitNumber, classification, linkable_texts]);
                }
                res.json({ message: 'Classification saved successfully' });
            } catch (err) {
                console.error('Error saving classification', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to save employees data
        app.post('/api/employees/full', async (req, res) => {
            const { businessName, ownerName, categories, employees } = req.body;
            if (!businessName || !ownerName || !employees) {
                return res.status(400).json({ error: 'Missing required fields: businessName, ownerName, or employees' });
            }
            try {
                // Delete existing employees for this business and owner
                await pool.query('DELETE FROM employees WHERE business_name = $1 AND owner_name = $2', [businessName, ownerName]);
                // Insert new employees
                const insertQuery = `
                    INSERT INTO employees (business_name, owner_name, no, employee_name, address, health_cert_no, remarks, date_of_xray)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `;
                for (const emp of employees) {
                    await pool.query(insertQuery, [
                        businessName,
                        ownerName,
                        emp.no,
                        emp.name,
                        emp.address,
                        emp.cert,
                        emp.remarks,
                        emp.date_of_xray || null
                    ]);
                }
                res.json({ message: 'Employees saved successfully' });
            } catch (err) {
                console.error('Error saving employees', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to get classification data by businessName and ownerName
        app.get('/api/classifications', async (req, res) => {
            const { business_name, owner_name } = req.query;
            if (!business_name || !owner_name) {
                return res.status(400).json({ error: 'Missing required query parameters: business_name or owner_name' });
            }
            try {
                const query = `
                    SELECT permit_number, classification, categories
                    FROM classifications
                    WHERE business_name = $1 AND owner_name = $2
                    LIMIT 1
                `;
                const result = await pool.query(query, [business_name, owner_name]);
                if (result.rowCount === 0) {
                    return res.json(null);
                }
                res.json(result.rows[0]);
            } catch (err) {
                console.error('Error fetching classification', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to get employees data by businessName and ownerName
        app.get('/api/employees', async (req, res) => {
            const { business_name, owner_name } = req.query;
            if (!business_name || !owner_name) {
                return res.status(400).json({ error: 'Missing required query parameters: business_name or owner_name' });
            }
            try {
                const query = `
                    SELECT no, employee_name, address, health_cert_no, remarks, date_of_xray
                    FROM employees
                    WHERE business_name = $1 AND owner_name = $2
                    ORDER BY no
                `;
                const result = await pool.query(query, [business_name, owner_name]);
                res.json(result.rows);
            } catch (err) {
                console.error('Error fetching employees', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        app.listen(port, () => {
            console.log('Server running on http://localhost:${port}');
        });
    } catch (err) {
        console.error('Failed to initialize server', err);
        process.exit(1);
    }
}
init();