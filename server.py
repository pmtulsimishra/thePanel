#!/usr/bin/env python3
"""
Dev server for The Panel.
Serves static files + POST /api/claude proxies to Anthropic API.

Usage:
  ANTHROPIC_API_KEY=sk-ant-... python3 server.py
"""
import http.server
import json
import os
import urllib.request
import urllib.error
from pathlib import Path

PORT     = 4322
BASE_DIR = Path(__file__).parent.resolve()
API_KEY  = os.environ.get("ANTHROPIC_API_KEY", "")


class PanelHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_POST(self):
        if self.path == "/api/claude":
            self._handle_claude()
        else:
            self.send_error(404, "Not found")

    def _handle_claude(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length))
        system = body.get("system", "")
        doc    = body.get("document", "")

        if not API_KEY:
            self._json({"error": "ANTHROPIC_API_KEY not set on server"}, 500)
            return

        payload = json.dumps({
            "model": "claude-opus-4-7",
            "max_tokens": 1024,
            "system": system,
            "messages": [{"role": "user", "content": f"Please review the following document:\n\n{doc}"}],
        }).encode()

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "x-api-key":         API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
                text = data["content"][0]["text"]
                self._json({"text": text})
        except urllib.error.HTTPError as e:
            err = json.loads(e.read()).get("error", {}).get("message", str(e))
            self._json({"error": err}, e.code)
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if len(args) >= 2 and args[1] in ("200", "304"):
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    os.chdir(BASE_DIR)
    if not API_KEY:
        print("⚠️  ANTHROPIC_API_KEY not set — set it before starting:")
        print("   export ANTHROPIC_API_KEY=sk-ant-...")
    with http.server.HTTPServer(("", PORT), PanelHandler) as server:
        print(f"🎭  The Panel  →  http://localhost:{PORT}")
        print(f"📄  Reviewer  →  http://localhost:{PORT}/reviewer.html")
        print("    Ctrl+C to stop.\n")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n👋  Server stopped.")
