"""Deploy from repository root: python -m modal deploy modal_deploy.py."""
from pathlib import Path
import modal

ROOT = Path(__file__).resolve().parent
app = modal.App('scalp-studio')
secret = modal.Secret.from_name('scalp-studio', required_keys=['HF_TOKEN', 'SCALP_API_KEY'])
cache = modal.Volume.from_name('scalp-studio-model-cache', create_if_missing=True)

base = (modal.Image.debian_slim(python_version='3.11')
    .pip_install('fastapi>=0.115,<1', 'python-multipart>=0.0.18', 'numpy>=1.26,<3', 'Pillow>=10.4')
    .add_local_dir(ROOT / 'backend', '/root/backend', ignore=['__pycache__', '*.pyc'])
    .add_local_file(ROOT / 'index.html', '/root/index.html')
    .add_local_file(ROOT / 'app.js', '/root/app.js')
    .add_local_file(ROOT / 'scan-import.js', '/root/scan-import.js')
    .add_local_file(ROOT / 'facescape-local.js', '/root/facescape-local.js')
    .add_local_file(ROOT / 'facescape-ui.js', '/root/facescape-ui.js')
    .add_local_file(ROOT / 'face-topology.js', '/root/face-topology.js')
    .add_local_file(ROOT / 'photo-face.js', '/root/photo-face.js')
    .add_local_file(ROOT / 'photo-face-ui.js', '/root/photo-face-ui.js'))
gpu_image = (modal.Image.debian_slim(python_version='3.11')
    .apt_install('git', 'libglib2.0-0', 'libgl1')
    .pip_install('torch==2.8.0', 'torchvision==0.23.0')
    .pip_install_from_requirements(str(ROOT / 'backend' / 'requirements.txt'))
    .pip_install('git+https://github.com/facebookresearch/vggt.git@a288dd0f14786c93483e45524328726ab7b1b4ce')
    .env({'HF_HOME': '/model-cache/huggingface', 'U2NET_HOME': '/model-cache/rembg'})
    .add_local_dir(ROOT / 'backend', '/root/backend', ignore=['__pycache__', '*.pyc']))


@app.function(image=gpu_image, gpu='A100-80GB', cpu=4, memory=32768,
              timeout=1800, max_containers=1, min_containers=0, scaledown_window=60,
              secrets=[secret], volumes={'/model-cache': cache})
def reconstruct_job(images):
    import io
    import json
    import os
    from fastapi import HTTPException, UploadFile
    from backend.app import reconstruct
    files = [UploadFile(file=io.BytesIO(data), filename=f'head-{i}.png') for i, data in enumerate(images)]
    try:
        response = reconstruct(files=files, x_api_key=os.environ['SCALP_API_KEY'])
        return {'result': json.loads(response.body)}
    except HTTPException as exc:
        return {'error': exc.detail, 'status_code': exc.status_code}
    finally:
        cache.commit()


@app.function(image=base, secrets=[secret], max_containers=1, min_containers=0, timeout=120)
@modal.asgi_app()
def web():
    from backend.cloud_api import create_app
    return create_app(
        lambda images: reconstruct_job.spawn(images).object_id,
        lambda call_id: modal.FunctionCall.from_id(call_id).get(timeout=0),
    )
