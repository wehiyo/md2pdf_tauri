<template>
  <div class="bookmarks-panel">
    <div class="bookmarks-header">
      <span>书签</span>
      <button class="add-bookmark-btn" title="添加当前位置书签" @click="$emit('add-bookmark')">+</button>
    </div>
    <div class="bookmarks-list">
      <div v-for="item in bookmarks" :key="item.id" class="bookmark-item"
        :title="item.filePath + (item.anchorId ? '#' + item.anchorId : '')"
        @click="$emit('jump-bookmark', item)"
        @contextmenu.prevent="showMenu($event, item)">
        <svg class="bm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        <div class="bm-info">
          <div class="bm-name">{{ item.name }}</div>
          <div class="bm-path">{{ shortPath(item.filePath) }} · {{ Math.round((item.scrollRatio || 0) * 100) }}%</div>
        </div>
        <button class="bm-remove" title="删除书签" @click.stop="doDeleteItem(item)">×</button>
      </div>
      <div v-if="bookmarks.length === 0" class="empty-message">暂无书签</div>
    </div>

    <Teleport to="body">
      <div v-if="menuVisible" class="bm-context-menu" :style="menuStyle" @click.stop>
        <div class="menu-item" @click="startRename">重命名</div>
        <div class="menu-item menu-danger" @click="doDelete">删除</div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="renaming" class="rename-overlay" @click="cancelRename">
        <div class="rename-dialog" @click.stop>
          <div class="rename-title">重命名书签</div>
          <input v-model="newName" class="rename-input" @keyup.enter="doRename" @keyup.escape="cancelRename" />
          <div class="rename-btns">
            <button class="rename-btn cancel" @click="cancelRename">取消</button>
            <button class="rename-btn confirm" @click="doRename">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, inject } from 'vue'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

interface Bookmark {
  id: string; name: string; filePath: string; anchorId: string; headingText: string; timestamp: number; scrollRatio?: number
}

const props = defineProps<{ projectPath: string }>()
defineEmits<{ 'jump-bookmark': [item: Bookmark]; 'add-bookmark': [] }>()

const bookmarks = ref<Bookmark[]>([])
const menuVisible = ref(false)
const menuStyle = ref<Record<string, string>>({})
const menuItem = ref<Bookmark | null>(null)
const renaming = ref(false)
const newName = ref('')

const configPath = () => props.projectPath.replace(/\\/g, '/') + '/.markrefine.json'

async function load() {
  try {
    const raw = await readTextFile(configPath())
    const config = JSON.parse(raw)
    bookmarks.value = config.bookmarks || []
  } catch { bookmarks.value = [] }
}
async function save() {
  try {
    let config: any = {}
    try { const raw = await readTextFile(configPath()); config = JSON.parse(raw) } catch {}
    config.bookmarks = bookmarks.value
    await writeTextFile(configPath(), JSON.stringify(config, null, 2))
  } catch {}
}

onMounted(load)
watch(() => props.projectPath, load)

const bmRefresh = inject('bookmarksRefresh', ref(0))!
watch(bmRefresh, () => load())

function shortPath(p: string) {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.slice(-3).join('/')
}

function showMenu(e: MouseEvent, item: Bookmark) {
  menuItem.value = item; menuVisible.value = true
  menuStyle.value = { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', zIndex: '10000' }
  nextTick(() => document.addEventListener('click', hideMenu))
}
function hideMenu() { menuVisible.value = false; document.removeEventListener('click', hideMenu) }
function startRename() {
  hideMenu(); newName.value = menuItem.value?.name || ''
  renaming.value = true; nextTick(() => (document.querySelector('.rename-input') as HTMLInputElement)?.focus())
}
function cancelRename() { renaming.value = false }
async function doRename() {
  const n = newName.value.trim(); if (!n || !menuItem.value) { renaming.value = false; return }
  const item = bookmarks.value.find(b => b.id === menuItem.value!.id)
  if (item) { item.name = n; await save() }
  renaming.value = false
}
async function doDeleteItem(item: Bookmark) {
  bookmarks.value = bookmarks.value.filter(b => b.id !== item.id)
  await save()
}
async function doDelete() {
  hideMenu()
  if (menuItem.value) doDeleteItem(menuItem.value)
}

defineExpose({ load, save, hasBookmark })

// 检查是否已有同位置书签（供 App.vue 调用）
function hasBookmark(filePath: string, anchorId: string): boolean {
  return bookmarks.value.some(b => b.filePath === filePath && b.anchorId === anchorId)
}

onUnmounted(() => document.removeEventListener('click', hideMenu))
</script>

<style scoped>
.bookmarks-panel { display: flex; flex-direction: column; height: 100%; }
.bookmarks-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #e2e8f0; border-bottom: 1px solid #cbd5e1; }
.bookmarks-header span { font-size: 12px; font-weight: 600; color: #374151; }
.add-bookmark-btn { width: 22px; height: 22px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; color: #374151; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; }
.add-bookmark-btn:hover { background: #e2e8f0; }
.bookmarks-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.bookmark-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; transition: background .15s; }
.bookmark-item:hover { background: #f1f5f9; }
.bookmark-item:hover .bm-remove { opacity: 1; }
.bm-icon { width: 16px; height: 16px; color: #f59e0b; flex-shrink: 0; }
.bm-remove { flex-shrink: 0; margin-left: auto; width: 20px; height: 20px; border: none; border-radius: 4px; background: transparent; color: #9ca3af; cursor: pointer; font-size: 16px; line-height: 1; padding: 0; opacity: 0; transition: opacity .15s; }
.bm-remove:hover { color: #dc2626; background: #fee2e2; }
.bm-info { min-width: 0; }
.bm-name { font-size: 12px; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-pct { font-size: 10px; color: #94a3b8; font-weight: 400; margin-left: 4px; }
.bm-path { font-size: 10px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.empty-message { padding: 16px 12px; text-align: center; color: #9ca3af; font-size: 12px; }
.bm-context-menu { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.12); min-width: 120px; padding: 4px 0; }
.menu-item { padding: 6px 14px; font-size: 12px; color: #374151; cursor: pointer; }
.menu-item:hover { background: #f1f5f9; }
.menu-danger { color: #dc2626; }
.menu-danger:hover { background: #fee2e2; }
.rename-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center; z-index: 10001; }
.rename-dialog { background: #fff; border-radius: 8px; padding: 20px 24px; min-width: 300px; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
.rename-title { font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
.rename-input { width: 100%; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 13px; outline: none; box-sizing: border-box; }
.rename-input:focus { border-color: #3b82f6; }
.rename-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.rename-btn { padding: 5px 16px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; cursor: pointer; background: #fff; color: #374151; }
.rename-btn.confirm { background: #3b82f6; color: #fff; border-color: #3b82f6; }
</style>