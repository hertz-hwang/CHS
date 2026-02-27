import { IDSNode, parseIDS } from './ids'
import { unicodeBlock, unicodeHex } from './unicode'

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

const LS_KEY = 'chars_hijack_roots'

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
  strokes = new Map<string, string>()
  freq = new Map<string, number>()
  pinyin = new Map<string, string>()
  roots = new Set<string>()
  charsets = new Map<string, string[]>()
  private _cache = new Map<string, DecompResult>()

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
      if (ids && ids !== ch) { this.decomp.set(ch, ids); n++ }
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
      if (cols.length >= 2) { this.strokes.set(cols[0], cols[1]); n++ }
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
        this.pinyin.set(ch, cols[1])
        const fq = parseInt(cols[2])
        if (!isNaN(fq)) this.freq.set(ch, fq)
        n++
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
    if (name && this.charsets.has(name)) return this.charsets.get(name)!
    return [...this.decomp.keys()].sort()
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

  decompose(char: string): DecompResult {
    const cached = this._cache.get(char)
    if (cached) return cached
    const tree = this._build(char, new Set())
    const res: DecompResult = { leaves: tree.leaves(), ids: tree.toIDS(), tree }
    this._cache.set(char, res)
    return res
  }

  private _build(char: string, visited: Set<string>): IDSNode {
    if (this.roots.has(char)) return new IDSNode(char)
    if (visited.has(char) || !this.decomp.has(char)) return new IDSNode(char)
    const nv = new Set(visited); nv.add(char)
    const tree = parseIDS(this.decomp.get(char)!)
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
    return (this.strokes.get(ch) || '').length
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
