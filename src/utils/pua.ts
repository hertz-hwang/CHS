/**
 * 花括号字根转 PUA 字符工具
 * 用于将 {xxx} 形式的原子字根转换为 PUA 专用字符
 */

// PUA 映射表：{花括号字根} -> PUA字符
let roots2puaMap: Map<string, string> = new Map()
let pua2rootsMap: Map<string, string> = new Map()
let isLoaded = false

/**
 * 加载 roots2pua 映射文件
 */
export async function loadRoots2PuaMap(): Promise<void> {
  if (isLoaded) return
  
  try {
    const response = await fetch('/data/roots2pua.txt')
    if (!response.ok) {
      console.warn('Failed to load roots2pua.txt:', response.status)
      return
    }
    
    const text = await response.text()
    parseRoots2PuaText(text)
    isLoaded = true
  } catch (error) {
    console.warn('Error loading roots2pua.txt:', error)
  }
}

/**
 * 解析 roots2pua 文本内容
 */
function parseRoots2PuaText(text: string): void {
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    
    const cols = line.split('\t')
    if (cols.length >= 2) {
      const bracedRoot = cols[0]  // 如 {⺀⺀}
      const puaCode = cols[1]      // PUA 码位，如 U+E000
      
      if (bracedRoot && puaCode) {
        // 将 U+E000 格式转换为实际字符
        let puaChar = puaCode
        if (puaCode.startsWith('U+') || puaCode.startsWith('u+')) {
          const codePoint = parseInt(puaCode.slice(2), 16)
          if (!isNaN(codePoint)) {
            puaChar = String.fromCodePoint(codePoint)
          }
        }
        
        roots2puaMap.set(bracedRoot, puaChar)
        pua2rootsMap.set(puaChar, bracedRoot)
      }
    }
  }
}

/**
 * 同步设置映射表（用于已加载的数据）
 */
export function setRoots2PuaMap(map: Map<string, string>): void {
  roots2puaMap = map
  pua2rootsMap.clear()
  for (const [k, v] of map) {
    pua2rootsMap.set(v, k)
  }
  isLoaded = true
}

/**
 * 获取当前映射表
 */
export function getRoots2PuaMap(): Map<string, string> {
  return roots2puaMap
}

/**
 * 判断是否是花括号字根
 */
export function isBracedRoot(char: string): boolean {
  return char.startsWith('{') && char.endsWith('}')
}

/**
 * 将花括号字根转换为 PUA 字符
 * 如果不是花括号字根或找不到映射，返回原字符
 */
export function bracedRootToPua(char: string): string {
  if (!isBracedRoot(char)) return char
  return roots2puaMap.get(char) || char
}

/**
 * 将 PUA 字符转换回花括号字根
 * 如果不是 PUA 字符或找不到映射，返回原字符
 */
export function puaToBracedRoot(char: string): string {
  return pua2rootsMap.get(char) || char
}

/**
 * 批量转换字符串中的花括号字根为 PUA 字符
 * 用于显示文本
 */
export function convertBracedRootsToPua(text: string): string {
  // 匹配 {xxx} 形式的花括号字根
  return text.replace(/\{[^}]+\}/g, (match) => {
    return roots2puaMap.get(match) || match
  })
}

/**
 * 检查字符是否需要使用 PUA 字体显示
 */
export function needsPuaFont(char: string): boolean {
  // 检查是否是花括号字根或其对应的 PUA 字符
  if (isBracedRoot(char)) return roots2puaMap.has(char)
  return pua2rootsMap.has(char)
}

/**
 * 获取 PUA 字体名称
 */
export function getPuaFontName(): string {
  return 'CHS-PUA'
}

/**
 * 获取 PUA 字体 CSS 样式
 */
export function getPuaFontStyle(): string {
  return `'${getPuaFontName()}', 'Noto Sans SC', 'Microsoft YaHei', sans-serif`
}