/**
 * BBCode 解析器 — 支持 [b][i][u][s][mask][color][size][url][img] 等语法
 */

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function parseBBCode(text: string): string {
  if (!text) return ''
  let html = escapeHtml(text)
  // 注意：要先处理有属性的标签，再处理无属性的，否则会被通用 .replace 吞掉
  html = html.replace(/\[img\](.*?)\[\/img\]/gi, '<img src="$1" alt="图片" loading="lazy">')
  html = html.replace(/\[url=([^\]]+)\](.*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener">$2</a>')
  html = html.replace(/\[url\](.*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener">$1</a>')
  html = html.replace(/\[color=([#0-9a-fA-F]+)\]/gi, '<span style="color:$1">')
  html = html.replace(/\[\/color\]/gi, '</span>')
  html = html.replace(/\[size=(\d+)\]/gi, '<span style="font-size:$1px">')
  html = html.replace(/\[\/size\]/gi, '</span>')
  html = html.replace(/\[b\]/gi, '<strong>').replace(/\[\/b\]/gi, '</strong>')
  html = html.replace(/\[i\]/gi, '<em>').replace(/\[\/i\]/gi, '</em>')
  html = html.replace(/\[u\]/gi, '<u>').replace(/\[\/u\]/gi, '</u>')
  html = html.replace(/\[s\]/gi, '<del>').replace(/\[\/s\]/gi, '</del>')
  html = html.replace(/\[mask\]/gi, '<span class="bbcode-mask">').replace(/\[\/mask\]/gi, '</span>')
  html = html.replace(/\n/g, '<br>')
  return html
}
