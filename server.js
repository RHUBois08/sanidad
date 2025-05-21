// server.js

const express = require('express');
const bodyParser = require('body-parser');
const { Pool, Client } = require('pg');
const cors = require('cors');
const fs = require('fs');
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const path = require('path');

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
            date_of_xray DATE,
            application_date DATE
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
        await pool.query(createEmployeesTableQuery);
        console.log('Table "employees" is ready');
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
                const result = await pool.query(`
                    SELECT id, business_name, owner_name, applicant_type, 
                           application_date, EXTRACT(YEAR FROM application_date) as application_year, remarks, status, address
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
                // Check if classification data already exists
                const checkQuery = `
                    SELECT * FROM classifications 
                    WHERE business_name = $1 AND owner_name = $2
                `;
                const existingClassification = await pool.query(checkQuery, [businessName, ownerName]);

                if (existingClassification.rows.length > 0) {
                    // Update existing record
                    const updateQuery = `
                        UPDATE classifications 
                        SET permit_number = $3, classification = $4, categories = $5
                        WHERE business_name = $1 AND owner_name = $2
                    `;
                    await pool.query(updateQuery, [businessName, ownerName, permitNumber, classification, linkable_texts]);
                    res.json({ message: 'Classification updated successfully' });
                } else {
                    // Insert new record
                    const insertQuery = `
                        INSERT INTO classifications (business_name, owner_name, permit_number, classification, categories)
                        VALUES ($1, $2, $3, $4, $5)
                    `;
                    await pool.query(insertQuery, [businessName, ownerName, permitNumber, classification, linkable_texts]);
                    res.json({ message: 'Classification saved successfully' });
                }
            } catch (err) {
                console.error('Error saving classification', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to save employees data with upsert (insert or update)
        app.post('/api/employees/full', async (req, res) => {
            const { businessName, ownerName, categories, employees } = req.body;
            if (!businessName || !ownerName || !employees) {
                return res.status(400).json({ error: 'Missing required fields: businessName, ownerName, or employees' });
            }
            try {
                const upsertQuery = `
                    INSERT INTO employees (id, business_name, owner_name, no, employee_name, address, health_cert_no, remarks, date_of_xray, application_date)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (id) DO UPDATE SET
                        business_name = EXCLUDED.business_name,
                        owner_name = EXCLUDED.owner_name,
                        no = EXCLUDED.no,
                        employee_name = EXCLUDED.employee_name,
                        address = EXCLUDED.address,
                        health_cert_no = EXCLUDED.health_cert_no,
                        remarks = EXCLUDED.remarks,
                        date_of_xray = EXCLUDED.date_of_xray,
                        application_date = EXCLUDED.application_date
                `;

                const insertQuery = `
                    INSERT INTO employees (business_name, owner_name, no, employee_name, address, health_cert_no, remarks, date_of_xray, application_date)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `;

                for (const emp of employees) {
                    if (emp.id) {
                        // Update existing employee
                        await pool.query(upsertQuery, [
                            emp.id,
                            businessName,
                            ownerName,
                            emp.no,
                            emp.name,
                            emp.address,
                            emp.cert,
                            emp.remarks,
                            emp.date_of_xray || null,
                            emp.application_date || null // application_date can be null
                        ]);
                    } else {
                        // Insert new employee without id
                        await pool.query(insertQuery, [
                            businessName,
                            ownerName,
                            emp.no,
                            emp.name,
                            emp.address,
                            emp.cert,
                            emp.remarks,
                            emp.date_of_xray || null,
                            emp.application_date || null
                        ]);
                    }
                }
                res.json({ message: 'Employees saved successfully' });
            } catch (err) {
                console.error('Error saving employees:', err);
                res.status(500).json({ error: 'Internal server error', details: err });
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

            console.log('business_name:', business_name);
            console.log('owner_name:', owner_name);
            console.log('year:', year);

            if (!business_name || !owner_name) {
                return res.status(400).json({ error: 'Missing required query parameters: business_name or owner_name' });
            }
            try {
                const query = `
                    SELECT id, no, employee_name, address, health_cert_no, remarks, date_of_xray
                    FROM employees
                    WHERE business_name = $1 AND owner_name = $2
                    ${year ? 'AND EXTRACT(YEAR FROM application_date) = $3' : ''}
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

        // API to delete an employee by id
        app.delete('/api/employees/:id', async (req, res) => {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({ error: 'Missing employee id' });
            }
            try {
                const deleteQuery = 'DELETE FROM employees WHERE id = $1';
                const result = await pool.query(deleteQuery, [id]);
                if (result.rowCount === 0) {
                    return res.status(404).json({ error: 'Employee not found' });
                }
                res.json({ message: 'Employee deleted successfully' });
            } catch (err) {
                console.error('Error deleting employee:', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        app.get('/api/generateCertificate', async (req, res) => {
            const { businessName, ownerName, year } = req.query;
        
            if (!businessName || !ownerName) {
                return res.status(400).json({ error: 'Missing required query parameters: businessName or ownerName' });
            }
        
            try {
                // Load the Word template as binary
                const templatePath = path.join(__dirname, 'assets', 'sanitary_certificate_format.docx');
                let content = fs.readFileSync(templatePath, "binary");
        
                // Unzip the content
                let zip = new PizZip(content);
        
                // Create the doc from template
                let doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                });

                // Get the current date
                const currentDate = new Date();
                const month = currentDate.toLocaleString('default', { month: 'long' });
                const day = currentDate.getDate();
                const currentYear = currentDate.getFullYear();
                const formattedDate = `${month} ${day}, ${currentYear}`;

                // Fetch employee list
                const { businessName, ownerName, year } = req.query;

                // Fetch owner application date
                const ownerQuery = `
                    SELECT application_date FROM owners
                    WHERE business_name = $1 AND owner_name = $2
                `;
                const ownerParams = [businessName, ownerName];
                const ownerResult = await pool.query(ownerQuery, ownerParams);

                let applicationYear = null;
                if (ownerResult.rows.length > 0 && ownerResult.rows[0].application_date) {
                    const appDate = new Date(ownerResult.rows[0].application_date);
                    applicationYear = appDate.getUTCFullYear();
                }

                // Fetch employee list based on business name, owner name, and application year
                let employeeQuery = `
                    SELECT employee_name, application_date FROM employees
                    WHERE business_name = $1 AND owner_name = $2
                `;
                let employeeParams = [businessName, ownerName];

                if (year) {
                    employeeQuery += ` AND EXTRACT(YEAR FROM application_date) = $3`;
                    employeeParams.push(year);
                }

                employeeQuery += ` ORDER BY no`;

                const employeeResult = await pool.query(employeeQuery, employeeParams);

                const employees = employeeResult.rows.map((emp, index) => `${index + 1}. ${emp.employee_name}`).join('\n');
        
                // Replace placeholders with actual data
                doc.render({
                    BUSINESS_NAME: businessName.toUpperCase(),
                    BUSINESS_OWNER: ownerName.toUpperCase(),
                    Date: formattedDate,
                    Employees: employees
                });
        
                // Generate the new document
                const buf = doc.getZip().generate({
                    type: "nodebuffer",
                    compression: "DEFLATE",
                });
        
                // Set the content type
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename="${businessName} Certificate.docx"`);
        
                // Send the buffer to the client
                res.send(buf);
        
            } catch (error) {
                console.error('Error generating certificate:', error);
                res.status(500).json({ error: 'Failed to generate certificate', details: error.message });
            }
        });

        app.get('/api/generatePermit', async (req, res) => {
            const { businessName, ownerName, classification, address, permitNumber, applicationDate, employeeCount, expirationDate } = req.query;

            if (!businessName || !ownerName || !classification || !address || !permitNumber || !applicationDate || !employeeCount || !expirationDate) {
                return res.status(400).json({ error: 'Missing required query parameters' });
            }

            try {
                // Load the Word template as binary
                const templatePath = path.join(__dirname, 'assets', 'sanitary_permit_format.docx');
                let content = fs.readFileSync(templatePath, "binary");

                // Unzip the content
                let zip = new PizZip(content);

                // Create the doc from template
                let doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                });

                // Replace placeholders with actual data
                doc.render({
                    BUSINESS_NAME: businessName.toUpperCase(),
                    BUSINESS_OWNER: ownerName.toUpperCase(),
                    Type: classification,
                    Address: address,
                    Permit_No: permitNumber,
                    Date_Issued: applicationDate,
                    No_of_Employees: employeeCount,
                    Exp_Date: expirationDate
                });

                // Generate the new document
                const buf = doc.getZip().generate({
                    type: "nodebuffer",
                    compression: "DEFLATE",
                });

                // Set the content type
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename="${businessName} Permit.docx"`);

                // Send the buffer to the client
                res.send(buf);

            } catch (error) {
                console.error('Error generating permit:', error);
                res.status(500).json({ error: 'Failed to generate permit', details: error.message });
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
