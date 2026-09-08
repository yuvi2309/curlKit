#!/usr/bin/env python3
"""
cURL Kit — Import, parameterize, and batch-run cURL commands.

Usage:
  python -m src.main parse <curl_file>              Parse a cURL file and show components
  python -m src.main import <collection.json>       Import a Postman/JSON collection
  python -m src.main vars <curl_file>               Show variables in a cURL file
  python -m src.main validate <curl_file> <csv>     Validate CSV columns vs cURL variables
  python -m src.main run <curl_file> <csv>          Run cURL for each CSV row
  python -m src.main run <curl_file> <csv> --export-json results.json
  python -m src.main run <curl_file> <csv> --export-csv results.csv
  python -m src.main run <curl_file> <csv> --mapping mapping.json
  python -m src.main run <curl_file> <csv> --delay 200
"""

import sys
import os
import argparse
import logging
import json

# Allow running from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.parser.curl_parser import parse_curl, parse_curl_file
from src.parser.collection_parser import parse_collection
from src.variable.variable_utils import (
    extract_variables,
    generate_variable_mapping,
    save_mapping_config,
    load_mapping_config,
)
from src.csv.csv_utils import (
    read_csv,
    get_csv_columns,
    validate_csv_against_variables,
)
from src.executor.batch_executor import batch_execute
from src.results.exporter import (
    export_results_json,
    export_results_csv,
    print_summary,
)


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )


def cmd_parse(args):
    """Parse a cURL file and display its components."""
    request = parse_curl_file(args.curl_file)
    print(request.to_json(indent=2))


def cmd_import(args):
    """Import a Postman/JSON collection and display all requests."""
    requests = parse_collection(args.collection_file)
    print(f"Imported {len(requests)} request(s):\n")
    for i, req in enumerate(requests, 1):
        print(f"  {i}. [{req.method}] {req.name or req.url}")
        variables = extract_variables(req)
        if variables:
            print(f"     Variables: {', '.join(variables)}")
    print()

    # Optionally save as individual curl files
    if args.output_dir:
        os.makedirs(args.output_dir, exist_ok=True)
        for i, req in enumerate(requests, 1):
            outpath = os.path.join(args.output_dir, f"{i}_{_safe_filename(req.name)}.json")
            with open(outpath, 'w', encoding='utf-8') as f:
                f.write(req.to_json(indent=2))
        print(f"Saved {len(requests)} requests to {args.output_dir}/")


def cmd_vars(args):
    """Show variables found in a cURL file."""
    request = parse_curl_file(args.curl_file)
    variables = extract_variables(request)
    if variables:
        print(f"Variables found ({len(variables)}):")
        for v in variables:
            print(f"  - {{{{{v}}}}}")
    else:
        print("No variables ({{...}}) found in this cURL.")
    print()

    # If a CSV is also provided, generate mapping
    if args.csv_file:
        columns = get_csv_columns(args.csv_file)
        mapping = generate_variable_mapping(variables, columns)
        print("Auto-generated mapping (variable -> CSV column):")
        for var, col in mapping.items():
            status = f"-> '{col}'" if col else "-> [UNMAPPED]"
            print(f"  {{{{{var}}}}} {status}")
        print()

        if args.save_mapping:
            save_mapping_config(mapping, args.save_mapping)
            print(f"Mapping saved to {args.save_mapping}")


def cmd_validate(args):
    """Validate CSV columns against cURL variables."""
    request = parse_curl_file(args.curl_file)
    variables = extract_variables(request)
    mapping = None
    if args.mapping:
        mapping = load_mapping_config(args.mapping)
    result = validate_csv_against_variables(args.csv_file, variables, mapping)

    if result['missing']:
        print(f"MISSING variables (no matching CSV column):")
        for v in result['missing']:
            print(f"  - {{{{{v}}}}}")
    else:
        print("All variables have matching CSV columns.")

    if result['extra']:
        print(f"\nExtra CSV columns (not used by any variable):")
        for c in result['extra']:
            print(f"  - {c}")
    print()


def cmd_run(args):
    """Run a cURL for each CSV row, with variable substitution."""
    request = parse_curl_file(args.curl_file)
    variables = extract_variables(request)

    if not variables:
        print("No variables found. Running the cURL as-is for each CSV row.")

    # Load mapping if provided
    mapping = None
    if args.mapping:
        mapping = load_mapping_config(args.mapping)

    # Validate
    validation = validate_csv_against_variables(args.csv_file, variables, mapping)
    if validation['missing']:
        print("WARNING: The following variables have no matching CSV column:")
        for v in validation['missing']:
            print(f"  - {{{{{v}}}}}")
        if not args.force:
            print("Use --force to run anyway, or fix the CSV / mapping.")
            sys.exit(1)

    # Execute
    results = batch_execute(
        request=request,
        csv_file=args.csv_file,
        variables=variables,
        mapping=mapping,
        delay_ms=args.delay,
    )

    # Print summary
    print_summary(results)

    # Export
    if args.export_json:
        export_results_json(results, args.export_json)
        print(f"Results exported to {args.export_json}")

    if args.export_csv:
        export_results_csv(results, args.export_csv)
        print(f"Results exported to {args.export_csv}")


def _safe_filename(name: str) -> str:
    """Convert a string to a safe filename."""
    return "".join(c if c.isalnum() or c in '-_' else '_' for c in name)[:50]


def main():
    parser = argparse.ArgumentParser(
        prog="curlkit",
        description="cURL Kit — Import, parameterize, and batch-run cURL commands.",
    )
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose logging')
    subparsers = parser.add_subparsers(dest='command', help='Sub-commands')

    # parse
    p_parse = subparsers.add_parser('parse', help='Parse a cURL file and show components')
    p_parse.add_argument('curl_file', help='Path to a file containing a cURL command')

    # import
    p_import = subparsers.add_parser('import', help='Import a Postman/JSON collection')
    p_import.add_argument('collection_file', help='Path to a Postman/JSON collection file')
    p_import.add_argument('--output-dir', '-o', help='Directory to save parsed requests')

    # vars
    p_vars = subparsers.add_parser('vars', help='Show variables in a cURL command')
    p_vars.add_argument('curl_file', help='Path to a file containing a cURL command')
    p_vars.add_argument('--csv-file', '-c', help='CSV file to auto-generate mapping')
    p_vars.add_argument('--save-mapping', '-s', help='Save mapping to a JSON file')

    # validate
    p_validate = subparsers.add_parser('validate', help='Validate CSV columns vs cURL variables')
    p_validate.add_argument('curl_file', help='Path to a file containing a cURL command')
    p_validate.add_argument('csv_file', help='Path to a CSV file')
    p_validate.add_argument('--mapping', '-m', help='Path to a mapping JSON file')

    # run
    p_run = subparsers.add_parser('run', help='Run cURL for each CSV row')
    p_run.add_argument('curl_file', help='Path to a file containing a cURL command')
    p_run.add_argument('csv_file', help='Path to a CSV file with variable values')
    p_run.add_argument('--mapping', '-m', help='Path to a mapping JSON file')
    p_run.add_argument('--export-json', help='Export results to a JSON file')
    p_run.add_argument('--export-csv', help='Export results to a CSV file')
    p_run.add_argument('--delay', type=int, default=0, help='Delay between requests in ms')
    p_run.add_argument('--force', action='store_true', help='Run even with missing mappings')

    args = parser.parse_args()
    setup_logging(args.verbose)

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    commands = {
        'parse': cmd_parse,
        'import': cmd_import,
        'vars': cmd_vars,
        'validate': cmd_validate,
        'run': cmd_run,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
