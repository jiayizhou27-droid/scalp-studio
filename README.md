# Scalp Studio — 上传照片生成可旋转三维人脸

默认流程：**选择照片 → 自动下载轻量模型 → 自动估计人脸相对深度 → 生成三角网格与照片颜色 → 旋转 / 圈画**。不需要模型文件、手动标点、Python、云 GPU 或后端。

## 使用

打开网页，点“选择照片，自动生成”，选一张单人、光线均匀、尽量正面的照片。首次加载需要网络；模型与运行组件会自动获取。失败时页面会说明原因，可以重新生成。照片不上传给模型服务器。

完成后拖动旋转，选择右侧笔刷在脸部或部分额头圈画。可导出 PNG、JSON、PLY，也可导出真正含顶点与三角面的 OBJ（支持顶点颜色扩展）。OBJ 导出为原始推断表面，纹发显示仍是现有点云区域设计，未烘焙进 OBJ 材质。

## 技术来源

采用单图人脸表面估计路线，参考：Kartynnik et al., *Real-time Facial Surface Geometry from Monocular Video on Mobile GPUs*, CVPR Workshop on Computer Vision for Augmented and Virtual Reality, 2019。

- [Google Research 论文页](https://research.google/pubs/real-time-facial-surface-geometry-from-monocular-video-on-mobile-gpus/)
- [MediaPipe Face Landmarker 官方文档](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web)
- [官方模型地址](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)

具体实现使用现成 MediaPipe Tasks Vision **0.10.14** 与官方 Face Landmarker 模型 **float16/1**，并非逐行复现 2019 论文。运行库与 WASM 从固定版本 jsDelivr 获取，模型从 Google 官方存储自动下载，CPU/WASM 在浏览器中执行。模型约 3.8MB；首次还需下载运行组件。

从 478 个预测关键点中使用前 468 个表面顶点。只使用官方 canonical_face_model 的三角连接（898 个面），不使用其固定顶点坐标。顶点坐标全部来自照片推断；x/y 按图片长宽比换算，相对 z 使用模型约定。照片颜色沿网格内插取得，背景不另建几何。

原有 WebGL 设计器显示沿此网格插值采样的 120,000 个点。这是渲染采样数量，**不增加真实几何精度**。三角网格随 JSON 保存，OBJ 导出 468 顶点 / 898 面。

## 能力边界

这是**单张照片的近似三维人脸表面估计**，不是精确扫描或完整头部重建。只覆盖脸部及部分额头，不生成头顶、后脑、完整头发、发缝或被遮挡的真实头皮。侧面或遮挡部位的颜色不可靠。它适合个人 AR / 三维外观实验，不能声称已解决完整头皮纹发规划。

现成扫描模型导入和旧自建后端被保留在折叠备选入口。FaceScape 手工模型选择入口已从网页移除；历史未验证适配代码见 FACESCAPE.md。

## 检查与验证状态

```sh
node --check photo-face.js
node --check photo-face-ui.js
node check-photo-face.cjs
node check-photo-ui.cjs
node check.cjs
node check-scan.cjs
node check-url.cjs
node check-jobs.cjs
python -m unittest backend.test_geometry backend.test_cloud_api
```

2026-11-14：实际从官方地址完整下载了 **3,758,596 字节**的 Face Landmarker 模型，HTTP 200。固定版本 JS bundle、SIMD / 非 SIMD 的 WASM 及其 JS 运行文件也通过 HTTP HEAD 检查，均返回 **200** 并允许浏览器跨域读取。核心几何与界面流程使用模拟推理结果验证，包括深度随输入变化、网格、颜色、异常输入、无人脸 / 多人脸处理、上传即触发与失败重试。**尚未完成本项目真实照片的浏览器推理端到端验证**；不能将这些检查称为成功的真人扫描演示。

## 第三方资料

face-topology.js 的连接索引派生自 [MediaPipe canonical_face_model.obj](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj)，其许可证全文保留在 [third_party/mediapipe-LICENSE](third_party/mediapipe-LICENSE)。模型不包含在仓库中，由浏览器从官方地址下载。源码检查不涉及将用户照片发送给第三方。
