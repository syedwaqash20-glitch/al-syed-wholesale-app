import os
import json
import urllib.request
import requests
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union, Generator
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()

# Persistent thread-safe HTTP session with Keep-Alive connection pooling for low-latency queries
_http_session = requests.Session()
_http_session.headers.update({"Content-Type": "application/json"})


class TursoRow:
    """
    Standard Row wrapper for Turso DB results that mimics sqlite3.Row.
    Provides key (name) access, index access, dict conversion, iteration, and keys/values/items methods.
    """
    def __init__(self, cols: List[str], values: List[Any]):
        self._cols = cols
        self._col_map = {c: i for i, c in enumerate(cols)}
        self._values = values

    def __getitem__(self, item: Union[int, str]) -> Any:
        if isinstance(item, int):
            return self._values[item]
        elif isinstance(item, str):
            if item in self._col_map:
                return self._values[self._col_map[item]]
            item_lower = item.lower()
            for c, i in self._col_map.items():
                if c.lower() == item_lower:
                    return self._values[i]
            raise KeyError(f"Column '{item}' not found in TursoRow. Available: {self._cols}")
        raise TypeError(f"Row indices must be integers or strings, not {type(item).__name__}")

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default

    def keys(self) -> List[str]:
        return self._cols

    def values(self) -> List[Any]:
        return self._values

    def items(self) -> List[Tuple[str, Any]]:
        return list(zip(self._cols, self._values))

    def __len__(self) -> int:
        return len(self._values)

    def __iter__(self) -> Generator[Any, None, None]:
        for val in self._values:
            yield val

    def __contains__(self, item: Any) -> bool:
        if isinstance(item, str):
            return item in self._col_map or item.lower() in [c.lower() for c in self._cols]
        elif isinstance(item, int):
            return 0 <= item < len(self._values)
        return False

    def __repr__(self) -> str:
        return f"<TursoRow {dict(self.items())}>"


def _format_param(arg: Any) -> Dict[str, Any]:
    if arg is None:
        return {"type": "null"}
    elif isinstance(arg, bool):
        return {"type": "integer", "value": str(int(arg))}
    elif isinstance(arg, int):
        return {"type": "integer", "value": str(arg)}
    elif isinstance(arg, float):
        return {"type": "float", "value": arg}
    else:
        return {"type": "text", "value": str(arg)}


def _parse_val(val_obj: Any) -> Any:
    if not isinstance(val_obj, dict):
        return val_obj
    vtype = val_obj.get("type")
    val = val_obj.get("value")
    if vtype == "null" or val is None:
        return None
    elif vtype == "integer":
        return int(val)
    elif vtype == "float":
        return float(val)
    else:
        return str(val)


class TursoCursor:
    """
    Cursor implementation for Turso Cloud DB HTTP Pipeline API.
    """
    def __init__(self, connection: "TursoCloudConnection"):
        self.connection = connection
        self.description: Optional[List[Tuple]] = None
        self.lastrowid: Optional[int] = None
        self.rowcount: int = -1
        self._rows: List[TursoRow] = []
        self._idx: int = 0

    def execute(self, sql: str, parameters: Sequence[Any] = ()) -> "TursoCursor":
        self._rows = []
        self._idx = 0
        self.description = None

        endpoint = self.connection.pipeline_url
        headers = {"Authorization": f"Bearer {self.connection.auth_token}"}

        args = [_format_param(p) for p in parameters] if parameters else []
        payload = {
            "requests": [
                {
                    "type": "execute",
                    "stmt": {
                        "sql": sql,
                        "args": args
                    }
                }
            ]
        }

        try:
            resp = _http_session.post(endpoint, json=payload, headers=headers, timeout=10)
            if resp.status_code != 200:
                raise RuntimeError(f"Turso Cloud HTTP Error {resp.status_code}: {resp.text}")
            
            data = resp.json()
            results = data.get("results", [])
            if not results:
                return self
            
            res_obj = results[0]
            if res_obj.get("type") == "error":
                err_msg = res_obj.get("error", {}).get("message", "Turso query error")
                raise RuntimeError(f"Turso Error: {err_msg}")

            response = res_obj.get("response", {})
            result = response.get("result", {})

            # Process affected rows and last insert ID
            self.rowcount = result.get("affected_row_count", 0)
            last_id = result.get("last_insert_rowid")
            self.lastrowid = int(last_id) if last_id is not None else None

            cols_info = result.get("cols", [])
            cols = [c["name"] for c in cols_info]
            if cols:
                self.description = [(c["name"], None, None, None, None, None, None) for c in cols_info]

            raw_rows = result.get("rows", [])
            for r in raw_rows:
                parsed = [_parse_val(v) for v in r]
                self._rows.append(TursoRow(cols, parsed))

        except Exception as err:
            raise RuntimeError(f"Turso Cloud Connection Error: {err}") from err

        return self

    def executemany(self, sql: str, seq_of_parameters: Sequence[Sequence[Any]]) -> "TursoCursor":
        self._rows = []
        self._idx = 0
        self.description = None

        if not seq_of_parameters:
            return self

        endpoint = self.connection.pipeline_url
        headers = {"Authorization": f"Bearer {self.connection.auth_token}"}

        requests_list = []
        for params in seq_of_parameters:
            args = [_format_param(p) for p in params] if params else []
            requests_list.append({
                "type": "execute",
                "stmt": {
                    "sql": sql,
                    "args": args
                }
            })

        payload = {"requests": requests_list}

        try:
            resp = _http_session.post(endpoint, json=payload, headers=headers, timeout=10)
            if resp.status_code != 200:
                raise RuntimeError(f"Turso Cloud HTTP Error {resp.status_code}: {resp.text}")

            data = resp.json()
            results = data.get("results", [])
            total_affected = 0
            last_id = None
            for res_obj in results:
                if res_obj.get("type") == "error":
                    err_msg = res_obj.get("error", {}).get("message", "Turso query error")
                    raise RuntimeError(f"Turso Error in executemany: {err_msg}")
                res = res_obj.get("response", {}).get("result", {})
                total_affected += res.get("affected_row_count", 0)
                if res.get("last_insert_rowid") is not None:
                    last_id = res.get("last_insert_rowid")

            self.rowcount = total_affected
            self.lastrowid = int(last_id) if last_id is not None else None

        except Exception as err:
            raise RuntimeError(f"Turso Cloud Connection Error: {err}") from err

        return self

    def fetchone(self) -> Optional[TursoRow]:
        if self._idx < len(self._rows):
            row = self._rows[self._idx]
            self._idx += 1
            return row
        return None

    def fetchall(self) -> List[TursoRow]:
        remaining = self._rows[self._idx:]
        self._idx = len(self._rows)
        return remaining

    def fetchmany(self, size: int = 1) -> List[TursoRow]:
        end = min(self._idx + size, len(self._rows))
        res = self._rows[self._idx:end]
        self._idx = end
        return res

    def close(self):
        self._rows = []
        self._idx = 0


class TursoCloudConnection:
    """
    SQLite-compatible connection class for Turso Cloud Database.
    No local database file is used.
    """
    def __init__(self, db_url: str, auth_token: str):
        if not db_url or not auth_token:
            raise ValueError(
                "Missing Turso Cloud DB credentials! TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in environment variables."
            )
        self.db_url = db_url
        self.auth_token = auth_token
        
        # Convert libsql:// or https:// to https://.../v2/pipeline
        clean_url = db_url.strip()
        if clean_url.startswith("libsql://"):
            clean_url = clean_url.replace("libsql://", "https://")
        if not clean_url.startswith("https://") and not clean_url.startswith("http://"):
            clean_url = f"https://{clean_url}"
        clean_url = clean_url.rstrip("/")
        if not clean_url.endswith("/v2/pipeline"):
            clean_url = f"{clean_url}/v2/pipeline"
        self.pipeline_url = clean_url
        self.row_factory = TursoRow

    def cursor(self) -> TursoCursor:
        return TursoCursor(self)

    def execute(self, sql: str, parameters: Sequence[Any] = ()) -> TursoCursor:
        cur = self.cursor()
        return cur.execute(sql, parameters)

    def executemany(self, sql: str, seq_of_parameters: Sequence[Sequence[Any]]) -> TursoCursor:
        cur = self.cursor()
        return cur.executemany(sql, seq_of_parameters)

    def commit(self):
        pass  # Auto-committed per pipeline call

    def rollback(self):
        pass  # Auto-handled per pipeline call

    def close(self):
        pass


def create_connection(db_target: Optional[str] = None) -> TursoCloudConnection:
    """
    Creates connection strictly to Turso Cloud Database.
    """
    url = os.getenv("TURSO_DATABASE_URL", TURSO_DATABASE_URL).strip()
    token = os.getenv("TURSO_AUTH_TOKEN", TURSO_AUTH_TOKEN).strip()
    if not url or not token:
        raise RuntimeError("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables must be defined!")
    return TursoCloudConnection(db_url=url, auth_token=token)


def get_db() -> Generator[TursoCloudConnection, None, None]:
    """
    Dependency generator for FastAPI routes.
    Ensures connection is closed after request.
    """
    conn = create_connection()
    try:
        yield conn
    finally:
        conn.close()