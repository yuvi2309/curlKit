import re
import shlex
import json
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field, asdict


@dataclass
class CurlRequest:
    """Structured representation of a parsed cURL command."""
    name: str = ""
    method: str = "GET"
    url: str = ""
    headers: Dict[str, str] = field(default_factory=dict)
    data: Optional[str] = None
    cookies: Dict[str, str] = field(default_factory=dict)
    auth: Optional[tuple] = None
    follow_redirects: bool = False
    insecure: bool = False
    compressed: bool = False
    timeout: Optional[int] = None
    connect_timeout: Optional[int] = None
    query_params: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # Remove None values for cleaner output
        return {k: v for k, v in d.items() if v is not None and v != {} and v != "" and v is not False}

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)


class CurlParser:
    """
    Parses a cURL command string into a CurlRequest.
    Handles multiline commands, single/double quotes, and common cURL flags.
    """

    # Flags that take a value argument
    VALUE_FLAGS = {
        '-X', '--request',
        '-H', '--header',
        '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode',
        '-u', '--user',
        '-b', '--cookie',
        '-o', '--output',
        '-A', '--user-agent',
        '-e', '--referer',
        '--connect-timeout',
        '--max-time',
        '-F', '--form',
    }

    # Boolean flags (no value)
    BOOL_FLAGS = {
        '-L', '--location',
        '-k', '--insecure',
        '--compressed',
        '-I', '--head',
        '-s', '--silent',
        '-S', '--show-error',
        '-v', '--verbose',
    }

    def __init__(self, curl_command: str, name: str = ""):
        self.raw = curl_command
        self.name = name

    def parse(self) -> CurlRequest:
        """Parse the cURL command string into a CurlRequest."""
        cleaned = self._normalize(self.raw)
        tokens = self._tokenize(cleaned)
        return self._parse_tokens(tokens)

    def _normalize(self, cmd: str) -> str:
        """Remove line continuations and normalize whitespace."""
        # Handle backslash-newline continuations
        cmd = re.sub(r'\\\s*\n', ' ', cmd)
        # Collapse multiple spaces
        cmd = re.sub(r'\s+', ' ', cmd).strip()
        return cmd

    def _tokenize(self, cmd: str) -> List[str]:
        """Shell-aware tokenization using shlex."""
        try:
            return shlex.split(cmd)
        except ValueError:
            # Fallback: manual tokenization if shlex fails on unbalanced quotes
            return re.findall(r"""(?:[^\s"']+|"[^"]*"|'[^']*')+""", cmd)

    def _parse_tokens(self, tokens: List[str]) -> CurlRequest:
        req = CurlRequest(name=self.name)
        explicit_method = False
        has_data = False
        i = 0

        while i < len(tokens):
            token = tokens[i]

            if token == 'curl':
                i += 1
                continue

            # Method
            if token in ('-X', '--request'):
                i += 1
                req.method = tokens[i].upper()
                explicit_method = True

            # Headers
            elif token in ('-H', '--header'):
                i += 1
                header_str = tokens[i]
                if ':' in header_str:
                    k, v = header_str.split(':', 1)
                    key = k.strip()
                    val = v.strip()
                    # Detect cookies in headers
                    if key.lower() == 'cookie':
                        for pair in val.split(';'):
                            pair = pair.strip()
                            if '=' in pair:
                                ck, cv = pair.split('=', 1)
                                req.cookies[ck.strip()] = cv.strip()
                    else:
                        req.headers[key] = val

            # Data (body)
            elif token in ('-d', '--data', '--data-raw', '--data-binary'):
                i += 1
                has_data = True
                if req.data is None:
                    req.data = tokens[i]
                else:
                    req.data += '&' + tokens[i]

            elif token == '--data-urlencode':
                i += 1
                has_data = True
                from urllib.parse import quote
                val = tokens[i]
                if '=' in val:
                    k, v = val.split('=', 1)
                    encoded = f"{k}={quote(v)}"
                else:
                    encoded = quote(val)
                if req.data is None:
                    req.data = encoded
                else:
                    req.data += '&' + encoded

            # Form data
            elif token in ('-F', '--form'):
                i += 1
                has_data = True
                # For form data, store as-is (multipart handling can be extended)
                if req.data is None:
                    req.data = tokens[i]
                else:
                    req.data += '&' + tokens[i]

            # Auth
            elif token in ('-u', '--user'):
                i += 1
                auth_str = tokens[i]
                if ':' in auth_str:
                    user, passwd = auth_str.split(':', 1)
                    req.auth = (user, passwd)
                else:
                    req.auth = (auth_str, '')

            # Cookies
            elif token in ('-b', '--cookie'):
                i += 1
                cookie_str = tokens[i]
                for pair in cookie_str.split(';'):
                    pair = pair.strip()
                    if '=' in pair:
                        ck, cv = pair.split('=', 1)
                        req.cookies[ck.strip()] = cv.strip()

            # User-Agent
            elif token in ('-A', '--user-agent'):
                i += 1
                req.headers['User-Agent'] = tokens[i]

            # Referer
            elif token in ('-e', '--referer'):
                i += 1
                req.headers['Referer'] = tokens[i]

            # Follow redirects
            elif token in ('-L', '--location'):
                req.follow_redirects = True

            # Insecure
            elif token in ('-k', '--insecure'):
                req.insecure = True

            # Compressed
            elif token == '--compressed':
                req.compressed = True

            # HEAD request
            elif token in ('-I', '--head'):
                if not explicit_method:
                    req.method = 'HEAD'

            # Timeouts
            elif token == '--connect-timeout':
                i += 1
                req.connect_timeout = int(tokens[i])

            elif token == '--max-time':
                i += 1
                req.timeout = int(tokens[i])

            # Output (ignored but consumed)
            elif token in ('-o', '--output', '-s', '--silent', '-S', '--show-error', '-v', '--verbose'):
                if token in ('-o', '--output'):
                    i += 1  # skip value

            # URL (positional argument — not a flag)
            elif not token.startswith('-') and ('://' in token or token.startswith('http')):
                req.url = token

            # Handle --url flag
            elif token == '--url':
                i += 1
                req.url = tokens[i]

            i += 1

        # If data was sent and method wasn't explicitly set, default to POST
        if has_data and not explicit_method:
            req.method = 'POST'

        # Parse query params from URL
        if '?' in req.url:
            base, qs = req.url.split('?', 1)
            for pair in qs.split('&'):
                if '=' in pair:
                    k, v = pair.split('=', 1)
                    req.query_params[k] = v

        return req


def parse_curl(curl_command: str, name: str = "") -> CurlRequest:
    """Convenience function to parse a cURL command string."""
    return CurlParser(curl_command, name=name).parse()


def parse_curl_file(filepath: str) -> CurlRequest:
    """Parse a cURL command from a text file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read().strip()
    return parse_curl(content, name=filepath)
