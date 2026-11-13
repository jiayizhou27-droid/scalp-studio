"""Measured-view geometry processing; never substitutes a template head."""
import numpy as np


def pack_geometry(world, rgb, masks, confidence, first_extrinsic, stride=3):
    world = np.asarray(world, dtype=np.float32)
    confidence = np.asarray(confidence)
    if confidence.ndim == 4:
        confidence = confidence[..., 0]
    if world.shape[:-1] != masks.shape or confidence.shape != masks.shape:
        raise ValueError('Geometry and segmentation must have identical pixel alignment')
    valid = (masks > .75) & np.isfinite(world).all(-1) & np.isfinite(confidence)
    if valid.sum() < 100:
        raise ValueError('Too few foreground pixels; inspect head crops and cutouts')
    threshold = np.quantile(confidence[valid], .25)
    valid &= confidence >= threshold
    sampled = valid[:, ::stride, ::stride]
    points_grid = world[:, ::stride, ::stride]
    colors_grid = rgb[:, ::stride, ::stride]
    points = points_grid[sampled]
    colors = colors_grid[sampled]
    if len(points) < 100:
        raise ValueError('Insufficient reconstructed head points; add overlapping views')
    # VGGT world is relative to first camera. Convert to right/up/toward-camera.
    ext = np.asarray(first_extrinsic)
    points = points @ ext[:, :3].T + ext[:, 3]
    points *= np.array([1, -1, -1], dtype=np.float32)
    lo, hi = np.quantile(points, [.01, .99], axis=0)
    keep = ((points >= lo - (hi-lo)*.25) & (points <= hi+(hi-lo)*.25)).all(1)
    points, colors = points[keep], colors[keep]
    span = float(np.max(hi-lo))
    if not np.isfinite(span) or span < 1e-8:
        raise ValueError('Degenerate reconstruction')
    center = (lo+hi)/2
    points = (points-center) * (2/span)
    # Fuse observations into small voxels; average source colors per 3D cell.
    cells = np.floor(points / .006).astype(np.int32)
    _, inv = np.unique(cells, axis=0, return_inverse=True)
    count = np.bincount(inv)
    fused = np.stack([np.bincount(inv, weights=points[:,i])/count for i in range(3)], 1)
    color = np.stack([np.bincount(inv, weights=colors[:,i])/count for i in range(3)], 1)
    if len(fused) > 180000:
        index = np.linspace(0, len(fused)-1, 180000, dtype=np.int32)
        fused, color = fused[index], color[index]
    return {
        'schema': 'scalp-reconstruction-v2',
        'method': 'VGGT-1B-Commercial + BiRefNet-portrait',
        'representation': 'colored_point_cloud',
        'positions': np.round(fused, 5).ravel().tolist(),
        'colors': np.clip(np.rint(color*255), 0, 255).astype(np.uint8).ravel().tolist(),
        'view_count': len(world), 'point_count': len(fused),
        'metric_scale': False,
        'warnings': ['Observed-view point cloud; not a watertight mesh or validated head scan.',
                     'Unobserved or hair-covered scalp is not recovered.',
                     'No subject-specific accuracy benchmark has been run.']
    }
