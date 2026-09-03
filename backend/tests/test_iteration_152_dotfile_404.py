# Iteration 152 retest: SPA catch-all must 404 (JSON) for dot-file paths,
# still serve index.html for extension-less SPA routes, and still serve real bundles.
import http.client
import re

HOST = "localhost"
PORT = 8001


def _raw_get(path):
    """Send the path literally (no client-side normalisation)."""
    conn = http.client.HTTPConnection(HOST, PORT, timeout=15)
    conn.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
    conn.putheader("Host", f"{HOST}:{PORT}")
    conn.endheaders()
    resp = conn.getresponse()
    body = resp.read()
    ctype = resp.getheader("content-type") or ""
    status = resp.status
    conn.close()
    return status, ctype, body


DOTFILES = [
    "/.env",
    "/backend/.env",
    "/a/b/.env",
    "/....//....//backend/.env",
    "/..%5c..%5cbackend/.env",
]

SPA_ROUTES = ["/", "/dashboard", "/items"]

SECRETS = [b"MONGO_URL", b"JWT_SECRET", b"ADMIN_PASSWORD", b"DB_NAME"]


class TestDotFile404:
    def test_dotfile_paths_return_404_json(self):
        for path in DOTFILES:
            status, ctype, body = _raw_get(path)
            assert status == 404, f"{path} -> {status} ({ctype}) {body[:120]!r}"
            assert "application/json" in ctype, f"{path} content-type={ctype}"
            assert b"Not found" in body, f"{path} body={body[:200]!r}"
            for marker in SECRETS:
                assert marker not in body, f"{path} leaked {marker!r}"

    def test_spa_routes_still_serve_index_html(self):
        for path in SPA_ROUTES:
            status, ctype, body = _raw_get(path)
            assert status == 200, f"{path} -> {status}"
            assert "text/html" in ctype, f"{path} content-type={ctype}"
            assert b"<div id=\"root\">" in body or b"<div id=root>" in body, f"{path} not index.html"

    def test_real_bundle_from_index_still_200(self):
        status, _ctype, body = _raw_get("/")
        assert status == 200
        assets = re.findall(rb'(?:src|href)="(/static/[^"]+)"', body)
        assert assets, "no /static asset referenced by index.html"
        for asset in {a.decode() for a in assets}:
            st, ct, b = _raw_get(asset)
            assert st == 200, f"{asset} -> {st}"
            assert len(b) > 0, f"{asset} empty"
            assert "json" not in ct, f"{asset} unexpectedly JSON ({ct})"
