import csv
import os
from typing import List, Dict, Optional


def read_csv(filepath: str) -> List[Dict[str, str]]:
    """
    Reads a CSV file and returns a list of dictionaries (one per row).
    Strips whitespace from headers and values.
    """
    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"CSV file not found: {filepath}")

    with open(filepath, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        rows = []
        for row in reader:
            cleaned = {k.strip(): (v.strip() if v else '') for k, v in row.items()}
            rows.append(cleaned)
    return rows


def get_csv_columns(filepath: str) -> List[str]:
    """Returns the column headers from a CSV file."""
    with open(filepath, newline='', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        headers = next(reader, [])
    return [h.strip() for h in headers]


def validate_csv_against_variables(
    filepath: str,
    required_variables: List[str],
    mapping: Optional[Dict[str, str]] = None,
) -> Dict[str, List[str]]:
    """
    Validate that the CSV has all required columns for the variables.
    Returns a dict with 'missing' (variables without a matching column)
    and 'extra' (CSV columns not used by any variable).
    """
    columns = get_csv_columns(filepath)

    if mapping:
        mapped_cols = set(mapping.values()) - {''}
        missing = [v for v in required_variables if mapping.get(v, '') == '']
        extra = [c for c in columns if c not in mapped_cols]
    else:
        col_lower = {c.lower() for c in columns}
        missing = [v for v in required_variables if v.lower() not in col_lower]
        extra = [c for c in columns if c.lower() not in {v.lower() for v in required_variables}]

    return {'missing': missing, 'extra': extra}


def build_variable_row(
    csv_row: Dict[str, str],
    variables: List[str],
    mapping: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    """
    Build a variable_map from a CSV row for substitution.
    If mapping is provided, uses it; otherwise, matches variable names to column names (case-insensitive).
    """
    if mapping:
        result = {}
        for var in variables:
            col = mapping.get(var, '')
            result[var] = csv_row.get(col, '') if col else ''
        return result

    # Auto-match by name (case-insensitive)
    col_lower = {k.lower(): k for k in csv_row}
    result = {}
    for var in variables:
        actual_col = col_lower.get(var.lower(), '')
        result[var] = csv_row.get(actual_col, '') if actual_col else ''
    return result
