import json
from typing import List, Dict, Any, Optional
from src.parser.curl_parser import CurlRequest


class PostmanCollectionParser:
    """
    Parses a Postman Collection v2.1 JSON export into a list of CurlRequests.
    Also supports a simple JSON array of raw cURL strings.
    """

    def __init__(self, filepath: str):
        self.filepath = filepath
        with open(filepath, 'r', encoding='utf-8') as f:
            self.data = json.load(f)

    def parse(self) -> List[CurlRequest]:
        """Detect format and parse accordingly."""
        # Postman collection v2.1
        if 'info' in self.data and 'item' in self.data:
            return self._parse_postman_v2(self.data['item'])

        # Simple JSON array of cURL strings
        if isinstance(self.data, list):
            return self._parse_curl_list(self.data)

        # Single request object
        if 'request' in self.data:
            return [self._parse_postman_request(self.data)]

        raise ValueError(f"Unrecognized collection format in {self.filepath}")

    def _parse_postman_v2(self, items: List[Dict], folder: str = "") -> List[CurlRequest]:
        """Recursively parse Postman v2.1 items (supports folders)."""
        requests = []
        for item in items:
            # Folder with sub-items
            if 'item' in item and isinstance(item['item'], list):
                subfolder = f"{folder}/{item.get('name', '')}" if folder else item.get('name', '')
                requests.extend(self._parse_postman_v2(item['item'], subfolder))
            # Request item
            elif 'request' in item:
                req = self._parse_postman_request(item, folder)
                requests.append(req)
        return requests

    def _parse_postman_request(self, item: Dict, folder: str = "") -> CurlRequest:
        """Parse a single Postman request item into a CurlRequest."""
        request = item.get('request', item)
        name = item.get('name', 'Unnamed')
        if folder:
            name = f"{folder}/{name}"

        # Method
        method = request.get('method', 'GET').upper()

        # URL
        url_obj = request.get('url', {})
        if isinstance(url_obj, str):
            url = url_obj
            query_params = {}
        else:
            url = url_obj.get('raw', '')
            query_params = {}
            for q in url_obj.get('query', []):
                if not q.get('disabled', False):
                    query_params[q.get('key', '')] = q.get('value', '')

        # Headers
        headers = {}
        for h in request.get('header', []):
            if not h.get('disabled', False):
                headers[h.get('key', '')] = h.get('value', '')

        # Body
        data = None
        body = request.get('body', {})
        if body:
            mode = body.get('mode', '')
            if mode == 'raw':
                data = body.get('raw', '')
            elif mode == 'urlencoded':
                pairs = []
                for p in body.get('urlencoded', []):
                    if not p.get('disabled', False):
                        pairs.append(f"{p.get('key', '')}={p.get('value', '')}")
                data = '&'.join(pairs)
            elif mode == 'formdata':
                pairs = []
                for p in body.get('formdata', []):
                    if not p.get('disabled', False):
                        pairs.append(f"{p.get('key', '')}={p.get('value', '')}")
                data = '&'.join(pairs)

        # Auth
        auth = None
        auth_obj = request.get('auth', {})
        if auth_obj and auth_obj.get('type') == 'basic':
            basic = auth_obj.get('basic', [])
            username = password = ''
            for entry in basic:
                if entry.get('key') == 'username':
                    username = entry.get('value', '')
                elif entry.get('key') == 'password':
                    password = entry.get('value', '')
            auth = (username, password)

        return CurlRequest(
            name=name,
            method=method,
            url=url,
            headers=headers,
            data=data,
            query_params=query_params,
            auth=auth,
        )

    def _parse_curl_list(self, curl_list: List) -> List[CurlRequest]:
        """Parse a JSON array of cURL strings or objects with a 'curl' key."""
        from src.parser.curl_parser import parse_curl
        requests = []
        for i, entry in enumerate(curl_list):
            if isinstance(entry, str):
                req = parse_curl(entry, name=f"Request {i+1}")
            elif isinstance(entry, dict) and 'curl' in entry:
                req = parse_curl(entry['curl'], name=entry.get('name', f"Request {i+1}"))
            else:
                continue
            requests.append(req)
        return requests


def parse_collection(filepath: str) -> List[CurlRequest]:
    """Convenience function to parse any collection file."""
    return PostmanCollectionParser(filepath).parse()
