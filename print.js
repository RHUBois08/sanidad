new print.js


const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");

// Load the Word template as binary
let content;
try {
    content = fs.readFileSync("C:/Users/DELL/Desktop/sanidad/assests/sanitary_certificate_format.docx", "binary");
} catch (error) {
    console.error("Error reading the template file:", error);
    process.exit(1);
}

// Unzip the content
let zip;
try {
    zip = new PizZip(content);
} catch (error) {
    console.error("Error unzipping the template file:", error);
    process.exit(1);
}

// Create the doc from template
let doc;
try {
    doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });
} catch (error) {
    console.error("Error initializing Docxtemplater:", error);
    process.exit(1);
}

// Replace placeholders with actual data
try {
    doc.render({
        Date: "April 21, 2025",
        BUSINESS_NAME: "Adrian's Samgyupsalamat",
        BUSINESS_OWNER: "Adrian Pogi"
    });
} catch (error) {
    console.error("Error rendering the document:", error);
    process.exit(1);
}

// Generate the new document
let buffer;
try {
    buffer = doc.getZip().generate({
        type: "nodebuffer",
    });
} catch (error) {
    console.error("Error generating the document buffer:", error);
    process.exit(1);
}

// Save it
try {
    fs.writeFileSync("C:/Users/DELL/Desktop/sanidad/sample_outputs/sample_output.docx", buffer);
    console.log("Document generated successfully: sample_output.docx");
} catch (error) {
    console.error("Error saving the document:", error);
    process.exit(1);
}

async function generateSanitaryPermit() {
    // Fetch visible data from the form
    const businessName = document.getElementById("businessName").value.trim();
    const ownerName = document.getElementById("ownerName").value.trim();

    if (!businessName || !ownerName) {
        alert("Please fill in the Business Name and Owner Name fields.");
        return;
    }

    try {
        // Fetch owner details from the server
        const response = await fetch(`http://localhost:3000/api/owners?business_name=${encodeURIComponent(businessName)}&owner_name=${encodeURIComponent(ownerName)}`);
        console.log("API Response Status:", response.status); // Debugging
        if (!response.ok) {
            throw new Error(`Failed to fetch owner details. Status: ${response.status}`);
        }

        const ownerData = await response.json();
        console.log("Owner Data:", ownerData); // Debugging

        // Ensure required fields are present
        if (!ownerData || !ownerData.business_name || !ownerData.owner_name) {
            alert("Owner details not found. Please check the input fields.");
            return;
        }

        // Map required fields from the owners table
        const mappedData = {
            BUSINESS_NAME: ownerData.business_name,
            BUSINESS_OWNER: ownerData.owner_name,
            Address: ownerData.address || "N/A",
            Sanitary_Permit_No: ownerData.sanitary_permit_number || "N/A",
            Date_Issued: ownerData.application_date ? new Date(ownerData.application_date).toLocaleDateString() : "N/A",
        };

        console.log("Mapped Data:", mappedData); // Debugging

        // Load the Word template
        const PizZip = require("pizzip");
        const Docxtemplater = require("docxtemplater");
        const fs = require("fs");

        const templatePath = "C:/Users/DELL/Desktop/sanidad/assests/sanitary_permit_format.docx";
        const outputPath = "C:/Users/DELL/Desktop/sanidad/sample_outputs/permit_output.docx";

        const content = fs.readFileSync(templatePath, "binary");
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        // Replace placeholders with actual data
        doc.render(mappedData);

        // Generate and save the document
        const buffer = doc.getZip().generate({ type: "nodebuffer" });
        fs.writeFileSync(outputPath, buffer);

        alert("Sanitary Permit generated successfully!");
        console.log(`Document saved at: ${outputPath}`);
    } catch (error) {
        console.error("Error generating the sanitary permit:", error);
        alert(`Failed to generate the sanitary permit: ${error.message}`);
    }
}