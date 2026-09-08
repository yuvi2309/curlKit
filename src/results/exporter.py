import csv
import json
import os
from typing import List, Dict, Any
from src.executor.batch_executor import ExecutionResult


def _ensure_dir(filepath: str):
    dirpath = os.path.dirname(filepath)
    if dirpath:
        os.makedirs(dirpath, exist_ok=True)


def export_results_json(results: List[ExecutionResult], filepath: str, include_response_body: bool = True):
    """Export execution results to a JSON file."""
    _ensure_dir(filepath)
    data = []
    for r in results:
        entry = {
            'row_index': r.row_index,
            'request_name': r.request_name,
            'method': r.method,
            'url': r.url,
            'status_code': r.status_code,
            'duration_ms': r.duration_ms,
            'success': r.success,
            'variables_used': r.variables_used,
        }
        if r.error:
            entry['error'] = r.error
        if include_response_body and r.response_body:
            # Try to parse JSON responses for cleaner output
            try:
                entry['response_body'] = json.loads(r.response_body)
            except (json.JSONDecodeError, TypeError):
                entry['response_body'] = r.response_body
        if r.response_headers:
            entry['response_headers'] = r.response_headers
        data.append(entry)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, default=str)


def export_results_csv(results: List[ExecutionResult], filepath: str):
    """Export execution results to a CSV file."""
    _ensure_dir(filepath)
    if not results:
        return

    # Collect all variable keys across results
    all_var_keys = set()
    for r in results:
        all_var_keys.update(r.variables_used.keys())
    all_var_keys = sorted(all_var_keys)

    fieldnames = [
        'row_index', 'request_name', 'method', 'url',
        'status_code', 'duration_ms', 'success', 'error',
    ] + [f'var_{k}' for k in all_var_keys] + ['response_body']

    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for r in results:
            row = {
                'row_index': r.row_index,
                'request_name': r.request_name,
                'method': r.method,
                'url': r.url,
                'status_code': r.status_code,
                'duration_ms': r.duration_ms,
                'success': r.success,
                'error': r.error or '',
                'response_body': (r.response_body or '')[:1000],  # Truncate for CSV
            }
            for k in all_var_keys:
                row[f'var_{k}'] = r.variables_used.get(k, '')
            writer.writerow(row)


def print_summary(results: List[ExecutionResult]):
    """Print a summary table of execution results to stdout."""
    total = len(results)
    succeeded = sum(1 for r in results if r.success)
    failed = total - succeeded

    print(f"\n{'='*70}")
    print(f"  BATCH EXECUTION SUMMARY")
    print(f"{'='*70}")
    print(f"  Total: {total}  |  Succeeded: {succeeded}  |  Failed: {failed}")

    if results:
        durations = [r.duration_ms for r in results if r.duration_ms is not None]
        if durations:
            print(f"  Avg time: {sum(durations)/len(durations):.1f}ms  |  "
                  f"Min: {min(durations):.1f}ms  |  Max: {max(durations):.1f}ms")

    print(f"{'='*70}")
    print(f"  {'Row':<5} {'Status':<8} {'Time(ms)':<10} {'Method':<7} {'URL'}")
    print(f"  {'-'*5} {'-'*8} {'-'*10} {'-'*7} {'-'*35}")

    for r in results:
        status = str(r.status_code) if r.status_code else 'ERR'
        dur = f"{r.duration_ms:.1f}" if r.duration_ms else '-'
        url = r.url[:50] + ('...' if len(r.url) > 50 else '')
        print(f"  {r.row_index:<5} {status:<8} {dur:<10} {r.method:<7} {url}")

    if failed > 0:
        print(f"\n  ERRORS:")
        for r in results:
            if not r.success:
                print(f"    Row {r.row_index}: {r.error}")

    print(f"{'='*70}\n")
