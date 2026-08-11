/**
 * 字体族名解析器 — 支持 TTF/OTF/WOFF/WOFF2
 * 移植自原 HTML 练习器，用于从二进制字体文件中提取 font-family
 */

function readUint16(dv: DataView, off: number): number {
  return dv.getUint16(off, false)
}

function readUint32(dv: DataView, off: number): number {
  return dv.getUint32(off, false)
}

function basename(filename: string): string {
  const m = filename.match(/^(.+?)(\.[^.]+)?$/)
  return m ? m[1] : filename
}

/** 解析 TTF/OTF 字体文件的 name 表，得到字体族名 */
function parseTtfFamily(bytes: Uint8Array): string | null {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const numTables = readUint16(dv, 4)
    let nameOff = -1
    for (let i = 0; i < numTables; i++) {
      const bo = 12 + i * 16
      const tag = String.fromCharCode(dv.getUint8(bo), dv.getUint8(bo + 1), dv.getUint8(bo + 2), dv.getUint8(bo + 3))
      if (tag === 'name') { nameOff = readUint32(dv, bo + 8); break }
    }
    if (nameOff < 0) return null
    const fmt = readUint16(dv, nameOff)
    if (fmt !== 0) return null
    const count = readUint16(dv, nameOff + 2)
    const strOff = readUint16(dv, nameOff + 4)
    const records: Array<{
      nameID: number; platformID: number; encodingID: number; languageID: number
      length: number; offset: number
    }> = []
    for (let i = 0; i < count; i++) {
      const ro = nameOff + 6 + i * 12
      const platformID = readUint16(dv, ro)
      const encodingID = readUint16(dv, ro + 2)
      const languageID = readUint16(dv, ro + 4)
      const nameID = readUint16(dv, ro + 6)
      if (nameID === 1 || nameID === 16 || nameID === 4) {
        records.push({
          nameID, platformID, encodingID, languageID,
          length: readUint16(dv, ro + 8), offset: readUint16(dv, ro + 10)
        })
      }
    }
    records.sort((a, b) => {
      const aid = (a.nameID === 16 ? 0 : a.nameID === 1 ? 1 : 2)
      const bid = (b.nameID === 16 ? 0 : b.nameID === 1 ? 1 : 2)
      if (aid !== bid) return aid - bid
      const ap = (a.platformID === 3 ? 0 : a.platformID === 0 ? 1 : 2)
      const bp = (b.platformID === 3 ? 0 : b.platformID === 0 ? 1 : 2)
      if (ap !== bp) return ap - bp
      const al = a.languageID === 2052 ? 0 : a.languageID === 1033 ? 1 : 2
      const bl = b.languageID === 2052 ? 0 : b.languageID === 1033 ? 1 : 2
      return al - bl
    })
    for (const rec of records) {
      if (rec.platformID === 1) continue // Mac Roman 跳过
      const start = nameOff + strOff + rec.offset
      if (start + rec.length > bytes.byteOffset + bytes.byteLength) continue
      let name: string
      if (rec.platformID === 0 && rec.encodingID === 6) {
        name = new TextDecoder('utf-8').decode(bytes.slice(start, start + rec.length)).replace(/\0/g, '').trim()
      } else {
        name = new TextDecoder('utf-16be').decode(bytes.slice(start, start + rec.length)).replace(/\0/g, '').trim()
      }
      if (name && name.length > 0) return name
    }
    return null
  } catch (e) {
    console.warn('parseTtfFamily error:', e)
    return null
  }
}

/** 使用 DecompressionStream('deflate-raw') 解压 */
async function inflateRaw(buf: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()
  // 复制到新 ArrayBuffer-backed Uint8Array，避开 SharedArrayBuffer 类型不匹配
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
  for (const c of chunks) total += c.length
  const merged = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { merged.set(c, pos); pos += c.length }
  return merged
}

/** 根据格式分发解析 */
export async function parseFontFamily(
  buffer: ArrayBuffer,
  format: string,
  filename: string
): Promise<string> {
  const arr = new Uint8Array(buffer)
  if (format === 'woff') {
    try {
      if (arr.length < 44) throw new Error('woff too short')
      const dv = new DataView(buffer, 0, 44)
      const signature = String.fromCharCode(arr[0], arr[1], arr[2], arr[3])
      if (signature !== 'wOFF') throw new Error('not woff')
      const numTables = dv.getUint16(12, false)
      let nameTableOff = -1, nameCompLen = -1, nameOrigLen = -1
      for (let i = 0; i < numTables; i++) {
        const bo = 44 + i * 20
        const tag = String.fromCharCode(arr[bo], arr[bo + 1], arr[bo + 2], arr[bo + 3])
        if (tag === 'name') {
          nameTableOff = dv.getUint32(bo + 4, false)
          nameCompLen = dv.getUint32(bo + 8, false)
          nameOrigLen = dv.getUint32(bo + 12, false)
          break
        }
      }
      if (nameTableOff < 0) return parseTtfFamily(arr) || basename(filename)
      const compData = new Uint8Array(buffer, nameTableOff, nameCompLen)
      if (nameCompLen === nameOrigLen) {
        return parseTtfFamily(compData) || basename(filename)
      }
      const decompressed = await inflateRaw(compData)
      return parseTtfFamily(decompressed) || basename(filename)
    } catch (e) {
      return basename(filename)
    }
  }
  if (format === 'woff2') {
    try {
      // WOFF2：跳过 4 字节签名后整体 Brotli / deflate-raw 解压
      const decompressed = await inflateRaw(arr.slice(4))
      return parseTtfFamily(decompressed) || basename(filename)
    } catch (e) {
      return basename(filename)
    }
  }
  // TTF/OTF
  const family = parseTtfFamily(arr)
  return family || basename(filename)
}
