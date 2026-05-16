import { ref } from 'vue'

export interface ThemeColors {
  bodyColor: string
  headingColor: string
  linkColor: string
  codeBg: string
  tableHeaderBg: string
  tableBorder: string
  blockquoteBorder: string
  blockquoteColor: string
  borderColor: string
  headingFont: string
  bodyFont: string
  codeFont: string
  h1Size: string
  h1Border: string
  h2Size: string
  h2Border: string
  codeRadius: string
  preRadius: string
  blockquoteStyle: string
  hBorderColor: string
}

export const THEMES: Record<string, ThemeColors> = {
  default: {
    bodyColor: '#1f2937',
    headingColor: '#111827',
    linkColor: '#3b82f6',
    codeBg: '#f3f4f6',
    tableHeaderBg: '#c2dfff',
    tableBorder: '#d1d5db',
    blockquoteBorder: '#e5e7eb',
    blockquoteColor: '#6b7280',
    borderColor: '#e5e7eb',
    hBorderColor: '#93c5fd',
    headingFont: 'inherit',
    bodyFont: 'inherit',
    codeFont: 'inherit',
    h1Size: '2em',
    h1Border: '2px solid',
    h2Size: '1.5em',
    h2Border: '1px solid',
    codeRadius: '3px',
    preRadius: '6px',
    blockquoteStyle: 'solid',
  },
  github: {
    bodyColor: '#1f2328',
    headingColor: '#1f2328',
    linkColor: '#0969da',
    codeBg: '#f6f8fa',
    tableHeaderBg: '#ddf4ff',
    tableBorder: '#d0d7de',
    blockquoteBorder: '#2f81f7',
    blockquoteColor: '#656d76',
    borderColor: '#d0d7de',
    hBorderColor: '#d0d7de',
    headingFont: 'inherit',
    bodyFont: 'inherit',
    codeFont: 'inherit',
    h1Size: '2em',
    h1Border: '1px solid',
    h2Size: '1.5em',
    h2Border: '1px solid',
    codeRadius: '6px',
    preRadius: '6px',
    blockquoteStyle: 'solid',
  },
  academic: {
    bodyColor: '#333333',
    headingColor: '#1a1a1a',
    linkColor: '#0056a7',
    codeBg: '#f5f5f0',
    tableHeaderBg: '#e8e4d8',
    tableBorder: '#ccc5b3',
    blockquoteBorder: '#ccc5b3',
    blockquoteColor: '#666666',
    borderColor: '#ddd6c4',
    hBorderColor: '#ddd6c4',
    headingFont: 'Georgia, "Times New Roman", serif',
    bodyFont: 'Georgia, "Times New Roman", serif',
    codeFont: '"Courier New", Courier, monospace',
    h1Size: '1.75em',
    h1Border: 'none',
    h2Size: '1.35em',
    h2Border: 'none',
    codeRadius: '2px',
    preRadius: '2px',
    blockquoteStyle: 'dotted',
  },
  minimal: {
    bodyColor: '#1a1a1a',
    headingColor: '#000000',
    linkColor: '#1a1a1a',
    codeBg: '#f9f9f9',
    tableHeaderBg: '#eeeeee',
    tableBorder: '#cccccc',
    blockquoteBorder: '#cccccc',
    blockquoteColor: '#666666',
    borderColor: '#cccccc',
    hBorderColor: '#cccccc',
    headingFont: 'inherit',
    bodyFont: 'inherit',
    codeFont: '"Consolas", "Courier New", monospace',
    h1Size: '1.75em',
    h1Border: 'none',
    h2Size: '1.3em',
    h2Border: 'none',
    codeRadius: '0',
    preRadius: '0',
    blockquoteStyle: 'none',
  },
}

const theme = ref('default')

export function useTheme() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('dark')
    applyTheme(theme.value)
  }

  function applyTheme(name: string) {
    theme.value = name
    const t = THEMES[name] || THEMES.default
    if (typeof document !== 'undefined') {
      const r = document.documentElement.style
      r.setProperty('--theme-body-color', t.bodyColor)
      r.setProperty('--theme-heading-color', t.headingColor)
      r.setProperty('--theme-link-color', t.linkColor)
      r.setProperty('--theme-code-bg', t.codeBg)
      r.setProperty('--theme-table-header-bg', t.tableHeaderBg)
      r.setProperty('--theme-table-border', t.tableBorder)
      r.setProperty('--theme-blockquote-border', t.blockquoteBorder)
      r.setProperty('--theme-blockquote-color', t.blockquoteColor)
      r.setProperty('--theme-border-color', t.borderColor)
      r.setProperty('--theme-heading-font', t.headingFont)
      r.setProperty('--theme-body-font', t.bodyFont)
      r.setProperty('--theme-code-theme-font', t.codeFont)
      r.setProperty('--theme-h1-size', t.h1Size)
      r.setProperty('--theme-h1-border', t.h1Border)
      r.setProperty('--theme-h2-size', t.h2Size)
      r.setProperty('--theme-h2-border', t.h2Border)
      r.setProperty('--theme-code-radius', t.codeRadius)
      r.setProperty('--theme-pre-radius', t.preRadius)
      r.setProperty('--theme-blockquote-style', t.blockquoteStyle)
      r.setProperty('--theme-h-border-color', t.hBorderColor)
    }
  }

  return { theme, applyTheme, THEMES }
}
