# 通用 AI 客服评估测试平台 - 宝塔面板 (BT-Panel / AA-Panel) 部署教程

## 项目简介

这是一个用于测试和调优 AI 客服回复质量的通用 Web 应用，1:1 模拟生产环境的意图分类与多轮回复逻辑。项目采用 **Node.js (Express)** 构建服务端，前端基于 Vue 3 与 Tailwind CSS。

系统支持 **多种存储部署模式**，可自由选择：
1. **MySQL 数据库模式**：配置宝塔 MySQL 数据库后，数据统一保存在 MySQL 中，适合团队协同与多设备同步。
2. **轻量文件持久化模式**：无需开启数据库，服务端自动将数据保存在 `data/db.json` 文件中。
3. **纯静态前端模式**：免安装 Node.js 与数据库，直接在宝塔创建纯静态网站，数据存于浏览器 `localStorage` 中。

---

## 环境要求

- **宝塔面板**: v7.0+ / AA-Panel
- **Node.js**: v16.x / v18.x / v20.x (通过宝塔「Node.js 版本管理器」或「Node 项目」模块安装)
- **Nginx**: 1.18+ (用于域名绑定、SSL 证书与反向代理)
- **MySQL 数据库 (可选)**: MySQL 5.7 / 8.0 或 MariaDB（仅在需要数据库存储时启用）

---

## 🚀 部署方案

### 方案一：Node.js 部署 + MySQL 数据库选配 (推荐团队使用)

**适用场景**: 正式生产与团队协作，支持大模型 API 安全代理，且所有配置与商品数据自动存入 MySQL 数据库。

#### 步骤 1：安装 Node.js 与创建 MySQL 数据库
1. 登录宝塔面板，进入 **软件商店**，安装 **Node.js 版本管理器**，并安装 Node.js v18.x 或 v20.x。
2. 进入宝塔面板 **数据库** → 点击 **添加数据库**：
   - **数据库名**: `ai_customer_service_eval`
   - **用户名**: `ai_customer_service_eval`
   - **密码**: 设置一个强密码（例如 `MyPassword123!`）
   - **访问权限**: 本地服务器 (`127.0.0.1`)

#### 步骤 2：上传项目文件
1. 在宝塔面板 **文件** 菜单中，进入 `/www/wwwroot/`。
2. 创建项目目录（如 `ai-customer-service-eval`）。
3. 将项目根目录下的所有代码上传至该目录：
   - `server.js` (核心 Node.js 服务)
   - `package.json` (项目依赖包)
   - `.env.example` (环境变量参考模板)
   - `public/` (静态前端网页目录)
   - `data/` (可选，本地数据持久化目录)

#### 步骤 3：添加宝塔 Node 项目与配置环境变量
1. 进入宝塔面板 **网站** → **Node 项目** → 点击 **添加 Node 项目**。
2. 填入参数：
   - **项目目录**: `/www/wwwroot/ai-customer-service-eval`
   - **项目名称**: `ai-customer-service-eval`
   - **启动选项 / 启动文件**: `server.js` (或运行命令 `npm start`)
   - **项目端口**: `3000` (可按需自定义端口，如 `80`)
   - **Node 版本**: 选择刚安装的 v18 或 v20
3. **配置环境变量与 `.env` 文件**:
   在项目根目录复制 `.env.example` 为 `.env` 文件，或在宝塔 Node 项目 **设置** → **环境变量** 中配置如下信息：
   ```env
   # 服务端口
   PORT=3000

   # 存储模式 (可选: auto / mysql / file / memory，默认 auto)
   STORAGE_MODE=auto

   # MySQL 数据库配置
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=ai_customer_service_eval
   DB_PASSWORD=你的数据库密码
   DB_NAME=ai_customer_service_eval

   # 服务端 API 中转/代理 Base URL (可选，防中转站地址在前端泄露)
   BASE_URL=https://your-api-proxy.com/v1

   # 可选预设服务端 API Key (前端留空时自动使用服务端 Key)
   OPENAI_API_KEY=sk-xxxxxx
   GEMINI_API_KEY=AQ.xxxxxx
   ANTHROPIC_API_KEY=sk-ant-xxxxxx
   ```
4. 点击 **确定/重载** 启动项目。系统会自动连接 MySQL 并自动运行建表语句（自动创建 `eval_products`、`eval_configs` 和 `eval_sessions` 数据表），无需手动导入 `.sql` 脚本。

#### 步骤 4：绑定域名与配置 Nginx 反向代理
1. 在 Node 项目设置中，点击 **域名管理**，添加您的访问域名。
2. 宝塔会自动完成 Nginx 反向代理将 80/443 端口请求转发到配置的 Node 端口（如 `3000` ）。
3. 可在网站 **SSL** 选项中为域名申请 Let's Encrypt 免费证书开启 HTTPS。

---

### 方案二：Node.js 部署 + 轻量文件持久化模式 (无需 MySQL)

**适用场景**: 个人或轻量测试使用，无需在宝塔创建 MySQL 数据库。

1. 按照 **方案一** 的步骤上传文件并添加 Node 项目。
2. 可在 `.env` 中设置 `STORAGE_MODE=file` 或留空 `DB_HOST` 环境变量。
3. `server.js` 会自动将所有更改落盘存储在 `./data/db.json` 文件中，服务重启数据依然完好保存。

---

### 方案三：纯静态前端部署 (零配置、最快捷)

**适用场景**: 免安装 Node.js 环境与数据库，纯前端本地 `localStorage` 存储，支持全局 JSON 导出与导入。

1. **创建纯静态站点**:
   在宝塔面板 **网站** → **添加站点**，选择“纯静态”。
2. **上传网页文件**:
   将 `public/` 目录下的所有静态文件（`index.html` 等）直接解压到站点根目录 `/www/wwwroot/你的域名/`。
3. **配置 Nginx SPA 伪静态**:
   在宝塔站点设置 → **伪静态** 中填写以下规则，并务必点击 **保存** 按钮生效：
   ```nginx
   location / {
       try_files $uri $uri/ /index.html;
   }
   ```
   如需强制重新加载 Nginx，可在宝塔终端或服务器 SSH 终端运行 `nginx -s reload`。

---

## 🌐 推荐网络加速 / Network Acceleration

为保障服务器或浏览器调用海外 AI 大模型接口（OpenAI, Gemini, Claude 等）的稳定性与低延迟，推荐搭配 **NodeHK VPN**：

- **官方网址**: [www.nodehk.shop](https://www.nodehk.shop)
- **优势**: 专为 AI 开发者与大模型 API 优化的高速稳定网络通道。

---

## 🛠️ 常用排查与维护

1. **查看数据与接口状态**:
   浏览器访问 `http://你的域名/api/config`，可查看当前的存储模式（`storage_mode`: `"mysql"` 或 `"file"`）以及服务端预设的 API Key 挂载状态。
2. **自定义端口与中转防泄露**:
   - 可在 `.env` 中自定义 `PORT=60107`，服务启动时将自动侦听 60107 端口。
   - 填写 `BASE_URL` 后，大模型 API 请求会在 Node.js 服务端进行代理，前端无需暴露真实的中转站代理地址。

