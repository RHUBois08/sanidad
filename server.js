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
        classification VARCHAR(255) NOT NULL,
        applicant_type VARCHAR(255),
        application_date DATE,
        remarks VARCHAR(255),
        status VARCHAR(50),
        address VARCHAR(255) NOT NULL,
        sanitary_permit_number VARCHAR(255) NOT NULL
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

    try {
        await pool.query(createOwnersTableQuery);
        console.log('Table "owners" is ready');
        await pool.query(createClassificationsTableQuery);
        console.log('Table "classifications" is ready');
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
                    `SELECT id, business_name, owner_name, classification, applicant_type, application_date, remarks, status, address, sanitary_permit_number
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
            const { businessName, ownerName, classification, applicantType, applicationDate, remarks, status, address, sanitaryPermitNumber } = req.body;
            if (!businessName || !ownerName || !address) {
                return res.status(400).json({ error: 'Missing required fields: businessName, ownerName, or address' });
            }
            try {
                const insertQuery = `
                    INSERT INTO owners (business_name, owner_name, classification, applicant_type, application_date, remarks, status, address, sanitary_permit_number)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *;
                `;
                const values = [businessName, ownerName, classification, applicantType, applicationDate, remarks, status, address, sanitaryPermitNumber];
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

        app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error('Failed to initialize server', err);
        process.exit(1);
    }
}

init();
