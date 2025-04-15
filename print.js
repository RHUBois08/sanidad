const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");

// Load the Word template as binary
let content;
try {
    content = fs.readFileSync("sanitary_certificate_format.docx", "binary");
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
        Date: "April 15, 2025",
        BUSINESS_NAME: "Adrian's Samgyupsalamat",
        BUSINESS_OWNER: "Adrian"
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
    fs.writeFileSync("C:\Users\DELL\Desktop\sample_outputs\sample_output.docx", buffer);
    console.log("Document generated successfully: sample_output.docx");
} catch (error) {
    console.error("Error saving the document:", error);
    process.exit(1);
}
