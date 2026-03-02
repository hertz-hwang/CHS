/**
 * 测评工具函数
 * 用于评估编码方案的各种指标
 * 参考科学形码测评系统
 */

// 46键集合（主键盘区所有能打出字符的按键，包括空格，排除 ` \ 两键）
export const KEYS_46 = [...`qwertyuiopasdfghjklzxcvbnm1234567890-= [];',./ `]
export const KEYS_46_SET = new Set(KEYS_46)

// 左手键集合（用于判断左右互击）
const LEFT_KEYS = [...`12345qwertasdfgzxcvb`]
const LEFT_SET = new Set(LEFT_KEYS)

// 当量数据（从文件加载）
const DEFAULT_EQ = 2.0
let EQ_DATA: Record<string, number> = {}
let eqDataLoaded = false

// 加载当量数据
export async function loadEquivalenceData(): Promise<void> {
  if (eqDataLoaded) return
  
  try {
    const res = await fetch('/data/pair_equivalence.txt')
    if (!res.ok) throw new Error('加载当量数据失败')
    
    const text = await res.text()
    const lines = text.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      
      const parts = trimmed.split('\t')
      if (parts.length >= 2) {
        const combo = parts[0].toLowerCase()
        const value = parseFloat(parts[1])
        if (combo && !isNaN(value)) {
          EQ_DATA[combo] = value
        }
      }
    }
    
    eqDataLoaded = true
    console.log(`已加载当量数据：${Object.keys(EQ_DATA).length} 条`)
  } catch (e) {
    console.error('加载当量数据失败:', e)
  }
}

// 计算两键组合的当量
function getComboEquivalence(key1: string, key2: string): number {
  const combo = key1.toLowerCase() + key2.toLowerCase()
  return EQ_DATA[combo] ?? DEFAULT_EQ
}

// 定义键盘布局（用于计算手指和位置）
const KEYBOARD_LAYOUT: Record<string, { hand: string; finger: string; row: number }> = {
  // 左手
  '`': { hand: 'left', finger: 'pinky', row: 0 },
  '1': { hand: 'left', finger: 'pinky', row: 0 },
  '2': { hand: 'left', finger: 'ring', row: 0 },
  '3': { hand: 'left', finger: 'middle', row: 0 },
  '4': { hand: 'left', finger: 'index', row: 0 },
  '5': { hand: 'left', finger: 'index', row: 0 },
  'q': { hand: 'left', finger: 'pinky', row: 1 },
  'w': { hand: 'left', finger: 'ring', row: 1 },
  'e': { hand: 'left', finger: 'middle', row: 1 },
  'r': { hand: 'left', finger: 'index', row: 1 },
  't': { hand: 'left', finger: 'index', row: 1 },
  'a': { hand: 'left', finger: 'pinky', row: 2 },
  's': { hand: 'left', finger: 'ring', row: 2 },
  'd': { hand: 'left', finger: 'middle', row: 2 },
  'f': { hand: 'left', finger: 'index', row: 2 },
  'g': { hand: 'left', finger: 'index', row: 2 },
  'z': { hand: 'left', finger: 'pinky', row: 3 },
  'x': { hand: 'left', finger: 'ring', row: 3 },
  'c': { hand: 'left', finger: 'middle', row: 3 },
  'v': { hand: 'left', finger: 'index', row: 3 },
  'b': { hand: 'left', finger: 'index', row: 3 },
  // 右手
  '6': { hand: 'right', finger: 'index', row: 0 },
  '7': { hand: 'right', finger: 'index', row: 0 },
  '8': { hand: 'right', finger: 'middle', row: 0 },
  '9': { hand: 'right', finger: 'ring', row: 0 },
  '0': { hand: 'right', finger: 'pinky', row: 0 },
  '-': { hand: 'right', finger: 'pinky', row: 0 },
  '=': { hand: 'right', finger: 'pinky', row: 0 },
  'y': { hand: 'right', finger: 'index', row: 1 },
  'u': { hand: 'right', finger: 'index', row: 1 },
  'i': { hand: 'right', finger: 'middle', row: 1 },
  'o': { hand: 'right', finger: 'ring', row: 1 },
  'p': { hand: 'right', finger: 'pinky', row: 1 },
  '[': { hand: 'right', finger: 'pinky', row: 1 },
  ']': { hand: 'right', finger: 'pinky', row: 1 },
  'h': { hand: 'right', finger: 'index', row: 2 },
  'j': { hand: 'right', finger: 'index', row: 2 },
  'k': { hand: 'right', finger: 'middle', row: 2 },
  'l': { hand: 'right', finger: 'ring', row: 2 },
  ';': { hand: 'right', finger: 'pinky', row: 2 },
  "'": { hand: 'right', finger: 'pinky', row: 2 },
  'n': { hand: 'right', finger: 'index', row: 3 },
  'm': { hand: 'right', finger: 'index', row: 3 },
  ',': { hand: 'right', finger: 'middle', row: 3 },
  '.': { hand: 'right', finger: 'ring', row: 3 },
  '/': { hand: 'right', finger: 'pinky', row: 3 },
  ' ': { hand: 'right', finger: 'thumb', row: 2 },
}

// 小指干扰组合（参考 schema-box 项目）
// 小指的使用对其它手指产生神经干扰
const PINKY_DISTURB_SET = new Set([
  'aq', 'qa', 'az', 'za', 'aw', 'wa',  // 左手小指干扰
  'pk', 'kp', 'pl', 'lp', 'p;', ';p',  // 右手小指干扰
  ';a', 'a;', ';z', 'z;',              // 跨手小指干扰
  'qz', 'zq', 'qp', 'pq',              // 其他小指组合
])

// 错手组合（参考 schema-box 项目）
// 因为中指、无名指下沉带动手掌下沉，导致高位按键难以按下的情况
const LONG_FINGER_DISTURB_SET = new Set([
  'xe', 'ex', 'cr', 'rc',  // 左手错手
  'wr', 'rw',              // 左手错手
  'cv', 'vc', 'dc', 'cd',  // 左手错手
  'sx', 'xs', 'ze', 'ez',  // 左手错手
  'xc', 'cx',              // 左手错手
])

// 手感数据：每个组合的各种手感指标
interface ComboFeel {
  dh: number   // 左右互击
  ms: number   // 同指大跨排
  ss: number   // 同指小跨排
  pd: number   // 小指干扰
  lfd: number  // 错手
}

// 计算两键组合的手感指标
function getComboFeel(key1: string, key2: string): ComboFeel {
  const info1 = KEYBOARD_LAYOUT[key1.toLowerCase()]
  const info2 = KEYBOARD_LAYOUT[key2.toLowerCase()]
  
  const result: ComboFeel = { dh: 0, ms: 0, ss: 0, pd: 0, lfd: 0 }
  
  if (!info1 || !info2) return result
  
  // 左右互击：两个按键不在同一个手区域
  const isLeft1 = LEFT_SET.has(key1.toLowerCase())
  const isLeft2 = LEFT_SET.has(key2.toLowerCase())
  if (isLeft1 !== isLeft2) {
    result.dh = 1
  }
  
  // 同指跨排：两个按键需要用相同手指，但不是同一键
  if (info1.hand === info2.hand && info1.finger === info2.finger && key1 !== key2) {
    const rowDiff = Math.abs(info1.row - info2.row)
    if (rowDiff >= 2) {
      result.ms = 1  // 大跨排（两排或多排）
    } else if (rowDiff === 1) {
      result.ss = 1  // 小跨排（一排）
    }
  }
  
  // 小指干扰
  const combo = key1.toLowerCase() + key2.toLowerCase()
  if (PINKY_DISTURB_SET.has(combo)) {
    result.pd = 1
  }
  
  // 错手
  if (LONG_FINGER_DISTURB_SET.has(combo)) {
    result.lfd = 1
  }
  
  return result
}

// 单字测评项（非缺字）
export interface EvaluateHanziItem {
  char: string       // 字
  freq: number       // 字频
  code: string       // 编码
  codeLen: number    // 码长
  collision: number  // 选重数
  selectKey: string  // 选重键
  brief2: boolean    // 理论二简
  
  // 加权值
  cl: number         // 加权键长 = 键长 * 字频
  ziEq: number       // 加权字均当量
  keyEq: number      // 加权键均当量
  
  // 手感指标（次数）
  dh: number         // 左右互击
  ms: number         // 同指大跨排
  ss: number         // 同指小跨排
  pd: number         // 小指干扰
  lfd: number        // 错手
  trible: number     // 三连击
  overKey: number    // 超标键位
  isLack: boolean    // 是否缺字
}

// 每一行的测评结果
export interface EvaluateLine {
  items: EvaluateHanziItem[]
  start: number
  end: number
  totalFreq: number
  usage: Record<string, number>
}

// 完整测评结果
export interface EvaluationResult {
  lines: EvaluateLine[]  // 5个分区
  usage: Record<string, number>  // 总按键使用
}

/**
 * 解析码表文件（支持 TXT 和 YAML 格式）
 */
export function parseCodeTable(content: string, filename?: string): Map<string, string> {
  const codeMap = new Map<string, string>()
  
  const isYaml = filename?.endsWith('.yaml') || filename?.endsWith('.yml') || 
                 content.includes('---')
  
  if (isYaml) {
    parseYamlCodeTable(content, codeMap)
  } else {
    parseTxtCodeTable(content, codeMap)
  }
  
  return codeMap
}

function parseTxtCodeTable(content: string, codeMap: Map<string, string>): void {
  const lines = content.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    
    const parts = trimmed.split(/[\t\s]+/)
    if (parts.length >= 2) {
      const char = parts[0]
      const code = parts[1].toLowerCase()
      if (char.length === 1) {
        const existing = codeMap.get(char)
        if (!existing || code.length < existing.length) {
          codeMap.set(char, code)
        }
      }
    }
  }
}

function parseYamlCodeTable(content: string, codeMap: Map<string, string>): void {
  const lines = content.split('\n')
  let passedHeader = false
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    
    if (trimmed === '---') {
      passedHeader = true
      continue
    }
    if (trimmed === '...') continue
    
    if (passedHeader && !trimmed.includes(':')) {
      const parts = trimmed.split(/[\t\s]+/)
      if (parts.length >= 2) {
        const char = parts[0]
        const code = parts[1].toLowerCase()
        if (char.length === 1) {
          const existing = codeMap.get(char)
          if (!existing || code.length < existing.length) {
            codeMap.set(char, code)
          }
        }
      }
    }
  }
  
  if (codeMap.size === 0) {
    parseTxtCodeTable(content, codeMap)
  }
}

/**
 * 测评编码方案
 * @param codeMap 编码映射
 * @param freqMap 字频映射
 * @param selectKeys 选重键
 * @param maxCodeLength 最大码长
 * @param missingSet 缺字集合（可选，用于标记缺字）
 */
export function evaluateScheme(
  codeMap: Map<string, string>,
  freqMap: Map<string, number>,
  selectKeys: string = '1234',
  maxCodeLength: number = 4,
  missingSet?: Set<string>
): EvaluationResult {
  // 按字频排序
  const sortedChars = [...freqMap.entries()]
    .filter(([char]) => char.length === 1)
    .sort((a, b) => b[1] - a[1])
  
  // 5个分区
  const sections = [
    [0, 300],
    [300, 500],
    [500, 1500],
    [1500, 3000],
    [3000, 6000],
  ]
  
  // 编码冲突计数器
  const codeCollision = new Map<string, number>()
  
  // 理论二简集合
  const brief2Set = new Set<string>()
  
  const lines: EvaluateLine[] = []
  const totalUsage: Record<string, number> = {}
  
  for (const [start, end] of sections) {
    const line: EvaluateLine = {
      items: [],
      start,
      end,
      totalFreq: 0,
      usage: {},
    }
    
    for (let i = start; i < Math.min(end, sortedChars.length); i++) {
      const [char, freq] = sortedChars[i]
      line.totalFreq += freq
      
      // 检查是否在缺字集合中（由调用方提供）
      const isMissing = missingSet?.has(char) ?? false
      
      // 检查码表中是否存在该字
      const code = codeMap.get(char)
      
      // 缺字判断：优先使用 missingSet，其次检查 codeMap
      if (isMissing || !code) {
        line.items.push({
          char,
          freq,
          code: code || '',
          codeLen: 0,
          collision: 0,
          selectKey: '',
          brief2: false,
          cl: 0,
          ziEq: 0,
          keyEq: 0,
          dh: 0,
          ms: 0,
          ss: 0,
          pd: 0,
          lfd: 0,
          trible: 0,
          overKey: 0,
          isLack: true,
        })
        continue
      }
      
      const codeLen = code.length
      const collision = (codeCollision.get(code) || 0) + 1
      codeCollision.set(code, collision)
      
      // 计算选重键
      let selectKey = ''
      if (maxCodeLength > codeLen || collision > 1) {
        const selectIdx = Math.min(collision - 1, selectKeys.length - 1)
        selectKey = selectKeys[selectIdx]
      }
      
      const fullCode = code + selectKey
      const keysLen = fullCode.length
      
      // 统计按键使用
      for (const k of fullCode) {
        line.usage[k] = (line.usage[k] || 0) + freq
        totalUsage[k] = (totalUsage[k] || 0) + freq
      }
      
      // 检查超标键位
      let overKey = 0
      for (const k of code) {
        if (!KEYS_46_SET.has(k)) overKey++
      }
      
      // 计算理论二简
      let brief2 = false
      if (code.length >= 2) {
        const code2 = code.slice(0, 2)
        if (!brief2Set.has(code2)) {
          brief2Set.add(code2)
          brief2 = true
        }
      }
      
      // 初始化测评项
      const item: EvaluateHanziItem = {
        char,
        freq,
        code,
        codeLen,
        collision,
        selectKey,
        brief2,
        cl: keysLen * freq,
        ziEq: 0,
        keyEq: 0,
        dh: 0,
        ms: 0,
        ss: 0,
        pd: 0,
        lfd: 0,
        trible: 0,
        overKey,
        isLack: false,
      }
      
      // 超标键位，跳过手感计算
      if (overKey > 0) {
        line.items.push(item)
        continue
      }
      
      // 计算当量
      if (keysLen < 2) {
        item.ziEq = freq  // 1码字当量为1
        item.keyEq = freq
      } else {
        let eq = 0
        for (let j = 1; j < fullCode.length; j++) {
          eq += getComboEquivalence(fullCode[j - 1], fullCode[j])
        }
        item.ziEq = eq * freq
        item.keyEq = (eq / (keysLen - 1)) * freq
      }
      
      // 计算手感指标（使用完整的编码，包括选重键）
      for (let j = 1; j < fullCode.length; j++) {
        const feel = getComboFeel(fullCode[j - 1], fullCode[j])
        item.dh += feel.dh
        item.ms += feel.ms
        item.ss += feel.ss
        item.pd += feel.pd
        item.lfd += feel.lfd
      }
      
      // 三连击
      for (let j = 2; j < fullCode.length; j++) {
        if (fullCode[j - 2] === fullCode[j - 1] && fullCode[j - 1] === fullCode[j]) {
          item.trible++
        }
      }
      
      line.items.push(item)
    }
    
    lines.push(line)
  }
  
  return { lines, usage: totalUsage }
}

/**
 * 汇总多个分区
 */
export function zipLines(lines: EvaluateLine[]): EvaluateLine {
  const result: EvaluateLine = {
    items: [],
    start: lines[0]?.start || 0,
    end: lines[lines.length - 1]?.end || 0,
    totalFreq: 0,
    usage: {},
  }
  
  for (const line of lines) {
    result.items.push(...line.items)
    result.totalFreq += line.totalFreq
    for (const [k, v] of Object.entries(line.usage)) {
      result.usage[k] = (result.usage[k] || 0) + v
    }
  }
  
  return result
}

/**
 * 计算某一列的统计值
 */
export function getColumnValue(
  line: EvaluateLine,
  column: string
): { count: number; weight: number } {
  let count = 0
  let weight = 0
  
  for (const item of line.items) {
    if (item.isLack) {
      // 缺字只统计 'lack' 列
      if (column === 'lack') {
        count++
        weight += item.freq
      }
      continue
    }
    
    // 超标键位只统计特定列
    if (item.overKey > 0 && !['overKey', 'lack'].includes(column)) continue
    
    switch (column) {
      case 'cd1':
        if (item.codeLen === 1) { count++; weight += item.freq }
        break
      case 'cd2':
        if (item.codeLen === 2) { count++; weight += item.freq }
        break
      case 'cd3':
        if (item.codeLen === 3) { count++; weight += item.freq }
        break
      case 'cd4':
        if (item.codeLen === 4) { count++; weight += item.freq }
        break
      case 'cd5':
        if (item.codeLen >= 5) { count++; weight += item.freq }
        break
      case 'select':
        if (item.collision > 1) { count++; weight += item.freq }
        break
      case 'brief2':
        if (item.brief2) { count++; weight += item.freq }
        break
      case 'lack':
        // 已在上面处理
        break
      case 'overKey':
        count += item.overKey
        weight += item.overKey * item.freq
        break
      case 'dh':
        count += item.dh
        weight += item.dh * item.freq
        break
      case 'ms':
        count += item.ms
        weight += item.ms * item.freq
        break
      case 'ss':
        count += item.ss
        weight += item.ss * item.freq
        break
      case 'pd':
        count += item.pd
        weight += item.pd * item.freq
        break
      case 'lfd':
        count += item.lfd
        weight += item.lfd * item.freq
        break
      case 'trible':
        if (item.trible > 0) { count++; weight += item.freq }
        break
    }
  }
  
  return { count, weight }
}

/**
 * 获取加权值
 */
export function getWeightedValue(line: EvaluateLine, field: 'cl' | 'ziEq' | 'keyEq'): number {
  let total = 0
  for (const item of line.items) {
    if (!item.isLack && item.overKey === 0) {
      total += item[field]
    }
  }
  return line.totalFreq > 0 ? total / line.totalFreq : 0
}

/**
 * 计算用指平衡（RMSE）
 */
export function calcFingerBalance(usage: Record<string, number>): number {
  // Workman布局的理想权重
  const workmanWeight: Record<string, number> = {
    'q': 1, 'w': 3, 'e': 7, 'r': 10, 't': 6,
    'y': 3, 'u': 6, 'i': 7, 'o': 3, 'p': 1,
    'a': 4, 's': 9, 'd': 14, 'f': 14, 'g': 5,
    'h': 5, 'j': 14, 'k': 14, 'l': 9, ';': 4,
    'z': 1, 'x': 2, 'c': 4, 'v': 4, 'b': 2,
    'n': 2, 'm': 4, ',': 4, '.': 2, '/': 1,
  }
  
  // 计算相对频率
  const total = Object.values(usage).reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  
  const relativeUsage: Record<string, number> = {}
  for (const [k, v] of Object.entries(usage)) {
    relativeUsage[k] = v / total * 100
  }
  
  // 计算RMSE
  let sum = 0
  let count = 0
  for (const key of Object.keys(workmanWeight)) {
    const ideal = workmanWeight[key]
    const actual = relativeUsage[key] || 0
    sum += (actual - ideal) ** 2
    count++
  }
  
  return Math.sqrt(sum / count)
}

/**
 * 将按键使用量转换为相对频率（百分比）
 */
export function toRelativeUsage(usage: Record<string, number>): Record<string, number> {
  const total = Object.values(usage).reduce((a, b) => a + b, 0)
  const result: Record<string, number> = {}
  
  for (const [key, value] of Object.entries(usage)) {
    result[key] = total > 0 ? (value / total) * 100 : 0
  }
  
  return result
}