# Scalp Studio — 扫描导入与个体化纹发设计

默认流程已简化为：**现成工具扫描客户本人 → 导入 GLB / GLTF / 完整 ZIP → 圈画局部纹发区域**。无需部署 GPU、填写服务地址或配置模型密钥。网页没有自动从少量照片生成完整头部的能力，也不使用替代头模。

## 使用

1. 用现成摄影测量 / 扫描工具（例如 [Polycam](https://poly.cam/)）获取静止客户头部的真实扫描；不要使用 AI 文生三维功能。扫描在第三方服务中完成，需要其账号及客户授权。
2. 检查扫描是否变形、缺失，裁掉环境和肩膀，再导出 GLTF。平台的额度、导出权限及数据处理条款以其当前说明为准。
3. 在网页导入完整 ZIP 或 GLB；如果导出为 GLTF 文件组，同时选择模型、BIN 和贴图。完整 ZIP 最方便。文件总量限制为 180MB。
4. 旋转检查头型，以当前角度设正面，然后圈画额角、发缝、发际线等多个独立区域。PNG、JSON、PLY 导出保存至本机。

## 表示与边界

导入器在扫描网格表面按面积采样最多 150,000 个点，保留世界坐标变换与采样到的顶点颜色 / 基色贴图，用已有 WebGL 点云设计器渲染。不会生成头型，也不会将照片投射到通用头模。采样会丢失部分细节；无贴图或顶点颜色的材质会明确提示不能视为真实肤色。

模型应已裁切为头部。工具不自动分离完整扫描中的人体 / 背景，不自动分类裸露头皮和已有头发。头发遮挡的头皮无法从扫描恢复。当前是设计沟通原型，未验证头部测量精度或实际纹发效果。

扫描文件导入后在本机解析。首次使用从 esm.sh 加载固定版本的 Three.js 0.180.0、fflate 0.8.2 组件，Draco 模型会加载固定 1.5.7 解码器。模型与贴图不上传给组件提供方；GLTF 中的外部资源 URL 会被拒绝，只允许已选择的本机文件或内嵌资源。扫描平台自己的照片上传及处理是独立步骤。

支持静态 GLTF / GLB 网格及其中的点对象、普通基色贴图与 Draco。动画 / 骨骼 / 实例模型拒绝导入；KTX2、Meshopt 等额外压缩扩展未经支持验证，请改用普通 GLTF / GLB 导出。

## 验证

```sh
node --check scan-import.js
node --check app.js
node check-scan.cjs
node check.cjs
node check-url.cjs
node check-jobs.cjs
python -m unittest backend.test_geometry backend.test_cloud_api
```

本地静态检查、数据归一化、资源路径约束、原有渲染和任务检查通过。当前环境无法启动浏览器自动化，因此没有完成真实浏览器 GLTF / ZIP 端到端导入测试；也未完成真人头部扫描导入与效果验证。不要把现有测试表述为成功的真人扫描演示。

自建 GPU 流程仅在高级选项中保留，参见 [GPU_DEPLOY.md](GPU_DEPLOY.md)。它未部署，也不属于默认导入流程。

<details><summary>高级：原 VGGT 重建技术说明</summary>

# Scalp Studio V2 — 个体化纹发重建与设计

## Current status / 当前状态

This is a **research integration, not a validated head scanner**. The GitHub Pages frontend is deployable. The Python GPU service is supplied as source; **no inference endpoint or commercial checkpoint has been provisioned**, and no real-person model inference has been tested in this project. Do not describe the online frontend alone as a working scan service.

本版移除通用参数头模与二维照片投影。流程为：头部框选 → BiRefNet 去背景 → VGGT 相机/深度预测 → 只保留前景的三维点云 → 在真实重建点上圈画局部纹发区域。**没有推理结果就不显示替代头模。**

## Individual treatment design / 个体化设计

- 额角缺损（羊角秃）、发缝加密、发际线柔化、自然茸毛感只作为可调笔刷起点；不自动生成固定覆盖区。
- 在客户重建几何上圈画多个独立区域，分别设置密度概率、色素色调、点径与边缘柔化。可擦除、撤销、隐藏区域与重命名。
- 已有头发、裸露头皮、疤痕与发际线要由设计人员检查；本版**没有自动头皮语义分类或临床规划**。
- 色素点显示受点云采样密度影响，不代表真实毛囊位置或实际色素点间距。当前茸毛质感为视觉原型，未完成真人效果校准。

## Techniques and upstream sources

- [VGGT, CVPR 2025](https://github.com/facebookresearch/vggt): predicts cameras and depth; world-space points are reconstructed through the official depth unprojection utility. Code is not copied into this repository.
- [BiRefNet, CAAI AIR 2024](https://github.com/ZhengPeng7/BiRefNet): foreground segmentation, executed through [rembg](https://github.com/danielgatis/rembg)'s `birefnet-portrait` session. BiRefNet is not a CVPR paper.
- The GPU service loads **`facebook/VGGT-1B-Commercial` only**. The original `facebook/VGGT-1B` checkpoint is non-commercial and must not be substituted for customer services. Follow the upstream license and apply for commercial checkpoint access yourself; approval is not supplied by this project.

## Capture

Use 8–16 overlapping images of the same motionless head; the API accepts 3–16 for experimentation. First image must be upright frontal: its camera establishes the initial viewing axes. Move the camera around the person in small increments, with matching features between views; include oblique crown views and back. Avoid isolated 90-degree views, beauty filters, portrait blur, moving hair, harsh shine or changing light. Explicitly crop the whole head including ears, excluding torso. The segmentation stage removes background but does not independently locate the head.

No method here recovers the real scalp beneath occluding hair. More photos do not guarantee a complete or accurate head. Unobserved surfaces remain missing.

## Run a GPU worker

Use an isolated Python 3.11 environment on a CUDA-compatible machine. Install a matching PyTorch/torchvision CUDA build from the [official instructions](https://pytorch.org/get-started/locally/), then:

```sh
pip install -r backend/requirements.txt
pip install 'git+https://github.com/facebookresearch/vggt.git'
```

Dependencies above use upstream ranges, not a fully tested lockfile. Freeze the environment and upstream revisions after a successful deployment. No model weights are included.

Set `HF_TOKEN` on the worker after obtaining access to [VGGT-1B-Commercial](https://huggingface.co/facebook/VGGT-1B-Commercial). Set a strong `SCALP_API_KEY` as a server environment variable; never commit either secret or put a Hugging Face token in the browser. Start from this repository root:

```sh
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --workers 1
```

For a local deployment open `http://127.0.0.1:8000/`, enter that origin and the service key. For use from the GitHub Pages UI deploy the GPU service behind authenticated HTTPS and enter its HTTPS origin. Do not expose an unprotected development server. `SCALP_ORIGINS` controls the comma-separated browser origin allowlist. The default allows this project's GitHub Pages origin and a local preview origin; add `http://127.0.0.1:8000` only if using a separate-origin client that needs it.

Memory requirements depend on frame count, precision and GPU. Budget a larger GPU and measure peak memory with your capture set; **a 4GB laptop GPU is not a verified supported inference target**. No cloud GPU rental, spend or external photo upload has been initiated.

`GET /health` reports configuration and package availability; it deliberately does not download weights or claim successful inference. `POST /reconstruct` requires `X-API-Key` and multipart `files`. It returns `scalp-reconstruction-v2` JSON with positions, vertex colors, foreground preview PNGs and provenance. The service handles one inference at a time and removes intermediate images when its temporary context closes. API responses and browser memory still contain personal appearance data. Operational access control, rate limits, retention, monitoring and customer consent are the deployer's responsibility.

## Representation and limitations

Output is a fused **colored 3D point cloud**, not a watertight head mesh, not Gaussian splatting, and not measured metric geometry. Source-view color follows reconstructed 3D points; it is not projected onto a generic head. Confidence thresholding and voxel fusion reduce redundant points; they do not guarantee cross-view consistency. Hair, smooth scalp, person movement and uncertain depth can create holes or duplicate surfaces. Inspect each result; recapture or reject poor reconstructions. Surface meshing and subject-specific reconstruction quality validation remain future work.

The frontend uses WebGL depth-tested points, vertex-local treatment weights and independent regional parameters. JSON includes geometry and design zones; PLY exports original measured-view geometry only. PNG exports a current-view before/after with simulation wording. Files are downloaded locally; no customer photos are committed to GitHub.

## Checks

```sh
python -m unittest backend.test_geometry
node --check app.js
node check.cjs
```

Tests verify foreground filtering, invalid-depth rejection, color preservation and mask alignment using synthetic geometry, plus independent design regions and the absence of template fallback. They are **not a model inference benchmark**. Backend source syntax/import checks succeeded; ASGI request-level testing was attempted but could not complete in this environment. GPU model inference has not been tested.

</details>
