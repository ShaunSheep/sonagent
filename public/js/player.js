// ========== 视频播放页面 ==========

let videos = [];
let currentIndex = 0;
let isPortrait = true;
let isDraggingProgress = false;
let startX = 0;
let startTime = 0;
let touchStartTime = 0; // 用于区分点击和滑动
let isFullscreen = false;

const videoPlayer = document.getElementById('videoPlayer');
const playPauseBtn = document.getElementById('playPauseBtn');
const progressBar = document.getElementById('progressBar');
const progressCurrent = document.getElementById('progressCurrent');
const progressBuffered = document.getElementById('progressBuffered');
const progressHandle = document.getElementById('progressHandle');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const gestureHint = document.getElementById('gestureHint');
const videoWrapper = document.getElementById('videoWrapper');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initPlayer();
    bindEvents();
});

// 初始化播放器
function initPlayer() {
    const storedVideos = sessionStorage.getItem('currentVideos');
    
    if (storedVideos) {
        videos = JSON.parse(storedVideos);
        currentIndex = parseInt(sessionStorage.getItem('currentVideoIndex') || '0');
    }

    if (videos.length === 0) {
        showToast('没有可播放的视频');
        location.href = '/';
        return;
    }

    updateIndicators();
    loadVideo(currentIndex);
    checkFavorite();
    
    // 自动播放
    setTimeout(() => {
        handlePlayPause();
    }, 500);
}

// 加载视频
function loadVideo(index) {
    if (index < 0 || index >= videos.length) return;
    
    currentIndex = index;
    const video = videos[index];
    
    document.getElementById('playerTitle').textContent = video.name;
    
    // 重置播放器状态
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
    videoPlayer.removeAttribute('src');
    videoPlayer.load();
    
    // 设置视频源
    videoPlayer.src = video.path;
    
    // iOS Safari: 等待 loadedmetadata 后再显示时长
    const onMetaLoaded = () => {
        const duration = videoPlayer.duration;
        console.log('视频加载成功，时长:', duration);
        if (isNaN(duration) || duration === 0) {
            showToast('视频格式不支持，请使用MP4格式');
        }
        totalTimeEl.textContent = formatTime(duration);
        videoPlayer.removeEventListener('loadedmetadata', onMetaLoaded);
    };
    
    videoPlayer.addEventListener('loadedmetadata', onMetaLoaded);
    
    // 错误处理
    videoPlayer.onerror = (e) => {
        console.error('视频加载错误:', e);
        showToast('视频加载失败，请检查视频格式');
    };
    
    videoPlayer.load();
    updateIndicators();
    updateFavoriteIcon();
    sessionStorage.setItem('currentVideoIndex', index);
}

// 绑定事件
function bindEvents() {
    // 播放/暂停按钮 - iOS Safari 必须用 touchend 而不是 click
    playPauseBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        handlePlayPause();
    });
    playPauseBtn.addEventListener('click', handlePlayPause);
    
    // 视频点击播放
    videoPlayer.addEventListener('touchend', (e) => {
        e.preventDefault();
        handlePlayPause();
    });
    videoPlayer.addEventListener('click', handlePlayPause);

    // 播放事件
    videoPlayer.addEventListener('play', () => {
        playPauseBtn.textContent = '⏸';
        updateMuteBtn();
    });

    videoPlayer.addEventListener('pause', () => {
        playPauseBtn.textContent = '▶';
    });
    
    // 静音状态变化
    videoPlayer.addEventListener('volumechange', updateMuteBtn);

    // 时间更新
    videoPlayer.addEventListener('timeupdate', updateProgress);

    // 视频加载完成
    videoPlayer.addEventListener('loadedmetadata', () => {
        totalTimeEl.textContent = formatTime(videoPlayer.duration);
    });

    // 缓冲更新
    videoPlayer.addEventListener('progress', updateBuffered);

    // 进度条拖拽
    progressBar.addEventListener('mousedown', startDragProgress);
    progressBar.addEventListener('touchstart', startDragProgress);
    document.addEventListener('mousemove', dragProgress);
    document.addEventListener('touchmove', dragProgress);
    document.addEventListener('mouseup', endDragProgress);
    document.addEventListener('touchend', endDragProgress);

    // 滑动手势 - 只在非播放按钮区域
    videoWrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
    videoWrapper.addEventListener('touchend', handleTouchEnd);

    // 双击切换全屏
    videoWrapper.addEventListener('dblclick', toggleRotate);

    // 屏幕方向变化
    window.addEventListener('resize', checkOrientation);
    checkOrientation();
}

// 处理播放/暂停
async function handlePlayPause() {
    if (videoPlayer.paused) {
        try {
            await videoPlayer.play();
            playPauseBtn.textContent = '⏸';
        } catch (e) {
            console.error('播放失败:', e);
            showToast('播放失败，请检查视频格式');
        }
    } else {
        videoPlayer.pause();
        playPauseBtn.textContent = '▶';
    }
}

// 切换静音状态
function toggleMute() {
    videoPlayer.muted = !videoPlayer.muted;
    const isMuted = videoPlayer.muted;
    document.getElementById('muteBtn').textContent = isMuted ? '🔇' : '🔊';
    showToast(isMuted ? '已静音' : '已开启声音');
    return isMuted;
}

// 更新静音按钮图标
function updateMuteBtn() {
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.textContent = videoPlayer.muted ? '🔇' : '🔊';
    }
}

// 播放/暂停（兼容旧代码）
function togglePlay() {
    handlePlayPause();
}

// 更新进度条
function updateProgress() {
    if (isDraggingProgress) return;
    
    const percent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
    progressCurrent.style.width = percent + '%';
    progressHandle.style.left = percent + '%';
    currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
}

// 更新缓冲
function updateBuffered() {
    if (videoPlayer.buffered.length > 0) {
        const bufferedEnd = videoPlayer.buffered.end(videoPlayer.buffered.length - 1);
        const percent = (bufferedEnd / videoPlayer.duration) * 100;
        progressBuffered.style.width = percent + '%';
    }
}

// 开始拖拽进度条
function startDragProgress(e) {
    isDraggingProgress = true;
    updateProgressFromEvent(e);
}

// 拖拽进度条
function dragProgress(e) {
    if (!isDraggingProgress) return;
    updateProgressFromEvent(e);
}

// 从事件更新进度
function updateProgressFromEvent(e) {
    const rect = progressBar.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let percent = (clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));
    
    videoPlayer.currentTime = percent * videoPlayer.duration;
    progressCurrent.style.width = (percent * 100) + '%';
    progressHandle.style.left = (percent * 100) + '%';
    currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
}

// 结束拖拽
function endDragProgress() {
    isDraggingProgress = false;
}

// 处理触摸开始
function handleTouchStart(e) {
    // 如果触摸的是播放按钮或进度条，不处理滑动
    if (e.target.closest('#playPauseBtn') || e.target.closest('#progressContainer')) {
        return;
    }
    if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        touchStartTime = Date.now();
    }
}

// 处理触摸结束
function handleTouchEnd(e) {
    if (!startX) return;
    
    const touchDuration = Date.now() - touchStartTime;
    // 如果触摸时间太长（>300ms），可能是按钮点击，不处理滑动
    if (touchDuration > 300) {
        startX = 0;
        return;
    }
    
    const endX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const diffX = endX - startX;
    const screenWidth = window.innerWidth;
    
    // 水平滑动超过屏幕10%认为是滑动手势
    if (Math.abs(diffX) > screenWidth * 0.1) {
        if (diffX > 0) {
            prevVideo();
            showGestureHint('◀ 上一条');
        } else {
            nextVideo();
            showGestureHint('下一条 ▶');
        }
    }
    
    startX = 0;
}

// 显示手势提示
function showGestureHint(text) {
    gestureHint.textContent = text;
    gestureHint.classList.add('show');
    setTimeout(() => {
        gestureHint.classList.remove('show');
    }, 800);
}

// 上一条
function prevVideo() {
    if (currentIndex > 0) {
        loadVideo(currentIndex - 1);
        videoPlayer.play();
    } else {
        showToast('已经是第一个了');
    }
}

// 下一条
function nextVideo() {
    if (currentIndex < videos.length - 1) {
        loadVideo(currentIndex + 1);
        videoPlayer.play();
    } else {
        showToast('已经是最后一个了');
    }
}

// 切换横竖屏
function toggleRotate() {
    isPortrait = !isPortrait;
    updateOrientation();
}

function checkOrientation() {
    isPortrait = window.innerHeight > window.innerWidth;
    updateOrientation();
}

function updateOrientation() {
    if (isPortrait) {
        videoWrapper.classList.remove('landscape');
        videoWrapper.classList.add('portrait');
    } else {
        videoWrapper.classList.remove('portrait');
        videoWrapper.classList.add('landscape');
    }
}

// 切换全屏
function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        // 进入全屏
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        }
        isFullscreen = true;
        updateFullscreenBtn();
    } else {
        // 退出全屏
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        isFullscreen = false;
        updateFullscreenBtn();
    }
}

// 更新全屏按钮
function updateFullscreenBtn() {
    const btn = document.querySelector('.fullscreen-btn');
    if (btn) {
        btn.textContent = isFullscreen ? '✕' : '⛶';
    }
}

// 监听全屏变化
document.addEventListener('fullscreenchange', () => {
    isFullscreen = !!document.fullscreenElement;
    updateFullscreenBtn();
});
document.addEventListener('webkitfullscreenchange', () => {
    isFullscreen = !!document.webkitFullscreenElement;
    updateFullscreenBtn();
});

// 更新指示器
function updateIndicators() {
    const container = document.getElementById('videoIndicators');
    container.innerHTML = videos.map((_, i) => 
        `<div class="indicator ${i === currentIndex ? 'active' : ''}" onclick="loadVideo(${i})"></div>`
    ).join('');
}

// 格式化时间
function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 返回上一页
function goBack() {
    history.back();
}

// ========== 收藏功能 ==========

// 切换收藏状态
async function toggleFavorite() {
    const video = videos[currentIndex];
    
    try {
        // 检查是否已收藏
        const res = await fetch('/api/favorites');
        const favorites = await res.json();
        const isFavorited = favorites.some(f => f.filename === video.filename);

        if (isFavorited) {
            // 取消收藏
            await fetch(`/api/favorites/${encodeURIComponent(video.filename)}`, {
                method: 'DELETE'
            });
            showToast('已取消收藏');
        } else {
            // 添加收藏
            await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video: video })
            });
            showToast('收藏成功');
        }
        
        updateFavoriteIcon();
    } catch (error) {
        showToast('操作失败');
    }
}

// 更新收藏图标
async function checkFavorite() {
    const video = videos[currentIndex];
    try {
        const res = await fetch('/api/favorites');
        const favorites = await res.json();
        const isFavorited = favorites.some(f => f.filename === video.filename);
        document.getElementById('favoriteBtn').textContent = isFavorited ? '❤️' : '🤍';
    } catch (error) {
        document.getElementById('favoriteBtn').textContent = '🤍';
    }
}

function updateFavoriteIcon() {
    checkFavorite();
}

// 显示提示
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 2000);
}
