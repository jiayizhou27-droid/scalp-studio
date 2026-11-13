# GPU 后端部署

当前状态：部署源码及异步任务接口已准备；尚未连接云账号、构建云镜像或完成真人 GPU 推理验证。GitHub Pages 本身无法运行此模型。

## 需要在账号内完成的设置

1. 登录 https://huggingface.co/facebook/VGGT-1B-Commercial ，阅读并接受模型访问条件。确认自己的账号能下载权重，再创建有相应读取权限的 token。
2. 登录 https://modal.com ，配置 GPU 使用所需的付款方式，并在账号内设置可接受的预算提醒。此部署使用单个 A100-80GB，空闲 60 秒后缩容到零；推理、冷启动、短暂空闲及模型缓存可能产生费用。实例上限不是金额硬上限。没有承诺免费或指定费用。
3. 在 Modal Secrets 建立名为 `scalp-studio` 的 Secret，包含 `HF_TOKEN` 与随机生成的强 `SCALP_API_KEY`。不要把凭据提交到仓库。网页只填写 `SCALP_API_KEY`，不填写 Hugging Face token。

## 部署方式 A：GitHub Actions

在本仓库 Settings → Secrets and variables → Actions 中配置 `MODAL_TOKEN_ID`、`MODAL_TOKEN_SECRET`（从自己的 Modal 账号获取）。在 Actions 手动运行 **Deploy GPU backend (manual)**。工作流不会随普通提交自动启动。

## 部署方式 B：本机

在仓库根目录执行：

```sh
python -m pip install 'modal>=1,<2'
python -m modal setup
python -m modal deploy modal_deploy.py
```

将部署成功输出的 `web` HTTPS 地址填写到纹发网页的“重建服务”中，输入服务密钥并点击检查。也可以直接打开后端地址中的同款网页，服务地址会自动填写。

## 验证

`GET /health` 只验证网关配置，**不证明权重访问、GPU 可用或推理成功**。使用获授权的 3 张重叠头部照片做首次验证；确认去背景预览、三维几何和模型错误提示。再增加至 8–16 张。显存需求随视角数量增长，A100-80GB 也未经本项目实测保证。

前端先读健康接口；新部署使用 `POST /jobs` 提交任务，再通过有签名、有效期一小时的任务编号轮询 `GET /jobs/{job_id}`；已有自建服务仍走 `/reconstruct`。任务结果查询必须提供服务密钥。首次下载权重可较慢，页面最多等待 30 分钟；关闭页面不会取消已排队的 GPU 任务。

## 照片及结果处理

图像发送至自己的 Modal 工作区。worker 临时图片在任务结束时清理；模型 Volume 只配置用于权重缓存，不用于保存客户图片。**Modal 异步调用会处理上传输入，并使结果在完成后最多 7 天可被取回**；应用查询签名一小时过期不等于平台删除。使用客户照片前，须确认平台当前数据处理与保留条款并纳入客户授权。不要将客户图片或完整模型输出写入日志或仓库。

## 本地检查

```sh
node --check app.js
node check.cjs
node check-url.cjs
node check-jobs.cjs
python -m unittest backend.test_geometry backend.test_cloud_api
```

本地检查不依赖真实 GPU，不代表云镜像构建、商业权重下载或真人推理已验证。部署源固定到 VGGT revision `a288dd0f14786c93483e45524328726ab7b1b4ce`，torch/torchvision 固定为 2.8.0/0.23.0；其余依赖仍使用范围，首次部署后需要保留实际环境版本。
