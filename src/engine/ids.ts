export const IDS_OPS: Record<string, number> = {
  '⿰': 2, '⿱': 2, '⿲': 3, '⿳': 3, '⿴': 2, '⿵': 2,
  '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2,
}

export const STRUCT_NAMES: Record<string, string> = {
  '⿰': '左右', '⿱': '上下', '⿲': '左中右', '⿳': '上中下',
  '⿴': '全包围', '⿵': '上三包', '⿶': '下三包', '⿷': '左三包',
  '⿸': '左上包', '⿹': '右上包', '⿺': '左下包', '⿻': '重叠',
}

export class IDSNode {
  char: string | null
  op: string | null
  children: IDSNode[]

  constructor(char: string | null = null, op: string | null = null, children: IDSNode[] = []) {
    this.char = char
    this.op = op
    this.children = children
  }

  isLeaf(): boolean {
    return this.char !== null
  }

  leaves(): string[] {
    if (this.isLeaf()) return [this.char!]
    const out: string[] = []
    for (const c of this.children) out.push(...c.leaves())
    return out
  }

  toIDS(): string {
    if (this.isLeaf()) return this.char!
    return this.op! + this.children.map((c) => c.toIDS()).join('')
  }

  depth(): number {
    if (this.isLeaf()) return 0
    return 1 + Math.max(...this.children.map((c) => c.depth()), 0)
  }
}

export function parseIDS(s: string): IDSNode | null {
  let pos = 0
  function next(): IDSNode | null {
    if (pos >= s.length) return null
    const ch = s[pos]
    if (IDS_OPS[ch] !== undefined) {
      const cnt = IDS_OPS[ch]
      pos++
      const kids: IDSNode[] = []
      for (let i = 0; i < cnt; i++) {
        const nd = next()
        if (nd) kids.push(nd)
      }
      return new IDSNode(null, ch, kids)
    }
    if (ch === '{') {
      let end = s.indexOf('}', pos)
      if (end < 0) end = s.length
      const tok = s.substring(pos, end + 1)
      pos = end + 1
      return new IDSNode(tok)
    }
    const cp = s.codePointAt(pos)!
    const c = String.fromCodePoint(cp)
    pos += c.length
    return new IDSNode(c)
  }
  return next()
}
