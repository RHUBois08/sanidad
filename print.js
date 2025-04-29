const { Client} = require('pg')

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'sanitary_permits_db',
    password: 'passsword',
    port: 5432,
});

async function generate_sanitary_permit() {

    fetch_owners();

    async function fetch_owners() {

        client.connect()
            .then(() => {
                console.log('Connected to the database');

                const business = "Adrian's Samgyupsalamat" 

                return client.query('SELECT owner_name FROM owners WHERE business_name = $1', [business]);
            })
            .then((res) => {
                if(res.rows.lenth > 0){
                    console.log('Data Fetched: ', res.rows[0].owner_name);
                }
                else {
                    console.log('No user found with that name.');
                }

            })
            .catch((err) => {
                console.error('Error executing query', err.stack);
            });
    }

    // async function fetch_classifications() {

    // }

    // async function fetch_employees() {

    // }

    // function permit_format() {

    // }
}