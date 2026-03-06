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
    const base = import.meta.env.BASE_URL
    const res = await fetch(`${base}data/pair_equivalence.txt`)
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
  } catch (e) {
    // 加载失败时使用默认值
  }
}

// 计算两键组合的当量
function getComboEquivalence(key1: string, key2: string): number {
  // 将空格转换为 _（数据文件中用 _ 表示空格）
  const k1 = key1 === ' ' ? '_' : key1.toLowerCase()
  const k2 = key2 === ' ' ? '_' : key2.toLowerCase()
  const combo = k1 + k2
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

// 手指定义
const PINKY_KEYS = new Set(['q', 'a', 'z', 'p', ';', '/', '0', '-', '=', '1'])  // 小指键
const RING_KEYS = new Set(['w', 's', 'x', 'o', 'l', '.', '2', '9'])  // 无名指键
const MIDDLE_KEYS = new Set(['e', 'd', 'c', 'i', 'k', ',', '3', '8'])  // 中指键

// 错手下排键：中指、无名指在第三排的位置，按下后会导致手掌下沉
// 根据用户资料：只统计与 xc,. 有关的错手情况
// 左手：c（中指）、x（无名指）；右手：,（中指）、.（无名指）
const LFD_BOTTOM_KEYS = new Set(['x', 'c', ',', '.'])

// 错手上排键：第一排字母键（需要手掌上移才能按到）
const LFD_TOP_KEYS = new Set(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'])

/**
 * 判断是否为小指干扰
 * 定义：同手中小指与无名指或中指的组合（存在神经干扰）
 * 不包含：小指与食指组合（食指独立）、跨手组合
 */
function isPinkyDisturb(key1: string, key2: string): boolean {
  const info1 = KEYBOARD_LAYOUT[key1.toLowerCase()]
  const info2 = KEYBOARD_LAYOUT[key2.toLowerCase()]
  
  if (!info1 || !info2) return false
  
  // 必须同手
  if (info1.hand !== info2.hand) return false
  
  const k1 = key1.toLowerCase()
  const k2 = key2.toLowerCase()
  
  // 检查是否为小指+无名指 或 小指+中指 的组合
  const isPinky1 = PINKY_KEYS.has(k1)
  const isPinky2 = PINKY_KEYS.has(k2)
  const isRing1 = RING_KEYS.has(k1)
  const isRing2 = RING_KEYS.has(k2)
  const isMiddle1 = MIDDLE_KEYS.has(k1)
  const isMiddle2 = MIDDLE_KEYS.has(k2)
  
  // 小指 + 无名指
  if ((isPinky1 && isRing2) || (isRing1 && isPinky2)) return true
  // 小指 + 中指
  if ((isPinky1 && isMiddle2) || (isMiddle1 && isPinky2)) return true
  
  return false
}

/**
 * 判断是否为错手
 * 定义：中指、无名指按下排键后，再按上排键（手掌需要移动）
 * 只统计与 xc,. 有关的错手情况
 * 方向性：只有从下排到上排才算错手
 */
function isLongFingerDisturb(key1: string, key2: string): boolean {
  const info1 = KEYBOARD_LAYOUT[key1.toLowerCase()]
  const info2 = KEYBOARD_LAYOUT[key2.toLowerCase()]
  
  if (!info1 || !info2) return false
  
  // 必须同手
  if (info1.hand !== info2.hand) return false
  
  const k1 = key1.toLowerCase()
  const k2 = key2.toLowerCase()
  
  // 第一个键必须是下排键（c 或 ,）
  if (!LFD_BOTTOM_KEYS.has(k1)) return false
  
  // 第二个键必须是上排键
  if (!LFD_TOP_KEYS.has(k2)) return false
  
  // 确认第一个键是中指或无名指
  const isRingOrMiddle1 = RING_KEYS.has(k1) || MIDDLE_KEYS.has(k1)
  if (!isRingOrMiddle1) return false
  
  return true
}

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
  if (isPinkyDisturb(key1, key2)) {
    result.pd = 1
  }
  
  // 错手
  if (isLongFingerDisturb(key1, key2)) {
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
  
  // 出简重和全码重
  simpleCollision: number  // 出简重（最短编码的重码情况）
  fullCollision: number    // 全码重（最长编码的重码情况）
  
  // 加权值
  cl: number         // 加权键长
  ziEq: number       // 加权字均当量
  keyEq: number      // 加权键均当量
  ziEqCombo: number  // 字当量（键值对当量值之和）
  keyEqCombo: number // 键当量（键均当量，字当量/键值对数量）
  
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
 * 返回每个字的所有编码（用于计算出简重和全码重）
 */
export function parseCodeTable(content: string, filename?: string): Map<string, string[]> {
  const codeMap = new Map<string, string[]>()
  
  const isYaml = filename?.endsWith('.yaml') || filename?.endsWith('.yml') || 
                 content.includes('---')
  
  if (isYaml) {
    parseYamlCodeTable(content, codeMap)
  } else {
    parseTxtCodeTable(content, codeMap)
  }
  
  return codeMap
}

function parseTxtCodeTable(content: string, codeMap: Map<string, string[]>): void {
  const lines = content.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    
    const parts = trimmed.split(/[\t\s]+/)
    if (parts.length >= 2) {
      const char = parts[0]
      const code = parts[1].toLowerCase()
      if (char.length === 1) {
        if (!codeMap.has(char)) {
          codeMap.set(char, [])
        }
        const codes = codeMap.get(char)!
        if (!codes.includes(code)) {
          codes.push(code)
        }
      }
    }
  }
}

function parseYamlCodeTable(content: string, codeMap: Map<string, string[]>): void {
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
          if (!codeMap.has(char)) {
            codeMap.set(char, [])
          }
          const codes = codeMap.get(char)!
          if (!codes.includes(code)) {
            codes.push(code)
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
 * @param codeMap 编码映射（支持 Map<string, string> 和 Map<string, string[]>）
 * @param freqMap 字频映射
 * @param selectKeys 选重键
 * @param maxCodeLength 最大码长
 * @param missingSet 缺字集合（可选，用于标记缺字）
 */
export function evaluateScheme(
  codeMap: Map<string, string> | Map<string, string[]>,
  freqMap: Map<string, number>,
  selectKeys: string = ";'456789",
  maxCodeLength: number = 4,
  missingSet?: Set<string>
): EvaluationResult {
  // 按字频排序
  const sortedChars = [...freqMap.entries()]
    .filter(([char]) => char.length === 1)
    .sort((a, b) => b[1] - a[1])
  
  // 5 个分区
  const sections = [
    [0, 300],
    [300, 500],
    [500, 1500],
    [1500, 3000],
    [3000, 6000],
  ]
  
  // 编码冲突计数器（全码重 - 基于最长编码）
  const fullCodeCollision = new Map<string, number>()
  // 出简重冲突计数器（基于最短编码）
  const simpleCodeCollision = new Map<string, number>()
  
  // 理论二简集合
  const brief2Set = new Set<string>()
  
  const lines: EvaluateLine[] = []
  const totalUsage: Record<string, number> = {}
  
  // 是否为数组类型的 codeMap
  const isArrayCodeMap = codeMap instanceof Map && 
    codeMap.size > 0 && Array.isArray(codeMap.values().next().value)
  
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
      
      // 获取该字的所有编码
      let codes: string[] | undefined
      if (isArrayCodeMap) {
        codes = (codeMap as Map<string, string[]>).get(char)
      } else {
        const code = (codeMap as Map<string, string>).get(char)
        if (code) codes = [code]
      }
      
      // 缺字判断：优先使用 missingSet，其次检查 codeMap
      if (isMissing || !codes || codes.length === 0) {
        line.items.push({
          char,
          freq,
          code: '',
          codeLen: 0,
          collision: 0,
          selectKey: '',
          brief2: false,
          simpleCollision: 0,
          fullCollision: 0,
          cl: 0,
          ziEq: 0,
          keyEq: 0,
          ziEqCombo: 0,
          keyEqCombo: 0,
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
      
      // 找到最短编码和最长编码
      let shortestCode = codes[0]
      let longestCode = codes[0]
      for (const code of codes) {
        if (code.length < shortestCode.length) shortestCode = code
        if (code.length > longestCode.length) longestCode = code
      }
      
      // 使用最短编码作为主要编码
      const code = shortestCode
      const codeLen = code.length
      
      // 计算出简重：基于最短编码的重码情况
      const simpleCollisionKey = shortestCode
      const simpleCollision = (simpleCodeCollision.get(simpleCollisionKey) || 0) + 1
      simpleCodeCollision.set(simpleCollisionKey, simpleCollision)
      
      // 计算全码重：基于最长编码的重码情况
      const fullCollisionKey = longestCode
      const fullCollision = (fullCodeCollision.get(fullCollisionKey) || 0) + 1
      fullCodeCollision.set(fullCollisionKey, fullCollision)
      
      // 计算选重键
      let selectKey = ''
      if (simpleCollision > 1) {
        // 有重码，使用配置的选重键（从第 2 选项开始）
        const selectIdx = Math.min(simpleCollision - 2, selectKeys.length - 1)
        selectKey = selectKeys[selectIdx]
      } else if (codeLen < maxCodeLength) {
        // 码长不足，使用空格确认首选项
        selectKey = ' '
      }
      // else: 四码自动上屏，不需要确认键
      
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
        collision: simpleCollision,  // collision 使用出简重
        selectKey,
        brief2,
        simpleCollision,
        fullCollision,
        cl: keysLen * freq,
        ziEq: 0,
        keyEq: 0,
        ziEqCombo: 0,
        keyEqCombo: 0,
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
        // 1 码字：只有一个键，无法形成键值对，当量为 0
        item.ziEq = 0
        item.keyEq = 0
        item.ziEqCombo = 0
        item.keyEqCombo = 0
      } else {
        let eq = 0
        for (let j = 1; j < fullCode.length; j++) {
          eq += getComboEquivalence(fullCode[j - 1], fullCode[j])
        }
        item.ziEq = eq * freq
        item.keyEq = (eq / (keysLen - 1)) * freq
        item.ziEqCombo = eq  // 字当量为键值对当量值之和
        item.keyEqCombo = eq / (keysLen - 1)  // 键当量 = 字当量 / 键值对数量
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
      case 'simpleCollision':
        // 出简重：最短编码重码数 > 1
        if (item.simpleCollision > 1) { count++; weight += item.freq }
        break
      case 'fullCollision':
        // 全码重：最长编码重码数 > 1
        if (item.fullCollision > 1) { count++; weight += item.freq }
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

// ============ 多字词测评 ============

// 多字词测评项（非缺字）
export interface EvaluateWordItem {
  word: string       // 词
  freq: number       // 词频
  code: string       // 编码
  codeLen: number    // 码长
  collision: number  // 选重数

  // 当量
  eq: number         // 加权词均当量

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

// 多字词每一行的测评结果
export interface EvaluateWordLine {
  items: EvaluateWordItem[]
  start: number
  end: number
  totalFreq: number
  usage: Record<string, number>
}

// 多字词完整测评结果
export interface EvaluationWordResult {
  lines: EvaluateWordLine[]
  usage: Record<string, number>
}

/**
 * 计算编码的当量
 */
function calcEquivalence(code: string): number {
  if (code.length < 2) return 1
  let eq = 0
  for (let i = 1; i < code.length; i++) {
    eq += getComboEquivalence(code[i - 1], code[i])
  }
  return eq
}

/**
 * 多字词测评
 * @param wordCodeMap 词语编码映射
 * @param wordFreqMap 词频映射
 */
export function evaluateWords(
  wordCodeMap: Map<string, string>,
  wordFreqMap: Map<string, number>
): EvaluationWordResult {
  // 按词频排序（只取2字及以上的词）
  const sortedWords = [...wordFreqMap.entries()]
    .filter(([word]) => word.length >= 2)
    .sort((a, b) => b[1] - a[1])

  // 6个分区（参考 schema-box）
  const sections = [
    [0, 2000],
    [2000, 5000],
    [5000, 10000],
    [10000, 20000],
    [20000, 40000],
    [40000, 60000],
  ]

  // 编码冲突计数器
  const codeCollision = new Map<string, number>()

  const lines: EvaluateWordLine[] = []
  const totalUsage: Record<string, number> = {}

  for (const [start, end] of sections) {
    const line: EvaluateWordLine = {
      items: [],
      start,
      end,
      totalFreq: 0,
      usage: {},
    }

    for (let i = start; i < Math.min(end, sortedWords.length); i++) {
      const [word, freq] = sortedWords[i]
      line.totalFreq += freq

      // 检查码表中是否存在该词
      const code = wordCodeMap.get(word)

      // 缺字判断
      if (!code) {
        line.items.push({
          word,
          freq,
          code: '',
          codeLen: 0,
          collision: 0,
          eq: 0,
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

      // 统计按键使用
      for (const k of code) {
        if (KEYS_46_SET.has(k)) {
          line.usage[k] = (line.usage[k] || 0) + freq
          totalUsage[k] = (totalUsage[k] || 0) + freq
        }
      }

      // 检查超标键位
      let overKey = 0
      for (const k of code) {
        if (!KEYS_46_SET.has(k)) overKey++
      }

      // 初始化测评项
      const item: EvaluateWordItem = {
        word,
        freq,
        code,
        codeLen,
        collision,
        eq: 0,
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
      item.eq = calcEquivalence(code) * freq

      // 计算手感指标
      for (let j = 1; j < code.length; j++) {
        const feel = getComboFeel(code[j - 1], code[j])
        item.dh += feel.dh
        item.ms += feel.ms
        item.ss += feel.ss
        item.pd += feel.pd
        item.lfd += feel.lfd
      }

      // 三连击
      for (let j = 2; j < code.length; j++) {
        if (code[j - 2] === code[j - 1] && code[j - 1] === code[j]) {
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
 * 汇总多个多字词分区
 */
export function zipWordLines(lines: EvaluateWordLine[]): EvaluateWordLine {
  const result: EvaluateWordLine = {
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
 * 计算多字词某一列的统计值
 */
export function getWordColumnValue(
  line: EvaluateWordLine,
  column: string
): { count: number; weight: number } {
  let count = 0
  let weight = 0

  for (const item of line.items) {
    if (item.isLack) {
      if (column === 'lack') {
        count++
        weight += item.freq
      }
      continue
    }

    // 超标键位只统计特定列
    if (item.overKey > 0 && !['overKey', 'lack'].includes(column)) continue

    switch (column) {
      case 'select':
        if (item.collision > 1) { count++; weight += item.freq }
        break
      case 'lack':
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
 * 获取多字词加权当量值
 */
export function getWordWeightedEq(line: EvaluateWordLine): number {
  let total = 0
  for (const item of line.items) {
    if (!item.isLack && item.overKey === 0) {
      total += item.eq
    }
  }
  return line.totalFreq > 0 ? total / line.totalFreq : 0
}

/**
 * 获取多字词手感指标的加权百分比
 */
export function getWordComboWeightPercent(line: EvaluateWordLine, column: string): string {
  let totalCombo = 0
  let weightedValue = 0

  for (const item of line.items) {
    if (item.isLack || item.overKey > 0) continue
    const comboCount = item.codeLen < 2 ? 1 : item.codeLen - 1
    totalCombo += comboCount * item.freq

    switch (column) {
      case 'dh': weightedValue += item.dh * item.freq; break
      case 'ms': weightedValue += item.ms * item.freq; break
      case 'ss': weightedValue += item.ss * item.freq; break
      case 'pd': weightedValue += item.pd * item.freq; break
      case 'lfd': weightedValue += item.lfd * item.freq; break
    }
  }

  return totalCombo > 0 ? (weightedValue / totalCombo * 100).toFixed(4) : '0.0000'
}

/**
 * 获取多字词缺字标记的加权比重
 */
export function getWordLackWeightPercent(line: EvaluateWordLine): string {
  let lackWeight = 0
  for (const item of line.items) {
    if (item.isLack) lackWeight += item.freq
  }
  return line.totalFreq > 0 ? (lackWeight / line.totalFreq * 100).toFixed(4) : '0.0000'
}

/**
 * 获取多字词某一列的加权比重
 */
export function getWordWeightPercent(line: EvaluateWordLine, column: string): string {
  const { weight } = getWordColumnValue(line, column)
  return line.totalFreq > 0 ? (weight / line.totalFreq * 100).toFixed(4) : '0.0000'
}
