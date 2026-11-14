# FaceScape 个人非商用实验

历史适配器记录：当前网页已改为 MediaPipe 自动下载模型的单图人脸入口，不再要求选择 FaceScape NPZ。以下适配器缺少真实官方权重测试，未作为可用的默认功能交付。

这是独立编写的浏览器适配器，不是官方完整照片重建演示的移植。不含 FaceScape 数据或权重，也不使用云推理服务。

## 首次使用

1. 打开 [官方模型下载说明](https://github.com/zhuhao-nju/facescape/blob/master/doc/external_link_fsbm.md)，阅读其使用协议，自行从官方链接下载 **facescape_bm_v1.6_847_50_52_id_front.npz**。只需此文件，不需要完整多人数据集。也兼容同版 50 身份的 `_id.npz`；不兼容 300 身份或 `_id_exp.npz`。
2. 在网站点击“选择 FaceScape 模型 NPZ”，从本机选择下载的文件。文件较大，读取时请等待进度完成；推荐桌面 Chrome / Edge。没有安装要求。首次联网加载 fflate 0.8.2 解压组件。
3. 选择一张自然闭嘴、近正面的个人照片，按提示依次点八个位置：画面左眼外 / 内眼角、画面右眼内 / 外眼角、鼻尖、画面左 / 右嘴角、下巴最下端。点错可撤销。这里的左右均指画面坐标。
4. 点击“拟合并开始纹发设计”。旋转检查拟合头型，在右侧选择额角、发缝或发际线等笔刷，圈画局部区域。

模型与照片只在当前页面内存中处理，不发送给后端。刷新页面需要重新选择文件。官方模型下载是单独步骤，网页不会自动接受使用条款或代替用户获取许可。

## 实现

参考官方 v1.6 数组布局，读取 `shape_bm_core`、`id_mean`、`id_var`、`lm_list_v16`、`fv_indices`。NPZ 按块解压，只保留形状核的**中性表情切片**和所需数值数组，不读取 pickle / 对象字段。支持 C 与 Fortran 两种存储顺序及大小端浮点数组。

令中性形状核为 B，身份参数均值为 m、方差为 v。使用标准化参数 z 表示 `vertices = B m + B diag(sqrt(v)) z`。根据八个标点交替估计二维相似相机与带高斯先验的身份参数；身份偏移限制在 ±2.5 个标准差。保持中性表情，只支持近正面。照片坐标以图像宽度统一尺度，避免长宽比改变拟合比例。

不估计三维头部姿态、表情或动态轮廓，不等价于官方 68 点、姿态、表情联合优化。八点不足以确定真实完整头型。沿拟合网格表面采样 120,000 点进入原有设计器；原始 FaceScape 身份基没有嵌入网站源码。

## 看见的是什么

- 三维形状会随照片标点拟合参数变化，而不是只把照片贴到固定网格上。
- 统一灰色材质不代表真实肤色，本版不提取照片纹理。
- 头顶、后脑和遮挡部位来自模型的统计先验，未经测量。模型若缺少某部位，适配器不会额外生成几何填充。
- 不恢复被头发遮挡的头皮，也不自动识别真实发缝、发际线或临床治疗区域。纹发仅为手工局部视觉实验。

## 验证状态

`node check-facescape.cjs` 验证合成 C / Fortran NPY 数组的分块中性切片提取、截断拒绝、线性求解、相机拟合、身份形变与表面采样。原有网页几何与设计检查继续保留。

**尚未获得真实官方 NPZ 文件，也未完成真实模型 / 浏览器端到端验证。**合成测试通过不能表述为真人照片重建已验证。官方模型较大，实际解析速度与兼容性仍需在用户设备测试。

## 来源与许可

- [FaceScape 新官网](https://nju-3dv.github.io/projects/FaceScape/)
- [官方模型格式说明](https://github.com/zhuhao-nju/facescape/blob/master/doc/doc_bilinear_model.md)
- [官方 Python 实现的数组布局](https://github.com/zhuhao-nju/facescape/blob/master/toolkit/src/facescape_bm.py)
- Yang et al., *FaceScape: A Large-Scale High Quality 3D Face Dataset and Detailed Riggable 3D Face Prediction*, CVPR 2020.
- Zhu et al., *FaceScape: 3D Facial Dataset and Benchmark for Single-View 3D Face Reconstruction*, IEEE TPAMI 2023.

官方模型受非商用及禁止再分发等条款约束。个人非商用使用仍须遵守原协议。不要把下载的 NPZ 上传到公开仓库或对外分发；本项目只提供独立适配代码。
