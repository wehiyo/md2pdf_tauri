<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click.self="handleOverlayClick">
      <div class="settings-dialog" @click="handleDialogClick">
        <div class="settings-header">字体设置</div>
        <div class="settings-body">
          <div class="settings-item">
            <label>中文字体</label>
            <div class="font-select-row">
              <div class="custom-select" @click="toggleChineseFontDropdown">
                <span class="selected-font-name">{{ getFontDisplayName(localConfig.chineseFont, 'chinese') }}</span>
                <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              <button class="add-font-btn" title="添加字体" @click="showFontPicker('chinese')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <div v-if="chineseFontDropdownOpen" class="dropdown-menu">
                <div class="dropdown-group">
                  <div class="dropdown-group-label">内置字体</div>
                  <div
                    v-for="font in builtinChineseFonts"
                    :key="font.id"
                    class="dropdown-item"
                    :class="{ selected: localConfig.chineseFont === font.id }"
                    @click="selectChineseFont(font.id)"
                  >
                    {{ font.name }}
                  </div>
                </div>
                <div v-if="localConfig.chineseCustomFonts?.length > 0" class="dropdown-group">
                  <div class="dropdown-group-label">自定义字体</div>
                  <div
                    v-for="font in localConfig.chineseCustomFonts"
                    :key="font.id"
                    class="dropdown-item custom-font-item"
                    :class="{ selected: localConfig.chineseFont === font.id }"
                  >
                    <span class="font-name-text" @click="selectChineseFont(font.id)">{{ font.name }}</span>
                    <button class="dropdown-remove-btn" title="移除" @click.stop="removeCustomFont(font.id, 'chinese')">×</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="settings-item">
            <label>英文字体</label>
            <div class="font-select-row">
              <div class="custom-select" @click="toggleEnglishFontDropdown">
                <span class="selected-font-name">{{ getFontDisplayName(localConfig.englishFont, 'english') }}</span>
                <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              <button class="add-font-btn" title="添加字体" @click="showFontPicker('english')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <div v-if="englishFontDropdownOpen" class="dropdown-menu">
                <div class="dropdown-group">
                  <div class="dropdown-group-label">内置字体</div>
                  <div
                    v-for="font in builtinEnglishFonts"
                    :key="font.id"
                    class="dropdown-item"
                    :class="{ selected: localConfig.englishFont === font.id }"
                    @click="selectEnglishFont(font.id)"
                  >
                    {{ font.name }}
                  </div>
                </div>
                <div v-if="localConfig.englishCustomFonts?.length > 0" class="dropdown-group">
                  <div class="dropdown-group-label">自定义字体</div>
                  <div
                    v-for="font in localConfig.englishCustomFonts"
                    :key="font.id"
                    class="dropdown-item custom-font-item"
                    :class="{ selected: localConfig.englishFont === font.id }"
                  >
                    <span class="font-name-text" @click="selectEnglishFont(font.id)">{{ font.name }}</span>
                    <button class="dropdown-remove-btn" title="移除" @click.stop="removeCustomFont(font.id, 'english')">×</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="settings-item">
            <label>代码字体</label>
            <div class="font-select-row">
              <div class="custom-select" @click="toggleCodeFontDropdown">
                <span class="selected-font-name">{{ getFontDisplayName(localConfig.codeFont, 'code') }}</span>
                <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              <button class="add-font-btn" title="添加字体" @click="showFontPicker('code')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <div v-if="codeFontDropdownOpen" class="dropdown-menu">
                <div class="dropdown-group">
                  <div class="dropdown-group-label">内置字体</div>
                  <div
                    v-for="font in builtinCodeFonts"
                    :key="font.id"
                    class="dropdown-item"
                    :class="{ selected: localConfig.codeFont === font.id }"
                    @click="selectCodeFont(font.id)"
                  >
                    {{ font.name }}
                  </div>
                </div>
                <div v-if="localConfig.codeCustomFonts?.length > 0" class="dropdown-group">
                  <div class="dropdown-group-label">自定义字体</div>
                  <div
                    v-for="font in localConfig.codeCustomFonts"
                    :key="font.id"
                    class="dropdown-item custom-font-item"
                    :class="{ selected: localConfig.codeFont === font.id }"
                  >
                    <span class="font-name-text" @click="selectCodeFont(font.id)">{{ font.name }}</span>
                    <button class="dropdown-remove-btn" title="移除" @click.stop="removeCustomFont(font.id, 'code')">×</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="settings-item">
            <label>基础字号</label>
            <div class="font-select-row">
              <div class="custom-select" @click="toggleFontSizeDropdown">
                <span class="selected-font-name">{{ getFontSizeLabel(localConfig.bodyFontSize) }}</span>
                <svg class="select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
              <div v-if="fontSizeDropdownOpen" class="dropdown-menu">
                <div
                  v-for="size in fontSizeOptions"
                  :key="size.value"
                  class="dropdown-item"
                  :class="{ selected: localConfig.bodyFontSize === size.value }"
                  @click="selectFontSize(size.value)"
                >
                  {{ size.label }}
                </div>
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
import { scanFonts as scanFontsDir, FONT_SIZE_OPTIONS, BUILTIN_CHINESE_FONTS, BUILTIN_ENGLISH_FONTS, BUILTIN_CODE_FONTS } from '../composables/useConfig'

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
const pickerType = ref<'chinese' | 'english' | 'code'>('chinese')
const chineseFontDropdownOpen = ref(false)
const englishFontDropdownOpen = ref(false)
const codeFontDropdownOpen = ref(false)
const fontSizeDropdownOpen = ref(false)

// 字号选项
const fontSizeOptions = FONT_SIZE_OPTIONS

// 内置字体列表
const builtinChineseFonts = BUILTIN_CHINESE_FONTS.map(f => ({ id: f.id, name: f.name }))
const builtinEnglishFonts = BUILTIN_ENGLISH_FONTS.map(f => ({ id: f.id, name: f.name }))
const builtinCodeFonts = BUILTIN_CODE_FONTS.map(f => ({ id: f.id, name: f.name }))

// 当 props.config 变化时更新本地配置
watch(() => props.config, (newConfig) => {
  localConfig.value = {
    ...newConfig,
    bodyFontSize: newConfig.bodyFontSize || 16,
    chineseCustomFonts: newConfig.chineseCustomFonts || [],
    englishCustomFonts: newConfig.englishCustomFonts || [],
    codeCustomFonts: newConfig.codeCustomFonts || []
  }
}, { immediate: true })

// 初始化时确保所有字段存在
onMounted(() => {
  if (!localConfig.value.chineseCustomFonts) {
    localConfig.value.chineseCustomFonts = []
  }
  if (!localConfig.value.englishCustomFonts) {
    localConfig.value.englishCustomFonts = []
  }
  if (!localConfig.value.codeCustomFonts) {
    localConfig.value.codeCustomFonts = []
  }
  if (!localConfig.value.bodyFontSize) {
    localConfig.value.bodyFontSize = 16
  }
})

function handleSave() {
  emit('save', {
    ...localConfig.value,
    bodyFontSize: localConfig.value.bodyFontSize || 16,
    chineseCustomFonts: localConfig.value.chineseCustomFonts || [],
    englishCustomFonts: localConfig.value.englishCustomFonts || [],
    codeCustomFonts: localConfig.value.codeCustomFonts || []
  })
}

// 移除自定义字体
function removeCustomFont(fontId: string, type: 'chinese' | 'english' | 'code') {
  if (type === 'chinese') {
    localConfig.value.chineseCustomFonts = (localConfig.value.chineseCustomFonts || []).filter(f => f.id !== fontId)
    if (localConfig.value.chineseFont === fontId) {
      localConfig.value.chineseFont = 'DengXian'
    }
    if (localConfig.value.chineseCustomFonts?.length === 0) {
      chineseFontDropdownOpen.value = false
    }
  } else if (type === 'english') {
    localConfig.value.englishCustomFonts = (localConfig.value.englishCustomFonts || []).filter(f => f.id !== fontId)
    if (localConfig.value.englishFont === fontId) {
      localConfig.value.englishFont = 'Arial'
    }
    if (localConfig.value.englishCustomFonts?.length === 0) {
      englishFontDropdownOpen.value = false
    }
  } else {
    localConfig.value.codeCustomFonts = (localConfig.value.codeCustomFonts || []).filter(f => f.id !== fontId)
    if (localConfig.value.codeFont === fontId) {
      localConfig.value.codeFont = 'SourceCodePro'
    }
    if (localConfig.value.codeCustomFonts?.length === 0) {
      codeFontDropdownOpen.value = false
    }
  }
}

// 显示字体选择框
async function showFontPicker(type: 'chinese' | 'english' | 'code') {
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

// 点击遮罩层
function handleOverlayClick() {
  chineseFontDropdownOpen.value = false
  englishFontDropdownOpen.value = false
  codeFontDropdownOpen.value = false
  fontSizeDropdownOpen.value = false
  emit('close')
}

// 点击对话框内部
function handleDialogClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.dropdown-menu') && !target.closest('.custom-select')) {
    chineseFontDropdownOpen.value = false
    englishFontDropdownOpen.value = false
    codeFontDropdownOpen.value = false
    fontSizeDropdownOpen.value = false
  }
}

// 检查字体是否已添加到列表
function isFontInList(fontId: string, type: 'chinese' | 'english' | 'code'): boolean {
  const customFonts = type === 'chinese' ? localConfig.value.chineseCustomFonts
    : type === 'english' ? localConfig.value.englishCustomFonts
    : localConfig.value.codeCustomFonts
  return (customFonts || []).some(f => f.id === fontId)
}

// 获取字体状态文字
function getFontStatus(fontId: string): string | null {
  const inChinese = isFontInList(fontId, 'chinese')
  const inEnglish = isFontInList(fontId, 'english')
  const inCode = isFontInList(fontId, 'code')
  const tags: string[] = []
  if (inChinese) tags.push('中文')
  if (inEnglish) tags.push('英文')
  if (inCode) tags.push('代码')
  if (tags.length > 0) return `已添加(${tags.join('/')})`
  return null
}

// 获取字体选择框项的样式类
function getFontPickerItemClass(fontId: string): string {
  if (isFontInList(fontId, pickerType.value)) return 'already-added'
  return ''
}

// 选择字体
function selectFont(font: CustomFont) {
  if (!isFontInList(font.id, pickerType.value)) {
    const customFontsKey = pickerType.value === 'chinese' ? 'chineseCustomFonts'
      : pickerType.value === 'english' ? 'englishCustomFonts'
      : 'codeCustomFonts'
    const fontKey = pickerType.value === 'chinese' ? 'chineseFont'
      : pickerType.value === 'english' ? 'englishFont'
      : 'codeFont'

    localConfig.value[customFontsKey] = [...(localConfig.value[customFontsKey] || []), font]
    localConfig.value[fontKey] = font.id
  } else {
    // 已在列表中，直接选择
    const fontKey = pickerType.value === 'chinese' ? 'chineseFont'
      : pickerType.value === 'english' ? 'englishFont'
      : 'codeFont'
    localConfig.value[fontKey] = font.id
  }
  closeFontPicker()
}

// 获取字体显示名称
function getFontDisplayName(fontId: string, type: 'chinese' | 'english' | 'code'): string {
  const builtinFonts = type === 'chinese' ? builtinChineseFonts
    : type === 'english' ? builtinEnglishFonts
    : builtinCodeFonts
  const customFonts = type === 'chinese' ? localConfig.value.chineseCustomFonts
    : type === 'english' ? localConfig.value.englishCustomFonts
    : localConfig.value.codeCustomFonts

  const builtin = builtinFonts.find(f => f.id === fontId)
  if (builtin) return builtin.name

  const custom = customFonts?.find(f => f.id === fontId)
  if (custom) return custom.name

  return fontId
}

// 切换下拉框
function toggleChineseFontDropdown() {
  chineseFontDropdownOpen.value = !chineseFontDropdownOpen.value
  englishFontDropdownOpen.value = false
  codeFontDropdownOpen.value = false
  fontSizeDropdownOpen.value = false
}

function toggleEnglishFontDropdown() {
  englishFontDropdownOpen.value = !englishFontDropdownOpen.value
  chineseFontDropdownOpen.value = false
  codeFontDropdownOpen.value = false
  fontSizeDropdownOpen.value = false
}

function toggleCodeFontDropdown() {
  codeFontDropdownOpen.value = !codeFontDropdownOpen.value
  chineseFontDropdownOpen.value = false
  englishFontDropdownOpen.value = false
  fontSizeDropdownOpen.value = false
}

function toggleFontSizeDropdown() {
  fontSizeDropdownOpen.value = !fontSizeDropdownOpen.value
  chineseFontDropdownOpen.value = false
  englishFontDropdownOpen.value = false
  codeFontDropdownOpen.value = false
}

// 选择字体
function selectChineseFont(fontId: string) {
  localConfig.value.chineseFont = fontId
  chineseFontDropdownOpen.value = false
}

function selectEnglishFont(fontId: string) {
  localConfig.value.englishFont = fontId
  englishFontDropdownOpen.value = false
}

function selectCodeFont(fontId: string) {
  localConfig.value.codeFont = fontId
  codeFontDropdownOpen.value = false
}

function selectFontSize(size: number) {
  localConfig.value.bodyFontSize = size
  fontSizeDropdownOpen.value = false
}

function getFontSizeLabel(size: number): string {
  const option = fontSizeOptions.find(o => o.value === size)
  return option ? option.label : `${size}px`
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
  position: relative;
}

.custom-select {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  background-color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
}

.custom-select:hover {
  border-color: #cbd5e1;
}

.selected-font-name {
  color: #374151;
}

.select-arrow {
  width: 16px;
  height: 16px;
  stroke: #64748b;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 36px;
  margin-top: 4px;
  background-color: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
}

.dropdown-group {
  padding: 4px 0;
}

.dropdown-group-label {
  padding: 6px 12px;
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.dropdown-item {
  padding: 10px 12px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.2s;
}

.dropdown-item:hover:not(.custom-font-item) {
  background-color: #f1f5f9;
}

.dropdown-item.selected {
  background-color: #dbeafe;
  color: #1e40af;
}

.custom-font-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 8px;
}

.font-name-text {
  flex: 1;
  padding-right: 8px;
}

.custom-font-item:hover {
  background-color: #f1f5f9;
}

.dropdown-remove-btn {
  width: 20px;
  height: 20px;
  border: none;
  background-color: transparent;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.dropdown-remove-btn:hover {
  background-color: #fee2e2;
  color: #dc2626;
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