const { Client } = require('pg');
const dbConfig = require('./server');

const client = new Client(dbConfig);

let isClientConnected = false; // Track connection status
let connectionReadyCallbacks = []; // Queue for functions waiting for connection

client.connect()
    .then(() => {
        console.log('Connected to the database');
        isClientConnected = true; // Mark client as connected
        connectionReadyCallbacks.forEach(callback => callback()); // Execute queued callbacks
        connectionReadyCallbacks = []; // Clear the queue
    })
    .catch((err) => {
        console.error('Error connecting to the database', err.stack);
    });

function safeGenerateSanitaryPermit() {
    if (!isClientConnected) {
        console.warn('Database client is not connected yet. Queuing the request.');
        connectionReadyCallbacks.push(generate_sanitary_permit); // Queue the function
        return;
    }
    generate_sanitary_permit();
}

function generate_sanitary_permit() {
    function fetch_owners() {
        const business = "Papa P Massage Parlor";

        client.query('SELECT owner_name FROM owners WHERE business_name = $1', [business])
            .then((res) => {
                if (res.rows.length > 0) {
                    console.log('Data Fetched: ', res.rows[0].owner_name);
                } else {
                    console.log('No user found with that name.');
                }
                
            })
            .catch((err) => {
                console.error('Error executing query', err.stack);
            });
    }

    fetch_owners();
}

module.exports = { safeGenerateSanitaryPermit }; 