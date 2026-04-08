<template>
  <div class="preview-toolbar">
    <div class="toolbar-left">
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
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
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
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
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
}>()

defineProps<{
  previewOnlyMode?: boolean
  showToc?: boolean
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

.dark .preview-toolbar {
  background-color: #1e293b;
  border-bottom-color: #334155;
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

.dark .toolbar-btn {
  color: #e2e8f0;
}

.dark .toolbar-btn:hover {
  background-color: #333;
}

.toolbar-btn.active {
  background-color: #dbeafe;
  color: #2563eb;
}

.dark .toolbar-btn.active {
  background-color: #1e3a5f;
  color: #60a5fa;
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

.dark .dropdown-menu {
  background-color: #1e293b;
  border-color: #334155;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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

.dark .dropdown-item {
  color: #e2e8f0;
}

.dark .dropdown-item:hover {
  background-color: #334155;
}
</style>