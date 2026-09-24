#!/usr/bin/env python3
"""Loopback-only PaperCode server. Uses Apple's on-device OCR; no cloud credentials."""
import argparse
import json
import platform
from pathlib import Path
import socket
import sys
import subprocess
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
MAX_IMAGE_BYTES = 8 * 1024 * 1024
OCR_TIMEOUT = 30


def prepare_engine():
    if platform.system() != "Darwin":
        return None
    source = ROOT / "native/Recognize.swift"
    runtime = ROOT / ".runtime"
    binary = runtime / "papercode-vision"
    runtime.mkdir(exist_ok=True)
    if not binary.exists() or binary.stat().st_mtime < source.stat().st_mtime:
        print("Preparing on-device handwriting recognition (first launch only)…", flush=True)
        subprocess.run(["swiftc", "-O", "-module-cache-path", str(runtime / "swift-cache"),
                        str(source), "-o", str(binary)], check=True, timeout=180)
    return binary


class PaperCodeServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, engine):
        self.engine = engine
        self.ocr_lock = threading.Lock()
        super().__init__(address, Handler)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "dist"), **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, fmt, *args):
        # Never log images, OCR text, request bodies, or arbitrary request paths.
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def reply(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # The user cancelled; the bounded subprocess still terminates.

    def valid_host(self):
        port = self.server.server_port
        return self.headers.get("Host") in {f"127.0.0.1:{port}", f"localhost:{port}"}

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403, {"error": "Invalid host"})
        if urlsplit(self.path).path == "/api/health":
            return self.reply(200, {"service": "papercode", "engine": "apple-vision" if self.server.engine else None,
                                    "localOnly": True, "maxImageBytes": MAX_IMAGE_BYTES})
        if urlsplit(self.path).path.startswith("/api/"):
            return self.reply(404, {"error": "Unknown endpoint"})
        return super().do_GET()

    def do_POST(self):
        if not self.valid_host():
            return self.reply(403, {"error": "Invalid host"})
        if urlsplit(self.path).path != "/api/ocr":
            return self.reply(404, {"error": "Unknown endpoint"})
        expected_origin = f"http://{self.headers.get('Host')}"
        if self.headers.get("Origin") not in (None, expected_origin) or self.headers.get("X-PaperCode-Request") != "scan":
            return self.reply(403, {"error": "Only the local PaperCode page may scan images"})
        if self.headers.get("Content-Type") not in {"image/png", "image/jpeg", "image/webp"}:
            return self.reply(415, {"error": "Expected a PNG, JPEG, or WebP image"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 0 < size <= MAX_IMAGE_BYTES or self.headers.get("Transfer-Encoding"):
            return self.reply(413, {"error": "Image must be between 1 byte and 8 MB"})
        if not self.server.engine:
            return self.reply(503, {"error": "Handwriting engine requires macOS and Swift Command Line Tools"})
        if not self.server.ocr_lock.acquire(blocking=False):
            return self.reply(429, {"error": "Một ảnh đang được xử lý. Hãy thử lại sau vài giây."})
        try:
            image = self.rfile.read(size)
            if len(image) != size:
                return self.reply(400, {"error": "Incomplete image"})
            result = subprocess.run([str(self.server.engine)], input=image, capture_output=True, timeout=OCR_TIMEOUT)
            if result.returncode:
                return self.reply(422, {"error": "Bộ nhận dạng trên máy chưa đọc được ảnh. Hãy chọn lại ảnh hoặc quét lại."})
            self.reply(200, json.loads(result.stdout))
        except subprocess.TimeoutExpired:
            self.reply(504, {"error": "Nhận dạng quá 30 giây. Đã dừng xử lý; bạn có thể thử lại."})
        except (socket.timeout, ValueError, OSError):
            self.reply(400, {"error": "Không thể xử lý ảnh này."})
        finally:
            self.server.ocr_lock.release()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    try:
        engine = prepare_engine()
        server = PaperCodeServer(("127.0.0.1", args.port), engine)
    except (OSError, subprocess.SubprocessError) as error:
        print(f"Không khởi động được PaperCode: {error}\n"
              "Trên Mac cần Swift Command Line Tools (xcode-select --install). "
              "Nếu cổng đang được dùng, tắt phiên PaperCode cũ hoặc dùng --port 4174.", file=sys.stderr)
        raise SystemExit(1)
    print(f"PaperCode: http://127.0.0.1:{server.server_port}/ · "
          + ("Apple Vision ready; images stay on this Mac" if engine else "Browser OCR only; handwriting unavailable"), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
