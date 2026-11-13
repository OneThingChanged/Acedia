// Shared safe block structure; callers retain their own authorized link renderer.
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function markdownTableCells(line) {
  const source=String(line).trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  const cells=[]; let current='', code=0;
  for(let i=0;i<source.length;i++) {
    const char=source[i];
    if(char==='\\'&&source[i+1]==='|'){current+='|';i++;continue;}
    if(char==='`'){let n=1;while(source[i+n]==='`')n++;if(!code)code=n;else if(code===n)code=0;current+=source.slice(i,i+n);i+=n-1;continue;}
    if(char==='|'&&!code){cells.push(current.trim());current='';}else current+=char;
  }
  cells.push(current.trim()); return cells;
}
function isMarkdownTableDivider(line){const cells=markdownTableCells(line);return cells.length>0&&cells.every(cell=>/^:?-{3,}:?$/.test(cell));}

export function renderMarkdownBlocks(value, inline, { copyLabel = 'Copy' } = {}) {
  const lines = String(value ?? "").split(/\r?\n/);
  const output = [];
  let listType = null;
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };
  const startsBlock = (index) => {
    const line = lines[index] || "";
    const next = lines[index + 1] || "";
    return !line.trim()
      || /^(```|~~~)/.test(line.trim())
      || /^(#{1,6})\s+/.test(line)
      || /^\s*([-*+]|\d+\.)\s+/.test(line)
      || /^\s*>\s?/.test(line)
      || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
      || (line.includes("|") && isMarkdownTableDivider(next));
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^(```|~~~)\s*([^\s]*)/);
    if (fence) {
      closeList();
      const marker = fence[1];
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(marker)) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[2] ? ` data-language="${escapeHtml(fence[2])}"` : "";
      output.push(`<div class="markdown-code-block"><div class="markdown-code-head"><span>${escapeHtml(fence[2] || "Code")}</span><button type="button" data-markdown-copy>${escapeHtml(copyLabel)}</button></div><pre><code${language}>${escapeHtml(code.join("\n"))}</code></pre></div>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList();
      output.push("<hr>");
      index += 1;
      continue;
    }

    if (line.includes("|") && isMarkdownTableDivider(lines[index + 1] || "")) {
      closeList();
      const headers = markdownTableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(markdownTableCells(lines[index]));
        index += 1;
      }
      output.push('<div class="markdown-table-scroll"><table><thead><tr>');
      for (const header of headers) output.push(`<th>${inline(header)}</th>`);
      output.push("</tr></thead><tbody>");
      for (const row of rows) {
        output.push("<tr>");
        for (let cellIndex = 0; cellIndex < headers.length; cellIndex += 1) {
          output.push(`<td>${inline(row[cellIndex] || "")}</td>`);
        }
        output.push("</tr>");
      }
      output.push("</tbody></table></div>");
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (unordered || ordered) {
      const nextListType = unordered ? "ul" : "ol";
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
        output.push(`<${listType}>`);
      }
      let item = (unordered || ordered)[1];
      const task = item.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        item = `<input type="checkbox" disabled${task[1].toLowerCase() === "x" ? " checked" : ""}> ${inline(task[2])}`;
      } else {
        item = inline(item);
      }
      output.push(`<li>${item}</li>`);
      index += 1;
      continue;
    }

    closeList();
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      output.push(`<blockquote>${quote.map(inline).join("<br>")}</blockquote>`);
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && !startsBlock(index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  closeList();
  return output.join("");
}
