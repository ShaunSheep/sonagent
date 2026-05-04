// ========== 聊天页面逻辑 ==========

let conversationHistory = [];
let isRecording = false;
let recognition = null;
let currentVideos = [];
let isTTSEnabled = true; // TTS开关
let currentSpeechUtterance = null; // 当前语音对象
let isSpeaking = false; // 是否正在播放
let recordingTimeout = null; // 录音超时定时器
let voiceMode = 'hold'; // 'hold' 长按模式, 'tap' 点击模式
let isTextMode = false; // 是否为打字模式

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
    checkBrowserSupport();
    initVoiceInput();
    bindEvents();
    updateTTSButton();
    initFullscreen();
    loadFontSize(); // 加载字体大小设置
    initAudioUnlock(); // iOS Safari 音频解锁
    await loadLatestHistory(); // 加载最新历史对话（包含视频）
    loadPromptSuggestions(); // 加载提示词推荐
    initInputMode(); // 初始化输入模式
    initBlankAreaClick(); // 初始化空白区域点击切换录音
    
    // 如果没有历史视频，才显示全部视频
    if (currentVideos.length === 0) {
        loadAllVideos();
    }
});

// 页面加载时自动获取并显示视频（仅当有聊天记录且没有历史视频时）
async function loadAllVideos() {
    // 检查是否有聊天记录
    const container = document.getElementById('chatContainer');
    const hasMessages = container && container.querySelectorAll('.message:not(.video-cards-message)').length > 0;
    
    if (!hasMessages) {
        return; // 没有聊天记录时不显示视频卡片
    }
    
    try {
        const res = await fetch('/api/videos?limit=4');
        const videos = await res.json();
        if (videos && videos.length > 0) {
            currentVideos = videos;
            showVideoCards(videos);
        }
    } catch (e) {
        console.log('加载视频失败', e);
    }
}

// 补充视频的缩略图信息
async function enrichVideosWithThumbnails(videos) {
    if (!videos || videos.length === 0) return videos;
    
    try {
        // 获取所有视频信息（包含 thumbnail）
        const res = await fetch('/api/videos?limit=100');
        const allVideos = await res.json();
        
        // 用 id 或 filename 匹配，补充 thumbnail
        return videos.map(video => {
            const matched = allVideos.find(v => 
                v.id === video.id || v.filename === video.filename
            );
            if (matched && matched.thumbnail) {
                video.thumbnail = matched.thumbnail;
            }
            return video;
        });
    } catch (e) {
        console.log('补充缩略图失败', e);
        return videos;
    }
}

// 初始化空白区域点击切换UI模式
function initBlankAreaClick() {
    const container = document.getElementById('chatContainer');
    
    container.addEventListener('click', (e) => {
        // 如果点击的是以下元素，不触发UI切换
        // 使用 closest() 向上查找
        
        // 欢迎区域
        if (e.target.closest('.welcome-screen')) return;
        if (e.target.closest('.welcome-icon')) return;
        if (e.target.closest('.welcome-title')) return;
        if (e.target.closest('.welcome-desc')) return;
        if (e.target.closest('.suggestion-section')) return;
        if (e.target.closest('.suggestion-item')) return;
        if (e.target.closest('.suggestion-list')) return;
        if (e.target.closest('.suggestion-title')) return;
        
        // 消息气泡区域
        if (e.target.closest('.message-content')) return;
        if (e.target.closest('.message-toolbar')) return;
        if (e.target.closest('.message-toolbar-btn')) return;
        if (e.target.closest('.message')) return;
        
        // 视频卡片
        if (e.target.closest('.video-card-inline')) return;
        if (e.target.closest('.video-card')) return;
        if (e.target.closest('.video-item')) return;
        
        // 输入区域
        if (e.target.closest('.input-area')) return;
        if (e.target.closest('.input-center')) return;
        if (e.target.closest('#textInput')) return;
        if (e.target.closest('#inputHint')) return;
        if (e.target.closest('button')) return;
        
        // 如果当前是打字模式，切换到说话模式（只切换UI，不开始录音）
        if (isTextMode) {
            exitTextMode();
        }
    });
}

// 初始化输入模式
function initInputMode() {
    const keyboardBtn = document.getElementById('keyboardBtn');
    const voiceSwitchBtn = document.getElementById('voiceSwitchBtn');
    const sendBtn = document.getElementById('sendBtn');
    const textInput = document.getElementById('textInput');
    const inputHint = document.getElementById('inputHint');

    // 点击键盘按钮 - 进入打字模式
    keyboardBtn.addEventListener('click', () => {
        enterTextMode();
    });

    // 点击音量按钮 - 退出打字模式
    voiceSwitchBtn.addEventListener('click', () => {
        exitTextMode();
    });

    // 点击发送按钮
    sendBtn.addEventListener('click', () => {
        if (textInput.value.trim()) {
            sendMessage();
        }
    });

    // 输入框内容变化 - 显示/隐藏发送按钮
    textInput.addEventListener('input', () => {
        if (textInput.value.trim()) {
            sendBtn.style.display = 'flex';
        } else {
            sendBtn.style.display = 'none';
        }
    });

    // 输入框回车发送
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && textInput.value.trim()) {
            sendMessage();
        }
    });

    // 长按说话功能 - 绑定到inputHint区域
    inputHint.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording(e);
    });
    inputHint.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopRecording();
    });
    inputHint.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        stopRecording();
    });
    inputHint.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startRecording(e);
    });
    inputHint.addEventListener('mouseup', (e) => {
        e.preventDefault();
        stopRecording();
    });
    inputHint.addEventListener('mouseleave', () => {
        if (isRecording) {
            stopRecording();
        }
    });
}

// 进入打字模式
function enterTextMode() {
    const keyboardBtn = document.getElementById('keyboardBtn');
    const voiceSwitchBtn = document.getElementById('voiceSwitchBtn');
    const sendBtn = document.getElementById('sendBtn');
    const textInput = document.getElementById('textInput');
    const inputHint = document.getElementById('inputHint');

    isTextMode = true;

    // 隐藏按住说话文字，显示输入框
    inputHint.style.display = 'none';
    textInput.style.display = 'block';

    // 切换右侧按钮
    keyboardBtn.style.display = 'none';
    voiceSwitchBtn.style.display = 'flex';

    // 隐藏发送按钮（有内容时显示）
    sendBtn.style.display = 'none';

    // 聚焦输入框
    textInput.focus();
}

// 退出打字模式
function exitTextMode() {
    const keyboardBtn = document.getElementById('keyboardBtn');
    const voiceSwitchBtn = document.getElementById('voiceSwitchBtn');
    const sendBtn = document.getElementById('sendBtn');
    const textInput = document.getElementById('textInput');
    const inputHint = document.getElementById('inputHint');

    isTextMode = false;

    // 清空输入框
    textInput.value = '';

    // 显示按住说话文字，隐藏输入框
    inputHint.style.display = 'block';
    textInput.style.display = 'none';

    // 切换右侧按钮
    keyboardBtn.style.display = 'flex';
    voiceSwitchBtn.style.display = 'none';
    sendBtn.style.display = 'none';

    // 收起键盘
    textInput.blur();
}

// 加载最新历史对话
async function loadLatestHistory() {
    try {
        const res = await fetch('/api/history?limit=1');
        const data = await res.json();
        
        if (data.list && data.list.length > 0) {
            const latest = data.list[0];
            
            // 添加欢迎语（在历史记录前显示）
            const container = document.getElementById('chatContainer');
            const welcomeScreen = document.getElementById('welcomeScreen');
            const suggestionSection = document.getElementById('suggestionSection');
            
            // 清空现有内容
            container.innerHTML = '';
            
            // 添加欢迎语
            welcomeScreen.style.display = 'block';
            welcomeScreen.style.flexDirection = 'column';
            welcomeScreen.style.alignItems = 'center';
            container.appendChild(welcomeScreen);
            
            // 隐藏提示词推荐区域
            if (suggestionSection) {
                suggestionSection.style.display = 'none';
            }
            
            // 恢复历史对话
            addMessage('user', latest.userMessage);
            conversationHistory.push({ role: 'user', content: latest.userMessage });
            
            addMessage('ai', latest.aiReply);
            conversationHistory.push({ role: 'assistant', content: latest.aiReply });
            
            // 如果有视频，补充缩略图后显示视频卡片
            if (latest.videos && latest.videos.length > 0) {
                const enrichedVideos = await enrichVideosWithThumbnails(latest.videos);
                currentVideos = enrichedVideos;
                showVideoCards(enrichedVideos);
            }
            
            // 滚动到底部
            container.scrollTop = container.scrollHeight;
        }
    } catch (e) {
        console.log('加载历史记录失败', e);
    }
}

// 加载提示词推荐（仅当有聊天记录时）
async function loadPromptSuggestions() {
    // 检查是否有聊天记录
    const container = document.getElementById('chatContainer');
    const hasMessages = container && container.querySelectorAll('.message:not(.video-cards-message)').length > 0;
    
    if (!hasMessages) {
        return; // 没有聊天记录时不显示提示词
    }
    
    const suggestionList = document.getElementById('suggestionList');
    if (!suggestionList) return;
    
    try {
        const res = await fetch('/api/prompt-suggestions');
        const data = await res.json();
        
        if (data.suggestions && data.suggestions.length > 0) {
            suggestionList.innerHTML = data.suggestions.map(s => `
                <button class="suggestion-item" onclick="sendSuggestion('${escapeHtml(s).replace(/'/g, "\\'")}')">
                    ${s}
                </button>
            `).join('');
        } else {
            // 使用默认提示词
            suggestionList.innerHTML = getDefaultSuggestions().map(s => `
                <button class="suggestion-item" onclick="sendSuggestion('${escapeHtml(s).replace(/'/g, "\\'")}')">
                    ${s}
                </button>
            `).join('');
        }
    } catch (e) {
        console.log('获取提示词失败，使用默认推荐', e);
        // 使用默认提示词
        suggestionList.innerHTML = getDefaultSuggestions().map(s => `
            <button class="suggestion-item" onclick="sendSuggestion('${escapeHtml(s).replace(/'/g, "\\'")}')">
                ${s}
            </button>
        `).join('');
    }
}

// 获取默认提示词
function getDefaultSuggestions() {
    return [
        '播放一个有趣的视频',
        '给我讲个故事',
        '推荐一些儿童动画片',
        '播放音乐视频'
    ];
}

// 发送提示词
function sendSuggestion(text) {
    document.getElementById('textInput').value = text;
    sendMessage();
}

// iOS Safari 音频上下文解锁（解决视频没声音）
function initAudioUnlock() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return;

    // 监听用户首次交互来解锁音频
    document.addEventListener('touchstart', function initAudio() {
        // 尝试创建 AudioContext（iOS Safari 需要用户交互才能创建）
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                if (ctx.state === 'suspended') {
                    ctx.resume().catch(() => {});
                }
            }
        } catch (e) {}

        // 隐藏提示
        const tip = document.getElementById('safariTip');
        if (tip) tip.style.display = 'none';
        
        // 移除监听
        document.removeEventListener('touchstart', initAudio);
    }, { once: true });
}

// 检测浏览器兼容性
function checkBrowserSupport() {
    const isEdgeMobile = /Edg/.test(navigator.userAgent) && /Mobile/.test(navigator.userAgent);
    const isQuark = /Quark/i.test(navigator.userAgent);
    const isQQBrowser = /MQQBrowser/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);
    
    if (isEdgeMobile) {
        showToast('建议使用Safari或Chrome浏览器以获得最佳语音体验');
    }
    
    // 夸克/QQ浏览器可能有问题，切换为点击模式
    if (isQuark || isQQBrowser) {
        voiceMode = 'tap';
        showToast('已切换为点击录音模式');
    }
    
    // iOS Safari 显示授权提示
    if (isIOS && isSafari) {
        const tip = document.getElementById('safariTip');
        if (tip) tip.style.display = 'block';
    }
}

// 全屏模式初始化
function initFullscreen() {
    // 检测是否为移动设备
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isMobile) {
        // 尝试进入全屏
        try {
            document.documentElement.requestFullscreen().catch(() => {});
        } catch (e) {}
        
        // 监听页面可见性变化，防止退出全屏
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                try {
                    document.documentElement.requestFullscreen().catch(() => {});
                } catch (e) {}
            }
        });
    }
}

// 绑定事件
function bindEvents() {
    // 相机按钮点击 - 暂时提示功能开发中
    const cameraBtn = document.getElementById('cameraBtn');
    if (cameraBtn) {
        cameraBtn.addEventListener('click', () => {
            showToast('相机功能开发中');
        });
    }

    // 加号按钮点击 - 暂时提示功能开发中
    const addBtn = document.getElementById('addBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            showToast('更多功能开发中');
        });
    }
}

// 初始化语音输入
function initVoiceInput() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'zh-CN';

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            document.getElementById('textInput').value = transcript;
        };

        recognition.onerror = (event) => {
            console.log('语音识别错误:', event.error);
            stopRecording();
        };

        recognition.onend = () => {
            stopRecording();
            // 自动发送语音内容
            const text = document.getElementById('textInput').value.trim();
            if (text) {
                sendMessage();
            }
        };
    }
}

// 开始录音
function startRecording(e) {
    if (e) e.preventDefault();
    
    // 如果是打字模式，先退出
    if (isTextMode) {
        exitTextMode();
    }
    
    if (!recognition) {
        showToast('您的浏览器不支持语音识别');
        return;
    }
    
    isRecording = true;
    
    // 更新UI - 显示录音状态
    const inputHint = document.getElementById('inputHint');
    if (inputHint) {
        inputHint.textContent = '松开结束';
        inputHint.style.color = '#4A90D9';
    }
    
    // 清空之前的输入
    const textInput = document.getElementById('textInput');
    if (textInput) {
        textInput.value = '';
    }
    
    // 显示波浪动画
    showVoiceWave();
    
    try {
        recognition.start();
    } catch (e) {
        // 已经在运行，先停止
        recognition.stop();
        setTimeout(() => recognition.start(), 100);
    }
    
    // 设置超时保护（最长录音30秒）
    if (recordingTimeout) {
        clearTimeout(recordingTimeout);
    }
    recordingTimeout = setTimeout(() => {
        if (isRecording) {
            stopRecording();
            showToast('录音超时，已自动结束');
        }
    }, 30000);
}

// 停止录音
function stopRecording() {
    if (!isRecording) return;
    
    isRecording = false;
    
    // 恢复UI
    const inputHint = document.getElementById('inputHint');
    if (inputHint) {
        inputHint.textContent = '按住说话';
        inputHint.style.color = '';
    }
    
    // 隐藏波浪动画
    hideVoiceWave();
    
    // 清除超时定时器
    if (recordingTimeout) {
        clearTimeout(recordingTimeout);
        recordingTimeout = null;
    }
    
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {}
    }
}

// 显示语音波浪动画
function showVoiceWave() {
    const container = document.getElementById('chatContainer');
    
    // 检查是否已存在
    let wavePanel = document.getElementById('voiceWavePanel');
    if (wavePanel) {
        wavePanel.style.display = 'flex';
        return;
    }
    
    // 创建波浪动画面板
    wavePanel = document.createElement('div');
    wavePanel.id = 'voiceWavePanel';
    wavePanel.className = 'voice-wave-panel';
    wavePanel.innerHTML = `
        <div class="voice-wave-tip">松手发送，上移取消</div>
        <div class="voice-wave-bars">
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
        </div>
    `;
    
    container.appendChild(wavePanel);
    // 移除scrollTop，因为波浪面板在底部区域，不需要额外滚动
    
    // 启动波浪动画
    animateWaveBars();
}

// 隐藏语音波浪动画
function hideVoiceWave() {
    const wavePanel = document.getElementById('voiceWavePanel');
    if (wavePanel) {
        wavePanel.style.display = 'none';
    }
}

// 波浪条动画
function animateWaveBars() {
    const bars = document.querySelectorAll('.wave-bar');
    bars.forEach((bar, index) => {
        // 设置不同的动画延迟，让波浪看起来更自然
        bar.style.animationDelay = (index * 0.1) + 's';
        bar.style.height = (10 + Math.random() * 30) + 'px';
    });
}

// 点击切换录音模式（用于tap模式）
function toggleRecording() {
    if (isRecording) {
        stopRecording();
        // 自动发送语音内容
        const text = document.getElementById('textInput').value.trim();
        if (text) {
            sendMessage();
        }
    } else {
        startRecording();
    }
}

// 检测是否可能需要视频
function mightNeedVideo(message) {
    const keywords = ['播放', '视频', '看', '找', '想看', '给我看', '找个', '放个', '有没有', '有视频吗', '有没有视频', '给我找个'];
    const lowerMsg = message.toLowerCase();
    return keywords.some(kw => lowerMsg.includes(kw));
}

// 提取可能的搜索关键词
function extractVideoKeyword(message) {
    // 移除常见的动词，保留更有意义的部分作为搜索词
    let keyword = message
        .replace(/播放|看|找|给我|想|一下|个|有没有|有视频吗|给我个|想看|给我看看|视频/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    // 如果清理后太短或为空，用原始消息
    if (!keyword || keyword.length < 2) {
        keyword = message;
    }
    
    return keyword;
}

// 发送消息
async function sendMessage() {
    const textInput = document.getElementById('textInput');
    const message = textInput.value.trim();
    
    if (!message) return;

    // 清空输入框并退出打字模式
    textInput.value = '';
    if (isTextMode) {
        exitTextMode();
    }

    // 隐藏欢迎页
    document.getElementById('welcomeScreen').style.display = 'none';
    
    // 隐藏提示词推荐
    const suggestionSection = document.getElementById('suggestionSection');
    if (suggestionSection) {
        suggestionSection.style.display = 'none';
    }

    // 添加用户消息
    addMessage('user', message);
    conversationHistory.push({ role: 'user', content: message });

    // 显示加载状态
    const loadingId = showLoading();

    // 如果可能需要视频，先搜索本地视频
    let localVideos = [];
    if (mightNeedVideo(message)) {
        const keyword = extractVideoKeyword(message);
        try {
            const res = await fetch(`/api/videos?keyword=${encodeURIComponent(keyword)}&limit=4`);
            localVideos = await res.json();
        } catch (e) {
            console.log('搜索本地视频失败', e);
        }
    }

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                history: conversationHistory,
                localVideos: localVideos
            })
        });

        const data = await response.json();
        hideLoading(loadingId);

        if (data.error) {
            addMessage('ai', '抱歉，' + data.error);
            // 如果有本地视频但API失败，提示用户
            if (data.localVideos && data.localVideos.length > 0) {
                addMessage('ai', '我找到了一些相关视频：');
                showVideoCards(data.localVideos);
            }
            // 保存错误记录到历史
            saveToHistory(message, data.error, localVideos);
            return;
        }

        // 添加AI回复
        addMessage('ai', data.reply);
        conversationHistory.push({ role: 'assistant', content: data.reply });

        // 播放语音（如果开启了）
        if (isTTSEnabled) {
            playTTS(data.reply);
        }

        // 如果有本地视频，显示卡片
        if (data.localVideos && data.localVideos.length > 0) {
            currentVideos = data.localVideos;
            showVideoCards(data.localVideos);
        }

        // 保存到历史记录
        saveToHistory(message, data.reply, data.localVideos || []);

    } catch (error) {
        hideLoading(loadingId);
        addMessage('ai', '网络错误，请检查服务器连接');
        saveToHistory(message, '网络错误', []);
    }
}

// 保存到历史记录
async function saveToHistory(userMessage, aiReply, videos) {
    try {
        await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userMessage: userMessage,
                aiReply: aiReply,
                videos: videos.map(v => ({
                    id: v.id,
                    name: v.name || v.title,
                    filename: v.filename
                }))
            })
        });
    } catch (e) {
        console.log('保存历史记录失败', e);
    }
}

// 添加消息到聊天区
function addMessage(role, content) {
    const container = document.getElementById('chatContainer');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    // 处理视频标记
    content = content.replace(/【视频(\d+)】/g, '');
    
    // AI消息使用Markdown解析
    let renderedContent;
    if (role === 'ai') {
        renderedContent = marked.parse(content);
    } else {
        renderedContent = escapeHtml(content);
    }
    
    // 工具栏HTML（仅AI消息显示，放在气泡内部底部）
    const toolbarHtml = role === 'ai' ? `
        <div class="message-toolbar">
            <button class="message-toolbar-btn" onclick="copyMessage(this)" title="复制">
                <span class="icon">📋</span>
            </button>
            <button class="message-toolbar-btn" onclick="speakMessage(this)" title="语音播报">
                <span class="icon">🔊</span>
            </button>
            <button class="message-toolbar-btn" onclick="collectMessage(this)" title="收藏">
                <span class="icon">🔖</span>
            </button>
            <button class="message-toolbar-btn" onclick="regenerateMessage(this)" title="重新生成">
                <span class="icon">🔄</span>
            </button>
        </div>
    ` : '';
    
    msgDiv.innerHTML = `<div class="message-bubble"><div class="message-content">${renderedContent}</div>${toolbarHtml}</div>`;
    
    // 保存原始消息内容到DOM元素
    msgDiv.dataset.content = content;
    
    container.appendChild(msgDiv);
    
    // 滚动到底部
    container.scrollTop = container.scrollHeight;
}

// 复制消息
function copyMessage(btn) {
    const msgDiv = btn.closest('.message');
    const content = msgDiv.dataset.content || '';
    navigator.clipboard.writeText(content).then(() => {
        showToast('已复制到剪贴板');
    }).catch(() => {
        showToast('复制失败');
    });
}

// 语音播报消息
function speakMessage(btn) {
    const msgDiv = btn.closest('.message');
    const content = msgDiv.dataset.content || '';
    playBrowserTTS(content);
}

// 收藏消息
function collectMessage(btn) {
    const msgDiv = btn.closest('.message');
    const content = msgDiv.dataset.content || '';
    
    // 获取当前收藏列表
    let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    
    // 添加新收藏
    favorites.unshift({
        id: Date.now(),
        content: content,
        time: new Date().toLocaleString()
    });
    
    // 保存
    localStorage.setItem('favorites', JSON.stringify(favorites));
    showToast('已收藏到我的收藏');
}

// 重新生成消息
let regenerateCallback = null; // 保存重新生成的回调函数

function regenerateMessage(btn) {
    const msgDiv = btn.closest('.message');
    const content = msgDiv.dataset.content || '';
    
    // 获取当前消息的索引
    const messages = document.querySelectorAll('.message.ai');
    const currentIndex = Array.from(messages).indexOf(msgDiv);
    
    // 如果有回调，执行重新生成
    if (regenerateCallback) {
        regenerateCallback(msgDiv);
        showToast('正在重新生成...');
    } else {
        showToast('刷新功能暂时不可用');
    }
}

// 注册重新生成回调（供sendMessage调用）
function setRegenerateCallback(callback) {
    regenerateCallback = callback;
}

// 转义HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

// 显示加载状态
function showLoading() {
    const container = document.getElementById('chatContainer');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message ai loading';
    loadingDiv.id = 'loading-' + Date.now();
    loadingDiv.innerHTML = '<div class="message-bubble">思考中...</div>';
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;
    return loadingDiv.id;
}

// 隐藏加载状态
function hideLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// TTS开关切换
function toggleTTS() {
    isTTSEnabled = !isTTSEnabled;
    updateTTSButton();
    
    if (isTTSEnabled) {
        showToast('语音播报已开启');
    } else {
        stopTTS();
        showToast('语音播报已关闭');
    }
}

// 更新TTS按钮状态
function updateTTSButton() {
    const btn = document.getElementById('ttsBtn');
    if (isSpeaking) {
        btn.textContent = '⏸';
        btn.classList.add('playing');
    } else {
        btn.textContent = isTTSEnabled ? '🔊' : '🔇';
        btn.classList.remove('playing');
    }
}

// 停止TTS
function stopTTS() {
    if (currentSpeechUtterance) {
        window.speechSynthesis.cancel();
        currentSpeechUtterance = null;
    }
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    isSpeaking = false;
    updateTTSButton();
}

// 播放TTS语音（豆包优先，失败则浏览器TTS）
let currentAudio = null;

async function playTTS(text) {
    // 停止之前的播放
    stopTTS();
    
    // 去除特殊标记
    text = text.replace(/【视频\d+】/g, '').trim();
    if (!text) return;

    // 尝试豆包TTS
    try {
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.substring(0, 500) })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            currentAudio = new Audio(url);
            
            currentAudio.onplay = () => {
                isSpeaking = true;
                updateTTSButton();
            };
            
            currentAudio.onended = () => {
                isSpeaking = false;
                updateTTSButton();
            };
            
            currentAudio.onerror = () => {
                isSpeaking = false;
                updateTTSButton();
                // 豆包TTS失败，尝试浏览器TTS
                playBrowserTTS(text);
            };
            
            currentAudio.play();
            return;
        }
    } catch (error) {
        console.log('豆包TTS失败，尝试浏览器TTS');
    }
    
    // 备用：浏览器原生TTS
    playBrowserTTS(text);
}

// 浏览器原生TTS
function playBrowserTTS(text) {
    if (!('speechSynthesis' in window)) {
        showToast('浏览器不支持语音播报');
        return;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1;
    utterance.pitch = 1;
    
    utterance.onstart = () => {
        isSpeaking = true;
        updateTTSButton();
    };
    
    utterance.onend = () => {
        isSpeaking = false;
        updateTTSButton();
    };
    
    utterance.onerror = () => {
        isSpeaking = false;
        updateTTSButton();
    };
    
    currentSpeechUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

// 显示视频卡片（内嵌到聊天消息中）
function showVideoCards(videos) {
    const container = document.getElementById('chatContainer');
    
    // 创建视频卡片消息
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai video-cards-message';
    
    const cardsHtml = videos.map((video, index) => {
        const thumbnail = video.thumbnail 
            ? `<img src="${video.thumbnail}" alt="" class="video-thumb-img">`
            : '';
        return `
        <div class="video-card-inline" onclick="playVideo(${index})">
            <div class="video-card-thumb-inline">
                ${thumbnail}
            </div>
            <div class="video-card-title-inline">${escapeHtml(video.name)}</div>
        </div>
    `}).join('');
    
    msgDiv.innerHTML = `
        <div class="video-cards-grid">
            ${cardsHtml}
        </div>
    `;
    
    container.appendChild(msgDiv);
    
    // 显示视频推荐提示词
    showVideoSuggestions();
    
    container.scrollTop = container.scrollHeight;
}

// 显示视频推荐提示词
async function showVideoSuggestions() {
    const container = document.getElementById('chatContainer');
    
    try {
        const res = await fetch('/api/prompt-suggestions');
        const data = await res.json();
        
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'video-suggestion-items';
        suggestionsDiv.innerHTML = data.suggestions.map(s => `
            <button class="suggestion-btn" onclick="sendSuggestion('${escapeHtml(s).replace(/'/g, "\\'")}')">
                ${escapeHtml(s)}
            </button>
        `).join('');
        
        container.appendChild(suggestionsDiv);
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.log('获取推荐提示词失败', e);
    }
}

// 关闭视频弹窗
function closeVideoModal() {
    document.getElementById('videoModal').classList.remove('show');
}

// 播放视频
async function playVideo(index) {
    closeVideoModal();
    
    const video = currentVideos[index];
    if (!video) {
        showToast('视频不存在');
        console.error('Video not found at index:', index, 'currentVideos:', currentVideos);
        return;
    }
    
    console.log('播放视频:', video);
    
    try {
        // 从后端获取视频完整信息（包含本地路径）
        const res = await fetch(`/api/video-path/${encodeURIComponent(video.id)}`);
        
        if (!res.ok) {
            const err = await res.json();
            showToast(err.error || '获取视频失败');
            console.error('API error:', err);
            return;
        }
        
        const fullVideo = await res.json();
        console.log('获取到完整视频信息:', fullVideo);
        
        if (fullVideo.error) {
            showToast(fullVideo.error);
            return;
        }
        
        sessionStorage.setItem('currentVideos', JSON.stringify([fullVideo]));
        sessionStorage.setItem('currentVideoIndex', '0');
        location.href = '/player';
    } catch (e) {
        showToast('获取视频失败: ' + e.message);
        console.error(e);
    }
}

// 显示提示
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// 点击弹窗背景关闭
document.getElementById('videoModal').addEventListener('click', (e) => {
    if (e.target.id === 'videoModal') {
        closeVideoModal();
    }
});

// ========== 字体大小功能 ==========

// 加载字体大小设置
function loadFontSize() {
    const savedSize = localStorage.getItem('chatFontSize') || 'medium';
    applyFontSize(savedSize);
}

// 应用字体大小
function applyFontSize(size) {
    // 移除所有字体大小类
    document.body.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
    // 添加新的类
    document.body.classList.add(`font-${size}`);
    // 更新按钮状态
    document.querySelectorAll('.font-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`font${size.charAt(0).toUpperCase() + size.slice(1)}`);
    if (activeBtn) activeBtn.classList.add('active');
    // 保存设置
    localStorage.setItem('chatFontSize', size);
}

// 设置字体大小
function setFontSize(size) {
    applyFontSize(size);
    hideFontSizeMenu();
    showToast(`字体已调整为${getFontSizeName(size)}`);
}

// 获取字体大小名称
function getFontSizeName(size) {
    const names = {
        'small': '小',
        'medium': '中',
        'large': '大',
        'xlarge': '特大'
    };
    return names[size] || '中';
}

// 切换字体大小菜单
function toggleFontSizeMenu() {
    const menu = document.getElementById('fontSizeMenu');
    menu.classList.toggle('show');
}

// 隐藏字体大小菜单
function hideFontSizeMenu() {
    document.getElementById('fontSizeMenu').classList.remove('show');
}

// 点击其他地方关闭菜单
document.addEventListener('click', (e) => {
    const menu = document.getElementById('fontSizeMenu');
    const btn = document.getElementById('fontSizeBtn');
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
        hideFontSizeMenu();
    }
});
