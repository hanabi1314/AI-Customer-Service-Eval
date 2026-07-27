# 通用 AI 客服评估测试平台 - REST API 接口文档

本项目后端（`server.js`）提供了一套标准的 RESTful API 接口，用于前端与各种自建程序（如 `xianyu-auto-reply` 或自动化测试脚本）对接进行商品管理、会话同步、配置读写与 AI 代理测试。

---

## 目录
1. [存储状态接口 GET `/api/db-status`](#1-存储状态接口-get-apidb-status)
2. [商品管理接口 `/api/products`](#2-商品管理接口-apiproducts)
3. [会话历史接口 `/api/sessions`](#3-会话历史接口-apisessions)
4. [全局配置接口 `/api/config`](#4-全局配置接口-apiconfig)
5. [AI 对话测试接口 POST `/api/chat`](#5-ai-对话测试接口-post-apichat)
6. [通用网络代理接口 POST `/api/proxy`](#6-通用网络代理接口-post-apiproxy)

---

### 1. 存储状态接口 `GET /api/db-status`
查询系统当前运行的数据存储模式。

**请求示例**:
```http
GET /api/db-status HTTP/1.1
Host: localhost:3000
```

**响应示例**:
```json
{
  "storage_mode": "mysql", // 或 "file"
  "status": "connected"
}
```

---

### 2. 商品管理接口 `/api/products`

#### 2.1 获取商品列表 `GET /api/products`
**响应示例**:
```json
[
  {
    "id": "p1",
    "title": "iPhone 15 Pro 256G 原野钛金属",
    "price": 5800,
    "desc": "国行双卡，电池健康度92%，全套原盒带小票。",
    "ai_prompt": "底价5600元，少于5600坚决卖不了。",
    "created_at": "2026-07-27T00:00:00.000Z",
    "updated_at": "2026-07-27T00:00:00.000Z"
  }
]
```

#### 2.2 添加或更改商品 `POST /api/products`
**请求体**:
```json
{
  "id": "p_custom_101", // 可选，若不传则自动生成
  "title": "Sony WH-1000XM5 耳机",
  "price": 1650,
  "desc": "99新全套配件",
  "ai_prompt": "底价1550元"
}
```

#### 2.3 修改商品 `PUT /api/products/:id`
**请求体**: 传入需更新的商品字段。

#### 2.4 删除商品 `DELETE /api/products/:id`
**响应**: `{ "message": "Product deleted" }`

---

### 3. 会话历史接口 `/api/sessions`

#### 3.1 获取指定商品的会话 `GET /api/sessions?product_id=p1`
**响应示例**:
```json
{
  "id": 1,
  "product_id": "p1",
  "chat_history": "[{\"role\":\"user\",\"content\":\"多少钱？\"},{\"role\":\"assistant\",\"content\":\"您好，标价5800元\"}]",
  "bargain_count": 1,
  "created_at": "2026-07-27T00:00:00.000Z"
}
```

#### 3.2 保存会话历史 `POST /api/sessions` 或 `PUT /api/sessions`
**请求体**:
```json
{
  "product_id": "p1",
  "chat_history": [
    {"role": "user", "content": "5500可以吗？"},
    {"role": "assistant", "content": "抱歉，底价5600元呢。"}
  ],
  "bargain_count": 2
}
```

---

### 4. 全局配置接口 `/api/config`

#### 4.1 获取配置 `GET /api/config`
#### 4.2 保存配置 `POST /api/config`
**请求体示例**:
```json
{
  "provider_type": "openai_compatible",
  "base_url": "https://api.openai.com/v1",
  "api_key": "sk-...",
  "model_name": "gpt-3.5-turbo",
  "max_discount_percent": 10,
  "max_discount_amount": 50,
  "max_bargain_rounds": 3,
  "price_keywords": "便宜, 优惠, 刀, 降价, 价格",
  "tech_keywords": "怎么用, 参数, 坏了, 故障",
  "default_keywords": "在吗, 包邮, 发货",
  "custom_prompts": {
    "price": "你是一个卖家助手...",
    "tech": "你是一个技术客服...",
    "default": "你是一个通用客服..."
  }
}
```

---

### 5. AI 对话测试接口 `POST /api/chat`
后端安全透传与多模型适配接口，避免前端直连暴露 Key。

**请求体示例**:
```json
{
  "provider_type": "openai_compatible", // 可选: openai_compatible, dashscope_app, gemini, anthropic
  "base_url": "https://api.openai.com/v1",
  "api_key": "sk-...", // 若未传则自动读取服务端的环境变量 API KEY
  "model_name": "gpt-3.5-turbo",
  "system_prompt": "你是一个闲鱼卖家助手...",
  "messages": [
    { "role": "user", "content": "能便宜50块钱包邮吗？" }
  ]
}
```

**响应示例**:
```json
{
  "reply": "您好！优惠50元可以的，刚好达到我们的优惠折扣上限，可以为您修改价格为 5750 元并包邮！"
}
```

---

### 6. 通用网络代理接口 `POST /api/proxy`
解决客户端直接跨域请求第三方 API 的 CORS 限制问题。

**请求体示例**:
```json
{
  "url": "https://api.openai.com/v1/models",
  "headers": {
    "Authorization": "Bearer sk-..."
  }
}
```
