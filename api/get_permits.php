<?php
$servername = "localhost";
$username = "your_username";
$password = "your_password";
$dbname = "sanitary_permit_db";

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    die(json_encode(['success' => false, 'error' => 'Connection failed: ' . $conn->connect_error]));
}

$permit_id = $_GET['id']; 

$sql = "SELECT * FROM permits WHERE id = $permit_id";
$result = $conn->query($sql);

if ($result->num_rows > 0) {
    $permit_data = $result->fetch_assoc();
    echo json_encode(['success' => true, 'data' => $permit_data]);
} else {
    echo json_encode(['success' => false, 'error' => 'Permit not found']);
}

$conn->close();
?>