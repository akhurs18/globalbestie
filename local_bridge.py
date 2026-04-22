#!/usr/bin/env python3
"""
Simple local server to bridge admin.html button to fast_push.py.
Run this script: python3 local_bridge.py
Then click the button in admin.html.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import subprocess
import json
import os

class BridgeHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-type")
        self.end_headers()

    def do_POST(self):
        if self.path == '/run_scraper':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Run fast_push.py
            script_path = os.path.join(os.path.dirname(__file__), 'fast_push.py')
            try:
                # Capture output to return to frontend
                result = subprocess.run(
                    ['python3', script_path], 
                    capture_output=True, 
                    text=True, 
                    timeout=300
                )
                response = {
                    'status': 'success' if result.returncode == 0 else 'error',
                    'stdout': result.stdout,
                    'stderr': result.stderr
                }
            except Exception as e:
                response = {'status': 'error', 'error': str(e)}
                
            self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run(port=8080):
    server_address = ('', port)
    httpd = HTTPServer(server_address, BridgeHandler)
    print(f"🌉 Bridge server running on http://localhost:{port}")
    print("Keep this window open to allow admin.html to run scraper scripts.")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
