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
  password: '1234',
  port: 5432,
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Create table if not exists
const createTableQuery = `
CREATE TABLE IF NOT EXISTS owners (
  id SERIAL PRIMARY KEY,
  business_name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255) NOT NULL,
  applicant_type VARCHAR(255) NOT NULL,
  application_date DATE NOT NULL,
  remarks VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL
);
`;

pool.query(createTableQuery)
  .then(() => console.log('Table "owners" is ready'))
  .catch(err => console.error('Error creating table', err));

// API to get all owners
app.get('/api/owners', async (req, res) => {
  try {
    const result = await pool.query('SELECT business_name, owner_name, applicant_type, application_date, remarks, status FROM owners ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching owners', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API to add new owner
app.post('/api/owners', async (req, res) => {
  const { businessName, ownerName, applicantType, applicationDate, remarks, status } = req.body;
  if (!businessName || !ownerName || !applicantType || !applicationDate || !remarks || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const insertQuery = `
      INSERT INTO owners (business_name, owner_name, applicant_type, application_date, remarks, status)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;
    const values = [businessName, ownerName, applicantType, applicationDate, remarks, status];
    const result = await pool.query(insertQuery, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting owner', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});