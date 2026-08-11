/**
 * 轻量级 ZIP 文件解析器 — 手工遍历本地文件头（local file header）
 * 不依赖第三方库
 */

export interface ZipEntry {
  name: string
  data: ArrayBuffer
  method: number  // 0 = stored, 8 = deflate
}

async function inflateRaw(buf: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()
  // 复制到 ArrayBuffer-backed Uint8Array 避开 SharedArrayBuffer 类型不匹配
  const copy = new Uint8Array(buf.byteLength)
  copy.set(buf)
  writer.write(copy)
  writer.close()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  let total = 0
  for (const c of chunks) total += c.byteLength
  const merged = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { merged.set(new Uint8Array(c), pos); pos += c.byteLength }
  return merged
}

function decodeName(buf: ArrayBuffer, off: number, nameLen: number, flags: number): string {
  const bytes = new Uint8Array(buf, off, nameLen)
  if (flags & 0x0800) {
    // UTF-8 flag set
    try { return new TextDecoder('utf-8').decode(bytes) } catch { return '' }
  }
  // 尝试 UTF-8 (严格)，失败则 GBK，再不行 GB18030
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder('gbk').decode(bytes)
    } catch {
      try {
        return new TextDecoder('gb18030').decode(bytes)
      } catch {
        return new TextDecoder('utf-8').decode(bytes)
      }
    }
  }
}

/** 解析 ZIP 文件，返回 entries 数组 */
export async function parseZip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const v = new DataView(buffer, 0, buffer.byteLength)
  const entries: ZipEntry[] = []
  let off = 0
  while (off + 30 <= buffer.byteLength && v.getUint32(off, true) === 0x04034b50) {
    const flags = v.getUint16(off + 6, true)
    const method = v.getUint16(off + 8, true)
    const compSize = v.getUint32(off + 18, true)
    const nameLen = v.getUint16(off + 26, true)
    const extraLen = v.getUint16(off + 28, true)
    const name = decodeName(buffer, off + 30, nameLen, flags)
    const dataOff = off + 30 + nameLen + extraLen
    if (name.endsWith('/')) {
      // 目录条目跳过
      off = dataOff + compSize
      continue
    }
    const raw = new Uint8Array(buffer, dataOff, compSize)
    let data: ArrayBuffer
    if (method === 0) {
      // 拷贝到新的 ArrayBuffer，确保不是 SharedArrayBuffer
      data = new ArrayBuffer(compSize)
      new Uint8Array(data).set(raw)
    } else if (method === 8) {
      const decompressed = await inflateRaw(raw)
      // 确保返回 ArrayBuffer（可能底层是 SharedArrayBuffer）
      data = new ArrayBuffer(decompressed.byteLength)
      new Uint8Array(data).set(decompressed)
    } else {
      // 不支持的压缩方法，跳过
      off = dataOff + compSize
      continue
    }
    entries.push({ name, data, method })
    off = dataOff + compSize
  }
  return entries
}

/** 用 TextDecoder 解码 ZIP 内的文本文件 */
export function decodeText(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder('gbk').decode(bytes)
    } catch {
      return new TextDecoder().decode(bytes)
    }
  }
}
