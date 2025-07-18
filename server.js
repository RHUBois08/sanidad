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
        date_issued DATE, -- Added column
        registered_num VARCHAR(255), -- New column
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `;

    // Ensure both date_issued and registered_num exist for existing tables
    const alterOwnersTableQuery = `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='owners' AND column_name='date_issued'
            ) THEN
                ALTER TABLE owners ADD COLUMN date_issued DATE;
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='owners' AND column_name='registered_num'
            ) THEN
                ALTER TABLE owners ADD COLUMN registered_num VARCHAR(255);
            END IF;
        END
        $$;
    `;

    const createEmployeesTableQuery = `
        CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            business_name VARCHAR(255),
            owner_name VARCHAR(255),
            no INTEGER,
            employee_name VARCHAR(255),
            position VARCHAR(255),
            age INTEGER,
            sex VARCHAR(255),
            nationality VARCHAR(255),
            place_of_work VARCHAR(255),
            address VARCHAR(255),
            health_cert_no VARCHAR(255),
            remarks VARCHAR(255),
            date_of_xray DATE,
            application_date DATE
        );
    `;

    try {
        await pool.query(createOwnersTableQuery);
        // Ensure date_issued and registered_num exist for existing tables
        await pool.query(alterOwnersTableQuery);
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
                    AND applicant_type = $3
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
                    // Generate registered_num: "year-00000" where 00000 is the order for this year
                    const year = new Date(applicationDate).getFullYear();
                    // Get the minimum id for this year (to ensure order by creation)
                    const orderQuery = `
                        SELECT id FROM owners
                        WHERE EXTRACT(YEAR FROM application_date) = $1
                        ORDER BY id
                    `;
                    const orderResult = await pool.query(orderQuery, [year]);
                    // The new business will be the next in order
                    const orderNumber = orderResult.rows.length + 1;
                    const registeredNum = `${year}-${orderNumber.toString().padStart(5, '0')}`;

                    // Insert the new owner with registered_num
                    const insertQuery = `
                        INSERT INTO owners 
                        (business_name, owner_name, applicant_type, application_date, remarks, status, address, registered_num)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        RETURNING *;
                    `;
                    const values = [businessName, ownerName, applicantType, applicationDate, remarks, status, address, registeredNum];
                    const result = await pool.query(insertQuery, values);

                    // If applicantType is "Renewal", duplicate employees from the most recent previous application_date
                    if (applicantType && applicantType.toLowerCase() === "renewal") {
                        // Find the most recent previous application_date for this business/owner
                        const prevDateQuery = `
                            SELECT application_date FROM owners
                            WHERE business_name = $1 AND owner_name = $2 AND application_date < $3
                            ORDER BY application_date DESC
                            LIMIT 1
                        `;
                        const prevDateResult = await pool.query(prevDateQuery, [businessName, ownerName, applicationDate]);
                        if (prevDateResult.rows.length > 0) {
                            const prevAppDate = prevDateResult.rows[0].application_date;
                            // Fetch employees from that previous application_date
                            const prevEmployeesQuery = `
                                SELECT no, employee_name, position, age, sex, nationality, place_of_work, address, health_cert_no, remarks, date_of_xray
                                FROM employees
                                WHERE business_name = $1 AND owner_name = $2 AND application_date = $3
                            `;
                            const prevEmployees = await pool.query(prevEmployeesQuery, [businessName, ownerName, prevAppDate]);
                            // Duplicate each employee for the new application_date (set application_date to the new one)
                            for (const emp of prevEmployees.rows) {
                                await pool.query(
                                    `INSERT INTO employees
                                    (business_name, owner_name, no, employee_name, position, age, sex, nationality, place_of_work, address, health_cert_no, remarks, date_of_xray, application_date)
                                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                                    [
                                        businessName,
                                        ownerName,
                                        emp.no,
                                        emp.employee_name,
                                        emp.position,
                                        emp.age,
                                        emp.sex,
                                        emp.nationality,
                                        emp.place_of_work,
                                        emp.address,
                                        emp.health_cert_no,
                                        emp.remarks,
                                        emp.date_of_xray,
                                        applicationDate // <-- always use the new/current applicationDate
                                    ]
                                );
                            }
                        }
                    }

                    res.status(201).json(result.rows[0]);
                }
            } catch (err) {
                console.error('Error inserting owner', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // API to delete an owner by businessName, ownerName, and applicationDate
        app.post('/api/owners/delete', async (req, res) => {
            const { businessName, ownerName, applicationDate } = req.body;
            if (!businessName || !ownerName || !applicationDate) {
                return res.status(400).json({ error: 'Missing required fields: businessName, ownerName, or applicationDate' });
            }
            try {
                const deleteQuery = `
                    DELETE FROM owners
                    WHERE business_name = $1 AND owner_name = $2 AND application_date = $3
                `;
                const result = await pool.query(deleteQuery, [businessName, ownerName, applicationDate]);
                if (result.rowCount === 0) {
                    return res.status(404).json({ error: 'Owner not found' });
                }
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
                // Remove all employees for this business/owner/application_date before inserting new ones
                let applicationDate = null;
                if (employees.length > 0) {
                    applicationDate = employees[0].application_date;
                }
                if (applicationDate) {
                    await pool.query(
                        `DELETE FROM employees WHERE business_name = $1 AND owner_name = $2 AND application_date = $3`,
                        [businessName, ownerName, applicationDate]
                    );
                }
                const upsertQuery = `
                    INSERT INTO employees (id, business_name, owner_name, no, employee_name, position, age, sex, nationality, place_of_work, address, health_cert_no, remarks, date_of_xray, application_date)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    ON CONFLICT (id) DO UPDATE SET
                        business_name = EXCLUDED.business_name,
                        owner_name = EXCLUDED.owner_name,
                        no = EXCLUDED.no,
                        employee_name = EXCLUDED.employee_name,
                        position = EXCLUDED.position,
                        age = EXCLUDED.age,
                        sex = EXCLUDED.sex,
                        nationality = EXCLUDED.nationality,
                        place_of_work = EXCLUDED.place_of_work,
                        address = EXCLUDED.address,
                        health_cert_no = EXCLUDED.health_cert_no,
                        remarks = EXCLUDED.remarks,
                        date_of_xray = EXCLUDED.date_of_xray,
                        application_date = EXCLUDED.application_date
                `;

                const insertQuery = `
                    INSERT INTO employees (business_name, owner_name, no, employee_name, position, age, sex, nationality, place_of_work, address, health_cert_no, remarks, date_of_xray, application_date)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
                            emp.position,
                            emp.age,
                            emp.sex,
                            emp.nationality,
                            emp.place_of_work,
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
                            emp.position,
                            emp.age,
                            emp.sex,
                            emp.nationality,
                            emp.place_of_work,
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
                let query = `
                    SELECT id, no, employee_name, position, age, sex, nationality, place_of_work, address, health_cert_no, remarks, date_of_xray, application_date
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
                    applicationYear = new Date(ownerResult.rows[0].application_date).getFullYear();
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
                // Fetch date_issued and registered_num from owners table using businessName, ownerName, and applicationDate
                const ownerQuery = `
                    SELECT date_issued, registered_num FROM owners
                    WHERE business_name = $1 AND owner_name = $2 AND application_date = $3
                    LIMIT 1
                `;
                const ownerResult = await pool.query(ownerQuery, [businessName, ownerName, applicationDate]);
                let dateIssuedValue = '';
                let registeredNumValue = '';
                if (ownerResult.rows.length > 0) {
                    if (ownerResult.rows[0].date_issued) {
                        const date = new Date(ownerResult.rows[0].date_issued);
                        const month = date.toLocaleString('default', { month: 'long' });
                        const day = date.getDate();
                        const year = date.getFullYear();
                        dateIssuedValue = `${month} ${day}, ${year}`;
                    }
                    registeredNumValue = ownerResult.rows[0].registered_num || '';
                }

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
                    Date_Issued: dateIssuedValue,
                    No_of_Employees: employeeCount,
                    Exp_Date: expirationDate,
                    Reg_No: registeredNumValue // <-- for {Reg_No}
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

        app.get('/api/generateHealthCard', async (req, res) => {
            const { health_cert_no, employee_name, position, age, sex, nationality, business_name } = req.query;
            if (!health_cert_no || !employee_name || !position || !age || !sex || !nationality || !business_name) {
                return res.status(400).json({ error: 'Missing required query parameters' });
            }
            try {
                const templatePath = path.join(__dirname, 'assets', 'sanitary_health_card_format.docx');
                let content = fs.readFileSync(templatePath, "binary");
                let zip = new PizZip(content);
                let doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                });

                // Sex: only first letter, uppercase
                const sexInitial = String(sex).charAt(0).toUpperCase();

                doc.render({
                    Reg_No: String(health_cert_no).toUpperCase(),
                    Name: String(employee_name).toUpperCase(),
                    Occupation: String(position).toUpperCase(),
                    A: String(age).toUpperCase(),
                    S: sexInitial,
                    Nationality: String(nationality).toUpperCase()
                });

                const buf = doc.getZip().generate({
                    type: "nodebuffer",
                    compression: "DEFLATE",
                });

                // Compose filename: business_name "employee_name" [health_cert_no].docx (not all caps)
                const safeBusiness = String(business_name).replace(/[\\/:*?"<>|]/g, '');
                const safeEmployee = String(employee_name).replace(/[\\/:*?"<>|]/g, '');
                const safeCert = String(health_cert_no).replace(/[\\/:*?"<>|]/g, '');
                const filename = `${safeBusiness} "${safeEmployee}" [${safeCert}].docx`;

                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

                res.send(buf);
            } catch (error) {
                console.error('Error generating health card:', error);
                res.status(500).json({ error: 'Failed to generate health card', details: error.message });
            }
        });

        // API to update remarks/status for an owner
        app.post('/api/owners/updateRemarks', async (req, res) => {
            const { business_name, owner_name, remarks } = req.body;
            if (!business_name || !owner_name) {
                return res.status(400).json({ error: 'Missing required fields: business_name or owner_name' });
            }
            try {
                let updateQuery, params;
                if (remarks === "Issued") {
                    updateQuery = `
                        UPDATE owners
                        SET remarks = $3, date_issued = CURRENT_DATE
                        WHERE business_name = $1 AND owner_name = $2
                    `;
                    params = [business_name, owner_name, remarks];
                } else {
                    updateQuery = `
                        UPDATE owners
                        SET remarks = $3, date_issued = NULL
                        WHERE business_name = $1 AND owner_name = $2
                    `;
                    params = [business_name, owner_name, remarks];
                }
                const result = await pool.query(updateQuery, params);
                if (result.rowCount === 0) {
                    return res.status(404).json({ error: 'Owner not found' });
                }
                res.json({ message: 'Remarks/status updated successfully' });
            } catch (err) {
                console.error('Error updating remarks:', err);
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
