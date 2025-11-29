// server.js - 英语学习工具后端服务器
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 中间件
app.use(cors());
app.use(express.json());

// ==================== 配置 API 密钥 ====================
// 👇 把你的密钥填在这里
const BAIDU_APP_ID = '20251127002507313';        // 替换成你的 APP ID
const BAIDU_SECRET_KEY = 'Kghf4u8d7gUkMdQgg3Z9';    // 替换成你的密钥

// ==================== 1. OCR 图片识别 ====================
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传图片' });
    }

    console.log('开始 OCR 识别...');
    
    const { data: { text } } = await Tesseract.recognize(
      req.file.buffer,
      'eng',
      { logger: m => console.log(m.status) }
    );

    console.log('识别完成');

    res.json({
      success: true,
      text: text.trim()
    });

  } catch (error) {
    console.error('OCR 失败:', error);
    res.status(500).json({ 
      error: 'OCR 识别失败',
      message: error.message 
    });
  }
});

// ==================== 2. 翻译 API ====================
app.post('/api/translate', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: '没有提供文本' });
    }

    console.log('翻译:', text.substring(0, 50) + '...');

    const translation = await baiduTranslate(text);

    res.json({
      success: true,
      original: text,
      translation: translation
    });

  } catch (error) {
    console.error('翻译失败:', error);
    res.status(500).json({ 
      error: '翻译失败',
      message: error.message 
    });
  }
});

// 百度翻译函数
async function baiduTranslate(text) {
  const salt = Date.now();
  const sign = crypto
    .createHash('md5')
    .update(BAIDU_APP_ID + text + salt + BAIDU_SECRET_KEY)
    .digest('hex');

  try {
    const response = await axios.get('https://fanyi-api.baidu.com/api/trans/vip/translate', {
      params: {
        q: text,
        from: 'en',
        to: 'zh',
        appid: BAIDU_APP_ID,
        salt: salt,
        sign: sign
      }
    });

    if (response.data.trans_result) {
      return response.data.trans_result.map(item => item.dst).join('\n');
    } else {
      throw new Error('翻译响应错误');
    }
  } catch (error) {
    console.error('百度翻译 API 错误:', error.response?.data || error.message);
    throw error;
  }
}

// ==================== 3. 词典 API ====================
app.get('/api/dictionary/:word', async (req, res) => {
  try {
    const { word } = req.params;
    
    console.log('查询单词:', word);

    // 1. Free Dictionary API
    let englishData = {};
    try {
      const freeDictResponse = await axios.get(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`
      );
      
      if (freeDictResponse.data && freeDictResponse.data[0]) {
        const entry = freeDictResponse.data[0];
        englishData = {
          phonetic: entry.phonetic || entry.phonetics[0]?.text || `/${word}/`,
          definition: entry.meanings[0]?.definitions[0]?.definition || '暂无定义',
          examples: entry.meanings[0]?.definitions[0]?.example ? 
            [entry.meanings[0].definitions[0].example] : []
        };
      }
    } catch (error) {
      console.log('Free Dictionary 无结果');
    }

    // 2. 百度翻译获取中文
    let translation = word;
    try {
      translation = await baiduTranslate(word);
    } catch (error) {
      console.log('翻译失败');
    }

    res.json({
      success: true,
      word: word,
      phonetic: englishData.phonetic || `/${word}/`,
      translation: translation,
      definition: englishData.definition || '暂无定义',
      examples: englishData.examples.length > 0 ? englishData.examples : 
        [`Example with ${word}.`],
      memory: '多看多记，重复是关键',
      level: word.length > 8 ? '中级' : '基础'
    });

  } catch (error) {
    console.error('词典查询失败:', error);
    res.status(500).json({ 
      error: '词典查询失败',
      message: error.message 
    });
  }
});

// ==================== 健康检查 ====================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// ==================== 启动服务器 ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🚀 英语学习工具后端服务器已启动!      ║
╚════════════════════════════════════════╝

📍 地址: http://localhost:${PORT}
⏰ 时间: ${new Date().toLocaleString()}

📡 可用接口:
  • POST /api/ocr           - 图片识别
  • POST /api/translate     - 文本翻译
  • GET  /api/dictionary/:word - 词典查询
  • GET  /health            - 健康检查

⚠️  提示: 请确保已配置百度翻译 API 密钥!
  `);
});
