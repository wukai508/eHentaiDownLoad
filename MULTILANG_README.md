# E-Hentai Downloader - 多语言支持说明

## 已支持的语言

- 中文 (zh_CN) - 默认语言
- English (en) - 英文

## 语言切换方式

插件会自动根据浏览器的语言设置来显示对应的语言。

### 如何更改 Chrome 浏览器语言：

1. 打开 Chrome 设置（chrome://settings/）
2. 点击左侧菜单的"语言"
3. 添加或调整首选语言顺序
4. 重新加载插件即可看到语言变化

## 文件结构

```
_locales/
  ├── zh_CN/
  │   └── messages.json  # 中文翻译
  └── en/
      └── messages.json  # 英文翻译
```

## 如何添加新语言

1. 在 `_locales` 文件夹下创建新的语言文件夹（如 `ja` 日文）
2. 复制 `zh_CN/messages.json` 到新文件夹
3. 翻译 `messages.json` 中的 `message` 字段内容
4. 重新加载插件

## 技术实现

- 使用 Chrome Extension i18n API
- manifest.json 中设置 `default_locale: "zh_CN"`
- HTML 使用 `data-i18n` 属性标记
- JavaScript 使用 `chrome.i18n.getMessage()` 获取翻译

## 示例

```javascript
// 获取简单消息
const title = chrome.i18n.getMessage('appTitle');

// 获取带参数的消息
const pageCount = chrome.i18n.getMessage('pageCountFormat', ['100']);
// 结果: "100 页" (中文) 或 "100 pages" (英文)
```
