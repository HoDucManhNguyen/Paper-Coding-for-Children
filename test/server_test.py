import http.client
import importlib.util
import json
from pathlib import Path
import subprocess
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('papercode_server', Path(__file__).resolve().parents[1] / 'scripts/serve.py')
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = server_module.PaperCodeServer(('127.0.0.1', 0), Path('/test/engine'))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method='POST', path='/api/ocr', body=b'png-test', headers=None):
        port = self.server.server_port
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
        actual = {'Content-Type': 'image/png', 'X-PaperCode-Request': 'scan', 'Origin': f'http://127.0.0.1:{port}'}
        actual.update(headers or {})
        conn.request(method, path, body, actual)
        response = conn.getresponse()
        status, data = response.status, response.read()
        conn.close()
        return status, json.loads(data)

    def test_health_identifies_local_engine(self):
        status, data = self.request('GET', '/api/health')
        self.assertEqual(status, 200)
        self.assertEqual(data['engine'], 'apple-vision')
        self.assertTrue(data['localOnly'])

    def test_rejects_cross_origin_images(self):
        self.assertEqual(self.request(headers={'Origin': 'https://example.com'})[0], 403)

    def test_rejects_rebinding_host(self):
        self.assertEqual(self.request(headers={'Host': 'example.com'})[0], 403)

    def test_rejects_unmarked_requests(self):
        self.assertEqual(self.request(headers={'X-PaperCode-Request': ''})[0], 403)

    def test_rejects_non_image_and_oversized_requests(self):
        self.assertEqual(self.request(headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request(headers={'Content-Length': str(server_module.MAX_IMAGE_BYTES + 1)})[0], 413)

    def test_busy_does_not_queue_unbounded_ocr_jobs(self):
        self.server.ocr_lock.acquire()
        try:
            self.assertEqual(self.request()[0], 429)
        finally:
            self.server.ocr_lock.release()

    def test_image_is_piped_without_disk_storage(self):
        result = subprocess.CompletedProcess([], 0, b'{"engine":"apple-vision","passes":[]}', b'')
        with patch.object(server_module.subprocess, 'run', return_value=result) as run:
            status, data = self.request()
            self.assertEqual(status, 200)
            self.assertEqual(data['engine'], 'apple-vision')
            self.assertEqual(run.call_args.kwargs['input'], b'png-test')
            self.assertEqual(run.call_args.kwargs['timeout'], 30)

    def test_engine_failure_releases_lock(self):
        result = subprocess.CompletedProcess([], 1, b'', b'internal details')
        with patch.object(server_module.subprocess, 'run', return_value=result):
            self.assertEqual(self.request()[0], 422)
        self.assertFalse(self.server.ocr_lock.locked())

    def test_timeout_releases_lock_and_allows_retry(self):
        with patch.object(server_module.subprocess, 'run', side_effect=subprocess.TimeoutExpired('ocr', 30)):
            self.assertEqual(self.request()[0], 504)
        self.assertFalse(self.server.ocr_lock.locked())


if __name__ == '__main__':
    unittest.main()
