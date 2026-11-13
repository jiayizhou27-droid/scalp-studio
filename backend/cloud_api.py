"""Authenticated, asynchronous gateway; GPU work is supplied by the deployer."""
import hashlib
import hmac
import io
import os
import time
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, UnidentifiedImageError

from .app import MAX_FILE, authorized


def sign_job(call_id, expires):
    payload = f'{call_id}.{expires}'
    signature = hmac.new(os.environ['SCALP_API_KEY'].encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f'{payload}.{signature}'


def verify_job(token):
    try:
        call_id, expires, signature = token.split('.')
        expected = sign_job(call_id, int(expires)).rsplit('.', 1)[1]
        if not hmac.compare_digest(signature, expected) or int(expires) < time.time():
            raise ValueError
        return call_id
    except (ValueError, KeyError):
        raise HTTPException(404, 'Job not found or expired')


def create_app(submit, retrieve):
    app = FastAPI(title='Scalp Studio GPU gateway', docs_url=None, redoc_url=None)
    app.add_middleware(CORSMiddleware,
        allow_origins=os.getenv('SCALP_ORIGINS', 'https://jiayizhou27-droid.github.io').split(','),
        allow_methods=['GET', 'POST'], allow_headers=['X-API-Key'])

    @app.get('/health')
    def health():
        return {'service': 'scalp-reconstruction-v2', 'job_api': True,
                'configured': bool(os.getenv('SCALP_API_KEY')),
                'checkpoint': 'facebook/VGGT-1B-Commercial',
                'model_loaded': False, 'inference_verified': False,
                'note': 'Gateway available; successful GPU inference has not been established by this check.'}

    @app.post('/jobs')
    def start(files: list[UploadFile] = File(...), x_api_key: str | None = Header(None)):
        try:
            authorized(x_api_key)
            if not 3 <= len(files) <= 16:
                raise HTTPException(422, 'Upload 3–16 overlapping head crops')
            payload, total = [], 0
            for item in files:
                raw = item.file.read(MAX_FILE + 1)
                total += len(raw)
                if len(raw) > MAX_FILE or total > 80 * 1024 * 1024:
                    raise HTTPException(413, 'Upload exceeds byte limit')
                try:
                    with Image.open(io.BytesIO(raw)) as image:
                        if min(image.size) < 100:
                            raise ValueError
                        image.verify()
                except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
                    raise HTTPException(422, 'Invalid head image')
                payload.append(raw)
            call_id = submit(payload)
            token = sign_job(call_id, int(time.time()) + 3600)
            return JSONResponse({'job_id': token, 'status': 'pending'}, status_code=202)
        finally:
            for item in files:
                item.file.close()

    @app.get('/jobs/{token}')
    def result(token: str, x_api_key: str | None = Header(None)):
        authorized(x_api_key)
        call_id = verify_job(token)
        try:
            output = retrieve(call_id)
        except TimeoutError:
            return JSONResponse({'status': 'pending'}, status_code=202)
        except Exception:
            raise HTTPException(503, 'GPU job unavailable; check worker logs before retrying')
        if output.get('error'):
            raise HTTPException(output.get('status_code', 503), output['error'])
        return output['result']

    @app.get('/', include_in_schema=False)
    def ui():
        return FileResponse(Path(__file__).resolve().parents[1] / 'index.html')

    @app.get('/app.js', include_in_schema=False)
    def script():
        return FileResponse(Path(__file__).resolve().parents[1] / 'app.js', media_type='application/javascript')

    return app
