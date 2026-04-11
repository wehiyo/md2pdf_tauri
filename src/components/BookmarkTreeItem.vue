<template>
  <div class="bookmark-item">
    <!-- 父节点（章节标题） -->
    <div
      class="chapter-item"
      :style="{ paddingLeft: level * 16 + 12 + 'px' }"
      @click="handleClick"
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

function handleClick() {
  // 展开/折叠
  if (hasChildren.value) {
    isExpanded.value = !isExpanded.value
  }
  // 触发跳转（如果有 ID 且有 filePath 表示是可跳转的章节）
  if (props.chapter.id && props.chapter.filePath) {
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
  gap: 6px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 13px;
  color: #374151;
  border-radius: 4px;
  margin: 1px 4px;
}

.chapter-item:hover {
  background-color: #e5e7eb;
}

.dark .chapter-item {
  color: #e2e8f0;
}

.dark .chapter-item:hover {
  background-color: #334155;
}

.expand-arrow {
  width: 14px;
  height: 14px;
  transition: transform 0.2s;
  flex-shrink: 0;
  color: #9ca3af;
}

.expand-arrow.expanded {
  transform: rotate(90deg);
}

.dark .expand-arrow {
  color: #6b7280;
}

.no-arrow {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
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
}
</style>