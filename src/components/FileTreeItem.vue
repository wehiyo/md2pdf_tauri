<template>
  <div class="tree-item">
    <!-- 文件夹节点 -->
    <div
      v-if="item.isFolder"
      class="folder-item"
      :style="{ paddingLeft: level * 12 + 12 + 'px' }"
      @click="toggleFolder"
    >
      <svg class="folder-arrow" :class="{ expanded: isExpanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <!-- 关闭的文件夹图标 -->
      <svg v-if="!isExpanded" class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 0-2 2H4a2 2 0 0 0-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <!-- 打开的文件夹图标 -->
      <svg v-else class="folder-icon folder-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 3h4a2 2 0 0 1 2 2v1"/>
        <path d="M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9l-2 3H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2z"/>
      </svg>
      <span class="item-name">{{ item.name }}</span>
    </div>

    <!-- 文件节点 -->
    <div
      v-else
      class="file-item"
      :class="{ active: item.path === currentFile }"
      :style="{ paddingLeft: level * 12 + 12 + 'px' }"
      @click="selectFile"
      @contextmenu.prevent="showContextMenu($event)"
      :title="item.path"
    >
      <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <span class="item-name">{{ item.name }}</span>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="ctx.menuVisible.value" class="file-context-menu" :style="ctx.menuStyle.value" @click.stop>
        <div class="menu-item" @click="ctx.openInExplorer">在资源管理器打开</div>
        <div class="menu-item" @click="ctx.copyFileName">复制文件名</div>
        <div class="menu-item" @click="ctx.copyFilePath">复制文件路径</div>
        <template v-if="ctx.showRenameDelete">
          <div class="menu-separator"></div>
          <div class="menu-item" @click="ctx.startRename">重命名</div>
        </template>
        <div class="menu-item" @click="ctx.saveAs">另存为</div>
        <template v-if="ctx.showRenameDelete">
          <div class="menu-separator"></div>
          <div class="menu-item menu-danger" @click="ctx.confirmDelete">删除</div>
        </template>
      </div>
    </Teleport>

    <!-- 重命名输入框 -->
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

    <!-- 子节点 -->
    <div v-if="item.isFolder && isExpanded && item.children" class="children">
      <FileTreeItem
        v-for="(child, index) in item.children"
        :key="index"
        :item="child"
        :current-file="currentFile"
        :level="level + 1"
        :is-readonly="isReadonly"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useFileContextMenu } from '../composables/useFileContextMenu'

interface MdFile {
  name: string
  path?: string
  children?: MdFile[]
  isFolder?: boolean
}

const props = defineProps<{
  item: MdFile
  currentFile: string | null
  level: number
  isReadonly?: boolean
}>()

const emit = defineEmits<{
  'select': [path: string]
  'rename-file': [oldPath: string, newName: string]
  'delete-file': [path: string]
  'save-as': [path: string]
}>()

// 文件夹默认关闭，若当前激活文件在此文件夹下则自动展开
const isExpanded = ref(
  props.item.isFolder && props.currentFile
    ? isInFolder(props.item, props.currentFile)
    : false
)

function isInFolder(folder: { path?: string; children?: any[] }, filePath: string): boolean {
  if (!folder.children) return false
  for (const child of folder.children) {
    if (child.path === filePath) return true
    if (child.isFolder && isInFolder(child, filePath)) return true
  }
  return false
}

// 当 currentFile 变化时（如恢复工作区），自动展开包含该文件的文件夹
watch(() => props.currentFile, (newFile) => {
  if (props.item.isFolder && newFile && isInFolder(props.item, newFile)) {
    isExpanded.value = true
  }
})

function toggleFolder() {
  isExpanded.value = !isExpanded.value
}

function selectFile() {
  if (props.item.path) {
    emit('select', props.item.path)
  }
}

// ── 右键菜单 ──────────────────────────────────────────

const ctx = useFileContextMenu(
  (old, name) => emit('rename-file', old, name),
  (path) => emit('delete-file', path),
  (path) => emit('save-as', path),
  { showRenameDelete: !props.isReadonly }
)

function showContextMenu(e: MouseEvent) {
  ctx.showMenu(e, props.item.path || null, props.item.name || '')
}
</script>

<style scoped>
.tree-item {
  user-select: none;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}

.folder-item:hover {
  background-color: #e2e8f0;
}

.folder-arrow {
  width: 12px;
  height: 12px;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.folder-arrow.expanded {
  transform: rotate(90deg);
}

.folder-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #f59e0b;
}

.folder-icon.folder-open {
  color: #fbbf24;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 12px;
  color: #374151;
}

.file-item:hover {
  background-color: #e2e8f0;
}

.file-item.active {
  background-color: #dbeafe;
  color: #2563eb;
}

.file-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #6b7280;
}

.file-item.active .file-icon {
  color: #2563eb;
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.children {
  /* 子节点无需额外样式 */
}

/* 右键菜单 */
.file-context-menu {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,.12);
  min-width: 160px;
  padding: 4px 0;
}

.menu-item {
  padding: 6px 14px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  transition: background .1s;
}
.menu-item:hover { background: #f1f5f9; }
.menu-separator { height: 1px; background: #e2e8f0; margin: 4px 0; }
.menu-danger { color: #dc2626; }
.menu-danger:hover { background: #fee2e2; }

/* 重命名弹窗 */
.rename-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.3);
  display: flex; align-items: center; justify-content: center; z-index: 10001;
}
.rename-dialog {
  background: #fff; border-radius: 8px; padding: 20px 24px;
  min-width: 320px; box-shadow: 0 8px 24px rgba(0,0,0,.15);
}
.rename-title { font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
.rename-input {
  width: 100%; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 4px;
  font-size: 13px; outline: none; box-sizing: border-box;
}
.rename-input:focus { border-color: #3b82f6; }
.rename-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.rename-btn {
  padding: 5px 16px; border: 1px solid #e2e8f0; border-radius: 4px;
  font-size: 12px; cursor: pointer; background: #fff; color: #374151;
}
.rename-btn.confirm { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.rename-btn.confirm:hover { background: #2563eb; }
</style>