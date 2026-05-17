<template>
  <div class="annotations-panel">
    <div class="annotations-header">
      <span>标注</span>
    </div>
    <div class="annotations-list">
      <template v-for="group in groupedAnnotations" :key="group.filePath">
        <div class="anno-group-header">{{ shortPath(group.filePath) }}</div>
        <div v-for="item in group.items" :key="item.id" class="anno-item"
          :class="{ orphan: item._orphan }"
          :title="item.filePath + (item._orphan ? ' [孤立]' : '')"
          @click="jumpTo(item)"
          @contextmenu.prevent="showMenu($event, item)">
          <svg class="anno-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <template v-if="item.type === 'highlight'">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </template>
            <template v-else-if="item.type === 'underline'">
              <line x1="4" y1="19" x2="20" y2="19"/>
            </template>
            <template v-else-if="item.type === 'wavy'">
              <path d="M4 19c1.5-2 2.5-2 4 0s2.5 2 4 0 2.5-2 4 0 2.5 2 4 0"/>
            </template>
            <template v-else>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </template>
          </svg>
          <div class="anno-info">
            <div class="anno-text">{{ item.selectedText }}</div>
            <div v-if="item.type === 'comment' && item.comment" class="anno-comment">{{ item.comment }}</div>
            <div v-if="item._orphan" class="anno-orphan-tag">[孤立]</div>
          </div>
          <button class="anno-remove" title="删除标注" @click.stop="doDelete(item)">&times;</button>
        </div>
      </template>
      <div v-if="allAnnotations.length === 0" class="empty-message">暂无标注</div>
    </div>

    <Teleport to="body">
      <div v-if="menuVisible" class="anno-context-menu" :style="menuStyle" @click.stop>
        <div class="menu-item menu-danger" @click="doMenuDelete">删除标注</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, inject } from 'vue'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

interface Annotation {
  id: string
  type: 'highlight' | 'underline' | 'wavy' | 'comment'
  filePath: string
  selectedText: string
  contextBefore: string
  contextAfter: string
  headingId: string
  comment?: string
  timestamp: number
  _orphan?: boolean
}

const props = defineProps<{ projectPath: string }>()
const emit = defineEmits<{
  'jump-annotation': [item: Annotation]
  'delete-annotation': [id: string]
}>()

const allAnnotations = ref<Annotation[]>([])
const menuVisible = ref(false)
const menuStyle = ref<Record<string, string>>({})
const menuItem = ref<Annotation | null>(null)

const configPath = () => props.projectPath.replace(/\\/g, '/') + '/.markrefine.json'

const groupedAnnotations = computed(() => {
  const map = new Map<string, Annotation[]>()
  for (const a of allAnnotations.value) {
    const list = map.get(a.filePath) || []
    list.push(a)
    map.set(a.filePath, list)
  }
  return Array.from(map.entries()).map(([filePath, items]) => ({
    filePath,
    items: items.sort((a, b) => b.timestamp - a.timestamp),
  }))
})

async function load() {
  try {
    const raw = await readTextFile(configPath())
    const config = JSON.parse(raw)
    allAnnotations.value = (config.annotations || []) as Annotation[]
  } catch { allAnnotations.value = [] }
}

async function save() {
  try {
    let config: any = {}
    try { const raw = await readTextFile(configPath()); config = JSON.parse(raw) } catch {}
    config.annotations = allAnnotations.value
    await writeTextFile(configPath(), JSON.stringify(config, null, 2))
  } catch {}
}

onMounted(load)
watch(() => props.projectPath, load)

const annoRefresh = inject('annotationsRefresh', ref(0))!
watch(annoRefresh, () => load())

function shortPath(p: string) {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.slice(-3).join('/')
}

function jumpTo(item: Annotation) {
  emit('jump-annotation', item)
}

function showMenu(e: MouseEvent, item: Annotation) {
  menuItem.value = item
  menuVisible.value = true
  menuStyle.value = { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', zIndex: '10000' }
  nextTick(() => document.addEventListener('click', hideMenu))
}

function hideMenu() { menuVisible.value = false; document.removeEventListener('click', hideMenu) }

async function doDelete(item: Annotation) {
  allAnnotations.value = allAnnotations.value.filter(a => a.id !== item.id)
  await save()
  emit('delete-annotation', item.id)
}

function doMenuDelete() {
  hideMenu()
  if (menuItem.value) doDelete(menuItem.value)
}

onUnmounted(() => document.removeEventListener('click', hideMenu))
</script>

<style scoped>
.annotations-panel { display: flex; flex-direction: column; height: 100%; }
.annotations-header { display: flex; align-items: center; padding: 8px 12px; background: #e2e8f0; border-bottom: 1px solid #cbd5e1; }
.annotations-header span { font-size: 12px; font-weight: 600; color: #374151; }
.annotations-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.anno-group-header { padding: 6px 12px; font-size: 10px; color: #64748b; font-weight: 600; background: #f8fafc; border-bottom: 1px solid #f1f5f9; }
.anno-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 12px; cursor: pointer; transition: background .15s; }
.anno-item:hover { background: #f1f5f9; }
.anno-item.orphan { opacity: 0.5; }
.anno-item:hover .anno-remove { opacity: 1; }
.anno-type-icon { width: 14px; height: 14px; color: #f59e0b; flex-shrink: 0; margin-top: 1px; }
.anno-remove { flex-shrink: 0; margin-left: auto; width: 18px; height: 18px; border: none; border-radius: 4px; background: transparent; color: #9ca3af; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; opacity: 0; transition: opacity .15s; }
.anno-remove:hover { color: #dc2626; background: #fee2e2; }
.anno-info { min-width: 0; flex: 1; }
.anno-text { font-size: 12px; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.anno-comment { font-size: 10px; color: #6366f1; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.anno-orphan-tag { font-size: 10px; color: #dc2626; margin-top: 1px; }
.empty-message { padding: 16px 12px; text-align: center; color: #9ca3af; font-size: 12px; }

.anno-context-menu { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.12); min-width: 100px; padding: 4px 0; }
.menu-item { padding: 6px 14px; font-size: 12px; color: #374151; cursor: pointer; }
.menu-item:hover { background: #f1f5f9; }
.menu-danger { color: #dc2626; }
.menu-danger:hover { background: #fee2e2; }
</style>
