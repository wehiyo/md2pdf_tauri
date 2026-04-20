<template>
  <div class="preview-toolbar">
    <div class="toolbar-left">
      <!-- 导航按钮 -->
      <button
        class="toolbar-btn nav-btn"
        :class="{ disabled: !canNavigateBack }"
        :disabled="!canNavigateBack"
        title="返回"
        @click="$emit('navigate-back')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <button
        class="toolbar-btn nav-btn"
        :class="{ disabled: !canNavigateForward }"
        :disabled="!canNavigateForward"
        title="前进"
        @click="$emit('navigate-forward')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
      <div class="nav-separator"></div>
      <button class="toolbar-btn" :class="{ active: previewOnlyMode }" title="仅预览" @click="$emit('preview-only')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>仅预览</span>
      </button>
      <button class="toolbar-btn" :class="{ active: showToc }" title="目录" @click="$emit('toggle-toc')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="15" y2="12"/>
          <line x1="3" y1="18" x2="18" y2="18"/>
        </svg>
        <span>目录</span>
      </button>
      <div class="dropdown">
        <button class="toolbar-btn dropdown-trigger" @click="toggleImportDropdown">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>导入</span>
          <svg class="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div v-show="importDropdownOpen" class="dropdown-menu">
          <button class="dropdown-item" @click="importFolder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 0-2 2H4a2 2 0 0 0-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span>导入文件夹</span>
          </button>
          <button class="dropdown-item" @click="importMkdocs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span>导入 Mkdocs</span>
          </button>
        </div>
      </div>
      <div class="dropdown">
        <button class="toolbar-btn dropdown-trigger" @click="toggleDropdown">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>导出</span>
          <svg class="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div v-show="dropdownOpen" class="dropdown-menu">
          <button class="dropdown-item" @click="exportHtml">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <span>导出 HTML</span>
          </button>
          <button class="dropdown-item" @click="exportPdf">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <path d="M9 13h6v4h-6z"/>
              <path d="M12 13v4"/>
            </svg>
            <span>导出 PDF</span>
          </button>
        </div>
      </div>
    </div>
    <div class="toolbar-right">
      <button class="toolbar-btn" title="设置" @click="$emit('open-settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const emit = defineEmits<{
  'preview-only': []
  'toggle-toc': []
  'import-folder': []
  'import-mkdocs': []
  'export-html': []
  'export-pdf': []
  'navigate-back': []
  'navigate-forward': []
  'open-settings': []
}>()

defineProps<{
  previewOnlyMode?: boolean
  showToc?: boolean
  canNavigateBack?: boolean
  canNavigateForward?: boolean
}>()

const dropdownOpen = ref(false)
const importDropdownOpen = ref(false)

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
  importDropdownOpen.value = false  // 关闭另一个下拉菜单
}

function toggleImportDropdown() {
  importDropdownOpen.value = !importDropdownOpen.value
  dropdownOpen.value = false  // 关闭另一个下拉菜单
}

function importFolder() {
  importDropdownOpen.value = false
  emit('import-folder')
}

function importMkdocs() {
  importDropdownOpen.value = false
  emit('import-mkdocs')
}

function exportHtml() {
  dropdownOpen.value = false
  emit('export-html')
}

function exportPdf() {
  dropdownOpen.value = false
  emit('export-pdf')
}

// 点击外部关闭下拉菜单
function handleClickOutside(event: MouseEvent) {
  const dropdowns = document.querySelectorAll('.dropdown')
  let clickedInside = false
  dropdowns.forEach(dropdown => {
    if (dropdown.contains(event.target as Node)) {
      clickedInside = true
    }
  })
  if (!clickedInside) {
    dropdownOpen.value = false
    importDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 36px;
  padding: 0 4px;
  background-color: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 0;
  background-color: transparent;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  height: 28px;
}

.toolbar-btn:hover {
  background-color: #e8e8e8;
}

.toolbar-btn svg {
  width: 16px;
  height: 16px;
}

.toolbar-btn span {
  font-weight: 400;
}

/* 导航按钮样式 */
.toolbar-btn.nav-btn {
  padding: 4px 6px;
}

.toolbar-btn.nav-btn.disabled,
.toolbar-btn.nav-btn:disabled {
  color: #9ca3af;
  cursor: not-allowed;
  background-color: transparent;
}

.nav-separator {
  width: 1px;
  height: 20px;
  background-color: #e2e8f0;
  margin: 0 4px;
}

.toolbar-btn.active {
  background-color: #dbeafe;
  color: #2563eb;
}

/* 下拉菜单样式 */
.dropdown {
  position: relative;
}

.dropdown-arrow {
  width: 12px;
  height: 12px;
  transition: transform 0.2s;
}

.dropdown-open .dropdown-arrow {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 140px;
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
  padding: 4px 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  width: 100%;
  border: none;
  background-color: transparent;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 12px;
  text-align: left;
}

.dropdown-item:hover {
  background-color: #f3f4f6;
}

.dropdown-item svg {
  width: 16px;
  height: 16px;
}
</style>