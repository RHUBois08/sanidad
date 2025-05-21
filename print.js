const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const sanitaryDbConfig = require('./server');

const client = new Client(sanitaryDbConfig);

let connectionReadyCallbacks = [];
let isClientConnected = false;

client.connect()
    .then(() => {
        console.log('Connected to the database');
        isClientConnected = true;
        connectionReadyCallbacks.forEach(callback => callback());
        connectionReadyCallbacks = [];
    })
    .catch((err) => {
        console.error('Error connecting to the database', err.stack);
    });

function permit() {
    if (!isClientConnected) {
        console.warn('Database client is not connected yet. Queuing the request.');
        connectionReadyCallbacks.push(generate_permit);
        return;
    }
    generate_permit();
}

function generate_permit() {
    const business = "Papa P Massage Parlor"; // This can be dynamic if needed

    client.query('SELECT business_name FROM owners WHERE business_name = $1', [business])
        .then((res) => {
            if (res.rows.length > 0) {
                const businessName = res.rows[0].business_name;
                console.log('Data Fetched: ', businessName);

                // Load the Word template
                const content = fs.readFileSync(path.resolve(__dirname, 'assets', 'sanitary_permit_format.docx'), 'binary');
                const zip = new PizZip(content);
                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                });

                // Set the template variables
                doc.render({
                    BUSINESS_NAME: businessName,
                });

                const buf = doc.getZip().generate({ type: 'nodebuffer' });

                // Save the generated document
                const outputPath = path.resolve(__dirname, 'assets', 'sanitary_permit_generated.docx');
                fs.writeFileSync(outputPath, buf);

                console.log('Sanitary permit generated at:', outputPath);
            } else {
                console.log('No business found with that name.');
            }
        })
        .catch((err) => {
            console.error('Error executing query', err.stack);
        });
}

module.exports = { permit };
