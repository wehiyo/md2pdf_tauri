/**
 * 规范化路径：解析 `.` 和 `..`，统一使用正斜杠。
 * 合并自 Preview.vue 和 useMkdocsExport.ts 中的两个独立实现。
 */
export function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const result: string[] = []

  const isWindowsPath = /^[A-Za-z]:/.test(normalized)
  const isUnixAbsolutePath = normalized.startsWith('/')

  for (const part of parts) {
    if (part === '..') {
      // 有父级可退时弹出
      if (result.length > 0 && result[result.length - 1] !== '..') {
        // Windows 路径中保留盘符不被移除
        if (!(result.length === 1 && isWindowsPath)) {
          result.pop()
        }
      } else if (!isUnixAbsolutePath) {
        // 相对路径或 Windows 路径：保留开头的 .. 以支持相对引用
        result.push(part)
      }
      // Unix 绝对路径：.. 在根目录直接丢弃（无法逃逸根目录）
    } else if (part !== '.' && part !== '') {
      result.push(part)
    }
  }

  const joinedPath = result.join('/')

  // Windows 路径确保盘符前缀存在
  if (isWindowsPath) {
    const driveMatch = normalized.match(/^([A-Za-z]:)/)
    if (driveMatch && !joinedPath.startsWith(driveMatch[1])) {
      return driveMatch[1] + '/' + joinedPath
    }
  }

  // Unix 绝对路径添加前导 /
  if (isUnixAbsolutePath && !isWindowsPath) {
    return '/' + joinedPath
  }

  return joinedPath
}
