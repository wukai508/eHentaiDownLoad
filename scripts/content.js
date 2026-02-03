// Content Script - E-Hentai 页面解析
console.log('[E-Hentai Downloader] Content script 已加载');

// 监听来自 popup 或 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[E-Hentai Downloader] 收到消息:', message.action);

    switch (message.action) {
        case 'getGalleryInfo':
            const info = extractGalleryInfo();
            console.log('[E-Hentai Downloader] 漫画信息:', info);
            sendResponse({ success: !!info, data: info });
            break;
        case 'getPageLinks':
            console.log('[E-Hentai Downloader] 开始获取页面链接...');
            getPageLinks().then(links => {
                console.log('[E-Hentai Downloader] 获取到页面链接数量:', links.length);
                console.log('[E-Hentai Downloader] 页面链接示例:', links.slice(0, 3));
                sendResponse({ success: true, data: links });
            }).catch(error => {
                console.error('[E-Hentai Downloader] 获取页面链接失败:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // 保持消息通道开放以进行异步响应
    }
    return true;
});

// 提取漫画基本信息
function extractGalleryInfo() {
    try {
        console.log('[E-Hentai Downloader] 开始提取漫画信息...');

        // 获取漫画标题
        const titleElement = document.querySelector('#gn');
        const title = titleElement ? titleElement.textContent.trim() : '未知标题';
        console.log('[E-Hentai Downloader] 标题:', title);

        // 获取日文标题（如果有）
        const titleJpElement = document.querySelector('#gj');
        const titleJp = titleJpElement ? titleJpElement.textContent.trim() : '';

        // 获取页数
        const pageCountMatch = document.body.innerHTML.match(/(\d+) pages/i);
        const pageCount = pageCountMatch ? parseInt(pageCountMatch[1]) : 0;
        console.log('[E-Hentai Downloader] 页数:', pageCount);

        // 从 URL 获取 gallery ID 和 token
        const urlMatch = location.pathname.match(/\/g\/(\d+)\/([a-f0-9]+)/);
        const galleryId = urlMatch ? urlMatch[1] : '';
        const token = urlMatch ? urlMatch[2] : '';
        console.log('[E-Hentai Downloader] Gallery ID:', galleryId, 'Token:', token);

        // 获取所有缩略图链接 (第一页的)
        const thumbLinks = Array.from(document.querySelectorAll('#gdt a')).map(a => a.href);
        console.log('[E-Hentai Downloader] 当前页缩略图链接数:', thumbLinks.length);

        return {
            title: sanitizeFileName(title),
            titleJp: titleJp,
            pageCount: pageCount,
            galleryId: galleryId,
            token: token,
            thumbLinks: thumbLinks,
            url: location.href
        };
    } catch (error) {
        console.error('[E-Hentai Downloader] 提取漫画信息失败:', error);
        return null;
    }
}

// 获取所有页面的链接（包括分页）
async function getPageLinks() {
    const links = [];
    console.log('[E-Hentai Downloader] getPageLinks 开始执行...');

    // 检查是否有分页
    const paginationLinks = document.querySelectorAll('.ptt td a');
    console.log('[E-Hentai Downloader] 分页链接元素数:', paginationLinks.length);

    const pageUrls = new Set();
    pageUrls.add(location.href);

    // 收集所有分页 URL
    paginationLinks.forEach(link => {
        const href = link.href;
        if (href && href.includes('?p=')) {
            pageUrls.add(href);
        }
    });
    console.log('[E-Hentai Downloader] 总分页数:', pageUrls.size);

    // 从当前页面获取缩略图链接
    const currentPageLinks = Array.from(document.querySelectorAll('#gdt a')).map(a => a.href);
    console.log('[E-Hentai Downloader] 当前页链接数:', currentPageLinks.length);
    links.push(...currentPageLinks);

    // 获取其他分页的链接
    const otherPages = Array.from(pageUrls).filter(url => url !== location.href).sort();
    console.log('[E-Hentai Downloader] 需要获取的其他分页:', otherPages.length);

    for (const pageUrl of otherPages) {
        try {
            console.log('[E-Hentai Downloader] 正在获取分页:', pageUrl);
            const response = await fetch(pageUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const pageLinks = Array.from(doc.querySelectorAll('#gdt a')).map(a => a.href);
            console.log('[E-Hentai Downloader] 分页获取到链接数:', pageLinks.length);
            links.push(...pageLinks);
        } catch (error) {
            console.error('[E-Hentai Downloader] 获取分页失败:', pageUrl, error);
        }
    }

    console.log('[E-Hentai Downloader] 总共获取到链接数:', links.length);
    return links;
}

// 清理文件名中的非法字符
function sanitizeFileName(name) {
    return name
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100); // 限制长度
}

