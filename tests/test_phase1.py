"""
End-to-end tests for cURL Kit Phase 1.
Run from project root: python -m tests.test_phase1
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.parser.curl_parser import parse_curl, parse_curl_file, CurlRequest
from src.parser.collection_parser import parse_collection
from src.variable.variable_utils import extract_variables, substitute_variables, generate_variable_mapping
from src.csv.csv_utils import read_csv, get_csv_columns, validate_csv_against_variables, build_variable_row


def test_parse_simple_get():
    req = parse_curl("curl https://example.com/api")
    assert req.method == "GET"
    assert req.url == "https://example.com/api"
    print("  PASS: test_parse_simple_get")


def test_parse_post_with_data():
    cmd = """curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{"name":"test"}'"""
    req = parse_curl(cmd)
    assert req.method == "POST"
    assert req.url == "https://api.example.com/users"
    assert req.headers.get("Content-Type") == "application/json"
    assert req.data == '{"name":"test"}'
    print("  PASS: test_parse_post_with_data")


def test_parse_multiline():
    cmd = """curl -X GET 'https://example.com/api' \\
  -H 'Accept: application/json' \\
  -H 'Authorization: Bearer token123'"""
    req = parse_curl(cmd)
    assert req.method == "GET"
    assert req.headers.get("Accept") == "application/json"
    assert req.headers.get("Authorization") == "Bearer token123"
    print("  PASS: test_parse_multiline")


def test_parse_auto_post():
    cmd = "curl https://example.com -d 'key=value'"
    req = parse_curl(cmd)
    assert req.method == "POST", f"Expected POST, got {req.method}"
    assert req.data == "key=value"
    print("  PASS: test_parse_auto_post")


def test_parse_auth():
    cmd = "curl -u admin:secret https://example.com"
    req = parse_curl(cmd)
    assert req.auth == ("admin", "secret")
    print("  PASS: test_parse_auth")


def test_parse_cookies():
    cmd = "curl -b 'session=abc123; user=john' https://example.com"
    req = parse_curl(cmd)
    assert req.cookies.get("session") == "abc123"
    assert req.cookies.get("user") == "john"
    print("  PASS: test_parse_cookies")


def test_parse_follow_insecure():
    cmd = "curl -L -k https://example.com"
    req = parse_curl(cmd)
    assert req.follow_redirects is True
    assert req.insecure is True
    print("  PASS: test_parse_follow_insecure")


def test_parse_query_params():
    cmd = "curl 'https://example.com/search?q=hello&page=2'"
    req = parse_curl(cmd)
    assert req.query_params.get("q") == "hello"
    assert req.query_params.get("page") == "2"
    print("  PASS: test_parse_query_params")


def test_parse_curl_file():
    req = parse_curl_file("samples/sample_get.txt")
    assert req.method == "GET"
    assert "{{post_id}}" in req.url
    assert req.headers.get("X-Custom-Header") == "{{custom_value}}"
    print("  PASS: test_parse_curl_file")


def test_collection_import():
    requests = parse_collection("samples/sample_collection.json")
    assert len(requests) == 3
    assert requests[0].name == "Get Post"
    assert requests[0].method == "GET"
    assert requests[1].name == "Create Post"
    assert requests[1].method == "POST"
    assert "API Folder" in requests[2].name
    print("  PASS: test_collection_import")


def test_extract_variables():
    req = parse_curl_file("samples/sample_get.txt")
    variables = extract_variables(req)
    assert "post_id" in variables
    assert "custom_value" in variables
    print("  PASS: test_extract_variables")


def test_extract_variables_post():
    req = parse_curl_file("samples/sample_post.txt")
    variables = extract_variables(req)
    assert "title" in variables
    assert "body" in variables
    assert "user_id" in variables
    print("  PASS: test_extract_variables_post")


def test_substitute_variables():
    req = parse_curl_file("samples/sample_get.txt")
    resolved = substitute_variables(req, {"post_id": "42", "custom_value": "xyz"})
    assert "42" in resolved.url
    assert "{{post_id}}" not in resolved.url
    assert resolved.headers.get("X-Custom-Header") == "xyz"
    print("  PASS: test_substitute_variables")


def test_read_csv():
    rows = read_csv("samples/sample_get_data.csv")
    assert len(rows) == 4
    assert rows[0]["post_id"] == "1"
    assert rows[0]["custom_value"] == "hello"
    print("  PASS: test_read_csv")


def test_get_csv_columns():
    cols = get_csv_columns("samples/sample_get_data.csv")
    assert "post_id" in cols
    assert "custom_value" in cols
    print("  PASS: test_get_csv_columns")


def test_validate_csv():
    req = parse_curl_file("samples/sample_get.txt")
    variables = extract_variables(req)
    result = validate_csv_against_variables("samples/sample_get_data.csv", variables)
    assert result["missing"] == [], f"Unexpected missing: {result['missing']}"
    print("  PASS: test_validate_csv")


def test_generate_mapping():
    variables = ["post_id", "custom_value", "missing_var"]
    columns = ["post_id", "Custom_Value", "extra_col"]
    mapping = generate_variable_mapping(variables, columns)
    assert mapping["post_id"] == "post_id"
    assert mapping["custom_value"] == "Custom_Value"
    assert mapping["missing_var"] == ""
    print("  PASS: test_generate_mapping")


def test_build_variable_row():
    row = {"post_id": "7", "custom_value": "abc"}
    variables = ["post_id", "custom_value"]
    result = build_variable_row(row, variables)
    assert result["post_id"] == "7"
    assert result["custom_value"] == "abc"
    print("  PASS: test_build_variable_row")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    tests = [
        test_parse_simple_get,
        test_parse_post_with_data,
        test_parse_multiline,
        test_parse_auto_post,
        test_parse_auth,
        test_parse_cookies,
        test_parse_follow_insecure,
        test_parse_query_params,
        test_parse_curl_file,
        test_collection_import,
        test_extract_variables,
        test_extract_variables_post,
        test_substitute_variables,
        test_read_csv,
        test_get_csv_columns,
        test_validate_csv,
        test_generate_mapping,
        test_build_variable_row,
    ]

    print(f"\nRunning {len(tests)} tests...\n")
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  FAIL: {t.__name__}: {e}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)}")
    print(f"{'='*40}\n")
    sys.exit(1 if failed else 0)
