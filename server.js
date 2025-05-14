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
        business_name VARCHAR(255),
        owner_name VARCHAR(255),
        applicant_type VARCHAR(255),
        application_date DATE,
        remarks VARCHAR(255),
        status VARCHAR(50),
        address VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `;

    try {
        await pool.query(createOwnersTableQuery);
        console.log('Table "owners" is ready');
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
                const result = await pool.query(`
                    SELECT id, business_name, owner_name, applicant_type, 
                           application_date, remarks, status, address
                    FROM owners
                    ORDER BY application_date DESC, id DESC
                `);
                res.json(result.rows);
            } catch (err) {
                console.error('Error fetching owners', err);
                res.status(500).json({ error: err.message || 'Internal server error' });
            }
        });

        // Modify the add owner API endpoint
        app.post('/api/owners', async (req, res) => {
            const { businessName, ownerName, applicantType, applicationDate, remarks, status, address } = req.body;
            if (!businessName || !ownerName || !address || !applicationDate) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
            
            try {
                // Check if owner already exists
                const checkQuery = `
                    SELECT * FROM owners 
                    WHERE LOWER(business_name) = LOWER($1) 
                    AND LOWER(owner_name) = LOWER($2)
                    AND LOWER(applicant_type) = LOWER($3)
                    AND application_date = $4
                    AND LOWER(address) = LOWER($5)
                    AND LOWER(remarks) = LOWER($6)
                    AND LOWER(status) = LOWER($7)
                `;
                const existingOwner = await pool.query(checkQuery, [businessName, ownerName, applicantType, applicationDate, address, remarks, status]);

                if (existingOwner.rows.length > 0) {
                    return res.status(400).json({ 
                        error: 'A business owner with this information already exists',
                        existingData: existingOwner.rows[0]
                    });
                } else {
                    // If no duplicate found, insert the new owner
                    const insertQuery = `
                        INSERT INTO owners 
                        (business_name, owner_name, applicant_type, application_date, remarks, status, address)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        RETURNING *;
                    `;
                    const values = [businessName, ownerName, applicantType, applicationDate, remarks, status, address];
                    const result = await pool.query(insertQuery, values);
                    res.status(201).json(result.rows[0]);
                }
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
                // Insert new record without checking for duplicates
                const insertQuery = `
                    INSERT INTO classifications (business_name, owner_name, permit_number, classification, categories)
                    VALUES ($1, $2, $3, $4, $5)
                `;
                await pool.query(insertQuery, [businessName, ownerName, permitNumber, classification, linkable_texts]);
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

        // API to get employees data by businessName, ownerName and year
        app.get('/api/employees', async (req, res) => {
            const { business_name, owner_name, year } = req.query;
            if (!business_name || !owner_name) {
                return res.status(400).json({ error: 'Missing required query parameters: business_name or owner_name' });
            }
            try {
                const query = `
                    SELECT no, employee_name, address, health_cert_no, remarks, date_of_xray
                    FROM employees
                    WHERE business_name = $1 AND owner_name = $2
                    ${year ? 'AND year = $3' : ''}
                    ORDER BY no
                `;
                const params = year ? [business_name, owner_name, year] : [business_name, owner_name];
                const result = await pool.query(query, params);
                res.json(result.rows);
            } catch (err) {
                console.error('Error fetching employees:', err);
                res.status(500).json({ error: 'Error fetching employees data', details: err.message });
            }
        });

        // API to get all years
        app.get('/api/years', async (req, res) => {
            try {
                const result = await pool.query('SELECT year FROM years ORDER BY year');
                res.json(result.rows);
            } catch (err) {
                console.error('Error fetching years:', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to add a new year
        app.post('/api/years/add', async (req, res) => {
            const { year } = req.body;
            
            if (!year || isNaN(parseInt(year))) {
                return res.status(400).json({ error: 'Valid year is required' });
            }

            try {
                const result = await pool.query(
                    'INSERT INTO years (year) VALUES ($1) ON CONFLICT (year) DO NOTHING RETURNING year',
                    [parseInt(year)]
                );
                res.status(201).json({ 
                    year: parseInt(year), 
                    added: result.rowCount > 0,
                    message: result.rowCount > 0 ? 'Year added successfully' : 'Year already exists'
                });
            } catch (err) {
                console.error('Error adding year:', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to delete a year
        app.delete('/api/years/:year', async (req, res) => {
            const { year } = req.params;
            
            try {
                await pool.query('BEGIN');
                // Due to CASCADE, this will automatically delete related employee records
                await pool.query('DELETE FROM years WHERE year = $1', [year]);
                await pool.query('COMMIT');
                res.json({ message: 'Year and associated data deleted successfully' });
            } catch (err) {
                await pool.query('ROLLBACK');
                console.error('Error deleting year:', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to get all owners including duplicates
        app.get('/api/owners/all', async (req, res) => {
            try {
                const result = await pool.query(`
                    SELECT 
                        id,
                        business_name,
                        owner_name,
                        applicant_type,
                        application_date,
                        remarks,
                        status,
                        address,
                        created_at,
                        false as is_duplicate
                    FROM owners
                    UNION ALL
                    SELECT 
                        id,
                        business_name,
                        owner_name,
                        applicant_type,
                        application_date,
                        remarks,
                        status,
                        address,
                        created_at,
                        true as is_duplicate
                    FROM duplicate_owners
                    ORDER BY created_at DESC;
                `);
                res.json(result.rows);
            } catch (err) {
                console.error('Error fetching all owners', err);
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
