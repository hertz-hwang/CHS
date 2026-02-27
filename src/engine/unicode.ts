export const UNICODE_BLOCKS: [number, number, string][] = [
  [0x2e80, 0x2ef3, '部首補充'],
  [0x2f00, 0x2fd5, '康熙部首'],
  [0x2ff0, 0x2fff, '汉字结构'],
  [0x3007, 0x31e5, '汉字笔画'],
  [0x3105, 0x312f, '注音符号'],
  [0x31a0, 0x31bf, '注音扩展'],
  [0x337b, 0x337f, '兼容字符'],
  [0x3400, 0x4dbf, 'CJK-A'],
  [0x4e00, 0x9fff, 'CJK'],
  [0xf900, 0xfad9, '兼容文字'],
  [0x16ff2, 0x16ff3, '儿化小字'],
  [0x17000, 0x187f7, '西夏文'],
  [0x18800, 0x18aff, '西夏文部件'],
  [0x18b00, 0x18cd5, '契丹小字'],
  [0x18cff, 0x18cff, '契丹小字'],
  [0x18d00, 0x18d1e, '西夏文补充'],
  [0x20000, 0x2a6df, 'CJK-B'],
  [0x2a700, 0x2b73f, 'CJK-C'],
  [0x2b740, 0x2b81d, 'CJK-D'],
  [0x2b820, 0x2cead, 'CJK-E'],
  [0x2ceb0, 0x2ebe0, 'CJK-F'],
  [0x2ebf0, 0x2ee5d, 'CJK-I'],
  [0x2f800, 0x2fa1d, '兼容補充'],
  [0x30000, 0x3134a, 'CJK-G'],
  [0x31350, 0x323af, 'CJK-H'],
  [0x323b0, 0x33479, 'CJK-J'],
]

export function unicodeBlock(ch: string): string {
  if (ch.startsWith('{')) return '特殊'
  const cp = ch.codePointAt(0) ?? 0
  for (const [s, e, name] of UNICODE_BLOCKS) {
    if (cp >= s && cp <= e) return name
  }
  return '其他'
}

export function unicodeHex(ch: string): string {
  if (ch.startsWith('{')) return ch
  const cp = ch.codePointAt(0) ?? 0
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')
}
