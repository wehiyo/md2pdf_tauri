<template>
  <div class="files-panel">
    <div v-if="workState === 'file'" class="opened-files-view">
      <div class="opened-files-header"><span class="header-title">打开的文件</span></div>
      <div class="opened-files-list">
        <div v-for="(file, index) in openedFiles" :key="index" class="opened-file-item"
          :class="{ active: index === currentFileIndex, unsaved: file.content !== file.savedContent }"
          :title="file.path ?? '未保存'" @click="$emit('switch-file', index)"
          @contextmenu.prevent="showMenu($event, file.path, file.name)">
          <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="file-name">{{ file.name }}</span>
          <span v-if="file.content !== file.savedContent" class="unsaved-mark">*</span>
          <button class="close-btn" title="关闭" @click.stop="$emit('close-file', index)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div v-if="openedFiles.length === 0" class="empty-message">暂无打开的文件</div>
      </div>
    </div>
    <div v-else class="folder-view">
      <div class="folder-header">
        <span class="folder-name">{{ folderName }}</span>
        <button class="folder-close-btn" title="关闭" @click="$emit('close-folder')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="folder-tree">
        <slot name="file-tree" />
        <div v-if="!$slots['file-tree']" class="empty-message">无 Markdown 文件</div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="ctx.menuVisible.value" class="file-context-menu" :style="ctx.menuStyle.value" @click.stop>
      <div class="menu-item" @click="ctx.openInExplorer">在资源管理器打开</div>
      <div class="menu-item" @click="ctx.copyFileName">复制文件名</div>
      <div class="menu-item" @click="ctx.copyFilePath">复制文件路径</div>
      <div class="menu-separator"></div>
      <div class="menu-item" @click="ctx.startRename">重命名</div>
      <div class="menu-item" @click="ctx.saveAs">另存为</div>
      <div class="menu-separator"></div>
      <div class="menu-item menu-danger" @click="ctx.confirmDelete">删除</div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="ctx.renaming.value" class="rename-overlay" @click="ctx.cancelRename">
      <div class="rename-dialog" @click.stop>
        <div class="rename-title">重命名</div>
        <input :value="ctx.newName.value" @input="ctx.newName.value = ($event.target as HTMLInputElement).value" class="rename-input" @keyup.enter="ctx.doRename" @keyup.escape="ctx.cancelRename" ref="ctx.renameInput" />
        <div class="rename-btns">
          <button class="rename-btn cancel" @click="ctx.cancelRename">取消</button>
          <button class="rename-btn confirm" @click="ctx.doRename">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useFileContextMenu } from '../composables/useFileContextMenu'

interface OpenedFile { path: string | null; content: string; savedContent: string; dir: string | null; name: string }

const props = defineProps<{
  workState: string
  openedFiles: OpenedFile[]
  currentFileIndex: number
  folderPath: string
  siteName?: string
}>()

const emit = defineEmits<{
  'switch-file': [index: number]
  'close-file': [index: number]
  'close-folder': []
  'rename-file': [oldPath: string, newName: string]
  'delete-file': [path: string]
  'save-as-file': [path: string]
}>()

// ── 右键菜单 ──────────────────────────────────────────

const ctx = useFileContextMenu(
  (old, name) => emit('rename-file', old, name),
  (path) => emit('delete-file', path),
  (path) => emit('save-as-file', path),
)

function showMenu(e: MouseEvent, path: string | null, name: string) {
  ctx.showMenu(e, path, name)
}

const folderName = computed(() => {
  if (props.workState === 'mkdocs') return props.siteName || 'MkDocs'
  if (!props.folderPath) return '文件列表'
  const lastSep = Math.max(props.folderPath.lastIndexOf('/'), props.folderPath.lastIndexOf('\\'))
  return lastSep >= 0 ? props.folderPath.substring(lastSep + 1) : props.folderPath
})
</script>

<style scoped>
.files-panel { display: flex; flex-direction: column; height: 100%; }
.opened-files-view { display: flex; flex-direction: column; height: 100%; }
.opened-files-header { padding: 8px 12px; background-color: #e2e8f0; border-bottom: 1px solid #cbd5e1; }
.header-title { font-size: 12px; font-weight: 600; color: #374151; }
.opened-files-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.opened-file-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; transition: background-color 0.2s; }
.opened-file-item:hover { background-color: #f1f5f9; }
.opened-file-item.active { background-color: #dbeafe; }
.file-icon { width: 16px; height: 16px; color: #6b7280; flex-shrink: 0; }
.file-name { flex: 1; font-size: 12px; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.opened-file-item.active .file-name { color: #2563eb; font-weight: 500; }
.opened-file-item.unsaved .file-name { font-weight: 500; }
.unsaved-mark { font-size: 14px; color: #f59e0b; font-weight: bold; margin-left: 2px; }
.close-btn { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: none; border-radius: 4px; background: transparent; color: #9ca3af; cursor: pointer; opacity: 0; transition: all 0.2s; }
.opened-file-item:hover .close-btn { opacity: 1; }
.close-btn:hover { background-color: #fee2e2; color: #dc2626; }
.close-btn svg { width: 12px; height: 12px; }
.folder-view { display: flex; flex-direction: column; height: 100%; }
.folder-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background-color: #e2e8f0; border-bottom: 1px solid #cbd5e1; }
.folder-name { font-size: 12px; font-weight: 600; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-close-btn { flex-shrink: 0; width: 20px; height: 20px; padding: 0; border: none; border-radius: 4px; background: transparent; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.folder-close-btn:hover { background: #cbd5e1; color: #334155; }
.folder-close-btn svg { width: 14px; height: 14px; }
.folder-tree { flex: 1; overflow-y: auto; padding: 4px 0; }
.empty-message { padding: 16px 12px; text-align: center; color: #9ca3af; font-size: 12px; }

.file-context-menu { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.12); min-width: 160px; padding: 4px 0; }
.menu-item { padding: 6px 14px; font-size: 12px; color: #374151; cursor: pointer; transition: background .1s; }
.menu-item:hover { background: #f1f5f9; }
.menu-separator { height: 1px; background: #e2e8f0; margin: 4px 0; }
.menu-danger { color: #dc2626; }
.menu-danger:hover { background: #fee2e2; }

.rename-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center; z-index: 10001; }
.rename-dialog { background: #fff; border-radius: 8px; padding: 20px 24px; min-width: 320px; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
.rename-title { font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
.rename-input { width: 100%; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 13px; outline: none; box-sizing: border-box; }
.rename-input:focus { border-color: #3b82f6; }
.rename-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.rename-btn { padding: 5px 16px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; cursor: pointer; background: #fff; color: #374151; }
.rename-btn.confirm { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.rename-btn.confirm:hover { background: #2563eb; }
</style>
