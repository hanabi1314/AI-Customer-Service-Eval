import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ----------------------------------------------------
// 存储层与数据库管理 (Storage & Database Layer)
// 支持 3 种模式: MySQL 数据库 / 本地文件 JSON 落盘 / 内存
// ----------------------------------------------------

let dbPool = null;
let storageMode = 'file'; // 'mysql', 'file', 'memory'

// 默认基础数据
let products = [
  {
    id: 1,
    title: 'iPhone 15 Pro 256G 原野钛金属',
    price: 5800,
    desc: '国行双卡，电池健康92%，全套原盒带小票。无拆无修，屏幕微瑕保护膜贴上不可见。仅接受小刀，大刀勿扰。',
    ai_prompt: '底价5600元，少于5600坚决卖不了，同城可面交送护壳。',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    title: 'Sony WH-1000XM5 头戴式降噪耳机',
    price: 1650,
    desc: '功能全好，降噪与音质绝佳，充一次电续航超长。保修期内，全套盒说齐全。',
    ai_prompt: '最多优惠50元，包邮顺丰。',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 3,
    title: 'MacBook Air M2 16G+512G 星空灰',
    price: 6800,
    desc: '电池循环45次，98新无磕碰，轻薄便携，办公神器。带原装35W双口充电器。',
    ai_prompt: '接受微刀，底价6600元。',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

let chatSessions = {};
let nextProductId = 4;
let nextSessionId = 1;

let globalConfig = {
  provider_type: 'openai_compatible',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model_name: 'gpt-3.5-turbo',
  max_discount_percent: 10,
  max_discount_amount: 50,
  max_bargain_rounds: 3,
  custom_prompts: {
    classify: '你是一个闲鱼商品意图识别助手。请分析用户消息的意图。',
    price: '你是一个专业的闲鱼卖家助手。用户在询问价格优惠。商品：{title}，价格：{price}元。最大优惠：{max_discount}% 或 {max_discount_amount}元。已议价{bargain_count}轮，最多{max_rounds}轮。请友好回复。',
    tech: '你是一个专业的产品技术支持。用户在咨询商品细节。商品：{title}，描述：{desc}。请专业解答。',
    default: '你是一个友好的闲鱼卖家。商品：{title}，价格：{price}元。请热情回复买家。'
  }
};

// 本地数据落盘与读取 (File Persistence)
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function loadFromFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data.products && Array.isArray(data.products)) products = data.products;
      if (data.chatSessions) chatSessions = data.chatSessions;
      if (data.globalConfig) globalConfig = data.globalConfig;
      if (data.nextProductId) nextProductId = data.nextProductId;
      if (data.nextSessionId) nextSessionId = data.nextSessionId;
      console.log('[Storage] 成功从本地文件 data/db.json 加载数据');
    }
  } catch (e) {
    console.warn('[Storage] 读取本地文件失败，使用默认数据:', e.message);
  }
}

function saveToFile() {
  if (storageMode === 'mysql') return; // 如果开启了 MySQL 则不强制写本地文件
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      products,
      chatSessions,
      globalConfig,
      nextProductId,
      nextSessionId,
      updated_at: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Storage] 保存数据到 data/db.json 失败:', e.message);
  }
}

// MySQL 数据库初始化与自动化建表
async function initDatabase() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD || process.env.DB_PASS;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT || 3306);

  if (!host || !database || !user) {
    console.log('[Storage] 未配置 MySQL 环境变量 (DB_HOST, DB_NAME, DB_USER)，自动使用轻量文件存储/内存模式');
    loadFromFile();
    return;
  }

  try {
    dbPool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // 检查连接
    const [rows] = await dbPool.query('SELECT 1 + 1 AS result');
    console.log('[Storage] MySQL 数据库连接成功！模式切换为 [MySQL 关系型数据库]');
    storageMode = 'mysql';

    // 创建商品表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS eval_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        desc_text TEXT,
        ai_prompt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 创建配置表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS eval_configs (
        config_key VARCHAR(64) PRIMARY KEY,
        config_value LONGTEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 创建会话记录表
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS eval_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL UNIQUE,
        chat_history LONGTEXT,
        bargain_count INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 加载或初始化数据库默认值
    const [dbProds] = await dbPool.query('SELECT * FROM eval_products ORDER BY id DESC');
    if (dbProds.length > 0) {
      products = dbProds.map(p => ({
        id: p.id,
        title: p.title,
        price: Number(p.price),
        desc: p.desc_text || '',
        ai_prompt: p.ai_prompt || '',
        created_at: p.created_at,
        updated_at: p.updated_at
      }));
      nextProductId = Math.max(...products.map(p => p.id), 0) + 1;
    } else {
      // 写入默认商品
      for (const p of products) {
        await dbPool.query(
          'INSERT INTO eval_products (id, title, price, desc_text, ai_prompt) VALUES (?, ?, ?, ?, ?)',
          [p.id, p.title, p.price, p.desc, p.ai_prompt]
        );
      }
    }

    const [configs] = await dbPool.query('SELECT config_value FROM eval_configs WHERE config_key = "global_config"');
    if (configs.length > 0) {
      try {
        globalConfig = JSON.parse(configs[0].config_value);
      } catch (e) {}
    } else {
      await dbPool.query(
        'INSERT INTO eval_configs (config_key, config_value) VALUES (?, ?)',
        ['global_config', JSON.stringify(globalConfig)]
      );
    }

    const [dbSessions] = await dbPool.query('SELECT * FROM eval_sessions');
    if (dbSessions.length > 0) {
      dbSessions.forEach(s => {
        chatSessions[s.product_id] = {
          id: s.id,
          product_id: s.product_id,
          chat_history: s.chat_history || '[]',
          bargain_count: s.bargain_count || 0,
          created_at: s.created_at,
          updated_at: s.updated_at
        };
      });
      nextSessionId = Math.max(...dbSessions.map(s => s.id), 0) + 1;
    }
  } catch (err) {
    console.error('[Storage] MySQL 初始化连接失败，降级为文件存储模式:', err.message);
    storageMode = 'file';
    dbPool = null;
    loadFromFile();
  }
}

// 初始化存储
initDatabase();

// Handlers
const handleProductsRequest = async (req, res, resourceId) => {
  const method = req.method;
  const id = resourceId ? parseInt(resourceId, 10) : (req.params.id ? parseInt(req.params.id, 10) : null);

  if (method === 'GET') {
    if (id) {
      const p = products.find(prod => prod.id === id);
      if (p) return res.json(p);
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.json(products);
  }

  if (method === 'POST') {
    const { title, price, desc, ai_prompt } = req.body || {};
    if (!title || price === undefined) {
      return res.status(400).json({ error: 'Title and price are required' });
    }
    const newProduct = {
      id: nextProductId++,
      title,
      price: Number(price),
      desc: desc || '',
      ai_prompt: ai_prompt || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    products.unshift(newProduct);

    if (storageMode === 'mysql' && dbPool) {
      try {
        const [result] = await dbPool.query(
          'INSERT INTO eval_products (title, price, desc_text, ai_prompt) VALUES (?, ?, ?, ?)',
          [newProduct.title, newProduct.price, newProduct.desc, newProduct.ai_prompt]
        );
        newProduct.id = result.insertId;
      } catch (e) {
        console.error('[MySQL Error]', e.message);
      }
    }
    saveToFile();
    return res.status(201).json({ id: newProduct.id, message: 'Product created' });
  }

  if (method === 'PUT' && id) {
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Product not found' });
    const { title, price, desc, ai_prompt } = req.body || {};
    products[idx] = {
      ...products[idx],
      title: title !== undefined ? title : products[idx].title,
      price: price !== undefined ? Number(price) : products[idx].price,
      desc: desc !== undefined ? desc : products[idx].desc,
      ai_prompt: ai_prompt !== undefined ? ai_prompt : products[idx].ai_prompt,
      updated_at: new Date().toISOString()
    };

    if (storageMode === 'mysql' && dbPool) {
      try {
        await dbPool.query(
          'UPDATE eval_products SET title=?, price=?, desc_text=?, ai_prompt=? WHERE id=?',
          [products[idx].title, products[idx].price, products[idx].desc, products[idx].ai_prompt, id]
        );
      } catch (e) {
        console.error('[MySQL Error]', e.message);
      }
    }
    saveToFile();
    return res.json({ message: 'Product updated' });
  }

  if (method === 'DELETE' && id) {
    products = products.filter(p => p.id !== id);
    delete chatSessions[id];

    if (storageMode === 'mysql' && dbPool) {
      try {
        await dbPool.query('DELETE FROM eval_products WHERE id=?', [id]);
      } catch (e) {
        console.error('[MySQL Error]', e.message);
      }
    }
    saveToFile();
    return res.json({ message: 'Product deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

const handleSessionsRequest = async (req, res, resourceId) => {
  const method = req.method;
  const id = resourceId ? parseInt(resourceId, 10) : (req.params.id ? parseInt(req.params.id, 10) : null);

  if (method === 'GET') {
    if (id) {
      const session = Object.values(chatSessions).find(s => s.id === id);
      if (session) return res.json(session);
      return res.status(404).json({ error: 'Session not found' });
    }
    const productId = req.query.product_id ? parseInt(req.query.product_id, 10) : null;
    if (productId) {
      if (!chatSessions[productId]) {
        chatSessions[productId] = {
          id: nextSessionId++,
          product_id: productId,
          chat_history: '[]',
          bargain_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      return res.json(chatSessions[productId]);
    }
    return res.json(Object.values(chatSessions));
  }

  if (method === 'POST' || method === 'PUT') {
    const { product_id, chat_history, bargain_count } = req.body || {};
    const pid = product_id ? parseInt(product_id, 10) : null;
    if (!pid) return res.status(400).json({ error: 'product_id is required' });

    const historyStr = typeof chat_history === 'string' ? chat_history : JSON.stringify(chat_history || []);
    if (chatSessions[pid]) {
      chatSessions[pid].chat_history = historyStr;
      chatSessions[pid].bargain_count = bargain_count ?? chatSessions[pid].bargain_count;
      chatSessions[pid].updated_at = new Date().toISOString();
    } else {
      chatSessions[pid] = {
        id: nextSessionId++,
        product_id: pid,
        chat_history: historyStr,
        bargain_count: bargain_count || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    if (storageMode === 'mysql' && dbPool) {
      try {
        await dbPool.query(
          'INSERT INTO eval_sessions (product_id, chat_history, bargain_count) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE chat_history=VALUES(chat_history), bargain_count=VALUES(bargain_count)',
          [pid, historyStr, chatSessions[pid].bargain_count]
        );
      } catch (e) {
        console.error('[MySQL Session Sync Error]', e.message);
      }
    }
    saveToFile();
    return res.json({ id: chatSessions[pid].id, message: 'Session saved' });
  }

  if (method === 'DELETE' && id) {
    const key = Object.keys(chatSessions).find(k => chatSessions[k].id === id);
    if (key) {
      const pid = chatSessions[key].product_id;
      delete chatSessions[key];
      if (storageMode === 'mysql' && dbPool && pid) {
        dbPool.query('DELETE FROM eval_sessions WHERE product_id=?', [pid]).catch(e => console.error('[MySQL Session Delete Error]', e.message));
      }
    }
    saveToFile();
    return res.json({ message: 'Session deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

const handleConfigRequest = async (req, res) => {
  const method = req.method;
  if (method === 'GET') {
    return res.json(globalConfig);
  }
  if (method === 'POST' || method === 'PUT') {
    try {
      globalConfig = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (storageMode === 'mysql' && dbPool) {
        try {
          await dbPool.query(
            'INSERT INTO eval_configs (config_key, config_value) VALUES ("global_config", ?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value)',
            [JSON.stringify(globalConfig)]
          );
        } catch (e) {
          console.error('[MySQL Config Error]', e.message);
        }
      }
      saveToFile();
      return res.json({ message: 'Config saved' });
    } catch (e) {
      return res.status(400).json({ error: 'Invalid config JSON' });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
};

const handleChatRequest = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { provider_type, base_url, api_key, model_name, system_prompt, messages } = req.body || {};

  if (!api_key) {
    return res.status(400).json({ error: '请先配置 API Key 以后再测试 AI 对话' });
  }

  try {
    if (provider_type === 'gemini') {
      const model = model_name || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${api_key}`;
      const contents = (messages || []).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system_prompt }] },
          contents
        })
      });
      const data = await response.json();
      if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        return res.json({ reply: data.candidates[0].content.parts[0].text });
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return res.json({ reply: JSON.stringify(data) });
    } else {
      const url = (base_url || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_key}`
        },
        body: JSON.stringify({
          model: model_name || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: system_prompt },
            ...(messages || [])
          ]
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return res.json({ reply: data.choices[0].message.content });
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return res.json({ reply: JSON.stringify(data) });
    }
  } catch (err) {
    return res.status(500).json({ error: 'AI 请求服务异常: ' + err.message });
  }
};

const handleProxyRequest = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { url, headers = {}, body = null } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const fetchOptions = {
      method: body ? 'POST' : 'GET',
      headers: { ...headers }
    };
    if (body) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (err) {
    return res.status(500).json({ error: 'Proxy request failed: ' + err.message });
  }
};

const handleDbStatusRequest = (req, res) => {
  return res.json({
    storage_mode: storageMode, // 'mysql', 'file', 'memory'
    mysql_connected: storageMode === 'mysql',
    data_file: DATA_FILE,
    products_count: products.length,
    timestamp: new Date().toISOString()
  });
};

// API Routes
app.all('/api/products/:id?', (req, res) => handleProductsRequest(req, res));
app.all('/api/sessions/:id?', (req, res) => handleSessionsRequest(req, res));
app.all('/api/config', (req, res) => handleConfigRequest(req, res));
app.all('/api/chat', (req, res) => handleChatRequest(req, res));
app.all('/api/proxy', (req, res) => handleProxyRequest(req, res));
app.all('/api/db-status', (req, res) => handleDbStatusRequest(req, res));

// Compatibility Route for PHP style query strings: /server/api.php?path=products/1
const legacyPhpHandler = (req, res) => {
  const pathInfo = (req.query.path || '').replace(/^\/+|\/+$/g, '');
  const parts = pathInfo.split('/');
  const resource = parts[0] || '';
  const id = parts[1] || null;

  switch (resource) {
    case 'products':
      return handleProductsRequest(req, res, id);
    case 'sessions':
      return handleSessionsRequest(req, res, id);
    case 'config':
      return handleConfigRequest(req, res);
    case 'chat':
      return handleChatRequest(req, res);
    case 'proxy':
      return handleProxyRequest(req, res);
    default:
      return res.status(404).json({ error: 'Resource not found' });
  }
};

app.all('/server/api.php', legacyPhpHandler);
app.all('/api.php', legacyPhpHandler);

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
