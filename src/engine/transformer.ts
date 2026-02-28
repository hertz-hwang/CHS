import { TransformRuleConfig, VisualRuleConfig, RegexRuleConfig } from './config'

// ============ 类型定义 ============

export interface TransformResult {
  original: string
  transformed: string
  changed: boolean
}

// ============ IDSTransformer 类 ============

export class IDSTransformer {
  private rules: TransformRuleConfig[] = []
  private _onRulesChange: (() => void) | null = null

  constructor(rules: TransformRuleConfig[] = []) {
    this.rules = rules
  }

  setRules(rules: TransformRuleConfig[]): void {
    this.rules = rules
    this._onRulesChange?.()
  }

  getRules(): TransformRuleConfig[] {
    return this.rules
  }

  addRule(rule: TransformRuleConfig): void {
    this.rules.push(rule)
    this._onRulesChange?.()
  }

  updateRule(index: number, rule: TransformRuleConfig): void {
    if (index >= 0 && index < this.rules.length) {
      this.rules[index] = rule
      this._onRulesChange?.()
    }
  }

  removeRule(index: number): void {
    if (index >= 0 && index < this.rules.length) {
      this.rules.splice(index, 1)
      this._onRulesChange?.()
    }
  }

  onRulesChange(callback: () => void): void {
    this._onRulesChange = callback
  }

  // ============ 核心转换方法 ============

  transform(ids: string): string {
    let result = ids
    for (const rule of this.rules) {
      if (rule.enabled === false) continue
      result = this.applyRule(rule, result)
    }
    return result
  }

  private applyRule(rule: TransformRuleConfig, ids: string): string {
    if (rule.mode === 'regex') {
      return this.applyRegexRule(rule, ids)
    } else {
      return this.applyVisualRule(rule, ids)
    }
  }

  // ============ 正则模式 ============

  private applyRegexRule(rule: RegexRuleConfig, ids: string): string {
    try {
      const regex = new RegExp(rule.pattern, 'g')
      return ids.replace(regex, rule.replacement)
    } catch {
      return ids
    }
  }

  // ============ 可视化模式 ============

  private applyVisualRule(rule: VisualRuleConfig, ids: string): string {
    switch (rule.match_type) {
      case 'structure':
        return this.applyStructureMatch(rule, ids)
      case 'component':
        return this.applyComponentMatch(rule, ids)
      case 'full':
        return this.applyFullMatch(rule, ids)
      default:
        return ids
    }
  }

  /**
   * 结构匹配：匹配特定结构符开头的 IDS
   * 例如：structure="⿱", component="艹" 匹配 "⿱艹xxx"
   */
  private applyStructureMatch(rule: VisualRuleConfig, ids: string): string {
    if (!rule.structure) return ids

    // 检查是否以目标结构符开头
    if (!ids.startsWith(rule.structure)) return ids

    // 解析 IDS 获取子节点
    const children = this.extractChildren(ids, rule.structure)
    if (!children) return ids

    const position = rule.position || 'first'
    const targetComponent = rule.component

    // 根据位置查找要替换的部件
    let targetIndex = -1
    if (position === 'first') {
      targetIndex = children.findIndex(c => c === targetComponent || this.containsComponent(c, targetComponent!))
    } else if (position === 'second') {
      // 从后往前找
      for (let i = children.length - 1; i >= 0; i--) {
        if (children[i] === targetComponent || this.containsComponent(children[i], targetComponent!)) {
          targetIndex = i
          break
        }
      }
    } else {
      targetIndex = children.findIndex(c => c === targetComponent || this.containsComponent(c, targetComponent!))
    }

    if (targetIndex === -1) return ids

    // 替换目标部件
    children[targetIndex] = rule.replace_with

    // 重建 IDS
    return rule.structure + children.join('')
  }

  /**
   * 部件匹配：匹配包含特定部件的 IDS（任意位置）
   */
  private applyComponentMatch(rule: VisualRuleConfig, ids: string): string {
    if (!rule.component) return ids

    // 简单替换：直接替换部件
    const regex = new RegExp(this.escapeRegex(rule.component), 'g')
    if (regex.test(ids)) {
      return ids.replace(regex, rule.replace_with)
    }
    return ids
  }

  /**
   * 完整匹配：匹配完整的 IDS 序列
   */
  private applyFullMatch(rule: VisualRuleConfig, ids: string): string {
    if (!rule.component) return ids
    // 完整匹配时，component 存储完整的 IDS 模式
    if (ids === rule.component) {
      return rule.replace_with
    }
    return ids
  }

  // ============ 辅助方法 ============

  /**
   * 提取 IDS 结构的子节点
   */
  private extractChildren(ids: string, structure: string): string[] | null {
    if (!ids.startsWith(structure)) return null

    const children: string[] = []
    let pos = 1 // 跳过结构符
    const arity = this.getStructureArity(structure)

    for (let i = 0; i < arity && pos < ids.length; i++) {
      const child = this.extractOne(ids, pos)
      children.push(child)
      pos += child.length
    }

    return children
  }

  /**
   * 从指定位置提取一个完整的 IDS 单元
   */
  private extractOne(ids: string, pos: number): string {
    if (pos >= ids.length) return ''

    const char = ids[pos]

    // 检查是否是结构符
    if (this.isStructureChar(char)) {
      const arity = this.getStructureArity(char)
      let result = char
      let currentPos = pos + 1

      for (let i = 0; i < arity && currentPos < ids.length; i++) {
        const child = this.extractOne(ids, currentPos)
        result += child
        currentPos += child.length
      }
      return result
    }

    // 检查是否是命名字根 {xxx}
    if (char === '{') {
      const end = ids.indexOf('}', pos)
      if (end >= 0) {
        return ids.substring(pos, end + 1)
      }
    }

    // 普通字符
    return char
  }

  private isStructureChar(char: string): boolean {
    return ['⿰', '⿱', '⿲', '⿳', '⿴', '⿵', '⿶', '⿷', '⿸', '⿹', '⿺', '⿻'].includes(char)
  }

  private getStructureArity(char: string): number {
    const arities: Record<string, number> = {
      '⿰': 2, '⿱': 2, '⿲': 3, '⿳': 3, '⿴': 2, '⿵': 2,
      '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2,
    }
    return arities[char] || 2
  }

  private containsComponent(ids: string, component: string): boolean {
    return ids.includes(component)
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  // ============ 预览方法 ============

  preview(ids: string): TransformResult {
    const transformed = this.transform(ids)
    return {
      original: ids,
      transformed,
      changed: transformed !== ids,
    }
  }

  /**
   * 批量预览
   * @param decompMap 原始 IDS 数据 Map<汉字, IDS>
   */
  previewAll(decompMap: Map<string, string>): Map<string, TransformResult> {
    const results = new Map<string, TransformResult>()
    for (const [char, ids] of decompMap) {
      const transformed = this.transform(ids)
      if (transformed !== ids) {
        results.set(char, { original: ids, transformed, changed: true })
      }
    }
    return results
  }

  /**
   * 测试单条规则
   */
  testRule(rule: TransformRuleConfig, decompMap: Map<string, string>): string[] {
    const matched: string[] = []
    const tempTransformer = new IDSTransformer([rule])

    for (const [char, ids] of decompMap) {
      const result = tempTransformer.preview(ids)
      if (result.changed) {
        matched.push(char)
      }
    }
    return matched
  }

  /**
   * 从文本中提取所有命名字根 {xxx}
   */
  static extractNamedRoots(text: string): string[] {
    const roots: string[] = []
    const regex = /\{[^}]+\}/g
    let match
    while ((match = regex.exec(text)) !== null) {
      roots.push(match[0])
    }
    return roots
  }

  /**
   * 获取所有规则中涉及的命名字根
   * 包括 pattern 和 replacement 中的字根
   */
  getNamedRoots(): string[] {
    const roots = new Set<string>()
    for (const rule of this.rules) {
      if (rule.enabled === false) continue
      
      // 从正则模式的 pattern 和 replacement 中提取
      if (rule.mode === 'regex') {
        const patternRoots = IDSTransformer.extractNamedRoots(rule.pattern)
        const replacementRoots = IDSTransformer.extractNamedRoots(rule.replacement)
        patternRoots.forEach(r => roots.add(r))
        replacementRoots.forEach(r => roots.add(r))
      } else {
        // 从可视化模式的字段中提取
        const componentRoots = rule.component ? IDSTransformer.extractNamedRoots(rule.component) : []
        const replaceWithRoots = rule.replace_with ? IDSTransformer.extractNamedRoots(rule.replace_with) : []
        componentRoots.forEach(r => roots.add(r))
        replaceWithRoots.forEach(r => roots.add(r))
      }
    }
    return [...roots]
  }
}
