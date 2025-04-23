const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

// PostgreSQL connection pool setup
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'sanitary_permits_db',
  password: 'password',
  port: 5432,
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ensure sanitary_permit_number column exists in owners table without constraints
const alterTableQuery = `
ALTER TABLE owners
ADD COLUMN IF NOT EXISTS sanitary_permit_number VARCHAR(255);
`;

// Run ALTER TABLE query before other queries
pool.query(alterTableQuery)
  .then(() => console.log('Ensured sanitary_permit_number column exists in owners table'))
  .catch(err => console.error('Error altering owners table', err));

// Update table creation query to include sanitary_permit_number
const createTableQuery = `
CREATE TABLE IF NOT EXISTS owners (
  id SERIAL PRIMARY KEY,
  business_name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255) NOT NULL,
  applicant_type VARCHAR(255) NOT NULL,
  application_date DATE NOT NULL,
  remarks VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  sanitary_permit_number VARCHAR(255) UNIQUE NOT NULL
);
`;

pool.query(createTableQuery)
  .then(() => console.log('Table "owners" is ready'))
  .catch(err => console.error('Error creating table', err));

// API to get all owners (include sanitary_permit_number in the SELECT query)
app.get('/api/owners', async (req, res) => {
  try {
    const result = await pool.query('SELECT business_name, owner_name, applicant_type, application_date, remarks, status, sanitary_permit_number FROM owners ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching owners', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API to add new owner (include sanitaryPermitNumber in the request body and insert query)
app.post('/api/owners', async (req, res) => {
  const { businessName, ownerName, applicantType, applicationDate, remarks, status, sanitaryPermitNumber } = req.body;
  if (!businessName || !ownerName || !applicantType || !applicationDate || !remarks || !status || !sanitaryPermitNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const insertQuery = `
      INSERT INTO owners (business_name, owner_name, applicant_type, application_date, remarks, status, sanitary_permit_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;
    `;
    const values = [businessName, ownerName, applicantType, applicationDate, remarks, status, sanitaryPermitNumber];
    const result = await pool.query(insertQuery, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique violation error code
      res.status(400).json({ error: 'Sanitary Permit Number must be unique' });
    } else {
      console.error('Error inserting owner', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// New table for employees
const createEmployeesTableQuery = `
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  employee_name VARCHAR(255) NOT NULL,
  address VARCHAR(255),
  health_cert_no VARCHAR(255),
  remarks TEXT
);
`;

pool.query(createEmployeesTableQuery)
  .then(() => console.log('Table "employees" is ready'))
  .catch(err => console.error('Error creating employees table', err));

// New API to get all employees
app.get('/api/employees', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employees', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New API to add an employee
app.post('/api/employees', async (req, res) => {
  const { employeeName, address, healthCertNo, remarks } = req.body;
  if (!employeeName) {
    return res.status(400).json({ error: 'Employee name is required' });
  }
  try {
    const insertQuery = `
      INSERT INTO employees (employee_name, address, health_cert_no, remarks)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const values = [employeeName, address, healthCertNo, remarks];
    const result = await pool.query(insertQuery, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting employee', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});