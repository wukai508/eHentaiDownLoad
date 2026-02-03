// Background Script - E-Hentai Downloader
// 处理下载逻辑和跨域请求
console.log('[E-Hentai Downloader] Background script 已加载');

// 导入 JSZip (Service Worker 中必须在顶部同步导入)
try {
    importScripts('../lib/jszip.min.js');
    console.log('[E-Hentai Downloader] JSZip 已加载');
} catch (e) {
    console.error('[E-Hentai Downloader] JSZip 加载失败:', e);
}

// 下载状态
let downloadState = {
    isDownloading: false,
    isCancelled: false,
    total: 0,
    completed: 0,
    failed: 0,
    images: [],
    galleryInfo: null,
    mode: 'direct',
    targetTabId: null
};

// 下载间隔 (毫秒) - 防止反爬虫
const DOWNLOAD_DELAY = 500;

// 监听插件图标点击事件 - 打开新标签页
chrome.action.onClicked.addListener(async (tab) => {
    console.log('[E-Hentai Downloader] 插件图标被点击');

    // 打开新标签页
    const pageUrl = chrome.runtime.getURL('page/index.html');
    await chrome.tabs.create({ url: pageUrl });
});

// 监听来自 popup 或 page 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[E-Hentai Downloader] Background 收到消息:', message.action);

    switch (message.action) {
        case 'startDownload':
            console.log('[E-Hentai Downloader] 开始下载, 模式:', message.data.mode);
            console.log('[E-Hentai Downloader] 漫画信息:', message.data.galleryInfo);
            startDownload(message.data.galleryInfo, message.data.mode)
                .then(() => {
                    console.log('[E-Hentai Downloader] 下载任务完成');
                    sendResponse({ success: true });
                })
                .catch(error => {
                    console.error('[E-Hentai Downloader] 下载任务失败:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'startDownloadFromTab':
            console.log('[E-Hentai Downloader] 从指定标签页开始下载');
            downloadState.targetTabId = message.data.tabId;
            startDownloadFromTab(message.data.tabId, message.data.galleryInfo, message.data.mode)
                .then(() => {
                    console.log('[E-Hentai Downloader] 下载任务完成');
                    sendResponse({ success: true });
                })
                .catch(error => {
                    console.error('[E-Hentai Downloader] 下载任务失败:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'cancelDownload':
            cancelDownload();
            sendResponse({ success: true });
            break;
    }
    return true;
});

// 开始下载 (从指定标签页)
async function startDownloadFromTab(tabId, galleryInfo, mode) {
    if (downloadState.isDownloading) {
        throw new Error(chrome.i18n.getMessage('errorDownloadInProgress'));
    }

    // 初始化状态
    downloadState = {
        isDownloading: true,
        isCancelled: false,
        total: galleryInfo.pageCount,
        completed: 0,
        failed: 0,
        images: [],
        galleryInfo: galleryInfo,
        mode: mode,
        targetTabId: tabId
    };

    try {
        // 第一步：获取所有页面链接
        console.log('[E-Hentai Downloader] 步骤1: 从标签页获取页面链接...');
        notifyProgress(chrome.i18n.getMessage('statusParsingLinks'));

        const response = await chrome.tabs.sendMessage(tabId, { action: 'getPageLinks' });
        if (!response || !response.success) {
            throw new Error(chrome.i18n.getMessage('errorGetPageLinks'));
        }

        const pageLinks = response.data;
        console.log('[E-Hentai Downloader] 获取到页面链接数:', pageLinks.length);

        if (downloadState.isCancelled) return;

        // 第二步：从每个页面获取真实图片地址
        console.log('[E-Hentai Downloader] 步骤2: 解析图片地址...');
        notifyProgress(chrome.i18n.getMessage('statusGettingImages'));
        const imageUrls = await getAllImageUrls(pageLinks);
        console.log('[E-Hentai Downloader] 解析到图片地址数:', imageUrls.length);

        if (downloadState.isCancelled) return;

        downloadState.total = imageUrls.length;

        // 第三步：下载图片
        if (mode === 'zip') {
            await downloadAsZip(imageUrls, galleryInfo.title);
        } else {
            await downloadDirect(imageUrls, galleryInfo.title);
        }

        // 通知完成
        notifyComplete();
    } catch (error) {
        console.error('下载失败:', error);
        notifyError(error.message);
    } finally {
        downloadState.isDownloading = false;
    }
}

// 开始下载 (原有方法，用于 popup)
async function startDownload(galleryInfo, mode) {
    if (downloadState.isDownloading) {
        throw new Error(chrome.i18n.getMessage('errorDownloadInProgress'));
    }

    // 初始化状态
    downloadState = {
        isDownloading: true,
        isCancelled: false,
        total: galleryInfo.pageCount,
        completed: 0,
        failed: 0,
        images: [],
        galleryInfo: galleryInfo,
        mode: mode,
        targetTabId: null
    };

    try {
        // 第一步：获取所有页面链接
        console.log('[E-Hentai Downloader] 步骤1: 获取页面链接...');
        notifyProgress(chrome.i18n.getMessage('statusParsingLinks'));
        const pageLinks = await getAllPageLinks(galleryInfo);
        console.log('[E-Hentai Downloader] 获取到页面链接数:', pageLinks.length);
        console.log('[E-Hentai Downloader] 页面链接示例:', pageLinks.slice(0, 3));

        if (downloadState.isCancelled) return;

        // 第二步：从每个页面获取真实图片地址
        console.log('[E-Hentai Downloader] 步骤2: 解析图片地址...');
        notifyProgress(chrome.i18n.getMessage('statusGettingImages'));
        const imageUrls = await getAllImageUrls(pageLinks);
        console.log('[E-Hentai Downloader] 解析到图片地址数:', imageUrls.length);
        if (imageUrls.length > 0) {
            console.log('[E-Hentai Downloader] 图片地址示例:', imageUrls[0]);
        }

        if (downloadState.isCancelled) return;

        downloadState.total = imageUrls.length;

        // 第三步：下载图片
        if (mode === 'zip') {
            await downloadAsZip(imageUrls, galleryInfo.title);
        } else {
            await downloadDirect(imageUrls, galleryInfo.title);
        }

        // 通知完成
        notifyComplete();
    } catch (error) {
        console.error('下载失败:', error);
        notifyError(error.message);
    } finally {
        downloadState.isDownloading = false;
    }
}

// 取消下载
function cancelDownload() {
    downloadState.isCancelled = true;
    downloadState.isDownloading = false;
}

// 获取所有页面的链接
async function getAllPageLinks(galleryInfo) {
    console.log('[E-Hentai Downloader] getAllPageLinks 开始执行...');

    // 从 content script 获取链接
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[E-Hentai Downloader] 当前标签页:', tab ? tab.id : 'null');

    if (!tab) {
        throw new Error(chrome.i18n.getMessage('errorGetCurrentTab'));
    }

    console.log('[E-Hentai Downloader] 向 content script 发送 getPageLinks 消息...');
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageLinks' });
    console.log('[E-Hentai Downloader] 收到 content script 响应:', response);

    if (response && response.success) {
        console.log('[E-Hentai Downloader] 成功获取页面链接, 数量:', response.data.length);
        return response.data;
    }

    console.error('[E-Hentai Downloader] 获取页面链接失败, 响应:', response);
    throw new Error(chrome.i18n.getMessage('errorGetPageLinks'));
}

// 从页面获取真实图片地址
async function getAllImageUrls(pageLinks) {
    const imageUrls = [];

    for (let i = 0; i < pageLinks.length; i++) {
        if (downloadState.isCancelled) break;

        try {
            const imageUrl = await getImageUrlFromPage(pageLinks[i]);
            if (imageUrl) {
                imageUrls.push({
                    url: imageUrl,
                    index: i + 1,
                    filename: getFileNameFromUrl(imageUrl, i + 1)
                });
            }

            // 更新进度
            updateProgress(i + 1, pageLinks.length, 0, chrome.i18n.getMessage('parsingPageFormat', [i + 1, pageLinks.length]));

            // 延迟避免请求过快
            if (i < pageLinks.length - 1) {
                await delay(DOWNLOAD_DELAY);
            }
        } catch (error) {
            console.error(`解析页面 ${i + 1} 失败:`, error);
        }
    }

    return imageUrls;
}

// 从展示页获取真实图片地址
async function getImageUrlFromPage(pageUrl) {
    console.log('[E-Hentai Downloader] 正在解析页面:', pageUrl);
    try {
        const response = await fetch(pageUrl);
        console.log('[E-Hentai Downloader] fetch 响应状态:', response.status);
        const html = await response.text();
        console.log('[E-Hentai Downloader] 页面内容长度:', html.length);

        // 查找图片地址
        // 方法1: 从 img#img 标签获取
        const imgMatch = html.match(/<img[^>]+id="img"[^>]+src="([^"]+)"/);
        if (imgMatch) {
            console.log('[E-Hentai Downloader] 方法1成功, 图片地址:', imgMatch[1]);
            return imgMatch[1];
        }
        console.log('[E-Hentai Downloader] 方法1未匹配');

        // 方法2: 从页面脚本中获取
        const scriptMatch = html.match(/showbigimg\.php\?[^"']+/);
        if (scriptMatch) {
            console.log('[E-Hentai Downloader] 方法2找到:', scriptMatch[0]);
        }

        // 方法3: 查找原始图片链接
        const nlMatch = html.match(/id="i3"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
        if (nlMatch) {
            console.log('[E-Hentai Downloader] 方法3成功, 图片地址:', nlMatch[2]);
            return nlMatch[2];
        }
        console.log('[E-Hentai Downloader] 方法3未匹配');

        // 方法4: 直接匹配 hath.network 图片地址
        const hathMatch = html.match(/https?:\/\/[^"'\s]+\.hath\.network[^"'\s]+/);
        if (hathMatch) {
            console.log('[E-Hentai Downloader] 方法4成功, 图片地址:', hathMatch[0]);
            return hathMatch[0];
        }
        console.log('[E-Hentai Downloader] 方法4未匹配');

        // 调试: 输出页面中的 img 标签
        const allImgs = html.match(/<img[^>]+src="[^"]+"[^>]*>/g);
        console.log('[E-Hentai Downloader] 页面中的图片标签数:', allImgs ? allImgs.length : 0);
        if (allImgs && allImgs.length > 0) {
            console.log('[E-Hentai Downloader] 图片标签示例:', allImgs.slice(0, 3));
        }

        console.warn('[E-Hentai Downloader] 未能找到图片地址');
        return null;
    } catch (error) {
        console.error('[E-Hentai Downloader] 获取图片地址失败:', error);
        return null;
    }
}

// 直接下载模式
async function downloadDirect(imageUrls, galleryTitle) {
    downloadState.completed = 0;
    downloadState.failed = 0;

    for (const imageInfo of imageUrls) {
        if (downloadState.isCancelled) break;

        try {
            // 清理文件名中的非法字符
            const safeTitle = sanitizeFileName(galleryTitle);
            const filename = `${safeTitle}/${imageInfo.filename}`;
            console.log('[E-Hentai Downloader] 下载文件:', filename);

            await chrome.downloads.download({
                url: imageInfo.url,
                filename: filename,
                saveAs: false
            });

            downloadState.completed++;
        } catch (error) {
            console.error(`下载图片 ${imageInfo.index} 失败:`, error);
            downloadState.failed++;
        }

        // 更新进度
        updateProgress(
            downloadState.completed,
            downloadState.total,
            downloadState.failed,
            imageInfo.filename
        );

        // 延迟
        await delay(DOWNLOAD_DELAY);
    }
}

// ZIP 打包下载模式
async function downloadAsZip(imageUrls, galleryTitle) {
    // 动态导入 JSZip（在 service worker 中需要特殊处理）
    const zip = new JSZip();

    downloadState.completed = 0;
    downloadState.failed = 0;

    for (const imageInfo of imageUrls) {
        if (downloadState.isCancelled) break;

        try {
            // 获取图片数据
            const response = await fetch(imageInfo.url);
            const blob = await response.blob();

            // 添加到 ZIP
            zip.file(imageInfo.filename, blob);

            downloadState.completed++;
        } catch (error) {
            console.error(`获取图片 ${imageInfo.index} 失败:`, error);
            downloadState.failed++;
        }

        // 更新进度
        updateProgress(
            downloadState.completed,
            downloadState.total,
            downloadState.failed,
            imageInfo.filename
        );

        // 延迟
        await delay(DOWNLOAD_DELAY);
    }

    if (downloadState.isCancelled) return;

    // 生成 ZIP 文件
    console.log('[E-Hentai Downloader] 开始生成 ZIP 文件...');
    notifyProgress(chrome.i18n.getMessage('statusPackaging'));

    // 使用 base64 格式，因为 Service Worker 不支持 URL.createObjectURL
    const zipBase64 = await zip.generateAsync({
        type: 'base64',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });

    console.log('[E-Hentai Downloader] ZIP 生成完成，大小:', zipBase64.length, '字符');

    // 创建 data URL 下载
    const dataUrl = 'data:application/zip;base64,' + zipBase64;

    // 清理文件名
    const safeTitle = sanitizeFileName(galleryTitle);

    console.log('[E-Hentai Downloader] 开始下载 ZIP 文件:', safeTitle + '.zip');
    await chrome.downloads.download({
        url: dataUrl,
        filename: `${safeTitle}.zip`,
        saveAs: true
    });

    console.log('[E-Hentai Downloader] ZIP 下载已启动');
}

// 从 URL 获取文件名
function getFileNameFromUrl(url, index) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const originalName = pathname.split('/').pop();

        // 获取扩展名
        const extMatch = originalName.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        const ext = extMatch ? extMatch[1] : 'jpg';

        // 格式化序号为3位数
        const paddedIndex = String(index).padStart(3, '0');

        return `${paddedIndex}.${ext}`;
    } catch (error) {
        return `${String(index).padStart(3, '0')}.jpg`;
    }
}

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 清理文件名中的非法字符
function sanitizeFileName(name) {
    if (!name) return 'download';

    return name
        // 移除 Windows 非法字符
        .replace(/[<>:"/\\|?*]/g, '_')
        // 移除控制字符
        .replace(/[\x00-\x1f\x7f]/g, '')
        // 移除前导和尾随空格、点
        .replace(/^[\s.]+|[\s.]+$/g, '')
        // 多个空格合并为一个
        .replace(/\s+/g, ' ')
        // 限制长度
        .substring(0, 100)
        // 如果结果为空，使用默认名称
        || 'download';
}

// 通知进度更新
function updateProgress(completed, total, failed, currentFile) {
    chrome.runtime.sendMessage({
        action: 'downloadProgress',
        data: { completed, total, failed, currentFile }
    }).catch(() => { });
}

// 通知进度消息
function notifyProgress(message) {
    chrome.runtime.sendMessage({
        action: 'downloadProgress',
        data: {
            completed: downloadState.completed,
            total: downloadState.total,
            failed: downloadState.failed,
            currentFile: message
        }
    }).catch(() => { });
}

// 通知完成
function notifyComplete() {
    chrome.runtime.sendMessage({
        action: 'downloadComplete',
        data: {
            success: downloadState.completed,
            failed: downloadState.failed
        }
    }).catch(() => { });
}

// 通知错误
function notifyError(error) {
    chrome.runtime.sendMessage({
        action: 'downloadError',
        data: { error }
    }).catch(() => { });
}


