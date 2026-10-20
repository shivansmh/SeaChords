"""
Lightweight embedded HTTP server for the SeaChords Web Interface.
Serves live MJPEG camera feed, state API, configuration updates, and web assets.
"""
import os
import json
import time
import logging
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from typing import Optional, Dict, Any
import cv2

logger = logging.getLogger("seachords.web")

class SeaChordsWebState:
    """Thread-safe state shared between SeaChords engine and web clients."""
    def __init__(self):
        self.lock = threading.Lock()
        self.latest_jpeg: Optional[bytes] = None
        self.state: Dict[str, Any] = {
            "tonic": 0,
            "mode": "major",
            "degree": 1,
            "octave_zone": 0,
            "level": 0,
            "chord_name": "MUTED",
            "active_notes": [],
            "hands_present": False,
            "fps": 30.0
        }
        self.config_callbacks = []
        self.panic_callbacks = []

    def update_frame(self, bgr_frame):
        ret, jpeg = cv2.imencode('.jpg', bgr_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if ret:
            with self.lock:
                self.latest_jpeg = jpeg.tobytes()

    def update_state(self, **kwargs):
        with self.lock:
            self.state.update(kwargs)

    def get_state(self) -> Dict[str, Any]:
        with self.lock:
            return dict(self.state)

    def get_jpeg(self) -> Optional[bytes]:
        with self.lock:
            return self.latest_jpeg

class SeaChordsRequestHandler(BaseHTTPRequestHandler):
    web_state: SeaChordsWebState = None
    html_content: bytes = b""

    def log_message(self, format, *args):
        # Suppress noisy HTTP request logging
        pass

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(self.html_content)))
            self.end_headers()
            self.wfile.write(self.html_content)

        elif self.path == "/api/state":
            data = json.dumps(self.web_state.get_state()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)

        elif self.path.startswith("/video_feed"):
            self.send_response(200)
            self.send_header("Age", "0")
            self.send_header("Cache-Control", "no-cache, private")
            self.send_header("Pragma", "no-cache")
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=FRAME")
            self.end_headers()

            try:
                while True:
                    jpeg = self.web_state.get_jpeg()
                    if jpeg:
                        self.wfile.write(b"--FRAME\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n")
                        self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode("utf-8"))
                        self.wfile.write(jpeg)
                        self.wfile.write(b"\r\n")
                    time.sleep(0.033) # ~30 fps stream
            except (ConnectionResetError, BrokenPipeError):
                pass

        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        if self.path == "/api/panic":
            for cb in self.web_state.panic_callbacks:
                cb()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')

        elif self.path == "/api/config":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                cfg = json.loads(body)
                for cb in self.web_state.config_callbacks:
                    cb(cfg)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as e:
                self.send_error(400, str(e))
        else:
            self.send_error(404)

class WebServer:
    def __init__(self, web_state: SeaChordsWebState, host: str = "127.0.0.1", port: int = 8080):
        self.web_state = web_state
        self.host = host
        self.port = port
        self.server: Optional[ThreadingHTTPServer] = None
        self.thread: Optional[threading.Thread] = None

        # Load HTML
        html_path = os.path.join(os.path.dirname(__file__), "web", "index.html")
        with open(html_path, "rb") as f:
            SeaChordsRequestHandler.html_content = f.read()
        SeaChordsRequestHandler.web_state = self.web_state

    def start(self) -> str:
        # Try preferred port, if occupied try next ports
        for p in range(self.port, self.port + 10):
            try:
                self.server = ThreadingHTTPServer((self.host, p), SeaChordsRequestHandler)
                self.port = p
                break
            except OSError:
                continue

        if not self.server:
            raise RuntimeError(f"Could not bind WebServer on {self.host}:{self.port}")

        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        url = f"http://{self.host}:{self.port}"
        logger.info(f"SeaChords Web Interface running at {url}")
        return url

    def stop(self) -> None:
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None
