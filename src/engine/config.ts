import * as TOML from 'smol-toml'

// ============ 类型定义 ============

export interface RootCode {
  root: string           // 字根，如 "一" 或 "{落字框}"
  main: string           // 键位码（第1字符）
  sub?: string           // 小码（第2字符，可选）
  supplement?: string    // 补码（第3字符起，可选）
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
  nextNode?: string       // 取码节点的下一节点
  conditionType?: 'root_exists' | 'root_has_code' | 'root_count'
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
  roots: Record<string, string>      // 字根 -> 编码字符串
  named_roots: Record<string, string> // 命名字根名 -> IDS
  equivalent_roots: Record<string, string[]> // 主字根 -> 等效字根列表
  rules: TransformRuleConfig[]        // IDS 转换规则
  code_rules: CodeRuleNode[]          // 取码规则
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
      roots: parsed.roots || {},
      named_roots: parsed.named_roots || {},
      equivalent_roots: parsed.equivalent_roots || {},
      rules: parsed.rules || [],
      code_rules: parsed.code_rules || [],
    }
  } catch (e) {
    console.error('TOML parse error:', e)
    return {
      meta: { version: '1.0' },
      roots: {},
      named_roots: {},
      equivalent_roots: {},
      rules: [],
      code_rules: [],
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

  // code_rules (取码规则)
  for (const codeRule of config.code_rules) {
    lines.push('[[code_rules]]')
    lines.push(`id = "${codeRule.id}"`)
    lines.push(`type = "${codeRule.type}"`)
    lines.push(`label = "${codeRule.label}"`)
    if (codeRule.rootIndex !== undefined) lines.push(`rootIndex = ${codeRule.rootIndex}`)
    if (codeRule.codeIndex !== undefined) lines.push(`codeIndex = ${codeRule.codeIndex}`)
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
    rules: [],
    code_rules: [],
  }
}

// ============ 默认取码规则 ============

export function createDefaultCodeRules(): CodeRuleNode[] {
  return [
    { id: 'start', type: 'start', label: '开始' },
    { id: 'end', type: 'end', label: '结束' },
  ]
}
