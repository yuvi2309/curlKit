import re
import json
from typing import Dict, List, Set, Any, Optional
from src.parser.curl_parser import CurlRequest


VARIABLE_PATTERN = re.compile(r'\{\{(.*?)\}\}')


def extract_variables(request: CurlRequest) -> List[str]:
    """
    Extracts all {{variable_name}} placeholders from a CurlRequest.
    Scans URL, headers (keys + values), data, cookies, query params, and auth.
    """
    variables: Set[str] = set()

    # URL
    variables.update(VARIABLE_PATTERN.findall(request.url))

    # Headers
    for k, v in request.headers.items():
        variables.update(VARIABLE_PATTERN.findall(k))
        variables.update(VARIABLE_PATTERN.findall(v))

    # Data/body
    if request.data:
        variables.update(VARIABLE_PATTERN.findall(request.data))

    # Cookies
    for k, v in request.cookies.items():
        variables.update(VARIABLE_PATTERN.findall(k))
        variables.update(VARIABLE_PATTERN.findall(v))

    # Query params
    for k, v in request.query_params.items():
        variables.update(VARIABLE_PATTERN.findall(k))
        variables.update(VARIABLE_PATTERN.findall(v))

    # Auth
    if request.auth:
        for part in request.auth:
            if part:
                variables.update(VARIABLE_PATTERN.findall(str(part)))

    return sorted(variables)


def substitute_variables(request: CurlRequest, variable_map: Dict[str, str]) -> CurlRequest:
    """
    Returns a new CurlRequest with all {{var}} placeholders replaced
    using the provided variable_map.
    """
    def sub(text: Optional[str]) -> Optional[str]:
        if text is None:
            return None
        for k, v in variable_map.items():
            text = text.replace(f'{{{{{k}}}}}', v)
        return text

    def sub_dict(d: Dict[str, str]) -> Dict[str, str]:
        return {sub(k): sub(v) for k, v in d.items()}

    new_auth = None
    if request.auth:
        new_auth = tuple(sub(str(p)) if p else p for p in request.auth)

    return CurlRequest(
        name=request.name,
        method=request.method,
        url=sub(request.url),
        headers=sub_dict(request.headers),
        data=sub(request.data),
        cookies=sub_dict(request.cookies),
        auth=new_auth,
        follow_redirects=request.follow_redirects,
        insecure=request.insecure,
        compressed=request.compressed,
        timeout=request.timeout,
        connect_timeout=request.connect_timeout,
        query_params=sub_dict(request.query_params),
    )


def generate_variable_mapping(
    variables: List[str],
    csv_columns: List[str],
) -> Dict[str, str]:
    """
    Auto-maps variables to CSV columns by exact name match (case-insensitive).
    Returns a dict: {variable_name: csv_column_name}.
    Unmatched variables map to empty string.
    """
    col_lower = {c.lower(): c for c in csv_columns}
    mapping = {}
    for var in variables:
        if var.lower() in col_lower:
            mapping[var] = col_lower[var.lower()]
        else:
            mapping[var] = ""
    return mapping


def save_mapping_config(mapping: Dict[str, str], filepath: str):
    """Save variable-to-CSV-column mapping as a JSON config file."""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=2)


def load_mapping_config(filepath: str) -> Dict[str, str]:
    """Load variable-to-CSV-column mapping from a JSON config file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)
