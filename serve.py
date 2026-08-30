#!/usr/bin/env python3
"""Static file server with Cache-Control: no-cache — always fresh UI."""
import http.server
import socketserver

PORT = 8777


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with ThreadingTCPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
        print(f"Serving http://0.0.0.0:{PORT} (no-cache)")
        httpd.serve_forever()
