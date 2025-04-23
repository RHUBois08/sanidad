-- Create database
CREATE DATABASE sanitary_permits_db;

-- Connect to the database
\c sanitary_permits_db;

-- Create owners table
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
    sanitary_permit_number VARCHAR(255)
);

-- Create classifications table
CREATE TABLE IF NOT EXISTS classifications (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(255),
    owner_name VARCHAR(255),
    permit_number VARCHAR(255),
    classification VARCHAR(255),
    categories TEXT[]
);

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    health_cert_no VARCHAR(255),
    remarks TEXT
);
