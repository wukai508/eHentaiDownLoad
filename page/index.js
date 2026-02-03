// 完整页面脚本 - E-Hentai Downloader

// 全局状态
let currentGalleryInfo = null;
let downloadMode = 'direct';
let isDownloading = false;
let targetTabId = null;
let customTitle = null; // 用户自定义的文件夹名称

// DOM 元素
const elements = {};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    initElements();
    initEventListeners();
    await findEHentaiTab();
});

// 初始化 DOM 元素引用
function initElements() {
    elements.connectionStatus = document.getElementById('connectionStatus');
    elements.notGalleryTip = document.getElementById('notGalleryTip');
    elements.gallerySection = document.getElementById('gallerySection');
    elements.galleryTitle = document.getElementById('galleryTitle');
    elements.pageCount = document.getElementById('pageCount');
    elements.galleryId = document.getElementById('galleryId');
    elements.modeDirectBtn = document.getElementById('modeDirectBtn');
    elements.modeZipBtn = document.getElementById('modeZipBtn');
    elements.progressSection = document.getElementById('progressSection');
    elements.progressFill = document.getElementById('progressFill');
    elements.progressPercent = document.getElementById('progressPercent');
    elements.completedCount = document.getElementById('completedCount');
    elements.totalCount = document.getElementById('totalCount');
    elements.failedCount = document.getElementById('failedCount');
    elements.currentFile = document.getElementById('currentFile');
    elements.startBtn = document.getElementById('startBtn');
    elements.cancelBtn = document.getElementById('cancelBtn');
    elements.completeSection = document.getElementById('completeSection');
    elements.successCount = document.getElementById('successCount');
    elements.failCount = document.getElementById('failCount');
    elements.refreshBtn = document.getElementById('refreshBtn');
    elements.resetBtn = document.getElementById('resetBtn');
    // 编辑相关元素
    elements.editTitleBtn = document.getElementById('editTitleBtn');
    elements.titleEditContainer = document.getElementById('titleEditContainer');
    elements.titleInput = document.getElementById('titleInput');
    elements.saveTitleBtn = document.getElementById('saveTitleBtn');
    elements.cancelTitleBtn = document.getElementById('cancelTitleBtn');
}

// 初始化事件监听器
function initEventListeners() {
    elements.modeDirectBtn.addEventListener('click', () => setDownloadMode('direct'));
    elements.modeZipBtn.addEventListener('click', () => setDownloadMode('zip'));
    elements.startBtn.addEventListener('click', startDownload);
    elements.cancelBtn.addEventListener('click', cancelDownload);
    elements.refreshBtn.addEventListener('click', findEHentaiTab);
    elements.resetBtn.addEventListener('click', resetUI);
    // 编辑按钮事件
    elements.editTitleBtn.addEventListener('click', showTitleEdit);
    elements.saveTitleBtn.addEventListener('click', saveTitle);
    elements.cancelTitleBtn.addEventListener('click', hideTitleEdit);
    elements.titleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveTitle();
    });
}

// 查找 E-Hentai 标签页
async function findEHentaiTab() {
    showConnectionStatus();

    try {
        // 查找所有 E-Hentai 漫画目录页
        const tabs = await chrome.tabs.query({ url: '*://e-hentai.org/g/*' });

        if (tabs.length === 0) {
            showNotGalleryTip();
            return;
        }

        // 使用第一个找到的标签页
        targetTabId = tabs[0].id;
        console.log('[E-Hentai Downloader] 找到 E-Hentai 标签页:', targetTabId);

        // 获取漫画信息
        const response = await chrome.tabs.sendMessage(targetTabId, { action: 'getGalleryInfo' });

        if (response && response.success) {
            currentGalleryInfo = response.data;
            showGallerySection();
            updateGalleryInfo();
        } else {
            showNotGalleryTip();
        }
    } catch (error) {
        console.error('查找标签页失败:', error);
        showNotGalleryTip();
    }
}

// 显示连接状态
function showConnectionStatus() {
    elements.connectionStatus.classList.remove('hidden');
    elements.notGalleryTip.classList.add('hidden');
    elements.gallerySection.classList.add('hidden');
}

// 显示未找到提示
function showNotGalleryTip() {
    elements.connectionStatus.classList.add('hidden');
    elements.notGalleryTip.classList.remove('hidden');
    elements.gallerySection.classList.add('hidden');
}

// 显示漫画信息区
function showGallerySection() {
    elements.connectionStatus.classList.add('hidden');
    elements.notGalleryTip.classList.add('hidden');
    elements.gallerySection.classList.remove('hidden');
}

// 更新漫画信息显示
function updateGalleryInfo() {
    if (!currentGalleryInfo) return;

    // 显示自定义名称或原始名称
    const displayTitle = customTitle || currentGalleryInfo.title || '未知标题';
    elements.galleryTitle.textContent = displayTitle;
    elements.pageCount.textContent = `${currentGalleryInfo.pageCount || 0} 页`;
    elements.galleryId.textContent = currentGalleryInfo.galleryId || '--';
    elements.totalCount.textContent = currentGalleryInfo.pageCount || 0;
}

// 显示标题编辑
function showTitleEdit() {
    const currentTitle = customTitle || currentGalleryInfo?.title || '';
    elements.titleInput.value = currentTitle;
    elements.titleEditContainer.classList.remove('hidden');
    elements.titleInput.focus();
    elements.titleInput.select();
}

// 隐藏标题编辑
function hideTitleEdit() {
    elements.titleEditContainer.classList.add('hidden');
}

// 保存标题
function saveTitle() {
    const newTitle = elements.titleInput.value.trim();
    if (newTitle) {
        customTitle = newTitle;
        elements.galleryTitle.textContent = newTitle;
        console.log('[E-Hentai Downloader] 自定义标题:', newTitle);
    }
    hideTitleEdit();
}

// 设置下载模式
function setDownloadMode(mode) {
    downloadMode = mode;
    elements.modeDirectBtn.classList.toggle('active', mode === 'direct');
    elements.modeZipBtn.classList.toggle('active', mode === 'zip');
}

// 开始下载
async function startDownload() {
    if (!currentGalleryInfo || isDownloading || !targetTabId) return;

    isDownloading = true;

    // 更新 UI
    elements.startBtn.classList.add('hidden');
    elements.cancelBtn.classList.remove('hidden');
    elements.progressSection.classList.remove('hidden');
    elements.completeSection.classList.add('hidden');

    // 重置进度
    updateProgress(0, currentGalleryInfo.pageCount, 0);

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'startDownloadFromTab',
            data: {
                tabId: targetTabId,
                galleryInfo: {
                    ...currentGalleryInfo,
                    title: customTitle || currentGalleryInfo.title // 使用自定义名称
                },
                mode: downloadMode
            }
        });

        if (!response.success) {
            throw new Error(response.error || '下载启动失败');
        }
    } catch (error) {
        console.error('下载失败:', error);
        showError(error.message);
        resetDownloadUI();
    }
}

// 取消下载
function cancelDownload() {
    chrome.runtime.sendMessage({ action: 'cancelDownload' });
    resetDownloadUI();
}

// 重置下载 UI
function resetDownloadUI() {
    isDownloading = false;
    elements.startBtn.classList.remove('hidden');
    elements.cancelBtn.classList.add('hidden');
}

// 重置整个 UI
function resetUI() {
    resetDownloadUI();
    elements.progressSection.classList.add('hidden');
    elements.completeSection.classList.add('hidden');
    customTitle = null; // 重置自定义名称
    findEHentaiTab();
}

// 更新进度
function updateProgress(completed, total, failed, currentFileName = '') {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    elements.progressFill.style.width = `${percent}%`;
    elements.progressPercent.textContent = `${percent}%`;
    elements.completedCount.textContent = completed;
    elements.totalCount.textContent = total;
    elements.failedCount.textContent = failed;

    if (currentFileName) {
        elements.currentFile.textContent = `正在处理: ${currentFileName}`;
    }
}

// 显示完成
function showComplete(success, failed) {
    elements.progressSection.classList.add('hidden');
    elements.completeSection.classList.remove('hidden');
    elements.successCount.textContent = success;
    elements.failCount.textContent = failed;
    resetDownloadUI();
}

// 显示错误
function showError(message) {
    elements.currentFile.textContent = `错误: ${message}`;
    elements.currentFile.style.color = '#f87171';
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'downloadProgress':
            updateProgress(
                message.data.completed,
                message.data.total,
                message.data.failed,
                message.data.currentFile
            );
            break;
        case 'downloadComplete':
            showComplete(message.data.success, message.data.failed);
            break;
        case 'downloadError':
            showError(message.data.error);
            resetDownloadUI();
            break;
    }
    return true;
});
