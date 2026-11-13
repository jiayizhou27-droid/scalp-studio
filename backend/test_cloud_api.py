import io
import os
import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from PIL import Image
from .cloud_api import create_app, sign_job, verify_job


class CloudGatewayTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {'SCALP_API_KEY': 'test-only-service-key'})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.submissions = []
        self.output = {'result': {'schema': 'scalp-reconstruction-v2'}}
        def submit(images):
            self.submissions.append(images)
            return 'fc-test'
        def retrieve(call_id):
            self.assertEqual(call_id, 'fc-test')
            if isinstance(self.output, Exception):
                raise self.output
            return self.output
        self.app = create_app(submit, retrieve)
        self.routes = {r.path: r.endpoint for r in self.app.routes}

    def files(self):
        stream = io.BytesIO()
        Image.new('RGB', (100, 100)).save(stream, format='PNG')
        return [UploadFile(file=io.BytesIO(stream.getvalue()), filename=f'{i}.png') for i in range(3)]

    def test_authorization_blocks_gpu_submission(self):
        files = self.files()
        with self.assertRaises(HTTPException) as caught:
            self.routes['/jobs'](files, 'wrong')
        self.assertEqual(caught.exception.status_code, 401)
        self.assertEqual(self.submissions, [])
        self.assertTrue(all(item.file.closed for item in files))

    def test_submit_and_poll(self):
        files = self.files()
        response = self.routes['/jobs'](files, 'test-only-service-key')
        self.assertEqual(response.status_code, 202)
        self.assertEqual(len(self.submissions[0]), 3)
        self.assertTrue(all(item.file.closed for item in files))
        import json
        token = json.loads(response.body)['job_id']
        self.output = TimeoutError()
        self.assertEqual(self.routes['/jobs/{token}'](token, 'test-only-service-key').status_code, 202)
        self.output = {'result': {'schema': 'scalp-reconstruction-v2'}}
        self.assertEqual(self.routes['/jobs/{token}'](token, 'test-only-service-key')['schema'], 'scalp-reconstruction-v2')

    def test_invalid_images_never_launch_gpu(self):
        files = [UploadFile(file=io.BytesIO(b'bad'), filename='bad.png') for _ in range(3)]
        with self.assertRaises(HTTPException) as caught:
            self.routes['/jobs'](files, 'test-only-service-key')
        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(self.submissions, [])

    def test_job_tokens_cannot_be_forged_or_expired(self):
        token = sign_job('fc-test', int(time.time()) + 60)
        self.assertEqual(verify_job(token), 'fc-test')
        for invalid in [token + '0', token.replace('fc-test', 'fc-other'), sign_job('fc-test', 1), 'bad']:
            with self.assertRaises(HTTPException):
                verify_job(invalid)

    def test_sanitized_worker_failure(self):
        self.output = {'error': 'GPU memory exhausted', 'status_code': 503}
        with self.assertRaises(HTTPException) as caught:
            self.routes['/jobs/{token}'](sign_job('fc-test', int(time.time()) + 60), 'test-only-service-key')
        self.assertEqual(caught.exception.status_code, 503)


if __name__ == '__main__':
    unittest.main()
