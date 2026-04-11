<template>
  <div class="bookmark-item">
    <!-- 父节点（章节标题） -->
    <div
      class="chapter-item"
      :style="{ paddingLeft: level * 12 + 12 + 'px' }"
      @click="toggleExpand"
    >
      <svg
        v-if="hasChildren"
        class="expand-arrow"
        :class="{ expanded: isExpanded }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <span v-else class="no-arrow"></span>
      <svg class="chapter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
      <span class="item-title">{{ chapter.title }}</span>
    </div>

    <!-- 子节点（md 内标题） -->
    <div v-if="isExpanded && chapter.children && chapter.children.length > 0" class="children">
      <BookmarkTreeItem
        v-for="(child, index) in chapter.children"
        :key="index"
        :chapter="child"
        :level="level + 1"
        @click="$emit('click', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { BookmarkTreeNode } from '../composables/useMkdocsExport'

const props = defineProps<{
  chapter: BookmarkTreeNode
  level: number
}>()

const emit = defineEmits<{
  'click': [id: string]
}>()

// 默认展开
const isExpanded = ref(true)

const hasChildren = computed(() => {
  return props.chapter.children && props.chapter.children.length > 0
})

function toggleExpand() {
  if (hasChildren.value) {
    isExpanded.value = !isExpanded.value
  }
  // 点击时也触发跳转（如果有 ID）
  if (props.chapter.id) {
    emit('click', props.chapter.id)
  }
}
</script>

<style scoped>
.bookmark-item {
  user-select: none;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 12px;
  color: #374151;
}

.chapter-item:hover {
  background-color: #e2e8f0;
}

.dark .chapter-item {
  color: #e2e8f0;
}

.dark .chapter-item:hover {
  background-color: #334155;
}

.expand-arrow {
  width: 12px;
  height: 12px;
  transition: transform 0.2s;
  flex-shrink: 0;
  color: #6b7280;
}

.expand-arrow.expanded {
  transform: rotate(90deg);
}

.dark .expand-arrow {
  color: #9ca3af;
}

.no-arrow {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.chapter-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #3b82f6;
}

.dark .chapter-icon {
  color: #60a5fa;
}

.item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.children {
  /* 子节点样式 */
}

/* 子节点（标题）样式调整 */
.children .chapter-item {
  font-weight: 400;
  padding-left: calc(var(--level, 0) * 12px + 24px);
}

.children .chapter-icon {
  color: #6b7280;
}

.dark .children .chapter-icon {
  color: #9ca3af;
}
</style>