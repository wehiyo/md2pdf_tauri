<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click.self="emit('close')">
      <div class="settings-dialog">
        <div class="settings-header">字体设置</div>
        <div class="settings-body">
          <div class="settings-item">
            <label>正文字体</label>
            <div class="font-select-row">
              <select v-model="localConfig.bodyFont">
                <optgroup label="内置字体">
                  <option value="SourceHanSans">思源黑体</option>
                  <option value="MicrosoftYaHei">微软雅黑</option>
                  <option value="DengXian">等线</option>
                </optgroup>
                <optgroup v-if="localConfig.bodyCustomFonts?.length > 0" label="自定义字体">
                  <option v-for="font in localConfig.bodyCustomFonts" :key="font.id" :value="font.id">
                    {{ font.name }}
                  </option>
                </optgroup>
              </select>
              <button class="add-font-btn" title="添加字体" @click="showFontPicker('body')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
            <div v-if="localConfig.bodyCustomFonts?.length > 0" class="custom-fonts-inline">
              <div v-for="font in localConfig.bodyCustomFonts" :key="font.id" class="custom-font-inline-item">
                <span class="font-name">{{ font.name }}</span>
                <button class="remove-inline-btn" title="移除" @click="removeCustomFont(font.id, 'body')">×</button>
              </div>
            </div>
          </div>
          <div class="settings-item">
            <label>代码字体</label>
            <div class="font-select-row">
              <select v-model="localConfig.codeFont">
                <optgroup label="内置字体">
                  <option value="SourceCodePro">Source Code Pro</option>
                  <option value="Consolas">Consolas</option>
                  <option value="CourierNew">Courier New</option>
                </optgroup>
                <optgroup v-if="localConfig.codeCustomFonts?.length > 0" label="自定义字体">
                  <option v-for="font in localConfig.codeCustomFonts" :key="font.id" :value="font.id">
                    {{ font.name }}
                  </option>
                </optgroup>
              </select>
              <button class="add-font-btn" title="添加字体" @click="showFontPicker('code')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
            <div v-if="localConfig.codeCustomFonts?.length > 0" class="custom-fonts-inline">
              <div v-for="font in localConfig.codeCustomFonts" :key="font.id" class="custom-font-inline-item">
                <span class="font-name">{{ font.name }}</span>
                <button class="remove-inline-btn" title="移除" @click="removeCustomFont(font.id, 'code')">×</button>
              </div>
            </div>
          </div>
        </div>
        <div class="settings-footer">
          <button class="save-btn" @click="handleSave">保存</button>
          <button class="cancel-btn" @click="emit('close')">取消</button>
        </div>

        <!-- 字体选择弹出框 -->
        <div v-if="fontPickerVisible" class="font-picker-overlay" @click="closeFontPicker">
          <div class="font-picker-dialog" @click.stop>
            <div class="font-picker-header">
              选择字体
              <button class="close-btn" @click="closeFontPicker">×</button>
            </div>
            <div class="font-picker-body">
              <div v-if="availableFonts.length === 0" class="no-fonts">
                fonts 目录下没有可用的字体文件
              </div>
              <div v-else class="font-picker-list">
                <div
                  v-for="font in availableFonts"
                  :key="font.id"
                  class="font-picker-item"
                  :class="getFontPickerItemClass(font.id)"
                  @click="selectFont(font)"
                >
                  <span>{{ font.name }}</span>
                  <span v-if="getFontStatus(font.id)" class="already-tag">{{ getFontStatus(font.id) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { FontConfig, CustomFont } from '../composables/useConfig'
import { scanFonts as scanFontsDir } from '../composables/useConfig'

const props = defineProps<{
  visible: boolean
  config: FontConfig
}>()

const emit = defineEmits<{
  close: []
  save: [config: FontConfig]
}>()

const localConfig = ref<FontConfig>({ ...props.config })
const fontPickerVisible = ref(false)
const availableFonts = ref<CustomFont[]>([])
const pickerType = ref<'body' | 'code'>('body')

// 当 props.config 变化时更新本地配置
watch(() => props.config, (newConfig) => {
  localConfig.value = { ...newConfig, bodyCustomFonts: newConfig.bodyCustomFonts || [], codeCustomFonts: newConfig.codeCustomFonts || [] }
}, { immediate: true })

// 初始化时确保两个数组存在
onMounted(() => {
  if (!localConfig.value.bodyCustomFonts) {
    localConfig.value.bodyCustomFonts = []
  }
  if (!localConfig.value.codeCustomFonts) {
    localConfig.value.codeCustomFonts = []
  }
})

function handleSave() {
  emit('save', { ...localConfig.value, bodyCustomFonts: localConfig.value.bodyCustomFonts || [], codeCustomFonts: localConfig.value.codeCustomFonts || [] })
}

// 移除自定义字体
function removeCustomFont(fontId: string, type: 'body' | 'code') {
  if (type === 'body') {
    localConfig.value.bodyCustomFonts = (localConfig.value.bodyCustomFonts || []).filter(f => f.id !== fontId)
    if (localConfig.value.bodyFont === fontId) {
      localConfig.value.bodyFont = 'SourceHanSans'
    }
  } else {
    localConfig.value.codeCustomFonts = (localConfig.value.codeCustomFonts || []).filter(f => f.id !== fontId)
    if (localConfig.value.codeFont === fontId) {
      localConfig.value.codeFont = 'SourceCodePro'
    }
  }
}

// 显示字体选择框
async function showFontPicker(type: 'body' | 'code') {
  pickerType.value = type
  try {
    const fonts = await scanFontsDir()
    availableFonts.value = fonts
    fontPickerVisible.value = true
  } catch (e) {
    console.error('扫描字体失败:', e)
    availableFonts.value = []
    fontPickerVisible.value = true
  }
}

// 关闭字体选择框
function closeFontPicker() {
  fontPickerVisible.value = false
}

// 检查字体是否已添加到正文列表
function isFontInBodyList(fontId: string): boolean {
  return (localConfig.value.bodyCustomFonts || []).some(f => f.id === fontId)
}

// 检查字体是否已添加到代码列表
function isFontInCodeList(fontId: string): boolean {
  return (localConfig.value.codeCustomFonts || []).some(f => f.id === fontId)
}

// 获取字体在字体选择框中的状态文字
function getFontStatus(fontId: string): string | null {
  const inBody = isFontInBodyList(fontId)
  const inCode = isFontInCodeList(fontId)
  if (inBody && inCode) return '已添加(正文/代码)'
  if (inBody) return '已添加(正文)'
  if (inCode) return '已添加(代码)'
  return null
}

// 获取字体选择框项的样式类
function getFontPickerItemClass(fontId: string): string {
  const inBody = isFontInBodyList(fontId)
  const inCode = isFontInCodeList(fontId)
  // 当前选择类型的列表中已添加则标记为不可选
  if (pickerType.value === 'body' && inBody) return 'already-added'
  if (pickerType.value === 'code' && inCode) return 'already-added'
  return ''
}

// 选择字体
function selectFont(font: CustomFont) {
  if (pickerType.value === 'body') {
    // 正文字体
    if (!isFontInBodyList(font.id)) {
      localConfig.value.bodyCustomFonts = [...(localConfig.value.bodyCustomFonts || []), font]
    }
    localConfig.value.bodyFont = font.id
  } else {
    // 代码字体
    if (!isFontInCodeList(font.id)) {
      localConfig.value.codeCustomFonts = [...(localConfig.value.codeCustomFonts || []), font]
    }
    localConfig.value.codeFont = font.id
  }
  closeFontPicker()
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.settings-dialog {
  background-color: #ffffff;
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.settings-header {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 20px;
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-item label {
  font-size: 14px;
  color: #475569;
  font-weight: 500;
}

.font-select-row {
  display: flex;
  gap: 8px;
}

.font-select-row select {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  background-color: #fff;
  cursor: pointer;
}

.font-select-row select:focus {
  outline: none;
  border-color: #3b82f6;
}

.add-font-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background-color: #f8fafc;
  cursor: pointer;
  transition: all 0.2s;
}

.add-font-btn:hover {
  background-color: #3b82f6;
  border-color: #3b82f6;
}

.add-font-btn:hover svg {
  stroke: #fff;
}

.add-font-btn svg {
  width: 16px;
  height: 16px;
  stroke: #64748b;
}

.custom-fonts-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.custom-font-inline-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background-color: #f1f5f9;
  border-radius: 4px;
  font-size: 13px;
}

.custom-font-inline-item .font-name {
  color: #475569;
}

.remove-inline-btn {
  margin-left: 6px;
  width: 18px;
  height: 18px;
  border: none;
  background-color: transparent;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.remove-inline-btn:hover {
  color: #dc2626;
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.save-btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  background-color: #3b82f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-btn:hover {
  background-color: #2563eb;
}

.cancel-btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  background-color: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cancel-btn:hover {
  background-color: #e5e7eb;
}

/* 字体选择弹出框 */
.font-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.font-picker-dialog {
  background-color: #fff;
  border-radius: 8px;
  min-width: 300px;
  max-width: 400px;
  max-height: 400px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.font-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 18px;
  color: #64748b;
  cursor: pointer;
}

.close-btn:hover {
  color: #1e293b;
}

.font-picker-body {
  padding: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.no-fonts {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}

.font-picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.font-picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.font-picker-item:hover:not(.already-added) {
  background-color: #dbeafe;
}

.font-picker-item.already-added {
  background-color: #f3f4f6;
  cursor: default;
}

.font-picker-item span:first-child {
  font-size: 14px;
  color: #374151;
}

.already-tag {
  font-size: 12px;
  color: #94a3b8;
}
</style>