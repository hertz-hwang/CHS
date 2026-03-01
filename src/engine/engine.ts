import { IDSNode, parseIDS } from './ids'
import { unicodeBlock, unicodeHex } from './unicode'
import { IDSTransformer, TransformResult } from './transformer'
import { UserConfig, RootCode, CodeRuleNode, parseRootCodes, rootCodesToRecord, createDefaultCodeRules, parseCode } from './config'

export interface DecompResult {
  leaves: string[]
  ids: string
  tree: IDSNode
}

export interface StepInfo {
  lv: number
  char: string
  ids: string
  leaves: string[]
}

export interface CoverageResult {
  total: number
  covered: number
  rate: number
  uncovered: string[]
  missing: [string, number][]
}

export interface SuggestItem {
  comp: string
  cnt: number
  sc: number
}

export interface PinyinInfo {
  py: string      // 拼音
  freq: number    // 词频
}

const LS_KEY = 'chars_hijack_roots'

// 国标笔画五分类等效字根配置
export const GB_STROKE_EQUIVALENT_ROOTS: Record<string, string[]> = {
  "一": ["㇀"],
  "丨": ["亅"],
  "丶": ["㇏", "乀"],
  "乛": ["㇇", "㇂", "𠃊", "㇅", "𠃌", "乚", "𠃍", "㇉", "⺄", "𠄎", "𠃋", "𠄌", "㇎", "𠃑", "㇌", "㇋", "㇁", "𡿨", "乙", "〇"]
}

function parseRootsFromText(text: string): Set<string> {
  const roots = new Set<string>()
  let i = 0
  while (i < text.length) {
    if (text[i] === '{') {
      let end = text.indexOf('}', i)
      if (end < 0) end = text.length - 1
      roots.add(text.substring(i, end + 1))
      i = end + 1
    } else if (!/\s/.test(text[i])) {
      const cp = text.codePointAt(i)!
      const c = String.fromCodePoint(cp)
      roots.add(c)
      i += c.length
    } else {
      i++
    }
  }
  return roots
}

export class CharsHijack {
  decomp = new Map<string, string>()
  strokes = new Map<string, string[]>()       // 支持多笔画（大陆/台湾标准）
  freq = new Map<string, number>()
  pinyinList = new Map<string, PinyinInfo[]>() // 支持多音字，按词频降序
  pinyin = new Map<string, string>()          // 保留兼容，存储最高频拼音
  roots = new Set<string>()
  charsets = new Map<string, string[]>()
  private _cache = new Map<string, DecompResult>()

  // 转换引擎
  transformer: IDSTransformer | null = null

  // 命名字根的 IDS 定义 { "{落字框}" => "⿱艹氵" }
  namedRoots = new Map<string, string>()

  // 字根编码 { "一" => { main: "f", sub: "k", supplement: "i" } }
  rootCodes = new Map<string, RootCode>()

  // 取码规则
  codeRules: CodeRuleNode[] = createDefaultCodeRules()

  // 等效字根 { 主字根 -> 等效字根列表 }
  equivalentRoots = new Map<string, string[]>()

  // 配置元信息
  private _meta: UserConfig['meta'] = { version: '1.0' }

  private _pickG(variants: string[]): string | null {
    let universal: string | null = null
    for (let v of variants) {
      v = v.trim()
      if (!v) continue
      const m = v.match(/\[([A-Z]+)\]\s*$/)
      if (m) {
        if (m[1].includes('G')) return v.substring(0, m.index!)
      } else {
        if (universal === null) universal = v
      }
    }
    return universal
  }

  loadSkyIDS(text: string): number {
    let n = 0
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const cols = line.split('\t')
      if (cols.length < 3) continue
      const ch = cols[1]
      const ids = this._pickG(cols.slice(2))
      // 存储所有 IDS，即使 IDS 与字符本身相同（如「乙」）
      // 这样不可拆分的单字也会出现在字符集中
      if (ids) { this.decomp.set(ch, ids); n++ }
    }
    this._cache.clear()
    return n
  }

  loadCustomIDS(text: string): { total: number; overwritten: number } {
    let n = 0, ow = 0
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const cols = line.split('\t')
      if (cols.length < 3) continue
      const ch = cols[1]
      const ids = this._pickG(cols.slice(2))
      if (ids && ids !== ch) {
        if (this.decomp.has(ch)) ow++
        this.decomp.set(ch, ids); n++
      }
    }
    this._cache.clear()
    return { total: n, overwritten: ow }
  }

  loadStrokes(text: string): number {
    let n = 0
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const cols = line.split('\t')
      if (cols.length >= 2) {
        const ch = cols[0]
        const stroke = cols[1]
        // 收集所有笔画编码（保持顺序，大陆标准在前）
        if (!this.strokes.has(ch)) {
          this.strokes.set(ch, [])
        }
        this.strokes.get(ch)!.push(stroke)
        n++
      }
    }
    return n
  }

  loadDict(text: string): number {
    let n = 0
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const cols = line.split('\t')
      if (cols.length >= 3 && [...cols[0]].length === 1) {
        const ch = cols[0]
        const py = cols[1]
        const fq = parseInt(cols[2]) || 0
        
        // 收集所有拼音信息（避免重复）
        if (!this.pinyinList.has(ch)) {
          this.pinyinList.set(ch, [])
        }
        const list = this.pinyinList.get(ch)!
        // 检查是否已存在相同的拼音
        if (!list.some(p => p.py === py)) {
          list.push({ py, freq: fq })
        }
        
        // 更新词频（取最大值）
        if (fq > 0) {
          const existingFq = this.freq.get(ch) || 0
          if (fq > existingFq) {
            this.freq.set(ch, fq)
          }
        }
        n++
      }
    }
    
    // 对每个字的拼音按词频降序排列，并设置最高频拼音到 pinyin（兼容）
    for (const [ch, list] of this.pinyinList) {
      list.sort((a, b) => b.freq - a.freq)
      if (list.length > 0) {
        this.pinyin.set(ch, list[0].py)
      }
    }
    
    return n
  }

  loadCharset(name: string, text: string): number {
    const chars: string[] = []
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const cols = line.split('\t')
      const ch = cols[0]
      if ([...ch].length === 1) chars.push(ch)
    }
    this.charsets.set(name, chars)
    return chars.length
  }

  getCharset(name?: string | null): string[] {
    let chars: string[]
    if (name && this.charsets.has(name)) {
      // 指定字集时，只返回该字集的字符，不添加额外的字根
      chars = [...this.charsets.get(name)!]
    } else {
      // 未指定字集时，返回所有有拆分的字符，并添加字根
      chars = [...this.decomp.keys()]
      // 确保所有字根也在列表中
      for (const root of this.roots) {
        if (!chars.includes(root)) {
          chars.push(root)
        }
      }
      // 确保所有有编码的字根也在列表中
      for (const root of this.rootCodes.keys()) {
        if (!chars.includes(root)) {
          chars.push(root)
        }
      }
    }
    return chars.sort()
  }

  setRoots(input: string | Iterable<string>): number {
    this.roots = typeof input === 'string' ? parseRootsFromText(input) : new Set(input)
    this._cache.clear()
    this._saveRoots()
    return this.roots.size
  }

  addRoots(input: string | Iterable<string>): void {
    const nr = typeof input === 'string' ? parseRootsFromText(input) : new Set(input)
    for (const r of nr) this.roots.add(r)
    this._cache.clear()
    this._saveRoots()
  }

  removeRoots(input: string | Iterable<string>): void {
    const tr = typeof input === 'string' ? parseRootsFromText(input) : new Set(input)
    for (const r of tr) this.roots.delete(r)
    this._cache.clear()
    this._saveRoots()
  }

  atomicComponents(): Set<string> {
    const allLeaves = new Set<string>()
    for (const ids_s of this.decomp.values()) {
      const t = parseIDS(ids_s)
      if (t) for (const l of t.leaves()) allLeaves.add(l)
    }
    return new Set([...allLeaves].filter((c) => !this.decomp.has(c)))
  }

  useAtomicRoots(): Set<string> {
    const a = this.atomicComponents()
    this.roots = a
    this._cache.clear()
    this._saveRoots()
    return a
  }

  loadRootsFromText(text: string): number {
    const roots = new Set<string>()
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      for (const r of parseRootsFromText(line)) roots.add(r)
    }
    return this.setRoots(roots)
  }

  private _saveRoots(): void {
    try { localStorage.setItem(LS_KEY, JSON.stringify([...this.roots])) } catch {}
  }

  loadSavedRoots(): boolean {
    try {
      const data = localStorage.getItem(LS_KEY)
      if (!data) return false
      const arr = JSON.parse(data) as string[]
      if (arr?.length > 0) { this.roots = new Set(arr); this._cache.clear(); return true }
    } catch {}
    return false
  }

  // ============ 转换引擎相关方法 ============

  setTransformer(t: IDSTransformer | null): void {
    this.transformer = t
    this._cache.clear()
    if (t) {
      t.onRulesChange(() => this._cache.clear())
    }
  }

  setNamedRoots(namedRoots: Record<string, string>): void {
    this.namedRoots = new Map(Object.entries(namedRoots))
    // 命名字根也应该加入 roots
    for (const name of this.namedRoots.keys()) {
      this.roots.add(name)
    }
    this._cache.clear()
  }

  setRootCodes(rootCodes: Record<string, string>): void {
    this.rootCodes = parseRootCodes(rootCodes)
  }

  applyConfig(config: UserConfig): void {
    // 保存 meta 信息
    if (config.meta) {
      this._meta = { ...config.meta }
    }

    // 设置命名字根
    if (config.named_roots) {
      this.setNamedRoots(config.named_roots)
    }

    // 设置字根编码
    if (config.roots) {
      this.setRootCodes(config.roots)
      // 同时将字根加入 roots
      for (const root of Object.keys(config.roots)) {
        this.roots.add(root)
      }
    }

    // 设置转换器
    if (config.rules && config.rules.length > 0) {
      const t = new IDSTransformer(config.rules)
      this.setTransformer(t)
      // 将规则中的命名字根自动加入 roots
      const namedRoots = t.getNamedRoots()
      for (const root of namedRoots) {
        this.roots.add(root)
      }
    } else {
      this.setTransformer(null)
    }

    // 设置取码规则
    if (config.code_rules && config.code_rules.length > 0) {
      this.codeRules = config.code_rules
    } else {
      this.codeRules = createDefaultCodeRules()
    }

    // 设置等效字根
    if (config.equivalent_roots) {
      this.equivalentRoots = new Map(Object.entries(config.equivalent_roots))
    }

    // 保存字根到 localStorage（包括转换器生成的命名字根）
    this._saveRoots()
    this._cache.clear()
  }

  getConfig(): UserConfig {
    const rules = this.transformer?.getRules() || []
    const namedRootsObj: Record<string, string> = {}
    for (const [k, v] of this.namedRoots) {
      namedRootsObj[k] = v
    }
    const equivalentRootsObj: Record<string, string[]> = {}
    for (const [k, v] of this.equivalentRoots) {
      equivalentRootsObj[k] = v
    }
    return {
      meta: this._meta,
      roots: rootCodesToRecord(this.rootCodes),
      named_roots: namedRootsObj,
      equivalent_roots: equivalentRootsObj,
      rules,
      code_rules: this.codeRules,
    }
  }

  // 设置取码规则
  setCodeRules(rules: CodeRuleNode[]): void {
    this.codeRules = rules
  }

  // 获取取码规则
  getCodeRules(): CodeRuleNode[] {
    return this.codeRules
  }

  // 清除缓存（当字根或规则变更时调用）
  clearCache(): void {
    this._cache.clear()
  }

  // 获取字的根编码
  getRootCode(root: string): RootCode | undefined {
    return this.rootCodes.get(root)
  }

  // 设置单个字根编码
  setRootCode(root: string, code: string): void {
    const parsed = parseCode(code)
    this.rootCodes.set(root, { root, ...parsed })
    // 同时将字根加入 roots
    this.roots.add(root)
    this._cache.clear()
    this._saveRoots()
  }

  // 获取字的根编码字符串（用于显示）
  getRootCodeString(root: string): string {
    const code = this.rootCodes.get(root)
    if (!code) return ''
    return (code.main || '') + (code.sub || '') + (code.supplement || '')
  }

  // 获取字根的有效编码（考虑等效字根）
  getEffectiveRootCode(root: string): RootCode | undefined {
    // 直接编码优先
    const directCode = this.rootCodes.get(root)
    if (directCode) return directCode
    
    // 检查是否是等效字根
    for (const [mainRoot, equivs] of this.equivalentRoots) {
      if (equivs.includes(root)) {
        return this.rootCodes.get(mainRoot)
      }
    }
    
    return undefined
  }

  // 设置等效字根
  setEquivalentRoots(mainRoot: string, equivalents: string[]): void {
    if (equivalents.length === 0) {
      this.equivalentRoots.delete(mainRoot)
    } else {
      this.equivalentRoots.set(mainRoot, equivalents)
    }
    this._cache.clear()
  }

  // 获取等效字根列表
  getEquivalentRoots(mainRoot: string): string[] {
    return this.equivalentRoots.get(mainRoot) || []
  }

  // 获取所有等效字根（扁平列表）
  getAllEquivalentRoots(): string[] {
    const result: string[] = []
    for (const equivs of this.equivalentRoots.values()) {
      result.push(...equivs)
    }
    return result
  }

  // 检查字根是否是等效字根
  isEquivalentRoot(root: string): boolean {
    for (const equivs of this.equivalentRoots.values()) {
      if (equivs.includes(root)) return true
    }
    return false
  }

  // 获取等效字根的主字根
  getMainRoot(equivalentRoot: string): string | undefined {
    for (const [mainRoot, equivs] of this.equivalentRoots) {
      if (equivs.includes(equivalentRoot)) {
        return mainRoot
      }
    }
    return undefined
  }

  decompose(char: string): DecompResult {
    const cached = this._cache.get(char)
    if (cached) return cached

    // 获取原始 IDS
    let ids = this.decomp.get(char)
    if (!ids) {
      const res: DecompResult = { leaves: [char], ids: char, tree: new IDSNode(char) }
      this._cache.set(char, res)
      return res
    }

    // 应用转换规则（实时计算）
    if (this.transformer) {
      ids = this.transformer.transform(ids)
    }

    const tree = this._buildWithIds(char, ids, new Set())
    const res: DecompResult = { leaves: tree.leaves(), ids: tree.toIDS(), tree }
    this._cache.set(char, res)
    return res
  }

  private _build(char: string, visited: Set<string>): IDSNode {
    if (this.roots.has(char)) return new IDSNode(char)
    if (visited.has(char) || !this.decomp.has(char)) return new IDSNode(char)
    const nv = new Set(visited); nv.add(char)
    const ids = this.decomp.get(char)!

    // 应用转换规则
    let transformedIds = ids
    if (this.transformer) {
      transformedIds = this.transformer.transform(ids)
    }

    const tree = parseIDS(transformedIds)
    if (!tree) return new IDSNode(char)
    return this._expand(tree, nv)
  }

  private _buildWithIds(char: string, ids: string, visited: Set<string>): IDSNode {
    if (this.roots.has(char)) return new IDSNode(char)
    if (visited.has(char)) return new IDSNode(char)
    const nv = new Set(visited); nv.add(char)
    const tree = parseIDS(ids)
    if (!tree) return new IDSNode(char)
    return this._expand(tree, nv)
  }

  private _expand(node: IDSNode, visited: Set<string>): IDSNode {
    if (node.isLeaf()) {
      return !this.roots.has(node.char!) ? this._build(node.char!, visited) : node
    }
    const kids = node.children.map((c) => this._expand(c, visited))
    return new IDSNode(null, node.op, kids)
  }

  buildTree(char: string): IDSNode {
    return this._build(char, new Set())
  }

  decomposeSteps(char: string): StepInfo[] {
    const steps: StepInfo[] = []
    this._steps(char, 0, steps, new Set())
    return steps
  }

  private _steps(char: string, lv: number, out: StepInfo[], vis: Set<string>): void {
    if (vis.has(char) || this.roots.has(char) || !this.decomp.has(char)) return
    const nv = new Set(vis); nv.add(char)
    const ids_s = this.decomp.get(char)!
    const t = parseIDS(ids_s)
    if (!t) return
    const leaves = t.leaves()
    out.push({ lv, char, ids: ids_s, leaves })
    for (const c of leaves) this._steps(c, lv + 1, out, nv)
  }

  strokeCount(ch: string): number {
    // 取第一个笔画编码的长度（大陆标准）
    const arr = this.strokes.get(ch)
    return arr && arr.length > 0 ? arr[0].length : 0
  }

  // 获取所有拼音（按词频降序）
  getPinyinList(ch: string): PinyinInfo[] {
    return this.pinyinList.get(ch) || []
  }

  // 获取所有笔画编码
  getStrokes(ch: string): string[] {
    return this.strokes.get(ch) || []
  }

  findCharsWith(comp: string): string[] {
    const res: string[] = []
    for (const [ch, ids_s] of this.decomp) {
      const t = parseIDS(ids_s)
      if (t && t.leaves().includes(comp)) res.push(ch)
    }
    return res
  }

  findCharsDeep(comp: string): string[] {
    const res: string[] = []
    for (const ch of this.getCharset()) {
      const { leaves } = this.decompose(ch)
      if (leaves.includes(comp)) res.push(ch)
    }
    return res
  }

  coverage(charsetName?: string | null): CoverageResult {
    const target = this.getCharset(charsetName)
    const total = target.length
    let ok = 0
    const bad: string[] = []
    const missing = new Map<string, number>()
    for (const ch of target) {
      const { leaves } = this.decompose(ch)
      if (leaves.every((c) => this.roots.has(c))) {
        ok++
      } else {
        bad.push(ch)
        for (const c of leaves) {
          if (!this.roots.has(c)) missing.set(c, (missing.get(c) || 0) + 1)
        }
      }
    }
    return {
      total, covered: ok, rate: total ? ok / total : 0,
      uncovered: bad,
      missing: [...missing.entries()].sort((a, b) => b[1] - a[1]),
    }
  }

  suggestRoots(minUse = 5, maxStroke: number | null = null): SuggestItem[] {
    const usage = new Map<string, Set<string>>()
    for (const ch of this.getCharset()) {
      this._gather(ch, ch, usage, new Set())
    }
    const out: SuggestItem[] = []
    for (const [comp, chars] of usage) {
      const cnt = chars.size
      if (cnt < minUse) continue
      const sc = this.strokeCount(comp)
      if (maxStroke && sc > 0 && sc > maxStroke) continue
      out.push({ comp, cnt, sc })
    }
    out.sort((a, b) => b.cnt - a.cnt || a.sc - b.sc)
    return out
  }

  private _gather(origin: string, ch: string, usage: Map<string, Set<string>>, vis: Set<string>): void {
    if (vis.has(ch)) return
    const nv = new Set(vis); nv.add(ch)
    if (ch !== origin) {
      if (!usage.has(ch)) usage.set(ch, new Set())
      usage.get(ch)!.add(origin)
    }
    if (this.decomp.has(ch)) {
      const t = parseIDS(this.decomp.get(ch)!)
      if (t) for (const leaf of t.leaves()) this._gather(origin, leaf, usage, nv)
    }
  }

  exportFull(chars?: string[]): string {
    if (!chars) chars = this.getCharset()
    const lines = ['汉字\t拆分结果\t结构式\t笔画数\t拼音\t词频']
    for (const ch of chars) {
      const { leaves, ids } = this.decompose(ch)
      lines.push(`${ch}\t${leaves.join(' ')}\t${ids}\t${this.strokeCount(ch)}\t${this.pinyin.get(ch) || ''}\t${this.freq.has(ch) ? this.freq.get(ch) : ''}`)
    }
    return lines.join('\n')
  }

  exportCompact(chars?: string[]): string {
    if (!chars) chars = this.getCharset()
    const lines: string[] = []
    for (const ch of chars) {
      const { leaves } = this.decompose(ch)
      lines.push(`${ch}\t${leaves.join(' ')}\t${this.freq.has(ch) ? this.freq.get(ch) : ''}`)
    }
    return lines.join('\n')
  }

  exportDetail(chars?: string[]): string {
    if (!chars) chars = this.getCharset()
    const lines: string[] = []
    for (const ch of chars) {
      const { leaves } = this.decompose(ch)
      const py = (this.pinyin.get(ch) || '').replace(/ /g, '_')
      lines.push(`${ch}\t[${leaves.join('')},${py},${unicodeBlock(ch)},${unicodeHex(ch)}]`)
    }
    return lines.join('\n')
  }

  exportRootsText(): string {
    const rs = [...this.roots].sort()
    const normal = rs.filter((r) => !r.startsWith('{'))
    const special = rs.filter((r) => r.startsWith('{'))
    const lines = [`# 字劫 - 字根集 (共 ${rs.length} 个)`]
    const bySC = new Map<number, string[]>()
    for (const r of normal) {
      const sc = this.strokeCount(r)
      if (!bySC.has(sc)) bySC.set(sc, [])
      bySC.get(sc)!.push(r)
    }
    for (const sc of [...bySC.keys()].sort((a, b) => a - b)) {
      lines.push(`# [${sc ? sc + '画' : '未知'}]`)
      lines.push(bySC.get(sc)!.join(''))
    }
    if (special.length) {
      lines.push('# [特殊字根]')
      for (const r of special) lines.push(r)
    }
    return lines.join('\n')
  }
}
