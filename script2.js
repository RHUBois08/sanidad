const scriptURL = "https://script.google.com/macros/s/AKfycbzISIpssusAbW7tmLG94Z8iASXxLdyWHGxz_1_WC3Olukx0B9IG4cE56KgfW_ukUvnC/exe";

const localData = localStorage.getItem('permitData');
console.log('Local data:', localData); // Log local data

const tableBody = document.querySelector("#dataTable tbody");

if (localData) {
    const permits = JSON.parse(localData);
    permits.forEach(permit => {
        const newRow = tableBody.insertRow();
        newRow.insertCell().textContent = permit.businessName;
        newRow.insertCell().textContent = permit.ownerName;
        newRow.insertCell().textContent = permit.applicantType;
        newRow.insertCell().textContent = permit.applicationDate;
        newRow.insertCell().textContent = permit.applicationStatus;
        newRow.insertCell().innerHTML = '<button>Edit</button> <button>Delete</button>'; // Add action buttons
    });
} else {
fetch(scriptURL + "?action=getData") // Add a query parameter
    .then(response => {
        console.log('Fetch response:', response); // Log fetch response
        return response.json();
    })
    .then(data => {
        data.forEach(row => {
            const newRow = tableBody.insertRow();
            newRow.insertCell().textContent = row['Business Name'];
            newRow.insertCell().textContent = row['Name of Owner/Applicant'];
            newRow.insertCell().textContent = row['Type of Applicant'];
            newRow.insertCell().textContent = row['Application Date'];
            newRow.insertCell().textContent = row['Status of Application'];
            newRow.insertCell().innerHTML = '<button>Edit</button> <button>Delete</button>'; // Add action buttons
        });
    })
    .catch(error => {
        console.error('Error fetching data:', error); // Improved error handling
        alert('Failed to fetch data. Please try again later.'); // User feedback
    });
}

function getData() {
    var ss = SpreadsheetApp.openById(scriptProp.getProperty('key')); // Assuming you're using scriptProp
    var sheet = ss.getSheetByName(sheetName);
    var data = sheet.getDataRange().getValues();
  
    // Remove the header row
    data.shift();
  
    // Convert to JSON
    var jsonData = data.map(function(row) {
        return {
            'Business Name': row[1], 
            'Name of Owner/Applicant': row[2],
            'Type of Applicant': row[3], 
            'Application Date': row[4], 
            'Status of Application': row[5]
        };
    });
  
    return ContentService.createTextOutput(JSON.stringify(jsonData))
        .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
    if (e.parameter.action === 'getData') {
        return getData();
    } else {
        return ContentService.createTextOutput("Invalid action");
    }
}
