# 通用 AI 客服评估与测试平台 | Universal AI Customer Service Eval Platform

[🇨🇳 中文文档](README.md) | [🇺🇸 English Documentation](README_EN.md)

[![Vue 3](https://img.shields.io/badge/Vue-3.x-emerald.svg)](https://vuejs.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.x-38bdf8.svg)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-Supported-blue.svg)](https://www.mysql.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![AA Panel / Baota Ready](https://img.shields.io/badge/BT--Panel-Supported-orange.svg)](DEPLOYMENT.md)

这是一个专为大模型（LLM）AI 客服设计的通用评估、测试与 Prompt 调优平台。面向电商客服、二手交易平台（如闲鱼、淘宝、转转）、智能体（AI Agent）等多样化业务场景，帮助开发团队与运营人员在无需真实买家交互的情况下，高效测试和验证 AI 的回复质量、议价策略及意图识别准确度。

---

## 📷 界面预览 / Interface Screenshots

### 🖥️ 1. 电脑端界面 (桌面侧边栏与双栏对话测试)
![电脑端界面预览](desktop_preview.png)

### 📱 2. 手机端界面 (响应式移动端体验)
<p align="center">
  <img src="mobile_preview_1.png" width="45%" alt="手机端 - 提示词版本与多意图编辑" />
  &nbsp;&nbsp;
  <img src="mobile_preview_2.png" width="45%" alt="手机端 - 对话测试与评估" />
</p>

---

## ✨ 核心特性

- 🌙 **亮色与灰色/暗黑模式无缝切换**: 界面支持亮色模式与 Slate 灰色/暗黑模式一键切换，舒适适配各类测试环境。
- 🌐 **双语界面支持 (中文 / English)**: 内置中英文双语 UI 实时切换，方便国际化与跨国团队协作。
- 📝 **提示词多版本协同与 JSON 导入/导出**: 针对多人协同设计 Prompt 的场景，支持创建多个提示词版本、对比效果、标记设计者姓名，并支持全量 Prompt 版本的 JSON 一键复制与导入/导出。
- 🎯 **自定义三意图优先级匹配**: 按照 **议价 (`price`) ➔ 细节咨询 (`tech`) ➔ 通用客服 (`default`)** 的次序智能分类，可在前端自由增删或修改判定关键词。
- 💰 **智能议价策略控制**: 全局配置允许的最大优惠百分比、最大优惠金额以及买家议价最大允许轮数。达到上限后 AI 将自动触发拒绝降价逻辑。
- 📦 **商品管理与专属附加提示词**: 支持商品的快速创建、副本复制、快捷删除，并可为单一商品单独配置“商品附加提示词”（如底价说明、赠品规则等）。
- 🗄️ **灵活的三重存储架构 (选配 MySQL / 本地文件 / localStorage)**:
  - **MySQL 数据库模式**：配置宝塔 MySQL 环境变量后自动连接并建表，适合多人协同与多设备数据同步。
  - **轻量文件持久化模式**：无需开启数据库，服务端自动将更改写入 `data/db.json` 文件。
  - **纯静态本地模式**：无须 Node.js 和数据库，纯静态托管，数据存储在浏览器 `localStorage` 中。
- ⚡ **多 AI 服务商协议兼容**: 直连或代理支持 OpenAI 兼容格式（DeepSeek / 通义千问 / ChatGLM / ChatGPT）、阿里云 DashScope、Google Gemini 与 Anthropic Claude。
- 🔍 **实时调试与 Prompt 探针**: 底部实时展示最终组装的 System Prompt、买家意图匹配结果、API 执行耗时及原始响应。

---

## 🔗 生态关联与生产环境兼容

本评估平台 1:1 模拟了生产环境中的核心回复机制，**完美兼容开源项目 `xianyu-auto-reply` 及同类电商自动回复系统**。

- **对于 `xianyu-auto-reply` 用户**: 无需绑定真实闲鱼账号或消耗真实交易买家会话，直接在本测试平台中导入您的 Prompt 与规则，即可实时观察 AI 的议价与回答表现。
- **对于通用 AI 客服开发者**: 平台提供了独立、模块化的可视化测试环境，可轻松迁移适配至各类自建电商客服机器人或平台。

---

## 🚀 推荐网络加速 / Network Acceleration

在测试或部署 AI 客服时，调用海外 AI 接口（OpenAI, Gemini, Claude）常面临网络延迟或不稳定的问题。推荐配合使用 **NodeHK VPN**，为您的 AI 接口调用提供高速稳定的网络支撑：

- 🌐 **官方网址**: [www.nodehk.shop](https://www.nodehk.shop)
- ⚡ **产品优势**: 低延迟、高并发、专线节点，顺畅连接主流 LLM API，保障 AI 客服评估与生产环境的稳定响应。

---

## 📁 项目结构

```
ai-customer-service-eval/
├── public/
│   └── index.html          # 单页 Web UI 界面 (Vue 3 + Tailwind CSS)
├── server.js               # Node.js (Express) 后端服务 (支持 MySQL / 文件持久化)
├── package.json            # 项目依赖说明与启动脚本
├── .env.example            # 环境变量与 MySQL 数据库配置参考模板
├── DEPLOYMENT.md           # 宝塔面板 (BT-Panel / AA-Panel) 详细部署教程
├── README.md               # 中文说明文档
└── README_EN.md            # 英文说明文档
```

---

## 🛠️ 快速开始

### 方式一：Node.js 启动 (支持数据库或轻量文件存储，推荐)

```bash
# 1. 安装项目依赖
npm install

# 2. (可选) 配置 MySQL 数据库环境变量
cp .env.example .env
# 编辑 .env 填写 DB_HOST, DB_USER, DB_PASSWORD, DB_NAME 参数。
# 如果不配置 MySQL 参数，系统将自动使用轻量本地文件 data/db.json 保存数据。

# 3. 启动 Node.js 服务 (默认端口 3000)
npm start
```

访问 `http://localhost:3000` 即可开始使用。

### 方式二：纯静态前端使用 / 部署 (零配置、最快捷)

本项目前端基于单文件 Vue 3 + Tailwind CSS 构建，无需依赖任何后端服务即可在浏览器中独立运行：

1. **直接双击打开**：
   可以直接在文件管理器中**双击 `public/index.html`**，用任意现代浏览器（Chrome、Edge、Safari 等）打开即可直接使用。所有的配置、商品及测试会话数据均会自动保存在浏览器的 `localStorage` 中。

2. **使用本地轻量 HTTP 服务器（推荐）**：
   如果希望获得更规范的 HTTP 环境，可直接在项目根目录下使用 Python 启动：
   ```bash
   python3 -m http.server 8080 -d public
   ```
   随后在浏览器访问 `http://localhost:8080` 即可使用。

### 方式三：宝塔面板部署 (生产推荐)

请查阅专用的 [宝塔面板部署教程 (DEPLOYMENT.md)](DEPLOYMENT.md)，支持一键挂载宝塔 MySQL 数据库与 Nginx 反向代理。

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。
