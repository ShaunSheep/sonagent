# 技术问题记录

---

## 📌 专题：缩略图不显示 Bug 排查（v1.5 第二轮）

### 问题概述
视频卡片显示正常，但缩略图始终不显示。

### 排查过程（共8轮）

| 轮次 | 尝试方向 | 发现/修复 | 结果 |
|------|----------|------------|------|
| 1 | 修改 `style.css` 标题高度 | 发现 CSS 中 `height: 36px` 可能不够 | ❌ 缩略图仍不显示 |
| 2 | 修改 `videos.json` 添加 thumbnail 字段 | 第一个视频缺少 thumbnail 字段 | ❌ 缩略图仍不显示 |
| 3 | 重新生成缩略图 | 缩略图文件缺失 | ✅ 缩略图文件已生成 |
| 4 | 修改 CSS 标题布局 | 移除固定高度，改用 line-clamp | ❌ 问题依旧 |
| 5 | 修改 `server.js` 的 `/api/videos` 接口 | 发现接口没有返回 thumbnail | ✅ 接口已修复 |
| 6 | 强制刷新浏览器缓存 | 服务器还在运行旧代码 | ❌ 需要重启服务器 |
| 7 | 发现视频卡片未渲染 | 页面加载时不自动显示视频 | ✅ 添加 `loadVideosOnStart()` |
| 8 | 历史视频无缩略图 | 历史记录中的视频缺少 thumbnail | ✅ 添加 `enrichVideosWithThumbnails()` |

### 根因分析

#### 问题1：API 返回数据不完整
```javascript
// server.js 第 577-587 行（修改前）
app.get('/api/videos', (req, res) => {
    const videos = searchVideosDB(keyword, limit);
    res.json(videos.map(v => ({
        id: v.id,
        name: v.title  // ❌ 缺少 thumbnail 字段
    })));
});

// 修复后
app.get('/api/videos', (req, res) => {
    const videos = searchVideos(keyword, limit);  // 使用包含 thumbnail 的函数
    res.json(videos);
});
```

#### 问题2：历史记录视频无缩略图
历史记录保存的是当时的视频数据（不含 thumbnail），加载历史时不补充缩略图信息。

#### 问题3：页面加载时不自动显示视频
视频卡片只在**发送消息后**才显示，页面首次加载时不显示。

### 最终解决方案

```javascript
// chat.js

// 1. 页面加载时自动获取视频
async function loadVideosOnStart() {
    const res = await fetch('/api/videos?limit=4');
    const videos = await res.json();
    if (videos.length > 0) {
        currentVideos = videos;
        showVideoCards(videos);
    }
}

// 2. 补充历史视频的缩略图
async function enrichVideosWithThumbnails(videos) {
    const res = await fetch('/api/videos?limit=100');
    const allVideos = await res.json();
    
    return videos.map(video => {
        const matched = allVideos.find(v => v.id === video.id);
        if (matched && matched.thumbnail) {
            video.thumbnail = matched.thumbnail;
        }
        return video;
    });
}

// 3. 初始化逻辑
document.addEventListener('DOMContentLoaded', async () => {
    await loadLatestHistory();  // 加载历史（含视频）
    
    if (currentVideos.length === 0) {
        loadAllVideos();  // 无历史时显示全部视频
    }
});
```

### 经验总结

#### 如何快速定位缩略图问题

1. **检查 API 返回**
   - 浏览器控制台执行：`fetch('/api/videos?limit=4').then(r=>r.json()).then(console.log)`
   - 确认返回数据中是否有 `thumbnail` 字段

2. **检查图片文件是否存在**
   - 访问：`http://localhost:3000/thumbnails/xxx.jpg`
   - 确认文件是否在 `public/thumbnails/` 目录

3. **检查 DOM 元素**
   - 控制台执行：`document.querySelectorAll('.video-thumb-img').forEach(img => console.log(img.src))`
   - 确认元素是否被渲染

4. **检查浏览器控制台错误**
   - F12 → Console 查看是否有 404 或加载错误

#### 下次避免同类问题

| 规则 | 说明 |
|------|------|
| **接口返回完整数据** | 所有列表类 API 应返回完整字段，不遗漏 |
| **前端不依赖后端缓存** | 历史记录等数据需要补充最新字段 |
| **修改代码后重启服务** | Node.js 代码修改需要重启才能生效 |
| **自动化测试** | 添加接口测试，验证返回字段完整性 |

#### 相关文件修改记录

| 文件 | 修改内容 |
|------|----------|
| `server.js` | `/api/videos` 改用 `searchVideos` 函数 |
| `public/js/chat.js` | 添加 `loadVideosOnStart()` 和 `enrichVideosWithThumbnails()` |
| `public/css/style.css` | 标题样式优化 |
| `videos.json` | 补充所有视频的 thumbnail 字段 |

---

## 📌 专题：视频卡片标题在小屏幕显示3行 Bug（v1.5 第三轮）

### 问题概述
PC端视频卡片标题显示2行，但手机端显示3行，不一致。

### 排查过程（共2轮）

| 轮次 | 尝试方向 | 发现/修复 | 结果 |
|------|----------|------------|------|
| 1 | 添加固定高度 `height: 36px` | `-webkit-line-clamp: 2` 在小屏幕下不生效 | ❌ 文字被截断显示不完整 |
| 2 | 改用 `max-height: 3.2em` | 配合 line-clamp 确保2行完整显示 | ✅ 问题解决 |

### 根因分析

#### 问题1：line-clamp 在移动端失效
`-webkit-line-clamp: 2` 在 PC 端浏览器可以正常工作，但在移动端 Safari/Chrome 下需要配合高度限制才能生效。

#### 问题2：固定高度导致文字截断
使用 `height: 36px` 虽然能限制行数，但字体大小不同时会导致文字被截断，用户体验差。

### 最终解决方案

```css
.video-card-title-inline {
    padding: 8px 10px;
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    /* 使用 max-height 配合 line-clamp 确保2行完整显示 */
    max-height: 3.2em;
    text-overflow: ellipsis;
    word-break: break-all;
}
```

### 经验总结

#### 如何快速定位 line-clamp 问题

1. **检查是否设置高度限制**
   - `-webkit-line-clamp` 需要配合 `height` 或 `max-height` 才能在移动端生效

2. **使用 max-height 而非 height**
   - `height: 固定值` 可能导致文字截断
   - `max-height` 更灵活，可适应不同字体大小

3. **移动端测试**
   - Chrome DevTools 可模拟移动设备（Ctrl+Shift+M）
   - 重点测试 Safari 和低版本 Android 浏览器

#### 下次避免同类问题

| 规则 | 说明 |
|------|------|
| **line-clamp 配合高度限制** | 使用 `-webkit-line-clamp` 时必须设置 `height` 或 `max-height` |
| **优先使用 max-height** | 避免固定高度导致的文字截断问题 |
| **多设备测试** | CSS 效果必须在 PC/iOS/Android 三端验证 |
| **响应式设计** | 考虑不同屏幕尺寸下的显示效果 |

#### 相关文件修改记录

| 文件 | 修改内容 |
|------|----------|
| `public/css/style.css` | `.video-card-title-inline` 添加 `max-height: 3.2em` |

---

## 2026-04-25 视频播放功能重构

### 问题1：视频播放路径不统一
**现象**：视频播放相关逻辑分散，有的走本地路径，有的走其他方式。

**原因**：架构设计不清晰。

**解决方案**：
- 统一规定：只要是视频播放相关，都走本地路径
- 前端只存储视频 ID 和文件名，传给大模型时不传本地路径
- 后端维护视频 ID 与本地路径的映射关系

---

### 问题2：大模型字符量过大
**现象**：每次搜索都把完整路径传给大模型，字符量过大。

**原因**：视频数据结构包含完整本地路径。

**解决方案**：
- 传给大模型时只传 `{ id, name, filename }`
- 点击播放时再请求后端获取完整信息（含 path）
- 减少 token 消耗

---

### 问题3：前端搜索关键词提取错误
**现象**：说"播放油罐车视频"时搜索返回空。

**原因**：`extractVideoKeyword` 函数没有移除"视频"关键词。
- 输入："播放油罐车视频"
- 移除"播放"后："油罐车视频"
- 搜索"油罐车视频"匹配不到"油罐车"

**解决方案**：
```javascript
// 在正则中添加"视频"关键词
.replace(/播放|看|找|给我|想|一下|个|有没有|有视频吗|给我个|想看|给我看看|视频/g, ' ')
```

---

### 问题4：playVideo 中关键词获取错误
**现象**：点击视频卡片后显示"视频不存在"。

**原因**：`playVideo` 函数从 `conversationHistory` 最后一条获取关键词，但最后一条是 AI 的回复，导致关键词为空。

**解决方案**：
- 不再依赖 history 获取关键词
- 直接用视频 ID 请求后端，后端通过 ID 查找对应视频

---

### 问题5：视频 ID 不稳定
**现象**：使用数组索引作为视频 ID，每次搜索结果顺序可能不同。

**原因**：数组索引不是持久化标识。

**解决方案**：
- 使用 `videos.json` 数据库管理视频元数据
- 视频 ID 使用固定字符串（如 `oil_tanker_test`）
- 后端通过固定 ID 查找视频，不再依赖搜索

---

### 问题6：文件名包含特殊字符
**现象**：文件名包含全角冒号（：）、感叹号等特殊字符，影响匹配。

**原因**：文件名"乐高游戏：油罐车..."中的全角冒号与搜索词不匹配。

**解决方案**：
- 视频文件重命名为不含特殊字符的名称
- 在 `videos.json` 中用 `filename` 存储实际文件名，`title` 存储规范化后的标题

---

### 最终架构方案

#### 目录结构
```
e:/sonagent/
├── public/
│   └── videos/                    # 视频文件存放目录
│       └── 油罐车测试_第一视角.mp4
├── videos.json                    # 视频元数据数据库
└── server.js
```

#### videos.json 结构
```json
{
  "videos": [
    {
      "id": "oil_tanker_test",
      "title": "乐高游戏 油罐车撞击油箱产生巨大冲击波 游戏测试 第一视角",
      "filename": "油罐车测试_第一视角.mp4",
      "originalFilename": "乐高游戏：油罐车撞击油箱产生巨大冲击波，游戏测试！_第一视角.mp4",
      "tags": ["油罐车", "乐高", "汽车", "撞击", "测试", "游戏"]
    }
  ]
}
```

#### API 接口
| 接口 | 用途 |
|------|------|
| `GET /api/videos?keyword=xxx` | 搜索视频，返回 `[{id, name}]` |
| `GET /api/video-path/:id` | 根据 ID 获取完整信息（含 path） |
| `GET /videos/:filename` | 视频流传输 |

#### 添加新视频
1. 将视频文件放入 `public/videos/` 目录
2. 重命名为不含特殊字符的名称
3. 在 `videos.json` 中添加记录：
```json
{
  "id": "唯一标识",
  "title": "搜索用标题（无特殊字符）",
  "filename": "实际文件名.mp4",
  "originalFilename": "原始文件名（可选）",
  "tags": ["标签1", "标签2"]
}
```
