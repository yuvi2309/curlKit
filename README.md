# cURL Kit

Import cURL commands/collections, parameterize them with `{{variables}}`, map to CSV data, and batch-run them.

## Project Structure

```
src/
  parser/
    curl_parser.py         # Parse cURL commands (multiline, shlex, 15+ flags)
    collection_parser.py   # Import Postman v2.1 / JSON collections
  variable/
    variable_utils.py      # Extract, substitute, and map variables
  csv/
    csv_utils.py           # CSV reading, column validation, variable mapping
  executor/
    batch_executor.py      # Execute cURL requests with logging and timing
  results/
    exporter.py            # Export results to JSON/CSV, print summary
  main.py                  # CLI entry point
samples/                   # Sample cURL files, CSVs, and Postman collections
tests/
  test_phase1.py           # 18 unit tests
```

## Quick Start

```bash
# Parse a cURL command and inspect its components
python -m src.main parse samples/sample_get.txt

# Import a Postman collection
python -m src.main import samples/sample_collection.json

# Show variables and auto-map to CSV columns
python -m src.main vars samples/sample_get.txt --csv-file samples/sample_get_data.csv

# Validate CSV against cURL variables
python -m src.main validate samples/sample_get.txt samples/sample_get_data.csv

# Batch run: execute the cURL for each CSV row, export results
python -m src.main run samples/sample_get.txt samples/sample_get_data.csv \
  --export-json output/results.json --export-csv output/results.csv

# POST example with body variables
python -m src.main run samples/sample_post.txt samples/sample_post_data.csv \
  --export-json output/post_results.json
```

## CLI Commands

| Command      | Description                                         |
|-------------|-----------------------------------------------------|
| `parse`     | Parse a cURL file and display structured components |
| `import`    | Import a Postman/JSON collection                    |
| `vars`      | Show `{{variables}}` and auto-map to CSV columns    |
| `validate`  | Validate CSV columns match cURL variables           |
| `run`       | Batch execute cURL for each CSV row                 |

### `run` flags
- `--mapping mapping.json` — Use a custom variable-to-column mapping
- `--export-json results.json` — Export results as JSON
- `--export-csv results.csv` — Export results as CSV
- `--delay 200` — Delay between requests (ms)
- `--force` — Run even when some variables are unmapped
- `-v` — Verbose logging

## Variables

Use `{{variable_name}}` anywhere in your cURL — URL, headers, body, cookies, auth.
Map each variable to a CSV column by name (auto-matched, case-insensitive) or via a JSON mapping file.

## Roadmap
- [x] cURL parser (multiline, shlex, 15+ flags)
- [x] Postman collection importer
- [x] Variable extraction & substitution
- [x] CSV integration & validation
- [x] Batch execution with logging & timing
- [x] Results export (JSON/CSV) & summary
- [x] Full CLI (parse, import, vars, validate, run)
- [ ] Workflow engine — chain cURLs, pass outputs, add logic (Phase 2)
