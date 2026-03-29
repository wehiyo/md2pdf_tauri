<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <div class="logo">
        <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span class="logo-text">MD2PDF</span>
      </div>
    </div>

    <div class="toolbar-center">
      <button class="btn btn-secondary" @click="$emit('open-file')">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        <span>打开</span>
      </button>

      <button class="btn btn-secondary" @click="$emit('save-file')">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span>保存</span>
      </button>

      <div class="divider"></div>

      <button class="btn btn-primary" @click="$emit('export-html')">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>导出 HTML</span>
      </button>

      <button class="btn btn-primary" @click="$emit('export-pdf')">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span>导出 PDF</span>
      </button>
    </div>

    <div class="toolbar-right">
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  'export-html': []
  'export-pdf': []
  'open-file': []
  'save-file': []
}>()
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 1rem;
  background-color: #ffffff;
  border-bottom: 1px solid #e2e8f0;
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1.125rem;
  color: #1f2937;
}

.logo-icon {
  width: 24px;
  height: 24px;
  color: #3b82f6;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background-color: #2563eb;
}

.btn-secondary {
  background-color: #f1f5f9;
  color: #475569;
}

.btn-secondary:hover {
  background-color: #e2e8f0;
}

.btn svg {
  width: 16px;
  height: 16px;
}

.divider {
  width: 1px;
  height: 24px;
  background-color: #e2e8f0;
  margin: 0 0.5rem;
}
</style>
