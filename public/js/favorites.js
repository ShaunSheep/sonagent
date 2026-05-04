// ========== 收藏页面 ==========

// 页面加载
document.addEventListener('DOMContentLoaded', () => {
    loadFavorites();
});

// 加载收藏列表
async function loadFavorites() {
    try {
        const response = await fetch('/api/favorites');
        const favorites = await response.json();
        
        const listContainer = document.getElementById('favoritesList');
        const emptyState = document.getElementById('emptyState');

        if (favorites.length === 0) {
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';
        
        listContainer.innerHTML = favorites.map(video => `
            <div class="favorite-item" onclick="playFavorite('${encodeURIComponent(video.filename)}')">
                <div class="favorite-thumb">🎬</div>
                <div class="favorite-info">
                    <div class="favorite-title">${escapeHtml(video.name)}</div>
                </div>
                <button class="favorite-delete" onclick="event.stopPropagation(); deleteFavorite('${encodeURIComponent(video.filename)}')">
                    删除
                </button>
            </div>
        `).join('');

    } catch (error) {
        showToast('加载收藏失败');
    }
}

// 播放收藏视频
async function playFavorite(filename) {
    try {
        // 从后端获取视频完整信息（包含本地路径）
        const res = await fetch(`/api/video-by-filename?filename=${filename}`);
        if (!res.ok) {
            showToast('视频文件不存在');
            return;
        }
        const video = await res.json();
        sessionStorage.setItem('currentVideos', JSON.stringify([video]));
        sessionStorage.setItem('currentVideoIndex', '0');
        location.href = '/player';
    } catch (e) {
        showToast('获取视频失败');
        console.error(e);
    }
}

// 删除收藏
async function deleteFavorite(filename) {
    if (!confirm('确定要取消收藏吗？')) return;

    try {
        const response = await fetch(`/api/favorites/${filename}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('已取消收藏');
            loadFavorites();
        } else {
            showToast('删除失败');
        }
    } catch (error) {
        showToast('删除失败');
    }
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 返回上一页
function goBack() {
    history.back();
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
