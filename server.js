import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 .env 环境变量文件 (支持原生 process.loadEnvFile 与手动全版本兼容解析)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    }
  } catch (e) {
    // 忽略原生提示
  }
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val !== '') {
            process.env[key] = val;
          }
        }
      }
    });
    console.log('[Env] 已加载 .env 配置:', {
      PORT: process.env.PORT || 3000,
      STORAGE_MODE: process.env.STORAGE_MODE || 'auto (依据 DB 配置决定)',
      DB_HOST: process.env.DB_HOST || '(未配置)',
      DB_NAME: process.env.DB_NAME || '(未配置)',
      DB_USER: process.env.DB_USER || '(未配置)',
      BASE_URL: process.env.BASE_URL || process.env.OPENAI_BASE_URL || process.env.API_BASE_URL || '(未配置，使用客户端或默认)',
      HAS_GEMINI_KEY: !!process.env.GEMINI_API_KEY,
      HAS_OPENAI_KEY: !!process.env.OPENAI_API_KEY,
      HAS_ANTHROPIC_KEY: !!process.env.ANTHROPIC_API_KEY
    });
  } catch (e) {
    console.warn('[Env] 手动解析 .env 发生错误:', e.message);
  }
} else {
  console.log('[Env] 根目录未检测到 .env 文件，使用默认配置');
}

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
    id: 'p1',
    title: 'iPhone 15 Pro 256G 原野钛金属',
    price: 5800,
    desc: '国行双卡，电池健康度92%，全套原盒带小票。无拆无修，屏幕微瑕保护膜贴上不可见。仅接受小刀，大刀勿扰。',
    ai_prompt: '底价5600元，少于5600坚决卖不了，同城可面交送护壳。',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'p2',
    title: 'Sony WH-1000XM5 头戴式降噪耳机',
    price: 1650,
    desc: '黑色，99新，箱提配件齐全。仅戴过几次，几乎无使用痕迹，降噪功能完好。不包邮。',
    ai_prompt: '底价1550元，运费买家自理，急售可当天发顺丰。',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'p3',
    title: 'MacBook Air M2 16G+512G 星空灰',
    price: 6800,
    desc: '官方箱充全，电池循环40次。充新无划痕。适合办公剪辑。',
    ai_prompt: '底价6600元，附送原装扩展坞。',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

let chatSessions = {};
let nextSessionId = 1;

let defaultPromptVersions = [
  {
    id: 'v1',
    name: '标准场景 (默认生产版本)',
    author: '系统预设',
    prompts: {
      price: "你是一位专业且有礼貌的二手客服。根据买家提出的降价要求进行合理谈判。\n- 标价: ¥{price}\n- 当前降价底线: 不得低于优惠后的极限价格\n- 议价原则: 语气诚恳，解释商品质量与成本，若超出允许的最大降价幅度或超过限定轮次，请礼貌拒绝。",
      tech: "你是一位精通各类数码与商品参数的专家客服。\n- 根据【商品详情描述】耐心回答买家的成色、参数、配件、拆修情况等细节。\n- 务必基于已知事实回答，未提及的细节要诚实说明。",
      default: "你是一位热情周到的客服。\n- 友好解答关于是否在售、包邮发货时间等常见日常问答。\n- 引导有诚意的买家下单。"
    }
  }
];

let globalConfig = {
  provider_type: 'openai_compatible',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model_name: 'gpt-3.5-turbo',
  max_discount_percent: 10,
  max_discount_amount: 50,
  max_bargain_rounds: 3,
  price_keywords: '便宜, 优惠, 刀, 降价, 价格, 多少钱, 能少, 还能, 最低, 底价, 实诚价, 到100, 能到, 包个邮, 少点, 便宜点',
  tech_keywords: '怎么用, 参数, 坏了, 故障, 设置, 说明书, 功能, 用法, 教程, 驱动, 尺码, 新旧, 正品, 拆过, 修过',
  default_keywords: '在吗, 还在吗, 快递, 包邮, 发货, 什么时候发, 拍下',
  promptVersions: defaultPromptVersions,
  activePromptVersionId: 'v1',
  custom_prompts: {
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
      if (data.globalConfig) globalConfig = { ...globalConfig, ...data.globalConfig };
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
  const envStorageMode = (process.env.STORAGE_MODE || 'auto').toLowerCase();

  if (envStorageMode === 'json' || envStorageMode === 'file') {
    console.log('[Storage] 环境变量 STORAGE_MODE 设为 [' + envStorageMode + ']，强制开启本地 JSON 文件持久化存储模式');
    storageMode = 'file';
    loadFromFile();
    return;
  }

  if (envStorageMode === 'memory') {
    console.log('[Storage] 环境变量 STORAGE_MODE 设为 [memory]，强制开启纯内存模式');
    storageMode = 'memory';
    return;
  }

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD || process.env.DB_PASS;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT || 3306);

  if (!host || !database || !user) {
    if (envStorageMode === 'mysql') {
      console.warn('[Storage] 警告: STORAGE_MODE 设为 mysql，但缺少 DB_HOST/DB_NAME/DB_USER 配置，自动降级为文件存储模式');
    } else {
      console.log('[Storage] 未配置 MySQL 环境变量 (DB_HOST, DB_NAME, DB_USER)，自动使用轻量文件存储模式 (data/db.json)');
    }
    storageMode = 'file';
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
    await dbPool.query('SELECT 1 + 1 AS result');
    console.log('[Storage] MySQL 数据库连接成功！模式切换为 [MySQL 关系型数据库]');
    storageMode = 'mysql';

    // 创建商品表 (使用 VARCHAR 存储 ID，支持数字和字符串 ID)
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS eval_products (
        id VARCHAR(64) PRIMARY KEY,
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
        product_id VARCHAR(64) NOT NULL UNIQUE,
        chat_history LONGTEXT,
        bargain_count INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 加载或初始化数据库默认值
    const [dbProds] = await dbPool.query('SELECT * FROM eval_products ORDER BY created_at DESC');
    if (dbProds.length > 0) {
      products = dbProds.map(p => ({
        id: String(p.id),
        title: p.title,
        price: Number(p.price),
        desc: p.desc_text || '',
        ai_prompt: p.ai_prompt || '',
        created_at: p.created_at,
        updated_at: p.updated_at
      }));
    } else {
      // 写入默认商品
      for (const p of products) {
        await dbPool.query(
          'INSERT INTO eval_products (id, title, price, desc_text, ai_prompt) VALUES (?, ?, ?, ?, ?)',
          [String(p.id), p.title, p.price, p.desc, p.ai_prompt]
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
          product_id: String(s.product_id),
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
  const id = resourceId || (req.params ? req.params.id : null);

  if (method === 'GET') {
    if (id) {
      const p = products.find(prod => String(prod.id) === String(id));
      if (p) return res.json(p);
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.json(products);
  }

  if (method === 'POST' || method === 'PUT') {
    const { id: reqId, title, price, desc, ai_prompt } = req.body || {};
    const targetId = id || reqId;
    if (!title || price === undefined) {
      return res.status(400).json({ error: 'Title and price are required' });
    }
    const productItem = {
      id: targetId ? String(targetId) : ('p_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
      title,
      price: Number(price),
      desc: desc || '',
      ai_prompt: ai_prompt || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const existingIdx = products.findIndex(p => String(p.id) === String(productItem.id));
    if (existingIdx !== -1) {
      products[existingIdx] = { ...products[existingIdx], ...productItem };
    } else {
      products.unshift(productItem);
    }

    if (storageMode === 'mysql' && dbPool) {
      try {
        await dbPool.query(
          'INSERT INTO eval_products (id, title, price, desc_text, ai_prompt) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), price=VALUES(price), desc_text=VALUES(desc_text), ai_prompt=VALUES(ai_prompt)',
          [productItem.id, productItem.title, productItem.price, productItem.desc, productItem.ai_prompt]
        );
        console.log(`[MySQL Storage] 成功同步更新商品数据 [${productItem.id}]: ${productItem.title}`);
      } catch (e) {
        console.error('[MySQL Error]', e.message);
      }
    }
    saveToFile();
    return res.status(200).json({ id: productItem.id, message: 'Product saved', product: productItem });
  }

  if (method === 'DELETE' && id) {
    products = products.filter(p => String(p.id) !== String(id));
    delete chatSessions[id];

    if (storageMode === 'mysql' && dbPool) {
      try {
        await dbPool.query('DELETE FROM eval_products WHERE id=?', [String(id)]);
        await dbPool.query('DELETE FROM eval_sessions WHERE product_id=?', [String(id)]);
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
  const id = resourceId || (req.params ? req.params.id : null);

  if (method === 'GET') {
    if (id) {
      const session = Object.values(chatSessions).find(s => String(s.id) === String(id));
      if (session) return res.json(session);
      return res.status(404).json({ error: 'Session not found' });
    }
    const productId = req.query.product_id;
    if (productId) {
      const pidStr = String(productId);
      if (!chatSessions[pidStr]) {
        chatSessions[pidStr] = {
          id: nextSessionId++,
          product_id: pidStr,
          chat_history: '[]',
          bargain_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      return res.json(chatSessions[pidStr]);
    }
    return res.json(Object.values(chatSessions));
  }

  if (method === 'POST' || method === 'PUT') {
    const { product_id, chat_history, bargain_count } = req.body || {};
    const pidStr = product_id ? String(product_id) : null;
    if (!pidStr) return res.status(400).json({ error: 'product_id is required' });

    const historyStr = typeof chat_history === 'string' ? chat_history : JSON.stringify(chat_history || []);
    if (chatSessions[pidStr]) {
      chatSessions[pidStr].chat_history = historyStr;
      chatSessions[pidStr].bargain_count = bargain_count ?? chatSessions[pidStr].bargain_count;
      chatSessions[pidStr].updated_at = new Date().toISOString();
    } else {
      chatSessions[pidStr] = {
        id: nextSessionId++,
        product_id: pidStr,
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
          [pidStr, historyStr, chatSessions[pidStr].bargain_count]
        );
      } catch (e) {
        console.error('[MySQL Session Sync Error]', e.message);
      }
    }
    saveToFile();
    return res.json({ id: chatSessions[pidStr].id, message: 'Session saved' });
  }

  if (method === 'DELETE' && id) {
    const key = Object.keys(chatSessions).find(k => String(chatSessions[k].id) === String(id) || String(k) === String(id));
    if (key) {
      const pid = chatSessions[key].product_id;
      delete chatSessions[key];
      if (storageMode === 'mysql' && dbPool && pid) {
        dbPool.query('DELETE FROM eval_sessions WHERE product_id=?', [String(pid)]).catch(e => console.error('[MySQL Session Delete Error]', e.message));
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
    return res.json({
      ...globalConfig,
      storage_mode: storageMode,
      env_keys: {
        gemini: !!process.env.GEMINI_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY
      }
    });
  }
  if (method === 'POST' || method === 'PUT') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      globalConfig = { ...globalConfig, ...payload };

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
  let { provider_type, base_url, api_key, model_name, system_prompt, messages } = req.body || {};

  // 环境变量中预设的中转站/代理地址，优先使用以防中转站地址在前端泄露
  const envBaseUrl = process.env.BASE_URL || process.env.OPENAI_BASE_URL || process.env.API_BASE_URL;

  // 如果前端未传 api_key (或传了空字符串/空格)，自动从环境变量多维提取
  if (!api_key || (typeof api_key === 'string' && !api_key.trim())) {
    if (provider_type === 'gemini') {
      api_key = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.OPENAI_API_KEY;
    } else if (provider_type === 'anthropic') {
      api_key = process.env.ANTHROPIC_API_KEY || process.env.API_KEY;
    } else if (provider_type === 'dashscope_app') {
      api_key = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || process.env.API_KEY;
    } else {
      // openai_compatible 或通用模式
      api_key = process.env.OPENAI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.DASHSCOPE_API_KEY;
      if (!api_key && process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        api_key = process.env.GEMINI_API_KEY;
        provider_type = 'gemini';
        model_name = model_name && model_name.includes('gemini') ? model_name : 'gemini-1.5-flash';
      } else if (!api_key && process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
        api_key = process.env.ANTHROPIC_API_KEY;
        provider_type = 'anthropic';
        model_name = model_name && model_name.includes('claude') ? model_name : 'claude-3-5-sonnet-20241022';
      }
    }
  }

  if (!api_key || (typeof api_key === 'string' && !api_key.trim())) {
    return res.status(400).json({ error: `未检测到有效的 API Key。请在前端面板填写，或在服务端 .env 文件中添加 OPENAI_API_KEY、GEMINI_API_KEY 或 API_KEY` });
  }
  api_key = String(api_key).trim();

  const timeoutMs = 35000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (provider_type === 'gemini') {
      const model = model_name || 'gemini-1.5-flash';
      const geminiHost = envBaseUrl ? envBaseUrl.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com';
      const url = `${geminiHost}/v1beta/models/${model}:generateContent?key=${api_key}`;
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
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        return res.json({ reply: data.candidates[0].content.parts[0].text });
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
      return res.json({ reply: typeof data === 'string' ? data : JSON.stringify(data) });
    } else if (provider_type === 'anthropic') {
      const targetBase = (envBaseUrl || base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
      const url = targetBase + '/messages';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': api_key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model_name || 'claude-3-5-sonnet-20241022',
          max_tokens: 2048,
          system: system_prompt,
          messages: (messages || []).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
          }))
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data.content && data.content[0] && data.content[0].text) {
        return res.json({ reply: data.content[0].text });
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
      return res.json({ reply: typeof data === 'string' ? data : JSON.stringify(data) });
    } else if (provider_type === 'dashscope_app') {
      const targetBase = (envBaseUrl || base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
      const url = targetBase + '/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_key}`
        },
        body: JSON.stringify({
          model: model_name || 'qwen-plus',
          messages: [
            { role: 'system', content: system_prompt },
            ...(messages || [])
          ]
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message?.content) {
        return res.json({ reply: data.choices[0].message.content });
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
      return res.json({ reply: typeof data === 'string' ? data : JSON.stringify(data) });
    } else {
      // openai_compatible
      const targetBase = (envBaseUrl || base_url || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const url = targetBase + '/chat/completions';
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
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message?.content) {
        return res.json({ reply: data.choices[0].message.content });
      }
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
      return res.json({ reply: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI 请求超时：远端 AI 服务响应时间超过 35 秒，请检查网络或更换模型重试' });
    }
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

  const timeoutMs = 35000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions = {
      method: body ? 'POST' : 'GET',
      headers: { ...headers },
      signal: controller.signal
    };
    if (body) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Proxy 请求超时：目标服务器响应时间超过 35 秒' });
    }
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
