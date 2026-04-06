// Vite raw imports
declare module '*?raw' {
  const content: string
  export default content
}

// Markdown-it plugins
declare module 'markdown-it-footnote' {
  import MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}


declare module 'markdown-it-sup' {
  import MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-sub' {
  import MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-abbr' {
  import MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-deflist' {
  import MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}


declare module 'markdown-it-emoji' {
  import MarkdownIt from 'markdown-it'
  export const bare: MarkdownIt.PluginSimple
  export const light: MarkdownIt.PluginSimple
  export const full: MarkdownIt.PluginSimple
}

declare module 'markdown-it-emoji/lib/data/full.mjs' {
  const data: Record<string, string>
  export default data
}