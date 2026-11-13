"""Self-hosted reconstruction service. No hosted service is implied by this source."""
import base64
import io
import os
import secrets
import tempfile
import threading
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from .geometry import pack_geometry

Image.MAX_IMAGE_PIXELS = 24_000_000
app = FastAPI(title='Scalp Studio · CVPR reconstruction', version='2.0')
origins = os.getenv('SCALP_ORIGINS', 'https://jiayizhou27-droid.github.io,http://127.0.0.1:8765').split(',')
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET','POST'], allow_headers=['X-API-Key'])
lock = threading.Lock()
model = None
session = None
MAX_FILE = 12 * 1024 * 1024


def authorized(key):
    secret = os.getenv('SCALP_API_KEY')
    if not secret:
        raise HTTPException(503, 'Set SCALP_API_KEY before starting the service')
    if not key or not secrets.compare_digest(secret, key):
        raise HTTPException(401, 'Invalid reconstruction service key')


@app.get('/health')
def health():
    import importlib.util
    return {'service':'scalp-reconstruction-v2', 'configured':bool(os.getenv('SCALP_API_KEY')),
            'model_loaded':model is not None, 'checkpoint':'facebook/VGGT-1B-Commercial',
            'vggt_installed':importlib.util.find_spec('vggt') is not None,
            'note':'Readiness and successful GPU inference are separate checks.'}


def square_head(image):
    # Browser sends an explicit head crop. Keep its complete extent: no center crop.
    edge = max(image.size)
    square = Image.new('RGBA', (edge,edge), (255,255,255,0))
    square.paste(image, ((edge-image.width)//2,(edge-image.height)//2))
    return square.resize((518,518), Image.Resampling.LANCZOS)


def infer(images):
    global model, session
    import torch
    from rembg import new_session, remove
    from vggt.models.vggt import VGGT
    from vggt.utils.load_fn import load_and_preprocess_images
    from vggt.utils.pose_enc import pose_encoding_to_extri_intri
    from vggt.utils.geometry import unproject_depth_map_to_point_map

    if not torch.cuda.is_available():
        raise RuntimeError('A CUDA inference worker is required for this deployment')
    # Segmentation runs on CPU so it does not occupy VGGT GPU memory.
    if session is None:
        session = new_session('birefnet-portrait', providers=['CPUExecutionProvider'])
    previews, masks, paths = [], [], []
    with tempfile.TemporaryDirectory(prefix='scalp-') as temporary:
        for i,image in enumerate(images):
            cutout = remove(image.convert('RGB'), session=session).convert('RGBA')
            square = square_head(cutout)
            mask = np.asarray(square.getchannel('A'), dtype=np.float32)/255
            if (mask > .75).sum() < 2000:
                raise ValueError(f'Foreground segmentation failed in view {i+1}; recrop the complete head')
            masks.append(mask)
            buff = io.BytesIO()
            square.resize((220,220)).save(buff, format='PNG')
            previews.append(base64.b64encode(buff.getvalue()).decode('ascii'))
            background = Image.new('RGBA', square.size, (255,255,255,255))
            background = Image.alpha_composite(background, square).convert('RGB')
            path = Path(temporary)/f'{i:03d}.png'
            background.save(path)
            paths.append(str(path))
        if model is None:
            # The original VGGT-1B checkpoint is NOT used: commercial use requires
            # access to this specific gated commercial checkpoint.
            model = VGGT.from_pretrained('facebook/VGGT-1B-Commercial').eval().to('cuda')
        tensor = load_and_preprocess_images(paths, mode='pad').to('cuda')
        if tuple(tensor.shape[-2:]) != (518,518):
            raise RuntimeError('Unexpected model preprocessing; mask alignment cannot be guaranteed')
        dtype = torch.bfloat16 if torch.cuda.get_device_capability()[0] >= 8 else torch.float16
        try:
            with torch.inference_mode(), torch.autocast(device_type='cuda', dtype=dtype):
                pred = model(tensor)
            ext, intr = pose_encoding_to_extri_intri(pred['pose_enc'], tensor.shape[-2:])
            depth = pred['depth'][0].float().cpu().numpy()
            extrinsic = ext[0].float().cpu().numpy()
            intrinsic = intr[0].float().cpu().numpy()
            confidence = pred['depth_conf'][0].float().cpu().numpy()
            world = unproject_depth_map_to_point_map(depth, extrinsic, intrinsic)
            rgb = tensor.float().cpu().numpy().transpose(0,2,3,1)
            result = pack_geometry(world, rgb, np.stack(masks), confidence, extrinsic[0])
            result['cutouts_png'] = previews
            return result
        finally:
            if 'pred' in locals(): del pred
            del tensor
            torch.cuda.empty_cache()


@app.post('/reconstruct')
def reconstruct(files: list[UploadFile] = File(...), x_api_key: str | None = Header(None)):
    authorized(x_api_key)
    if not 3 <= len(files) <= 16:
        raise HTTPException(422, 'Upload 3–16 overlapping head crops; first image must be upright frontal')
    if not lock.acquire(blocking=False):
        raise HTTPException(429, 'Reconstruction worker is busy; try again after current job')
    try:
        images=[]
        total = 0
        for item in files:
            raw=item.file.read(MAX_FILE+1)
            total+=len(raw)
            if len(raw)>MAX_FILE or total>80*1024*1024:
                raise HTTPException(413, 'Upload exceeds per-image or total byte limit')
            try:
                image=ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
                image.load()
                if min(image.size)<100:
                    raise ValueError('Head crop is too small')
                images.append(image.convert('RGB'))
            except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
                raise HTTPException(422, 'Invalid image; use a clear JPG or PNG head crop')
        return JSONResponse(infer(images))
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        # Avoid returning server paths, credentials or model-provider responses.
        text=str(exc).lower()
        if 'out of memory' in text:
            message='GPU memory exhausted; use fewer photos or a larger GPU'
        elif any(x in text for x in ['gated','401','403','authorized']):
            message='Commercial VGGT checkpoint access is missing; configure approved HF_TOKEN on worker'
        else:
            message='Inference could not complete; inspect worker logs and model installation'
        import logging
        logging.getLogger('scalp').exception('Reconstruction failed')
        raise HTTPException(503, message)
    finally:
        for item in files: item.file.close()
        lock.release()


# Serve only the two public assets, not the backend directory or local env files.
from fastapi.responses import FileResponse


@app.get('/', include_in_schema=False)
def ui():
    return FileResponse(Path(__file__).resolve().parents[1]/'index.html')


@app.get('/app.js', include_in_schema=False)
def ui_script():
    return FileResponse(Path(__file__).resolve().parents[1]/'app.js', media_type='application/javascript')
