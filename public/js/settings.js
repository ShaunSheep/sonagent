// ========== 设置页面 ==========

let originalConfig = {};

// 页面加载
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
});

// 加载配置
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        originalConfig = { ...config };
        
        document.getElementById('apiKey').value = config.doubaoApiKey || '';
        document.getElementById('apiUrl').value = config.doubaoApiUrl || '';
        document.getElementById('chatModel').value = config.chatModel || '';
        document.getElementById('ttsModel').value = config.ttsModel || '';
        document.getElementById('serverPort').value = config.serverPort || 3000;
    } catch (error) {
        showToast('加载配置失败');
    }
}

// 保存配置
async function saveConfig() {
    const apiKey = document.getElementById('apiKey').value.trim();
    
    const config = {
        doubaoApiKey: apiKey, // 保存完整Key
        doubaoApiUrl: document.getElementById('apiUrl').value.trim(),
        chatModel: document.getElementById('chatModel').value.trim(),
        ttsModel: document.getElementById('ttsModel').value.trim(),
        serverPort: parseInt(document.getElementById('serverPort').value) || 3000
    };

    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        
        if (result.success) {
            showToast('配置已保存');
            // 如果端口改变，提示重启
            if (config.serverPort !== originalConfig.serverPort) {
                setTimeout(() => {
                    showToast('端口已更改，请重启服务');
                }, 1500);
            }
        } else {
            showToast('保存失败: ' + result.message);
        }
    } catch (error) {
        showToast('保存失败，请检查网络');
    }
}

// 重置默认配置
function resetConfig() {
    const defaultConfig = {
        doubaoApiKey: '',
        doubaoApiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        chatModel: 'doubao-pro-16k',
        ttsModel: 'ebvoino',
        serverPort: 3000
    };

    document.getElementById('apiKey').value = '';
    document.getElementById('apiUrl').value = defaultConfig.doubaoApiUrl;
    document.getElementById('chatModel').value = defaultConfig.chatModel;
    document.getElementById('ttsModel').value = defaultConfig.ttsModel;
    document.getElementById('serverPort').value = defaultConfig.serverPort;
    
    showToast('已重置为默认配置');
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
