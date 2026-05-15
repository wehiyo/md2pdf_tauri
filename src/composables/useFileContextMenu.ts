import { ref, nextTick, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { confirm } from '@tauri-apps/plugin-dialog'

// 模块级单例：确保同一时间只有一个菜单可见
let activeHideMenu: (() => void) | null = null

export function useFileContextMenu(
  emitRename: (oldPath: string, newName: string) => void,
  emitDelete: (path: string) => void,
  emitSaveAs: (path: string) => void,
  options?: { showRenameDelete?: boolean }
) {
  const menuVisible = ref(false)
  const menuStyle = ref<Record<string, string>>({})
  const menuPath = ref('')
  const menuName = ref('')
  const renaming = ref(false)
  const newName = ref('')
  const renameInput = ref<HTMLInputElement>()

  function showMenu(e: MouseEvent, path: string | null, name: string) {
    if (!path) return
    // 关闭之前打开的菜单（单例模式，避免重叠）
    if (activeHideMenu) activeHideMenu()
    menuPath.value = path
    menuName.value = name
    menuVisible.value = true
    menuStyle.value = { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', zIndex: '10000' }
    nextTick(() => {
      activeHideMenu = hideMenu
      document.addEventListener('click', hideMenu)
    })
  }

  function hideMenu() {
    menuVisible.value = false
    document.removeEventListener('click', hideMenu)
    if (activeHideMenu === hideMenu) activeHideMenu = null
  }

  async function openInExplorer() {
    hideMenu()
    try { await invoke('open_in_explorer', { path: menuPath.value.replace(/\//g, '\\') }) } catch { /* ignore */ }
  }

  function getFullFileName() {
    const p = menuPath.value.replace(/\\/g, '/')
    return p.split('/').pop() || menuName.value
  }

  function copyFileName() {
    hideMenu()
    navigator.clipboard.writeText(getFullFileName()).catch(() => {})
  }

  function copyFilePath() {
    hideMenu()
    navigator.clipboard.writeText(menuPath.value.replace(/\//g, '\\')).catch(() => {})
  }

  function startRename() {
    hideMenu()
    const full = getFullFileName()
    const dotIdx = full.lastIndexOf('.')
    newName.value = dotIdx > 0 ? full.substring(0, dotIdx) : full
    renaming.value = true
    nextTick(() => renameInput.value?.focus())
  }

  function cancelRename() { renaming.value = false }

  function doRename() {
    const name = newName.value.trim()
    if (!name || !menuPath.value) { renaming.value = false; return }
    const full = getFullFileName()
    const dotIdx = full.lastIndexOf('.')
    const ext = dotIdx > 0 ? full.substring(dotIdx) : ''
    emitRename(menuPath.value, name + ext)
    renaming.value = false
  }

  function saveAs() {
    hideMenu()
    if (menuPath.value) emitSaveAs(menuPath.value)
  }

  async function confirmDelete() {
    hideMenu()
    if (!menuPath.value) return
    const confirmed = await confirm(`确定要删除文件「${getFullFileName()}」吗？`, {
      title: '删除确认',
      kind: 'warning',
      okLabel: '删除',
      cancelLabel: '取消',
    })
    if (confirmed) emitDelete(menuPath.value)
  }

  onUnmounted(() => document.removeEventListener('click', hideMenu))

  const showRenameDelete = options?.showRenameDelete ?? true

  return {
    menuVisible, menuStyle, renaming, newName, renameInput, showRenameDelete,
    showMenu, hideMenu,
    openInExplorer, copyFileName, copyFilePath,
    startRename, cancelRename, doRename,
    saveAs, confirmDelete,
  }
}
