<?php


$data = json_decode(file_get_contents('php://input'), true);

$permit_id = $data['permit_id'];
$employee_name = $conn->real_escape_string($data['employee_name']);

$sql = "INSERT INTO employees (permit_id, employee_name, address, health_cert_no, remarks) 
        VALUES ('$permit_id', '$employee_name', '$address', '$health_cert_no', '$remarks')";

if ($conn->query($sql) === TRUE) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => $conn->error]);
}

$conn->close();
?>