<?php
$servername = "localhost";
$username = "your_username";
$password = "your_password";
$dbname = "sanitary_permit_db";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
  die("Connection failed: " . $conn->connect_error);
}

$data = json_decode(file_get_contents('php://input'), true);

$sql = "INSERT INTO permits (business_name, owner_name, applicant_type, application_date, application_status)
VALUES ('".$data['businessName']."', '".$data['ownerName']."', '".$data['applicantType']."', '".$data['applicationDate']."', '".$data['applicationStatus']."')";

if ($conn->query($sql) === TRUE) {
  echo json_encode(['success' => true]);
} else {
  echo json_encode(['success' => false, 'error' => $conn->error]);
}

$conn->close();
?>