/** Tiny, safe markdown → HTML (headings, emphasis, lists, quotes, code, links, tables). Input is escaped first. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s: string) =>
  s.replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');

export function markdownToHtml(md: string): string {
  const lines = esc(md.replace(/\r\n/g, '\n')).split('\n');
  const out: string[] = [];
  let i = 0;
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { closeList(); const buf: string[] = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); out.push(`<pre><code>${buf.join('\n')}</code></pre>`); i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*[-*]\s+/.test(l)) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`); i++; continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`); i++; continue; }
    if (/^&gt;\s?/.test(l)) { closeList(); out.push(`<blockquote>${inline(l.replace(/^&gt;\s?/, ''))}</blockquote>`); i++; continue; }
    if (/^\|/.test(l) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1])) {
      closeList();
      const header = l.split('|').slice(1, -1).map((c) => `<th>${inline(c.trim())}</th>`).join('');
      i += 2; const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(`<tr>${lines[i].split('|').slice(1, -1).map((c) => `<td>${inline(c.trim())}</td>`).join('')}</tr>`); i++; }
      out.push(`<table><thead><tr>${header}</tr></thead><tbody>${rows.join('')}</tbody></table>`); continue;
    }
    if (l.trim() === '') { closeList(); i++; continue; }
    closeList();
    const para: string[] = [l];
    while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !/^(#{1,3}\s|\s*[-*]\s|\s*\d+[.)]\s|&gt;|```|\|)/.test(lines[i + 1])) para.push(lines[++i]);
    out.push(`<p>${inline(para.join('<br/>'))}</p>`); i++;
  }
  closeList();
  return out.join('\n');
}

/** Extracts a YouTube video id from common URL shapes. */
export function youtubeId(url: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url);
  return m ? m[1] : null;
}
