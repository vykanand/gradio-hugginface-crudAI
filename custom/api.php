<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: X-Requested-With, Content-Type, Origin, Cache-Control, Pragma, Authorization, Accept, Accept-Encoding");

//`created_at`DATETIME DEFAULT CURRENT_TIMESTAMP,
//config

include "../config.php";

$table_name = basename(getcwd());

// Helper: fetch table columns (for validation)
function get_table_columns($db, $table_name)
{
    $cols = array();
    $res = mysqli_query($db, "SHOW COLUMNS FROM `" . mysqli_real_escape_string($db, $table_name) . "`") or die(mysqli_error($db));
    while ($r = mysqli_fetch_assoc($res)) {
        $cols[] = $r['Field'];
    }
    return $cols;
}

// Helper: build WHERE clause from allowed $_GET filters (only columns present in table)
function build_where_from_get($db, $table_name, $allowed_columns)
{
    $where_clauses = array();
    $params = array();
    foreach ($_GET as $k => $v) {
        if ($k === 'getpluginmap' || $k === 'getfieldtypes' || $k === 'getfieldrequired' || $k === 'getfieldoptions' || $k === 'getfirstcontent' || $k === 'getcontent' || $k === 'filters' || $k === 'distinct')
            continue;
        // skip empty keys and control params
        if ($v === '' || $v === null)
            continue;
        if (in_array($k, $allowed_columns)) {
            // support comma-separated values for IN queries
            if (strpos($v, ',') !== false) {
                $vals = array_map(function ($x) use ($db) {
                    return "'" . mysqli_real_escape_string($db, trim($x)) . "'";
                }, explode(',', $v));
                $where_clauses[] = "`$k` IN (" . implode(',', $vals) . ")";
            } else {
                $where_clauses[] = "`$k` = '" . mysqli_real_escape_string($db, $v) . "'";
            }
        }
    }

    if (count($where_clauses) > 0) {
        return array('where' => ' WHERE ' . implode(' AND ', $where_clauses));
    }
    return array('where' => '');
}

// Get plugin mappings from navigation table
if (isset($_GET["getpluginmap"])) {
    $sql = "SELECT plugin FROM navigation WHERE nav = '$table_name'";
    $result = mysqli_query($db, $sql);

    $pluginMap = array();
    if ($result && mysqli_num_rows($result) > 0) {
        $row = mysqli_fetch_assoc($result);
        if (!empty($row['plugin'])) {
            $pluginMap = json_decode($row['plugin'], true);
            if (!is_array($pluginMap)) {
                $pluginMap = array();
            }
        }
    }

    header('Content-Type: application/json');
    echo json_encode($pluginMap);
    exit();
}

// Get field type mappings from navigation table
if (isset($_GET["getfieldtypes"])) {
    $sql = "SELECT field_types FROM navigation WHERE nav = '$table_name'";
    $result = mysqli_query($db, $sql);

    $fieldTypeMap = array();
    if ($result && mysqli_num_rows($result) > 0) {
        $row = mysqli_fetch_assoc($result);
        if (!empty($row['field_types'])) {
            $fieldTypeMap = json_decode($row['field_types'], true);
            if (!is_array($fieldTypeMap)) {
                $fieldTypeMap = array();
            }
        }
    }

    header('Content-Type: application/json');
    echo json_encode($fieldTypeMap);
    exit();
}

// Get field required mappings from navigation table
if (isset($_GET["getfieldrequired"])) {
    $sql = "SELECT field_required FROM navigation WHERE nav = '$table_name'";
    $result = mysqli_query($db, $sql);

    $fieldRequiredMap = array();
    if ($result && mysqli_num_rows($result) > 0) {
        $row = mysqli_fetch_assoc($result);
        if (!empty($row['field_required'])) {
            $fieldRequiredMap = json_decode($row['field_required'], true);
            if (!is_array($fieldRequiredMap)) {
                $fieldRequiredMap = array();
            } else {
                // Coerce common truthy/falsey string values to real booleans
                foreach ($fieldRequiredMap as $k => $v) {
                    if (is_string($v)) {
                        $lower = strtolower(trim($v));
                        if ($lower === 'true' || $lower === '1' || $lower === 'yes' || $lower === 'on') {
                            $fieldRequiredMap[$k] = true;
                        } else {
                            $fieldRequiredMap[$k] = false;
                        }
                    } else {
                        $fieldRequiredMap[$k] = (bool) $v;
                    }
                }
            }
        }
    }

    header('Content-Type: application/json');
    echo json_encode($fieldRequiredMap);
    exit();
}

// Get field options mappings from navigation table
if (isset($_GET["getfieldoptions"])) {
    $sql = "SELECT field_options FROM navigation WHERE nav = '$table_name'";
    $result = mysqli_query($db, $sql);

    $fieldOptionsMap = array();
    if ($result && mysqli_num_rows($result) > 0) {
        $row = mysqli_fetch_assoc($result);
        if (!empty($row['field_options'])) {
            $fieldOptionsMap = json_decode($row['field_options'], true);
            if (!is_array($fieldOptionsMap)) {
                $fieldOptionsMap = array();
            }
        }
    }

    header('Content-Type: application/json');
    echo json_encode($fieldOptionsMap);
    exit();
}

if (isset($_GET["getfirstcontent"])) {
    $user_role = isset($_GET['role']) ? $_GET['role'] : '';

    // Get table structure
    $sql = "SHOW COLUMNS FROM $table_name";
    $result = mysqli_query($db, $sql) or die(mysqli_error($db));

    $columns = array();
    while ($row = mysqli_fetch_assoc($result)) {
        $columns[] = $row['Field'];
    }

    // Remove system columns
    $exclude_columns = array('id', 'role', 'created_at');
    $columns = array_diff($columns, $exclude_columns);

    header('Content-Type: application/json');
    echo json_encode(array_values($columns));
    exit();
}


if (isset($_GET["getcontent"])) {

    // allow filtering by any column via query params. e.g. ?getcontent&status=active&category=5
    $allowed_columns = get_table_columns($db, $table_name);
    $whereObj = build_where_from_get($db, $table_name, $allowed_columns);
    $sql = "SELECT * FROM `$table_name`" . $whereObj['where'] . " ORDER BY created_at DESC";
    $result = mysqli_query($db, $sql) or die(mysqli_error($db));
    $fulldata = array();
    while ($r = mysqli_fetch_assoc($result)) {
        $fulldata[] = $r;
    }
    echo json_encode($fulldata);
}

// New: generic filters endpoint (alias for getcontent but clearer name)
if (isset($_GET['filters'])) {
    // usage: ?filters&field1=value1&field2=value2
    $allowed_columns = get_table_columns($db, $table_name);
    $whereObj = build_where_from_get($db, $table_name, $allowed_columns);
    $sql = "SELECT * FROM `$table_name`" . $whereObj['where'] . " ORDER BY created_at DESC";
    $result = mysqli_query($db, $sql) or die(mysqli_error($db));
    $fulldata = array();
    while ($r = mysqli_fetch_assoc($result)) {
        $fulldata[] = $r;
    }
    echo json_encode($fulldata);
}

// New: distinct values endpoint
if (isset($_GET['distinct'])) {
    // usage: ?distinct=column_name&otherfield=val
    $distinct_col = $_GET['distinct'];
    $allowed_columns = get_table_columns($db, $table_name);
    header('Content-Type: application/json');
    if (!in_array($distinct_col, $allowed_columns)) {
        echo json_encode(array('error' => 'invalid_column'));
        exit();
    }
    // build where from other params
    $whereObj = build_where_from_get($db, $table_name, $allowed_columns);
    $sql = "SELECT DISTINCT `$distinct_col` FROM `$table_name`" . $whereObj['where'] . " ORDER BY `$distinct_col` ASC";
    $result = mysqli_query($db, $sql) or die(mysqli_error($db));
    $values = array();
    while ($r = mysqli_fetch_assoc($result)) {
        $values[] = $r[$distinct_col];
    }
    echo json_encode($values);
}

if (isset($_REQUEST["setcontent"])) {
    $data = $_POST;
    unset($data["setcontent"]);
    $key = array_keys($data); //get key( column name)
    $value = array_values($data); //get values (values to be inserted)
    $sql = "INSERT INTO $table_name ( " . implode(',', $key) . ") VALUES('" . implode("','", $value) . "')";

    $result = mysqli_query($db, $sql) or die(mysqli_error($db));

    if ($result) {
        $message = array(
            "response" => "success"
        );
    } else {
        $message = array(
            "response" => "failed"
        );
    }
    echo json_encode($message);

}

if (isset($_POST["edcontent"])) {
    unset($_POST["edcontent"]);
    $query = "UPDATE $table_name SET";
    $comma = " ";
    foreach ($_POST as $key => $val) {
        if (!empty($val)) {
            $query .= $comma . $key . " = '" . mysqli_real_escape_string($db, trim($val)) . "'";
            $comma = ", ";
        }
    }

    $product_id = $_POST['id'];

    $query = $query . "WHERE id = '" . $product_id . "' ";

    $result = mysqli_query($db, $query) or die(mysqli_error($db));

    if ($result) {
        $message = array(
            "response" => "success"
        );
    } else {
        $message = array(
            "response" => "failed"
        );
    }
    echo json_encode($message);

}



if (isset($_GET["delcontentsa"])) {
    $id = $_GET['id'];
    $sql = "DELETE FROM $table_name WHERE id='$id'";
    $result = mysqli_query($db, $sql) or die(mysqli_error($db));
    if ($result) {
        $message = array(
            "response" => "success"
        );
    } else {
        $message = array(
            "response" => "failed"
        );
    }
    echo json_encode($message);

}

/**
 * SIMPLE BULK INSERT/UPSERT
 * POST /appsthink_crm/api.php?upsert
 * [
 *   { "email": "john@example.com", "name": "John" },
 *   { "email": "jane@example.com", "name": "Jane" }
 * ]
 */
if (isset($_GET["upsert"])) {
    header('Content-Type: application/json');

    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !is_array($input)) {
        echo json_encode(array('status' => 'error', 'message' => 'Invalid input'));
        exit();
    }

    $allowed_columns = get_table_columns($db, $table_name);
    $success = 0;
    $failed = 0;

    foreach ($input as $record) {
        $data = array();
        foreach ($record as $field => $value) {
            if (in_array($field, $allowed_columns) && $field !== 'id') {
                $data[$field] = mysqli_real_escape_string($db, $value);
            }
        }

        if (empty($data)) {
            $failed++;
            continue;
        }

        $fields = array_keys($data);
        $values = array_values($data);
        $updates = array();
        foreach ($data as $k => $v) {
            $updates[] = "`$k` = '$v'";
        }

        $sql = "INSERT INTO `$table_name` (`" . implode('`, `', $fields) . "`) VALUES ('" . implode("', '", $values) . "') ON DUPLICATE KEY UPDATE " . implode(', ', $updates);

        if (mysqli_query($db, $sql)) {
            $success++;
        } else {
            $failed++;
        }
    }

    echo json_encode(array('status' => 'success', 'success' => $success, 'failed' => $failed));
    exit();
}

$db->close();
?>