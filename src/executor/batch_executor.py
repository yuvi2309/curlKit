import time
import logging
import requests
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict
from src.parser.curl_parser import CurlRequest
from src.variable.variable_utils import substitute_variables
from src.csv.csv_utils import read_csv, build_variable_row

logger = logging.getLogger("curlkit.executor")


@dataclass
class ExecutionResult:
    """Result of executing a single cURL request."""
    row_index: int
    request_name: str
    method: str
    url: str
    status_code: Optional[int] = None
    response_body: Optional[str] = None
    response_headers: Optional[Dict[str, str]] = None
    duration_ms: Optional[float] = None
    error: Optional[str] = None
    variables_used: Dict[str, str] = field(default_factory=dict)

    @property
    def success(self) -> bool:
        return self.error is None and self.status_code is not None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def execute_request(request: CurlRequest) -> ExecutionResult:
    """Execute a single CurlRequest and return an ExecutionResult."""
    result = ExecutionResult(
        row_index=0,
        request_name=request.name,
        method=request.method,
        url=request.url,
    )

    start = time.time()
    try:
        kwargs = {
            'method': request.method,
            'url': request.url,
            'headers': request.headers,
        }

        if request.data is not None:
            kwargs['data'] = request.data

        if request.auth:
            kwargs['auth'] = request.auth

        if request.cookies:
            kwargs['cookies'] = request.cookies

        kwargs['allow_redirects'] = request.follow_redirects
        kwargs['verify'] = not request.insecure

        if request.timeout:
            kwargs['timeout'] = request.timeout
        elif request.connect_timeout:
            kwargs['timeout'] = request.connect_timeout

        resp = requests.request(**kwargs)

        result.status_code = resp.status_code
        result.response_body = resp.text
        result.response_headers = dict(resp.headers)

    except requests.exceptions.ConnectionError as e:
        result.error = f"Connection error: {e}"
    except requests.exceptions.Timeout as e:
        result.error = f"Timeout: {e}"
    except requests.exceptions.RequestException as e:
        result.error = f"Request failed: {e}"
    except Exception as e:
        result.error = f"Unexpected error: {e}"
    finally:
        result.duration_ms = round((time.time() - start) * 1000, 2)

    return result


def batch_execute(
    request: CurlRequest,
    csv_file: str,
    variables: List[str],
    mapping: Optional[Dict[str, str]] = None,
    delay_ms: int = 0,
) -> List[ExecutionResult]:
    """
    For each row in the CSV file, substitute variables into the request
    and execute it. Returns a list of ExecutionResults.
    """
    csv_rows = read_csv(csv_file)
    results = []

    total = len(csv_rows)
    logger.info(f"Starting batch execution: {total} rows, request: {request.name or request.url}")

    for i, row in enumerate(csv_rows):
        variable_map = build_variable_row(row, variables, mapping)
        resolved = substitute_variables(request, variable_map)

        logger.info(f"[{i+1}/{total}] {resolved.method} {resolved.url}")

        exec_result = execute_request(resolved)
        exec_result.row_index = i + 1
        exec_result.variables_used = variable_map

        if exec_result.success:
            logger.info(f"  -> {exec_result.status_code} ({exec_result.duration_ms}ms)")
        else:
            logger.warning(f"  -> ERROR: {exec_result.error}")

        results.append(exec_result)

        if delay_ms > 0 and i < total - 1:
            time.sleep(delay_ms / 1000)

    succeeded = sum(1 for r in results if r.success)
    failed = total - succeeded
    logger.info(f"Batch complete: {succeeded} succeeded, {failed} failed out of {total}")

    return results
