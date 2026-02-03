// Popup 脚本 - E-Hentai Downloader

// 全局状态
let currentGalleryInfo = null;
let downloadMode = 'direct'; // 'direct' | 'zip'
let isDownloading = false;
let isCancelled = false;

// DOM 元素
const elements = {
    notGalleryTip: null,
    mainContent: null,
    galleryTitle: null,
    pageCount: null,
    modeDirectBtn: null,
    modeZipBtn: null,
    progressSection: null,
    progressFill: null,
    progressPercent: null,
    completedCount: null,
    totalCount: null,
    failedCount: null,
    currentFile: null,
    startBtn: null,
    cancelBtn: null,
    completeSection: null,
    successCount: null,
    failCount: null
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    initElements();
    initEventListeners();
    await checkCurrentPage();
});

// 初始化 DOM 元素引用
function initElements() {
    elements.notGalleryTip = document.getElementById('notGalleryTip');
    elements.mainContent = document.getElementById('mainContent');
    elements.galleryTitle = document.getElementById('galleryTitle');
    elements.pageCount = document.getElementById('pageCount');
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
}

// 初始化事件监听器
function initEventListeners() {
    // 下载模式切换
    elements.modeDirectBtn.addEventListener('click', () => setDownloadMode('direct'));
    elements.modeZipBtn.addEventListener('click', () => setDownloadMode('zip'));

    // 开始下载
    elements.startBtn.addEventListener('click', startDownload);

    // 取消下载
    elements.cancelBtn.addEventListener('click', cancelDownload);
}

// 设置下载模式
function setDownloadMode(mode) {
    downloadMode = mode;
    elements.modeDirectBtn.classList.toggle('active', mode === 'direct');
    elements.modeZipBtn.classList.toggle('active', mode === 'zip');
}

// 检查当前页面
async function checkCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url) {
            showNotGalleryTip();
            return;
        }

        // 检查是否是 E-Hentai 漫画目录页
        const galleryMatch = tab.url.match(/e-hentai\.org\/g\/(\d+)\/([a-f0-9]+)/);
        
        if (!galleryMatch) {
            showNotGalleryTip();
            return;
        }

        // 向 content script 请求漫画信息
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getGalleryInfo' });
        
        if (response && response.success) {
            currentGalleryInfo = response.data;
            showMainContent();
            updateGalleryInfo();
        } else {
            showNotGalleryTip();
        }
    } catch (error) {
        console.error('检查页面失败:', error);
        showNotGalleryTip();
    }
}

// 显示非漫画页提示
function showNotGalleryTip() {
    elements.notGalleryTip.classList.remove('hidden');
    elements.mainContent.classList.add('hidden');
}

// 显示主内容
function showMainContent() {
    elements.notGalleryTip.classList.add('hidden');
    elements.mainContent.classList.remove('hidden');
}

// 更新漫画信息显示
function updateGalleryInfo() {
    if (!currentGalleryInfo) return;
    
    elements.galleryTitle.textContent = currentGalleryInfo.title || '未知标题';
    elements.pageCount.textContent = `${currentGalleryInfo.pageCount || 0} 页`;
    elements.totalCount.textContent = currentGalleryInfo.pageCount || 0;
}

// 开始下载
async function startDownload() {
    if (!currentGalleryInfo || isDownloading) return;

    isDownloading = true;
    isCancelled = false;

    // 更新 UI
    elements.startBtn.classList.add('hidden');
    elements.cancelBtn.classList.remove('hidden');
    elements.progressSection.classList.remove('hidden');
    elements.completeSection.classList.add('hidden');

    // 重置进度
    updateProgress(0, currentGalleryInfo.pageCount, 0);

    try {
        // 发送下载请求到 background script
        const response = await chrome.runtime.sendMessage({
            action: 'startDownload',
            data: {
                galleryInfo: currentGalleryInfo,
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
    isCancelled = true;
    chrome.runtime.sendMessage({ action: 'cancelDownload' });
    resetDownloadUI();
}

// 重置下载 UI
function resetDownloadUI() {
    isDownloading = false;
    elements.startBtn.classList.remove('hidden');
    elements.cancelBtn.classList.add('hidden');
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
        elements.currentFile.textContent = `正在下载: ${currentFileName}`;
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
