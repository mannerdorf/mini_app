/** Minimal markdown → safe HTML for guest blog (no deps). */
export function markdownToSafeHtml(md: string): string {
  const escaped = String(md || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = escaped.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(" ").trim();
    if (text) out.push(`<p>${inlineFormat(text)}</p>`);
    para = [];
  };

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("```")) {
      flushPara();
      closeList();
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        out.push("<pre><code>");
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(`${line}\n`);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    if (/^###\s+/.test(line)) {
      flushPara();
      closeList();
      out.push(`<h3>${inlineFormat(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushPara();
      closeList();
      out.push(`<h2>${inlineFormat(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      flushPara();
      closeList();
      out.push(`<h2>${inlineFormat(line.replace(/^#\s+/, ""))}</h2>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineFormat(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara();
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

function inlineFormat(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
