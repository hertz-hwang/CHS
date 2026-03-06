import * as TOML from 'smol-toml'

// ============ 类型定义 ============

export interface RootCode {
  root: string           // 字根，如 "一" 或 "{落字框}"
  main: string           // 键位码（第1字符）
  sub?: string           // 小码（第2字符，可选）
  supplement?: string    // 补码（第3字符起，可选）
  mergedFrom?: string    // 归并来源字根（表示此字根的编码与来源字根相同）
  codeEquivFrom?: string // 字根半归并来源，如 "日.1" 表示此字根的某码来自日.1
}

export interface VisualRuleConfig {
  mode: 'visual'
  match_type: 'structure' | 'component' | 'full'
  structure?: string      // 目标结构符，如 "⿱"
  component?: string      // 目标部件
  position?: 'first' | 'second' | 'any'
  replace_with: string    // 替换为
}

export interface RegexRuleConfig {
  mode: 'regex'
  pattern: string
  replacement: string
}

export type TransformRuleConfig = (VisualRuleConfig | RegexRuleConfig) & {
  name: string
  enabled?: boolean
}

// 取码规则节点类型
export interface CodeRuleNode {
  id: string
  type: 'start' | 'end' | 'pick' | 'condition'
  label: string
  rootIndex?: number
  codeIndex?: number
  charIndex?: number      // 多字词取码：第几个字（1-indexed）
  nextNode?: string       // 取码节点的下一节点
  conditionType?: 'root_exists' | 'root_has_code' | 'root_count' | 'char_exists'
  conditionValue?: number
  conditionCodeIndex?: number  // 用于 root_has_code 条件
  trueBranch?: string
  falseBranch?: string
  position?: { x: number; y: number }  // 节点位置
}

export interface UserConfig {
  meta: {
    version: string
    name?: string
    author?: string
    created?: string
    description?: string
  }
  charset?: string                    // 当前选中的字集ID
  roots: Record<string, string>      // 字根 -> 编码字符串
  named_roots: Record<string, string> // 命名字根名 -> IDS
  equivalent_roots: Record<string, string[]> // 主字根 -> 等效字根列表
  merged_roots: Record<string, string>  // 归并字根 -> 来源字根（编码相同）
  code_equivalences: Record<string, string>  // 字根半归并: "目.1" = "日.1" 表示目的第2码等于日的第2码
  rules: TransformRuleConfig[]        // IDS 转换规则
  code_rules: CodeRuleNode[]          // 单字取码规则
  word_code_rules?: CodeRuleNode[]    // 多字词取码规则
}

// ============ 编码解析 ============

export function parseCode(code: string): { main: string; sub?: string; supplement?: string } {
  if (!code) return { main: '' }
  return {
    main: code[0],
    sub: code.length > 1 ? code[1] : undefined,
    supplement: code.length > 2 ? code.slice(2) : undefined,
  }
}

export function codeToString(code: { main: string; sub?: string; supplement?: string }): string {
  return code.main + (code.sub || '') + (code.supplement || '')
}

export function parseRootCodes(roots: Record<string, string>): Map<string, RootCode> {
  const result = new Map<string, RootCode>()
  for (const [root, code] of Object.entries(roots)) {
    const parsed = parseCode(code)
    result.set(root, { root, ...parsed })
  }
  return result
}

export function rootCodesToRecord(codes: Map<string, RootCode>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [root, code] of codes) {
    result[root] = codeToString(code)
  }
  return result
}

// ============ TOML 解析与导出 ============

const LS_KEY = 'chars_hijack_config'

export function parseConfig(toml: string): UserConfig {
  try {
    const parsed = TOML.parse(toml) as Partial<UserConfig>
    return {
      meta: parsed.meta || { version: '1.0' },
      charset: parsed.charset,  // 解析字集ID
      roots: parsed.roots || {},
      named_roots: parsed.named_roots || {},
      equivalent_roots: parsed.equivalent_roots || {},
      merged_roots: parsed.merged_roots || {},
      code_equivalences: parsed.code_equivalences || {},
      rules: parsed.rules || [],
      code_rules: parsed.code_rules || [],
      word_code_rules: parsed.word_code_rules || [],
    }
  } catch (e) {
    console.error('TOML parse error:', e)
    return {
      meta: { version: '1.0' },
      roots: {},
      named_roots: {},
      equivalent_roots: {},
      merged_roots: {},
      code_equivalences: {},
      rules: [],
      code_rules: [],
      word_code_rules: [],
    }
  }
}

export function exportConfig(config: UserConfig): string {
  const lines: string[] = []

  // meta
  lines.push('[meta]')
  lines.push(`version = "${config.meta.version}"`)
  if (config.meta.name) lines.push(`name = "${config.meta.name}"`)
  if (config.meta.author) lines.push(`author = "${config.meta.author}"`)
  if (config.meta.created) lines.push(`created = "${config.meta.created}"`)
  if (config.meta.description) lines.push(`description = "${config.meta.description}"`)
  lines.push('')

  // charset (字集ID)
  if (config.charset) {
    lines.push(`charset = "${config.charset}"`)
    lines.push('')
  }

  // roots
  if (Object.keys(config.roots).length > 0) {
    lines.push('[roots]')
    for (const [root, code] of Object.entries(config.roots)) {
      lines.push(`"${root}" = "${code}"`)
    }
    lines.push('')
  }

  // named_roots
  if (Object.keys(config.named_roots).length > 0) {
    lines.push('[named_roots]')
    for (const [name, ids] of Object.entries(config.named_roots)) {
      lines.push(`"${name}" = "${ids}"`)
    }
    lines.push('')
  }

  // equivalent_roots (等效字根)
  if (Object.keys(config.equivalent_roots).length > 0) {
    lines.push('[equivalent_roots]')
    for (const [main, equivs] of Object.entries(config.equivalent_roots)) {
      const equivsStr = equivs.map(e => `"${e}"`).join(', ')
      lines.push(`"${main}" = [${equivsStr}]`)
    }
    lines.push('')
  }

  // merged_roots (归并字根)
  if (Object.keys(config.merged_roots).length > 0) {
    lines.push('[merged_roots]')
    for (const [target, source] of Object.entries(config.merged_roots)) {
      lines.push(`"${target}" = "${source}"`)
    }
    lines.push('')
  }

  // code_equivalences (字根半归并)
  if (Object.keys(config.code_equivalences).length > 0) {
    lines.push('[code_equivalences]')
    for (const [target, source] of Object.entries(config.code_equivalences)) {
      lines.push(`"${target}" = "${source}"`)
    }
    lines.push('')
  }

  // rules (IDS 转换规则)
  for (const rule of config.rules) {
    lines.push('[[rules]]')
    lines.push(`name = "${rule.name}"`)
    lines.push(`mode = "${rule.mode}"`)
    if (rule.enabled !== undefined) lines.push(`enabled = ${rule.enabled}`)
    if (rule.mode === 'visual') {
      lines.push(`match_type = "${rule.match_type}"`)
      if (rule.structure) lines.push(`structure = "${rule.structure}"`)
      if (rule.component) lines.push(`component = "${rule.component}"`)
      if (rule.position) lines.push(`position = "${rule.position}"`)
      lines.push(`replace_with = "${rule.replace_with}"`)
    } else {
      lines.push(`pattern = "${rule.pattern}"`)
      lines.push(`replacement = "${rule.replacement}"`)
    }
    lines.push('')
  }

  // code_rules (单字取码规则)
  for (const codeRule of config.code_rules) {
    lines.push('[[code_rules]]')
    lines.push(`id = "${codeRule.id}"`)
    lines.push(`type = "${codeRule.type}"`)
    lines.push(`label = "${codeRule.label}"`)
    if (codeRule.rootIndex !== undefined) lines.push(`rootIndex = ${codeRule.rootIndex}`)
    if (codeRule.codeIndex !== undefined) lines.push(`codeIndex = ${codeRule.codeIndex}`)
    if (codeRule.charIndex !== undefined) lines.push(`charIndex = ${codeRule.charIndex}`)
    if (codeRule.nextNode !== undefined) lines.push(`nextNode = "${codeRule.nextNode}"`)
    if (codeRule.conditionType !== undefined) lines.push(`conditionType = "${codeRule.conditionType}"`)
    if (codeRule.conditionValue !== undefined) lines.push(`conditionValue = ${codeRule.conditionValue}`)
    if (codeRule.conditionCodeIndex !== undefined) lines.push(`conditionCodeIndex = ${codeRule.conditionCodeIndex}`)
    if (codeRule.trueBranch !== undefined) lines.push(`trueBranch = "${codeRule.trueBranch}"`)
    if (codeRule.falseBranch !== undefined) lines.push(`falseBranch = "${codeRule.falseBranch}"`)
    if (codeRule.position !== undefined) {
      lines.push(`position = { x = ${codeRule.position.x}, y = ${codeRule.position.y} }`)
    }
    lines.push('')
  }

  // word_code_rules (多字词取码规则)
  if (config.word_code_rules && config.word_code_rules.length > 0) {
    for (const codeRule of config.word_code_rules) {
      lines.push('[[word_code_rules]]')
      lines.push(`id = "${codeRule.id}"`)
      lines.push(`type = "${codeRule.type}"`)
      lines.push(`label = "${codeRule.label}"`)
      if (codeRule.rootIndex !== undefined) lines.push(`rootIndex = ${codeRule.rootIndex}`)
      if (codeRule.codeIndex !== undefined) lines.push(`codeIndex = ${codeRule.codeIndex}`)
      if (codeRule.charIndex !== undefined) lines.push(`charIndex = ${codeRule.charIndex}`)
      if (codeRule.nextNode !== undefined) lines.push(`nextNode = "${codeRule.nextNode}"`)
      if (codeRule.conditionType !== undefined) lines.push(`conditionType = "${codeRule.conditionType}"`)
      if (codeRule.conditionValue !== undefined) lines.push(`conditionValue = ${codeRule.conditionValue}`)
      if (codeRule.conditionCodeIndex !== undefined) lines.push(`conditionCodeIndex = ${codeRule.conditionCodeIndex}`)
      if (codeRule.trueBranch !== undefined) lines.push(`trueBranch = "${codeRule.trueBranch}"`)
      if (codeRule.falseBranch !== undefined) lines.push(`falseBranch = "${codeRule.falseBranch}"`)
      if (codeRule.position !== undefined) {
        lines.push(`position = { x = ${codeRule.position.x}, y = ${codeRule.position.y} }`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

// ============ localStorage 存储 ============

export function loadConfigFromStorage(): UserConfig | null {
  try {
    const data = localStorage.getItem(LS_KEY)
    if (!data) return null
    return JSON.parse(data) as UserConfig
  } catch {
    return null
  }
}

export function saveConfigToStorage(config: UserConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config))
  } catch (e) {
    console.error('Failed to save config:', e)
  }
}

// ============ 多配置方案管理 ============

const SCHEMES_KEY = 'chars_hijack_schemes'
const CURRENT_SCHEME_KEY = 'chars_hijack_current_scheme'

// 配置方案元信息
export interface ConfigScheme {
  id: string           // 唯一标识
  name: string         // 方案名称
  author: string       // 作者
  created: string      // 创建时间
  updated: string      // 更新时间
  description: string  // 描述
  isExample?: boolean  // 是否为官方示例
}

// 带元信息的完整配置方案
export interface ConfigSchemeWithData extends ConfigScheme {
  config: UserConfig
}

// 获取所有配置方案列表
export function listSchemes(): ConfigScheme[] {
  try {
    const data = localStorage.getItem(SCHEMES_KEY)
    if (!data) return []
    return JSON.parse(data) as ConfigScheme[]
  } catch {
    return []
  }
}

// 保存配置方案列表
function saveSchemesList(schemes: ConfigScheme[]): void {
  localStorage.setItem(SCHEMES_KEY, JSON.stringify(schemes))
}

// 获取当前激活的方案ID
export function getCurrentSchemeId(): string | null {
  return localStorage.getItem(CURRENT_SCHEME_KEY)
}

// 设置当前激活的方案ID
export function setCurrentSchemeId(id: string): void {
  localStorage.setItem(CURRENT_SCHEME_KEY, id)
}

// 生成唯一ID
function generateId(): string {
  return `scheme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 获取方案存储键
function getSchemeKey(id: string): string {
  return `chars_hijack_scheme_${id}`
}

// 保存配置方案
export function saveScheme(scheme: ConfigScheme, config: UserConfig): void {
  // 保存方案数据
  const key = getSchemeKey(scheme.id)
  localStorage.setItem(key, JSON.stringify(config))
  
  // 更新方案列表
  const schemes = listSchemes()
  const index = schemes.findIndex(s => s.id === scheme.id)
  if (index >= 0) {
    schemes[index] = scheme
  } else {
    schemes.push(scheme)
  }
  saveSchemesList(schemes)
}

// 加载配置方案（同步版本，仅用于用户方案）
export function loadScheme(id: string): ConfigSchemeWithData | null {
  try {
    // 示例方案需要用 loadExampleScheme 异步加载
    if (id.startsWith('example_')) return null
    
    const schemes = listSchemes()
    const scheme = schemes.find(s => s.id === id)
    if (!scheme) return null
    
    const key = getSchemeKey(id)
    const data = localStorage.getItem(key)
    if (!data) return null
    
    const config = JSON.parse(data) as UserConfig
    return { ...scheme, config }
  } catch {
    return null
  }
}

// 删除配置方案
export function deleteScheme(id: string): boolean {
  try {
    // 不允许删除官方示例
    if (id.startsWith('example_')) return false
    
    const schemes = listSchemes()
    const index = schemes.findIndex(s => s.id === id)
    if (index < 0) return false
    
    // 删除方案数据
    const key = getSchemeKey(id)
    localStorage.removeItem(key)
    
    // 从列表中移除
    schemes.splice(index, 1)
    saveSchemesList(schemes)
    
    // 如果删除的是当前方案，清除当前方案标记
    if (getCurrentSchemeId() === id) {
      localStorage.removeItem(CURRENT_SCHEME_KEY)
    }
    
    return true
  } catch {
    return false
  }
}

// 重命名配置方案
export function renameScheme(id: string, newName: string, newAuthor?: string, newDescription?: string): boolean {
  try {
    const schemes = listSchemes()
    const scheme = schemes.find(s => s.id === id)
    if (!scheme) return false
    
    scheme.name = newName
    if (newAuthor !== undefined) scheme.author = newAuthor
    if (newDescription !== undefined) scheme.description = newDescription
    scheme.updated = new Date().toISOString().split('T')[0]
    
    saveSchemesList(schemes)
    return true
  } catch {
    return false
  }
}

// 创建新配置方案
export function createScheme(name: string, author: string, description: string = ''): ConfigScheme {
  const now = new Date().toISOString().split('T')[0]
  const scheme: ConfigScheme = {
    id: generateId(),
    name,
    author,
    created: now,
    updated: now,
    description,
  }
  return scheme
}

// 从 TOML 导入创建配置方案
export function importSchemeFromToml(toml: string, name?: string, author?: string): ConfigSchemeWithData | null {
  try {
    const config = parseConfig(toml)
    const schemeName = name || config.meta?.name || '导入配置'
    const schemeAuthor = author || config.meta?.author || '未知作者'
    const now = new Date().toISOString().split('T')[0]
    
    const scheme: ConfigScheme = {
      id: generateId(),
      name: schemeName,
      author: schemeAuthor,
      created: config.meta?.created || now,
      updated: now,
      description: config.meta?.description || '',
    }
    
    // 更新 config 的 meta 信息
    config.meta = {
      version: config.meta?.version || '1.0',
      name: schemeName,
      author: schemeAuthor,
      created: scheme.created,
      description: scheme.description,
    }
    
    return { ...scheme, config }
  } catch (e) {
    console.error('Failed to import scheme:', e)
    return null
  }
}

// 导出配置方案为 TOML
export function exportSchemeToToml(scheme: ConfigSchemeWithData): string {
  // 确保 meta 信息同步
  const config = { ...scheme.config }
  config.meta = {
    version: scheme.config.meta?.version || '1.0',
    name: scheme.name,
    author: scheme.author,
    created: scheme.created,
    description: scheme.description,
  }
  return exportConfig(config)
}

// 复制配置方案
export function duplicateScheme(id: string, newName?: string): ConfigSchemeWithData | null {
  const original = loadScheme(id)
  if (!original) return null
  
  const now = new Date().toISOString().split('T')[0]
  const scheme: ConfigScheme = {
    id: generateId(),
    name: newName || `${original.name} (副本)`,
    author: original.author,
    created: now,
    updated: now,
    description: original.description,
  }
  
  const config = { ...original.config }
  config.meta = {
    ...config.meta,
    name: scheme.name,
    author: scheme.author,
    created: scheme.created,
    description: scheme.description,
  }
  
  saveScheme(scheme, config)
  return { ...scheme, config }
}

// ============ 官方示例配置 ============

// 示例配置文件定义（只定义文件路径，元信息从文件读取）
const BASE = import.meta.env.BASE_URL
const EXAMPLE_FILES: { id: string; file: string }[] = [
  { id: 'example_hakimi', file: `${BASE}data/examples/哈基米_字劫.toml` },
]

// 示例配置缓存
let exampleSchemesCache: ConfigScheme[] | null = null
let exampleTomlCache: Map<string, string> = new Map()
let exampleConfigCache: Map<string, UserConfig> = new Map()

// 加载所有示例配置的元信息
async function loadExampleMeta(): Promise<ConfigScheme[]> {
  if (exampleSchemesCache) return exampleSchemesCache
  
  const schemes: ConfigScheme[] = []
  
  for (const { id, file } of EXAMPLE_FILES) {
    try {
      const res = await fetch(file)
      if (res.ok) {
        const toml = await res.text()
        exampleTomlCache.set(id, toml)
        
        const config = parseConfig(toml)
        exampleConfigCache.set(id, config)
        
        const now = new Date().toISOString().split('T')[0]
        schemes.push({
          id,
          name: config.meta?.name || '未命名方案',
          author: config.meta?.author || '未知作者',
          created: config.meta?.created || now,
          updated: config.meta?.created || now,
          description: config.meta?.description || '',
          isExample: true,
        })
      }
    } catch (e) {
      console.error(`Failed to load example ${id}:`, e)
    }
  }
  
  exampleSchemesCache = schemes
  return schemes
}

// 获取所有示例方案列表（同步版本，返回缓存或空数组）
export function getExampleSchemes(): ConfigScheme[] {
  return exampleSchemesCache || []
}

// 异步加载示例方案列表
export async function loadExampleSchemes(): Promise<ConfigScheme[]> {
  return loadExampleMeta()
}

export async function loadExampleScheme(id: string): Promise<ConfigSchemeWithData | null> {
  // 确保已加载元信息
  await loadExampleMeta()
  
  const config = exampleConfigCache.get(id)
  const schemes = exampleSchemesCache || []
  const scheme = schemes.find(s => s.id === id)
  
  if (!config || !scheme) return null
  
  return { ...scheme, config }
}

// 初始化示例配置（将示例添加到方案列表中显示）
export async function initExampleSchemes(): Promise<void> {
  const exampleSchemes = await loadExampleMeta()
  const schemes = listSchemes()
  
  for (const example of exampleSchemes) {
    if (!schemes.find(s => s.id === example.id)) {
      schemes.push(example)
    }
  }
  
  saveSchemesList(schemes)
}

// ============ 默认配置 ============

export function createDefaultConfig(name?: string, author?: string): UserConfig {
  return {
    meta: {
      version: '1.0',
      name: name || '',
      author: author || '',
      created: new Date().toISOString().split('T')[0],
      description: '字劫用户配置',
    },
    roots: {},
    named_roots: {},
    equivalent_roots: {},
    merged_roots: {},
    code_equivalences: {},
    rules: [],
    code_rules: [],
    word_code_rules: [],
  }
}

// ============ 默认取码规则 ============

export function createDefaultCodeRules(): CodeRuleNode[] {
  return [
    { id: 'start', type: 'start', label: '开始' },
    { id: 'end', type: 'end', label: '结束' },
  ]
}

// ============ 默认多字词取码规则 ============

export function createDefaultWordCodeRules(): CodeRuleNode[] {
  return [
    { id: 'start', type: 'start', label: '开始', nextNode: 'c0' },
    { id: 'end', type: 'end', label: '结束', position: { x: 384, y: 924 } },
    { id: 'c0', type: 'condition', label: '存在第3字？', conditionType: 'char_exists', conditionValue: 3, trueBranch: 's0', falseBranch: 's9', position: { x: 223, y: 154 } },
    { id: 's0', type: 'pick', label: '取第1字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 1, nextNode: 's5', position: { x: 136, y: 260 } },
    { id: 's1', type: 'pick', label: '取第1字第2根首码', rootIndex: 2, codeIndex: 1, charIndex: 1, nextNode: 's2', position: { x: 395, y: 385 } },
    { id: 's2', type: 'pick', label: '取第2字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 2, nextNode: 's3', position: { x: 399, y: 491 } },
    { id: 's3', type: 'pick', label: '取第2字第2根首码', rootIndex: 2, codeIndex: 1, charIndex: 2, nextNode: 'end', position: { x: 401, y: 589 } },
    { id: 's5', type: 'pick', label: '取第2字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 2, nextNode: 's6', position: { x: 140, y: 379 } },
    { id: 's6', type: 'pick', label: '取第3字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 3, nextNode: 'c1', position: { x: 144, y: 486 } },
    { id: 's4', type: 'pick', label: '取第3字第2根首码', rootIndex: 2, codeIndex: 1, charIndex: 3, nextNode: 'end', position: { x: 247, y: 711 } },
    { id: 's7', type: 'pick', label: '取末字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: -1, nextNode: 'end', position: { x: 11, y: 719 } },
    { id: 's9', type: 'pick', label: '取第1字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 1, nextNode: 's1', position: { x: 381, y: 269 } },
    { id: 'c1', type: 'condition', label: '存在第4字？', conditionType: 'char_exists', conditionValue: 4, trueBranch: 's7', falseBranch: 's4', position: { x: 125, y: 610 } },
  ]
}
