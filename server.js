const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const initSqlJs = require('sql.js');

const app = express();
const PORT = require('./config.json').serverPort || 3000;
const DB_PATH = './data/history.db';

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 初始化SQLite数据库
let db = null;

async function initDatabase() {
    const SQL = await initSqlJs();
    
    // 确保目录存在
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data', { recursive: true });
    }
    
    // 加载或创建数据库
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }
    
    // 创建表
    db.run(`
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userMessage TEXT NOT NULL,
            aiReply TEXT,
            videos TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    saveDatabase();
    console.log('📦 历史记录数据库初始化完成');
}

// 同步视频目录与数据库
function syncVideosWithDirectory() {
    const videosDir = path.join(__dirname, 'public', 'videos');
    const videosJsonPath = path.join(__dirname, 'videos.json');
    
    // 确保视频目录存在
    if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
        console.log('📁 视频目录已创建');
        return;
    }
    
    // 读取视频目录中的文件
    const files = fs.readdirSync(videosDir).filter(f => 
        f.endsWith('.mp4') || f.endsWith('.avi') || f.endsWith('.mov') || f.endsWith('.mkv')
    );
    
    // 加载现有 videos.json
    let videoData = { videos: [] };
    if (fs.existsSync(videosJsonPath)) {
        try {
            videoData = JSON.parse(fs.readFileSync(videosJsonPath, 'utf-8'));
        } catch (e) {
            console.log('⚠️ videos.json 解析失败，将重新创建');
        }
    }
    
    // 构建现有文件名的映射
    const existingFiles = new Map();
    videoData.videos.forEach(v => existingFiles.set(v.filename, v));
    
    // 同步文件列表
    let updated = false;
    const newVideos = [];
    
    files.forEach(filename => {
        if (existingFiles.has(filename)) {
            // 已存在，保留原有配置
            newVideos.push(existingFiles.get(filename));
        } else {
            // 新文件，自动添加
            const id = generateVideoId(filename);
            const title = filename.replace(/\.(mp4|avi|mov|mkv)$/i, '').replace(/[_-]/g, ' ');
            const tags = extractTags(title);
            
            newVideos.push({
                id: id,
                title: title,
                filename: filename,
                tags: tags
            });
            console.log(`🆕 自动添加视频: ${filename}`);
            updated = true;
        }
    });
    
    // 保存更新后的配置
    if (updated || newVideos.length !== videoData.videos.length) {
        fs.writeFileSync(videosJsonPath, JSON.stringify({ videos: newVideos }, null, 2));
        console.log(`📹 视频数据库已同步: ${newVideos.length} 个视频`);
    } else {
        console.log(`📹 视频数据库已是最新: ${newVideos.length} 个视频`);
    }
}

// 生成视频ID
function generateVideoId(filename) {
    // 移除扩展名和特殊字符
    const name = filename.replace(/\.(mp4|avi|mov|mkv)$/i, '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_');
    // 添加时间戳确保唯一性
    return `video_${name}_${Date.now().toString(36)}`;
}

// 提取标签
function extractTags(title) {
    const tags = [];
    const keywords = ['油罐车', '汽车', '测试', '游戏', '撞击', '动画', '儿童', '故事', '音乐', '教程'];
    keywords.forEach(kw => {
        if (title.includes(kw)) tags.push(kw);
    });
    return tags.length > 0 ? tags : ['视频'];
}

function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

// 加载配置
function loadConfig() {
    return JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
}

// 保存配置
function saveConfig(config) {
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
}

// 加载收藏
function loadFavorites() {
    if (fs.existsSync('./favorites.json')) {
        return JSON.parse(fs.readFileSync('./favorites.json', 'utf-8'));
    }
    return { favorites: [] };
}

// 保存收藏
function saveFavorites(data) {
    fs.writeFileSync('./favorites.json', JSON.stringify(data, null, 2));
}

// 加载视频元数据
function loadVideos() {
    if (fs.existsSync('./videos.json')) {
        return JSON.parse(fs.readFileSync('./videos.json', 'utf-8'));
    }
    return { videos: [] };
}

// 保存视频元数据
function saveVideos(data) {
    fs.writeFileSync('./videos.json', JSON.stringify(data, null, 2));
}

// 根据关键词搜索视频
function searchVideosDB(keyword, limit = 4) {
    const data = loadVideos();
    
    if (!keyword || keyword.trim() === '') {
        // 无关键词，返回所有视频
        return data.videos.slice(0, limit);
    }
    
    // 把关键词分割成多个词
    const keywords = keyword.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter(k => k.length >= 1);
    
    const matched = data.videos.filter(video => {
        const searchText = (video.title + ' ' + video.tags.join(' ')).toLowerCase();
        return keywords.some(kw => searchText.includes(kw.toLowerCase()));
    }).slice(0, limit);
    
    return matched;
}

// 根据ID获取视频
function getVideoById(id) {
    const data = loadVideos();
    return data.videos.find(v => v.id === id);
}

// 根据文件名获取视频
function getVideoByFilename(filename) {
    const data = loadVideos();
    return data.videos.find(v => v.filename === filename);
}

// 获取本机IP
function getLocalIP() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// ============ 历史记录 API ============

// 获取历史记录列表
app.get('/api/history', (req, res) => {
    if (!db) {
        return res.status(500).json({ error: '数据库未初始化' });
    }
    
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        
        const stmt = db.prepare('SELECT * FROM chat_history ORDER BY createdAt DESC LIMIT ? OFFSET ?');
        stmt.bind([limit, offset]);
        
        const list = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            row.videos = row.videos ? JSON.parse(row.videos) : [];
            list.push(row);
        }
        stmt.free();
        
        // 获取总数
        const countStmt = db.prepare('SELECT COUNT(*) as total FROM chat_history');
        countStmt.step();
        const total = countStmt.getAsObject().total;
        countStmt.free();
        
        res.json({ list, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 保存历史记录
app.post('/api/history', (req, res) => {
    if (!db) {
        return res.status(500).json({ error: '数据库未初始化' });
    }
    
    try {
        const { userMessage, aiReply, videos } = req.body;
        
        db.run(
            'INSERT INTO chat_history (userMessage, aiReply, videos) VALUES (?, ?, ?)',
            [userMessage, aiReply || '', JSON.stringify(videos || [])]
        );
        
        saveDatabase();
        
        // 获取刚插入的ID
        const stmt = db.prepare('SELECT last_insert_rowid() as id');
        stmt.step();
        const id = stmt.getAsObject().id;
        stmt.free();
        
        res.json({ success: true, id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取单条历史记录
app.get('/api/history/:id', (req, res) => {
    if (!db) {
        return res.status(500).json({ error: '数据库未初始化' });
    }
    
    try {
        const id = parseInt(req.params.id);
        const stmt = db.prepare('SELECT * FROM chat_history WHERE id = ?');
        stmt.bind([id]);
        
        if (stmt.step()) {
            const row = stmt.getAsObject();
            row.videos = row.videos ? JSON.parse(row.videos) : [];
            stmt.free();
            res.json(row);
        } else {
            stmt.free();
            res.status(404).json({ error: '记录不存在' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 删除单条历史记录
app.delete('/api/history/:id', (req, res) => {
    if (!db) {
        return res.status(500).json({ error: '数据库未初始化' });
    }
    
    try {
        const id = parseInt(req.params.id);
        db.run('DELETE FROM chat_history WHERE id = ?', [id]);
        saveDatabase();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 清空所有历史记录
app.delete('/api/history', (req, res) => {
    if (!db) {
        return res.status(500).json({ error: '数据库未初始化' });
    }
    
    try {
        db.run('DELETE FROM chat_history');
        saveDatabase();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ API 接口 ============

// 获取配置
app.get('/api/config', (req, res) => {
    const config = loadConfig();
    // 隐藏API Key
    if (config.doubaoApiKey) {
        config.doubaoApiKey = config.doubaoApiKey.substring(0, 4) + '****' + config.doubaoApiKey.slice(-4);
    }
    res.json(config);
});

// 保存配置
app.post('/api/config', (req, res) => {
    try {
        const newConfig = req.body;
        const config = loadConfig();
        Object.assign(config, newConfig);
        saveConfig(config);
        res.json({ success: true, message: '配置已保存' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// AI对话
app.post('/api/chat', async (req, res) => {
    let { message, history = [], localVideos = [] } = req.body;
    const config = loadConfig();
    
    if (!config.doubaoApiKey) {
        return res.status(400).json({ error: '请先在设置中配置豆包API Key' });
    }

    try {
        // 构建消息数组
        const messages = [];
        
        // 1. 基础系统提示 - 优化视频播放引导
        let systemPrompt = '你是豆包，简洁回复。';
        if (localVideos.length > 0) {
            systemPrompt = `你是一个本地视频助手。用户想要播放本地视频。

【重要规则】：
1. 如果用户消息中提到"本地有这些视频"，说明本地已经找到了匹配的视频
2. 你必须告诉用户："找到视频了！点击下方视频卡片即可播放"
3. 绝对不要推荐任何外部视频平台（如抖音、B站、西瓜视频等）
4. 不要说"不支持播放"或"无法直接播放"这类话
5. 简洁回复即可`;
        }
        messages.push({ role: 'system', content: systemPrompt });

        // 2. 如果有本地视频，在用户消息中直接提供视频信息（只传id和文件名，不传路径）
        if (localVideos.length > 0) {
            const videoList = localVideos.map((v, i) => `【视频${i+1}】${v.name}`).join('\n');
            // 在用户消息中附带视频列表（只包含id和name，减少字符量）
            message = `用户说: ${message}\n\n本地有这些视频:\n${videoList}`;
        }

        // 3. 加入历史对话
        history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
        });

        // 4. 加入用户当前消息
        messages.push({ role: 'user', content: message });

        const response = await fetch(`${config.doubaoApiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.doubaoApiKey}`
            },
            body: JSON.stringify({
                model: config.chatModel,
                messages: messages
            })
        });

        const data = await response.json();
        
        if (data.error) {
            return res.status(500).json({ error: data.error.message });
        }

        const reply = data.choices[0].message.content;

        res.json({ 
            reply: reply,
            localVideos: localVideos  // 把视频列表也返回给前端
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// TTS语音合成
app.post('/api/tts', async (req, res) => {
    const { text } = req.body;
    const config = loadConfig();

    if (!config.doubaoApiKey) {
        return res.status(400).json({ error: '请先配置API Key' });
    }

    try {
        const response = await fetch(`${config.doubaoApiUrl}/audio/speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.doubaoApiKey}`
            },
            body: JSON.stringify({
                model: config.ttsModel,
                input: text,
                voice: 'female_tianmei'
            })
        });

        const buffer = await response.buffer();
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length
        });
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 提示词推荐 API
app.get('/api/prompt-suggestions', async (req, res) => {
    const config = loadConfig();
    
    if (!config.doubaoApiKey) {
        return res.json({ suggestions: getDefaultSuggestions() });
    }

    try {
        // 获取本地视频数据
        const videos = loadVideos().videos;
        
        // 构建视频标签列表
        const videoTitles = videos.slice(0, 10).map(v => v.title).join('、');
        const allTags = [...new Set(videos.flatMap(v => v.tags || []))].join('、');
        
        const prompt = `你是豆包App的提示词生成器。请根据用户的本地视频内容，生成4个适合儿童/家庭用户聊天的推荐话题。

【本地视频主题】：${videoTitles || '暂无视频'}
【视频标签】：${allTags || '暂无标签'}

【要求】：
1. 生成4个不同的推荐话题
2. 话题应该有趣、适合儿童、能引发好奇心
3. 可以结合本地视频的主题或标签
4. 每个话题15-25个字
5. 直接返回4个话题，用换行分隔，不要加序号或任何前缀

【示例格式】：
给我讲个关于小动物的故事
为什么天空是蓝色的呢
播放一个有趣的动画片
教我唱一首儿歌`;

        const response = await fetch(`${config.doubaoApiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.doubaoApiKey}`
            },
            body: JSON.stringify({
                model: config.chatModel,
                messages: [
                    { role: 'user', content: prompt }
                ]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.log('提示词生成失败:', data.error);
            return res.json({ suggestions: getDefaultSuggestions() });
        }

        const reply = data.choices[0].message.content;
        // 解析返回的提示词，每行一个
        const suggestions = reply.split('\n').filter(s => s.trim()).slice(0, 4);
        
        res.json({ suggestions: suggestions.length > 0 ? suggestions : getDefaultSuggestions() });
    } catch (error) {
        console.log('提示词推荐API错误:', error);
        res.json({ suggestions: getDefaultSuggestions() });
    }
});

// 获取默认提示词
function getDefaultSuggestions() {
    return [
        '播放一个有趣的视频',
        '给我讲个故事',
        '推荐一些儿童动画片',
        '播放音乐视频'
    ];
}

// 搜索本地视频（从 videos.json 搜索）
function searchVideos(keyword, limit = 4) {
    const data = loadVideos();
    
    if (!keyword || keyword.trim() === '') {
        return data.videos.slice(0, limit).map((v, i) => ({
            id: v.id,
            name: v.title,
            filename: v.filename,
            thumbnail: v.thumbnail || null
        }));
    }
    
    // 把关键词分割成多个词
    const keywords = keyword.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter(k => k.length >= 1);
    
    const matched = data.videos.filter(video => {
        const searchText = ((video.title || '') + ' ' + ((video.tags || []).join(' '))).toLowerCase();
        return keywords.some(kw => searchText.includes(kw.toLowerCase()));
    }).slice(0, limit);

    return matched.map(v => ({
        id: v.id,
        name: v.title,
        filename: v.filename,
        thumbnail: v.thumbnail || null
    }));
}

// 获取视频列表（从数据库搜索）
app.get('/api/videos', (req, res) => {
    const keyword = req.query.keyword || '';
    const limit = parseInt(req.query.limit) || 4;
    // 使用 searchVideos 而不是 searchVideosDB，确保返回 thumbnail
    const videos = searchVideos(keyword, limit);
    res.json(videos);
});

// 获取单个视频信息（不包含本地路径）
app.get('/api/video/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const keyword = req.query.keyword || '';
    const videos = searchVideos(keyword, 10);
    
    if (id >= 0 && id < videos.length) {
        res.json(videos[id]);
    } else {
        res.status(404).json({ error: '视频不存在' });
    }
});

// 根据ID获取视频完整信息（包含本地路径，用于实际播放）
app.get('/api/video-path/:id', (req, res) => {
    const id = req.params.id;
    const video = getVideoById(id);
    
    if (!video) {
        return res.status(404).json({ error: '视频不存在' });
    }
    
    // 返回完整信息，包含本地播放路径
    res.json({
        ...video,
        name: video.title,
        path: `/videos/${encodeURIComponent(video.filename)}`
    });
});

// 根据文件名获取视频完整信息（用于收藏夹播放）
app.get('/api/video-by-filename', (req, res) => {
    const filename = req.query.filename;
    if (!filename) {
        return res.status(400).json({ error: '缺少filename参数' });
    }
    
    const video = getVideoByFilename(filename);
    if (!video) {
        return res.status(404).json({ error: '视频不存在' });
    }
    
    res.json({
        ...video,
        name: video.title,
        path: `/videos/${encodeURIComponent(video.filename)}`
    });
});

// 视频流
app.get('/videos/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const videoPath = path.join(__dirname, 'public', 'videos', filename);

    if (!fs.existsSync(videoPath)) {
        console.log('视频文件不存在:', videoPath);
        return res.status(404).send('视频文件不存在');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // 添加 CORS 头，支持跨域访问
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
    });

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (range) {
        // iOS Safari 发送的 Range 请求
        const parts = range.replace(/bytes=/, '').split('-');
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // 确保 start 和 end 有效
        if (start >= fileSize) start = fileSize - 1;
        if (end >= fileSize) end = fileSize - 1;
        if (start > end) start = end;

        const chunkSize = end - start + 1;
        
        res.writeHead(206, {
            'Content-Type': 'video/mp4',
            'Content-Length': chunkSize,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        const file = fs.createReadStream(videoPath, { start, end });
        file.pipe(res);

        file.on('error', (err) => {
            console.error('视频流错误:', err);
            res.end();
        });
    } else {
        // 无 Range 请求时返回整个文件
        res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
        });
        
        fs.createReadStream(videoPath).pipe(res);
    }
});

// 获取收藏列表
app.get('/api/favorites', (req, res) => {
    const favorites = loadFavorites();
    res.json(favorites.favorites);
});

// 添加收藏
app.post('/api/favorites', (req, res) => {
    const { video } = req.body;
    const favorites = loadFavorites();
    
    const exists = favorites.favorites.find(f => f.filename === video.filename);
    if (exists) {
        return res.json({ success: false, message: '已经收藏过了' });
    }
    
    favorites.favorites.push(video);
    saveFavorites(favorites);
    res.json({ success: true, message: '收藏成功' });
});

// 删除收藏
app.delete('/api/favorites/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const favorites = loadFavorites();
    
    favorites.favorites = favorites.favorites.filter(f => f.filename !== filename);
    saveFavorites(favorites);
    res.json({ success: true, message: '已取消收藏' });
});

// ============ 页面路由 (SPA Fallback) ============

// 处理 /settings, /player, /favorites, /history 等页面路由
app.get('/:page', (req, res) => {
    const page = req.params.page;
    const validPages = ['settings', 'player', 'favorites', 'history'];
    
    if (validPages.includes(page)) {
        res.sendFile(path.join(__dirname, 'public', `${page}.html`));
    } else {
        res.redirect('/');
    }
});

// 所有其他路径重定向到首页
app.get('*', (req, res) => {
    res.redirect('/');
});

// ============ 启动服务 ============

app.listen(PORT, async () => {
    await initDatabase();
    syncVideosWithDirectory(); // 同步视频目录
    
    const localIP = getLocalIP();
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║                                                   ║');
    console.log('║   🎉 SonAgent 服务已启动                           ║');
    console.log('║                                                   ║');
    console.log(`║   📱 手机访问: http://${localIP}:${PORT}          ║`);
    console.log(`║   💻 本机访问: http://localhost:${PORT}              ║`);
    console.log('║                                                   ║');
    console.log('╚═══════════════════════════════════════════════════╝');
});
