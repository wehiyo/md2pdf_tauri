/**
 * 静态站点导出模块
 * 将 MkDocs 项目导出为类似 MkDocs Material 的静态站点
 */

import { writeFile, mkdir, copyFile } from '@tauri-apps/plugin-fs'
import { useMarkdown, resetGlobalHeadingIndex } from './useMarkdown'

// 导出接口
export interface SiteExportOptions {
  outputDir: string           // 输出目录路径
  siteName: string            // 站点名称（用于顶部标题）
  chapters: NavChapter[]      // 章节列表（来自 useMkdocsExport）
}

export interface NavChapter {
  title: string
  navLevel: number
  filePath: string
  content?: string
  headings?: Heading[]
  numberPrefix: string
  chapterNumber: string
  htmlId?: string
}

export interface Heading {
  level: number
  text: string
  id: string
  adjustedLevel: number
  adjustedNumber: string
  adjustedId: string
}

export interface SearchIndexEntry {
  page: string
  title: string
  sections: SearchSection[]
}

export interface SearchSection {
  heading: string
  id: string
  text: string
}

interface PageInfo {
  title: string
  htmlFile: string
  chapter: NavChapter
}

interface NavPageLink {
  title: string
  href: string
}

/**
 * 生成页面文件名
 */
function generatePageFileName(chapter: NavChapter, isFirstLevel0: boolean): string {
  if (isFirstLevel0 && chapter.navLevel === 0) {
    return 'index.html'
  }

  if (chapter.chapterNumber) {
    // 将 "1.1" 转换为 "chapter-1-1.html"
    const parts = chapter.chapterNumber.split('.')
    return `chapter-${parts.join('-')}.html`
  }

  // 无编号的章节使用标题 slug
  const slug = chapter.title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')

  return `${slug}.html`
}

/**
 * Material 风格 CSS
 */
function getMaterialSiteCss(): string {
  return `
/* Material 风格静态站点样式 */

:root {
  --md-primary-color: #1976d2;
  --md-primary-bg: #1976d2;
  --md-sidebar-bg: #f5f5f5;
  --md-sidebar-width: 260px;
  --md-header-height: 64px;
  --md-content-bg: #ffffff;
  --md-text-color: #212121;
  --md-text-secondary: #757575;
  --md-link-color: #1976d2;
  --md-link-hover: #1565c0;
  --md-code-bg: #f5f5f5;
  --md-code-color: #37474f;
  --md-border-color: #e0e0e0;
  --md-hover-bg: #e8e8e8;
  --md-active-bg: #e3f2fd;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--md-text-color);
  background-color: var(--md-content-bg);
}

/* 顶部导航栏 */
.md-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--md-header-height);
  background-color: var(--md-primary-bg);
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 24px;
  z-index: 100;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.md-header__title {
  font-size: 20px;
  font-weight: 500;
  flex: 1;
}

.md-header__search {
  position: relative;
  width: 300px;
}

.md-search-input {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  background-color: rgba(255,255,255,0.2);
  color: #fff;
  font-size: 14px;
  outline: none;
}

.md-search-input::placeholder {
  color: rgba(255,255,255,0.7);
}

.md-search-input:focus {
  background-color: rgba(255,255,255,0.3);
}

.md-search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  max-height: 400px;
  overflow-y: auto;
  display: none;
  margin-top: 8px;
}

.md-search-results.active {
  display: block;
}

.md-search-result {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--md-border-color);
}

.md-search-result:last-child {
  border-bottom: none;
}

.md-search-result:hover {
  background-color: var(--md-hover-bg);
}

.md-search-result__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-text-color);
}

.md-search-result__section {
  font-size: 13px;
  color: var(--md-text-secondary);
  margin-top: 4px;
}

/* 侧边栏 */
.md-sidebar {
  position: fixed;
  top: var(--md-header-height);
  left: 0;
  width: var(--md-sidebar-width);
  height: calc(100vh - var(--md-header-height));
  background-color: var(--md-sidebar-bg);
  border-right: 1px solid var(--md-border-color);
  overflow-y: auto;
  padding: 16px 0;
}

.md-nav {
  list-style: none;
}

.md-nav__item {
  margin: 0;
}

.md-nav__link {
  display: block;
  padding: 8px 16px 8px 24px;
  color: var(--md-text-color);
  text-decoration: none;
  font-size: 14px;
  transition: background-color 0.2s;
}

.md-nav__link:hover {
  background-color: var(--md-hover-bg);
}

.md-nav__link.active {
  background-color: var(--md-active-bg);
  color: var(--md-primary-color);
  font-weight: 500;
}

.md-nav__link--level-0 {
  padding-left: 16px;
  font-weight: 500;
}

.md-nav__link--level-1 {
  padding-left: 32px;
}

.md-nav__link--level-2 {
  padding-left: 48px;
  font-size: 13px;
}

.md-nav__link--level-3 {
  padding-left: 64px;
  font-size: 13px;
}

/* 主内容区 */
.md-content {
  margin-left: var(--md-sidebar-width);
  margin-top: var(--md-header-height);
  padding: 24px 0;
  display: flex;
  justify-content: center;
}

.md-content__inner {
  max-width: 1000px;
  width: 100%;
  padding: 0 48px;
}

/* Markdown 内容样式 */
.md-content h1 {
  font-size: 2em;
  font-weight: 500;
  margin-bottom: 16px;
  color: var(--md-text-color);
}

.md-content h2 {
  font-size: 1.5em;
  font-weight: 500;
  margin-top: 32px;
  margin-bottom: 16px;
  color: var(--md-text-color);
}

.md-content h3 {
  font-size: 1.25em;
  font-weight: 500;
  margin-top: 24px;
  margin-bottom: 12px;
  color: var(--md-text-color);
}

.md-content h4 {
  font-size: 1em;
  font-weight: 500;
  margin-top: 20px;
  margin-bottom: 8px;
  color: var(--md-text-color);
}

.md-content p {
  margin-bottom: 16px;
}

.md-content a {
  color: var(--md-link-color);
  text-decoration: none;
}

.md-content a:hover {
  color: var(--md-link-hover);
  text-decoration: underline;
}

.md-content code {
  background-color: var(--md-code-bg);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
  color: var(--md-code-color);
}

.md-content pre {
  background-color: var(--md-code-bg);
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
  margin-bottom: 16px;
}

.md-content pre code {
  background-color: transparent;
  padding: 0;
  font-size: 14px;
}

.md-content blockquote {
  border-left: 4px solid var(--md-primary-color);
  padding-left: 16px;
  margin: 16px 0;
  color: var(--md-text-secondary);
}

.md-content table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
}

.md-content th,
.md-content td {
  border: 1px solid var(--md-border-color);
  padding: 12px;
  text-align: left;
}

.md-content th {
  background-color: var(--md-code-bg);
  font-weight: 500;
}

.md-content img {
  max-width: 100%;
  height: auto;
}

.md-content ul,
.md-content ol {
  margin-bottom: 16px;
  padding-left: 24px;
}

.md-content li {
  margin-bottom: 8px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .md-sidebar {
    width: 0;
    overflow: hidden;
  }

  .md-content {
    margin-left: 0;
  }

  .md-content__inner {
    padding: 16px;
  }

  .md-header__search {
    width: 200px;
  }
}

/* 页面导航（上一篇/下一篇） */
.md-footer-nav {
  display: flex;
  justify-content: space-between;
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--md-border-color);
}

.md-footer-nav__link {
  display: flex;
  flex-direction: column;
  max-width: 45%;
  text-decoration: none;
  color: var(--md-text-color);
  padding: 12px 16px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.md-footer-nav__link:hover {
  background-color: var(--md-hover-bg);
}

.md-footer-nav__link--prev {
  align-items: flex-start;
}

.md-footer-nav__link--next {
  align-items: flex-end;
  text-align: right;
}

.md-footer-nav__label {
  font-size: 12px;
  color: var(--md-text-secondary);
  margin-bottom: 4px;
}

.md-footer-nav__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-link-color);
}

.md-footer-nav__link:hover .md-footer-nav__title {
  color: var(--md-link-hover);
}

@media (max-width: 768px) {
  .md-footer-nav {
    flex-direction: column;
    gap: 12px;
  }

  .md-footer-nav__link {
    max-width: 100%;
  }

  .md-footer-nav__link--next {
    align-items: flex-start;
    text-align: left;
  }
}
`
}

/**
 * 搜索 JavaScript（从嵌入数据加载）
 */
function getSearchJs(): string {
  return `
// 搜索功能
(function() {
  const searchInput = document.querySelector('.md-search-input');
  const searchResults = document.querySelector('.md-search-results');

  if (!searchInput || !searchResults) return;

  // 从页面嵌入的数据加载搜索索引
  let searchIndex = [];
  const indexDataEl = document.getElementById('search-index-data');
  if (indexDataEl) {
    try {
      searchIndex = JSON.parse(indexDataEl.textContent || '[]');
    } catch (err) {
      console.error('解析搜索索引失败:', err);
    }
  }

  // 搜索输入处理
  searchInput.addEventListener('input', function(e) {
    const query = e.target.value.trim().toLowerCase();

    if (query.length < 2) {
      searchResults.classList.remove('active');
      searchResults.innerHTML = '';
      return;
    }

    const results = [];

    searchIndex.forEach(page => {
      // 搜索页面标题
      if (page.title.toLowerCase().includes(query)) {
        results.push({
          page: page.page,
          title: page.title,
          section: null,
          id: null
        });
      }

      // 搜索章节内容
      if (page.sections && page.sections.length > 0) {
        page.sections.forEach(section => {
          const headingText = (section.heading || '').toLowerCase();
          const contentText = (section.text || '').toLowerCase();
          if (headingText.includes(query) || contentText.includes(query)) {
            results.push({
              page: page.page,
              title: page.title,
              section: section.heading,
              id: section.id
            });
          }
        });
      }
    });

    // 显示结果（最多 10 条）
    if (results.length > 0) {
      const isSubPage = window.location.pathname.includes('/pages/');
      searchResults.innerHTML = results.slice(0, 10).map(r => {
        // 调整链接路径
        let href = r.page;
        if (isSubPage) {
          if (href === 'index.html') {
            href = '../index.html';
          } else if (href.startsWith('pages/')) {
            href = href.substring(6);
          }
        }
        if (r.id) {
          href += r.id;
        }
        const sectionText = r.section ? ' \\u2192 ' + r.section : '';
        return '<div class="md-search-result" data-href="' + href + '">' +
               '<div class="md-search-result__title">' + r.title + '</div>' +
               '<div class="md-search-result__section">' + sectionText + '</div>' +
               '</div>';
      }).join('');
      searchResults.classList.add('active');
    } else {
      searchResults.innerHTML = '<div class="md-search-result"><div class="md-search-result__title">无匹配结果</div></div>';
      searchResults.classList.add('active');
    }
  });

  // 点击搜索结果跳转（使用事件委托）
  searchResults.addEventListener('click', function(e) {
    const result = e.target.closest('.md-search-result');
    if (result) {
      const href = result.getAttribute('data-href');
      if (href) {
        window.location.href = href;
      }
    }
  });

  // 点击外部关闭搜索结果
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.md-header__search')) {
      searchResults.classList.remove('active');
    }
  });
})();
`
}

/**
 * 导航 JavaScript（侧边栏高亮）
 */
function getNavigationJs(): string {
  return `
// 导航高亮
(function() {
  // 获取当前页面路径
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  // 高亮当前页面的导航链接
  const navLinks = document.querySelectorAll('.md-nav__link');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || href === './' + currentPath) {
      link.classList.add('active');
    }
  });
})();
`
}

/**
 * 生成侧边栏导航 HTML
 */
function generateSidebarNav(
  chapters: NavChapter[],
  pageInfos: PageInfo[],
  currentChapter: NavChapter,
  isSubPage: boolean = false
): string {
  // 构建导航树
  const navItems: string[] = []

  for (const chapter of chapters) {
    const pageInfo = pageInfos.find(p => p.chapter === chapter)
    if (!pageInfo) continue

    // 判断是否当前页面
    const isActive = chapter === currentChapter
    const activeClass = isActive ? ' active' : ''

    // 导航层级样式
    const levelClass = ` md-nav__link--level-${chapter.navLevel}`

    // 显示标题（带编号）
    const displayTitle = chapter.chapterNumber
      ? `${chapter.chapterNumber}. ${chapter.title}`
      : chapter.title

    // 导航链接路径处理
    // 子页面(pages目录)导航到其他页面：
    // - index.html → ../index.html
    // - pages/xxx.html → xxx.html (同目录)
    let navHref: string
    if (isSubPage) {
      if (pageInfo.htmlFile === 'index.html') {
        navHref = '../index.html'
      } else if (pageInfo.htmlFile.startsWith('pages/')) {
        navHref = pageInfo.htmlFile.substring(6) // 移除 pages/ 前缀
      } else {
        navHref = pageInfo.htmlFile
      }
    } else {
      navHref = pageInfo.htmlFile
    }

    navItems.push(`<li class="md-nav__item">`)
    navItems.push(`<a href="${navHref}" class="md-nav__link${levelClass}${activeClass}">${displayTitle}</a>`)

    // 如果有子标题且是当前页面，显示子标题导航
    if (isActive && chapter.headings && chapter.headings.length > 0) {
      for (const heading of chapter.headings) {
        if (heading.adjustedLevel <= 4) {
          const headingTitle = heading.adjustedNumber
            ? `${heading.adjustedNumber}${heading.text}`
            : heading.text
          navItems.push(`<a href="#${heading.adjustedId}" class="md-nav__link md-nav__link--level-${chapter.navLevel + 1}">${headingTitle}</a>`)
        }
      }
    }

    navItems.push(`</li>`)
  }

  return `<ul class="md-nav">${navItems.join('\n')}</ul>`
}

/**
 * 生成页面导航 footer（上一篇/下一篇）
 */
function generateNavFooter(prevPage: NavPageLink | null, nextPage: NavPageLink | null, isSubPage: boolean = false): string {
  // 子页面需要调整链接路径
  const adjustHref = (href: string): string => {
    if (isSubPage) {
      if (href === 'index.html') {
        return '../index.html'
      } else if (href.startsWith('pages/')) {
        return href.substring(6) // 移除 pages/ 前缀，因为同目录
      }
    }
    return href
  }
  const prevHtml = prevPage
    ? `<a href="${adjustHref(prevPage.href)}" class="md-footer-nav__link md-footer-nav__link--prev">
         <span class="md-footer-nav__label">上一篇</span>
         <span class="md-footer-nav__title">${prevPage.title}</span>
       </a>`
    : ''

  const nextHtml = nextPage
    ? `<a href="${adjustHref(nextPage.href)}" class="md-footer-nav__link md-footer-nav__link--next">
         <span class="md-footer-nav__label">下一篇</span>
         <span class="md-footer-nav__title">${nextPage.title}</span>
       </a>`
    : ''

  if (!prevPage && !nextPage) {
    return ''
  }

  return `<nav class="md-footer-nav">${prevHtml}${nextHtml}</nav>`
}

/**
 * 生成完整页面 HTML
 */
function generatePageHtml(
  siteName: string,
  pageTitle: string,
  sidebarNav: string,
  contentHtml: string,
  navFooter: string,
  searchIndexJson: string,
  isSubPage: boolean = false
): string {
  // 子页面（pages目录下）需要使用 ../ 前缀引用资源
  const assetPrefix = isSubPage ? '../' : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle} - ${siteName}</title>
  <link rel="stylesheet" href="${assetPrefix}assets/css/site.css">
  <!-- 嵌入搜索索引数据 -->
  <script id="search-index-data" type="application/json">${searchIndexJson}</script>
</head>
<body>
  <!-- 顶部导航栏 -->
  <header class="md-header">
    <div class="md-header__title">${siteName}</div>
    <div class="md-header__search">
      <input type="text" class="md-search-input" placeholder="搜索...">
      <div class="md-search-results"></div>
    </div>
  </header>

  <!-- 侧边栏 -->
  <nav class="md-sidebar">
    ${sidebarNav}
  </nav>

  <!-- 主内容区 -->
  <main class="md-content">
    <div class="md-content__inner">
      ${contentHtml}
      ${navFooter}
    </div>
  </main>

  <script src="${assetPrefix}assets/js/search.js"></script>
  <script src="${assetPrefix}assets/js/navigation.js"></script>
</body>
</html>`
}

/**
 * 从 Markdown 内容提取纯文本（用于搜索）
 */
function extractPlainText(content: string): string {
  // 移除代码块
  let text = content.replace(/```[\s\S]*?```/g, '')
  // 移除行内代码
  text = text.replace(/`[^`]+`/g, '')
  // 移除链接标记，保留文字
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // 移除图片
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
  // 移除 HTML 标签
  text = text.replace(/<[^>]+>/g, '')
  // 移除特殊字符
  text = text.replace(/[#*_~`>|]/g, '')
  // 合并空白
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

/**
 * 生成搜索索引
 */
function generateSearchIndex(
  chapters: NavChapter[],
  pageInfos: PageInfo[]
): SearchIndexEntry[] {
  const index: SearchIndexEntry[] = []

  for (const chapter of chapters) {
    if (!chapter.filePath || !chapter.content) continue

    const pageInfo = pageInfos.find(p => p.chapter === chapter)
    if (!pageInfo) continue

    const { parse } = useMarkdown()
    const { body } = parse(chapter.content)

    const entry: SearchIndexEntry = {
      page: pageInfo.htmlFile,
      title: chapter.chapterNumber
        ? `${chapter.chapterNumber}. ${chapter.title}`
        : chapter.title,
      sections: []
    }

    // 添加章节标题作为第一个 section
    if (chapter.headings && chapter.headings.length > 0) {
      for (const heading of chapter.headings) {
        if (heading.adjustedLevel <= 4) {
          // 提取该标题下的内容片段（简单实现）
          const plainText = extractPlainText(body)

          entry.sections.push({
            heading: heading.adjustedNumber
              ? `${heading.adjustedNumber}${heading.text}`
              : heading.text,
            id: `#${heading.adjustedId}`,
            text: plainText.substring(0, 200) // 限制长度
          })
        }
      }
    }

    // 如果没有子标题，添加整个页面内容
    if (entry.sections.length === 0) {
      entry.sections.push({
        heading: chapter.title,
        id: '',
        text: extractPlainText(body).substring(0, 300)
      })
    }

    index.push(entry)
  }

  return index
}

/**
 * 复制图片文件到输出目录
 */
async function copyImages(
  chapters: NavChapter[],
  outputDir: string
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>() // 原路径 -> 新相对路径

  // 创建图片目录
  const imagesDir = `${outputDir}/assets/images`
  await mkdir(imagesDir, { recursive: true })

  // 扫描所有 MD 文件中的图片引用
  for (const chapter of chapters) {
    if (!chapter.filePath || !chapter.content) continue

    // 匹配 Markdown 图片语法 ![alt](path)
    const imageRegex = /!\[[^\]]*\]\([^)]+\)/g
    const matches = chapter.content.match(imageRegex) || []

    for (const match of matches) {
      // 提取图片路径
      const pathMatch = match.match(/\]\(([^)]+)\)/)
      if (!pathMatch) continue

      const originalPath = pathMatch[1]

      // 跳过外部链接
      if (originalPath.startsWith('http://') ||
          originalPath.startsWith('https://') ||
          originalPath.startsWith('data:')) {
        continue
      }

      // 计算图片绝对路径
      const chapterDir = chapter.filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
      const absoluteImagePath = `${chapterDir}/${originalPath}`.replace(/\\/g, '/')

      // 生成新文件名（使用原始文件名）
      const fileName = originalPath.split('/').pop() || 'image.png'
      const newRelativePath = `assets/images/${fileName}`

      // 如果还没复制过这个图片
      if (!imageMap.has(absoluteImagePath)) {
        try {
          await copyFile(absoluteImagePath, `${imagesDir}/${fileName}`)
          imageMap.set(absoluteImagePath, newRelativePath)
        } catch (err) {
          console.warn(`复制图片失败: ${absoluteImagePath}`, err)
        }
      }
    }
  }

  return imageMap
}

/**
 * 替换 HTML 中的图片路径
 */
function replaceImagePaths(html: string, imageMap: Map<string, string>, isSubPage: boolean = false): string {
  const pathPrefix = isSubPage ? '../' : ''
  return html.replace(/<img([^>]*)src=["']([^"']+)["']([^>]*)>/g, (match, before, src, after) => {
    // 查找替换路径
    for (const [original, newPath] of imageMap) {
      if (src.includes(original.split('/').pop() || '')) {
        // 添加路径前缀
        const fullNewPath = pathPrefix + newPath
        return `<img${before}src="${fullNewPath}"${after}>`
      }
    }
    return match
  })
}

/**
 * 导出静态站点
 */
export async function exportStaticSite(options: SiteExportOptions): Promise<void> {
  const { outputDir, siteName, chapters } = options

  // 在输出目录下创建以 siteName 为名称的文件夹
  // 处理 siteName 中的特殊字符，生成合法的文件夹名
  const safeFolderName = siteName
    .replace(/[<>:"/\\|?*]/g, '_')  // 替换 Windows 不允许的字符
    .replace(/\s+/g, '_')           // 空格替换为下划线
    .trim()

  const siteOutputDir = `${outputDir}/${safeFolderName}`

  // 创建目录结构
  await mkdir(`${siteOutputDir}/assets/css`, { recursive: true })
  await mkdir(`${siteOutputDir}/assets/js`, { recursive: true })
  await mkdir(`${siteOutputDir}/pages`, { recursive: true })

  // 生成页面信息列表
  const pageInfos: PageInfo[] = []
  let firstLevel0 = true

  for (const chapter of chapters) {
    const htmlFile = generatePageFileName(chapter, firstLevel0)
    if (chapter.navLevel === 0) {
      firstLevel0 = false
    }

    pageInfos.push({
      title: chapter.chapterNumber ? `${chapter.chapterNumber}. ${chapter.title}` : chapter.title,
      htmlFile: htmlFile === 'index.html' ? 'index.html' : `pages/${htmlFile}`,
      chapter
    })
  }

  // 复制图片
  const imageMap = await copyImages(chapters, siteOutputDir)

  // 写入 CSS
  const css = getMaterialSiteCss()
  await writeFile(`${siteOutputDir}/assets/css/site.css`, new TextEncoder().encode(css))

  // 写入 JS
  await writeFile(`${siteOutputDir}/assets/js/search.js`, new TextEncoder().encode(getSearchJs()))
  await writeFile(`${siteOutputDir}/assets/js/navigation.js`, new TextEncoder().encode(getNavigationJs()))

  // 生成搜索索引（嵌入到每个页面中）
  const searchIndex = generateSearchIndex(chapters, pageInfos)
  const searchIndexJson = JSON.stringify(searchIndex)

  // 保存搜索索引到单独文件（可选，用于其他用途）
  await writeFile(
    `${siteOutputDir}/search-index.json`,
    new TextEncoder().encode(JSON.stringify(searchIndex, null, 2))
  )

  // 重置标题计数器
  resetGlobalHeadingIndex()

  // 生成每个页面
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]
    const pageInfo = pageInfos[i]

    // 判断是否为子页面（pages目录下的页面）
    const isSubPage = pageInfo.htmlFile.startsWith('pages/')

    // 渲染内容
    let contentHtml = ''

    // 添加章节标题
    const headingLevel = Math.min(chapter.navLevel + 1, 4)
    const numberSpan = chapter.chapterNumber
      ? `<span class="heading-number">${chapter.chapterNumber}. </span>`
      : ''
    contentHtml += `<h${headingLevel} id="${chapter.htmlId || pageInfo.htmlFile.split('/').pop()}">${numberSpan}${chapter.title}</h${headingLevel}>\n`

    // 渲染 Markdown 内容
    if (chapter.filePath && chapter.content) {
      const { parse, renderContentSkipH1 } = useMarkdown()
      const { body } = parse(chapter.content)
      const rendered = renderContentSkipH1(body, chapter.numberPrefix, chapter.navLevel)

      // 替换图片路径（根据页面位置调整）
      contentHtml += replaceImagePaths(rendered, imageMap, isSubPage)
    }

    // 计算上一篇和下一篇（跳过无文件路径的章节）
    let prevPage: NavPageLink | null = null
    let nextPage: NavPageLink | null = null

    // 向前查找有文件路径的章节
    for (let j = i - 1; j >= 0; j--) {
      if (chapters[j].filePath) {
        prevPage = {
          title: pageInfos[j].title,
          href: pageInfos[j].htmlFile
        }
        break
      }
    }

    // 向后查找有文件路径的章节
    for (let j = i + 1; j < chapters.length; j++) {
      if (chapters[j].filePath) {
        nextPage = {
          title: pageInfos[j].title,
          href: pageInfos[j].htmlFile
        }
        break
      }
    }

    // 生成导航 footer
    const navFooter = generateNavFooter(prevPage, nextPage, isSubPage)

    // 生成侧边栏导航（当前页面高亮）
    const sidebarNav = generateSidebarNav(chapters, pageInfos, chapter, isSubPage)

    // 生成完整页面 HTML
    const pageHtml = generatePageHtml(
      siteName,
      pageInfo.title,
      sidebarNav,
      contentHtml,
      navFooter,
      searchIndexJson,
      isSubPage
    )

    // 写入文件
    const filePath = pageInfo.htmlFile === 'index.html'
      ? `${siteOutputDir}/index.html`
      : `${siteOutputDir}/${pageInfo.htmlFile}`

    await writeFile(filePath, new TextEncoder().encode(pageHtml))
  }
}