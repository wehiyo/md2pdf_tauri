<template>
  <div class="welcome-page">
    <div class="welcome-header">
      <h1>MarkRefine</h1>
      <p>Markdown 编辑器 — 编辑、预览、导出 PDF 和 HTML</p>
    </div>
    <div class="welcome-columns">
      <div class="welcome-column">
        <h3>启动</h3>
        <div class="welcome-actions">
          <button class="welcome-btn" @click="emit('new-file')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            <span>新建 MD 文件</span>
          </button>
          <button class="welcome-btn" @click="emit('open-file')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z"/></svg>
            <span>打开文件</span>
          </button>
          <button class="welcome-btn" @click="emit('import-folder')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>导入文件夹</span>
          </button>
          <button class="welcome-btn" @click="emit('import-mkdocs')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12l2 2 4-4"/></svg>
            <span>导入 MkDocs</span>
          </button>
        </div>
      </div>
      <div class="welcome-column">
        <h3>最近</h3>
        <div v-if="recentItems.length === 0" class="welcome-empty">
          暂无最近记录
        </div>
        <div v-else class="recent-list">
          <div
            v-for="item in recentItems"
            :key="item.path"
            class="recent-item"
            @click="openRecent(item)"
          >
            <div class="recent-icon">
              <svg v-if="item.type === 'file'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div class="recent-info">
              <div class="recent-name">{{ item.name }}</div>
              <div class="recent-path">{{ item.path }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface RecentItem {
  type: 'file' | 'folder' | 'mkdocs'
  name: string
  path: string
  timestamp: number
}

const emit = defineEmits<{
  'new-file': []
  'open-file': []
  'import-folder': []
  'import-mkdocs': []
  'open-recent-file': [path: string]
  'open-recent-folder': [path: string]
  'open-recent-mkdocs': [path: string]
}>()

const RECENT_KEY = 'markrefine-recent-items'

const recentItems = ref<RecentItem[]>([])

onMounted(() => {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (raw) recentItems.value = JSON.parse(raw)
  } catch { /* ignore */ }
})

function openRecent(item: RecentItem) {
  if (item.type === 'file') {
    emit('open-recent-file', item.path)
  } else if (item.type === 'folder') {
    emit('open-recent-folder', item.path)
  } else {
    emit('open-recent-mkdocs', item.path)
  }
}
</script>

<style scoped>
.welcome-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: #f8fafc;
  overflow: auto;
}
.welcome-header {
  text-align: center;
  margin-bottom: 40px;
}
.welcome-header h1 {
  font-size: 28px;
  font-weight: 300;
  color: #1e293b;
  margin: 0 0 8px;
}
.welcome-header p {
  font-size: 14px;
  color: #94a3b8;
  margin: 0;
}
.welcome-columns {
  display: flex;
  gap: 48px;
  max-width: 720px;
  width: 100%;
}
.welcome-column {
  flex: 1;
  min-width: 0;
}
.welcome-column h3 {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px;
}
.welcome-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.welcome-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}
.welcome-btn:hover {
  background: #e2e8f0;
}
.welcome-btn svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: #64748b;
}
.welcome-empty {
  font-size: 13px;
  color: #94a3b8;
  padding: 12px 0;
}
.recent-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.recent-item:hover {
  background: #e2e8f0;
}
.recent-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: #64748b;
}
.recent-icon svg {
  width: 18px;
  height: 18px;
}
.recent-info {
  min-width: 0;
}
.recent-name {
  font-size: 13px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-path {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
</style>
