import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export function isChatLocalPath(value: string) {
  const path = value.trim();
  if (!path || /[\r\n]/.test(path) || /^(?:https?:|mailto:|#)/i.test(path)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^(?:\/?[a-z]:[\\/]|file:\/\/)/i.test(path)) return false;
  return /^(?:\/?[a-z]:[\\/]|file:\/\/|\/[^/])/i.test(path)
    || /^(?:\.{1,2}[\\/])?[^<>|*?]+[\\/]$/.test(path)
    || /^[^<>|*?]+\.(?:png|jpe?g|gif|webp|bmp|svg|ico|md|markdown|html?|json|pdf|fbx|txt|csv|zip)(?::\d+(?::\d+)?)?$/i.test(path);
}

export function ChatMarkdown({ children, onOpenPath }: { children: string; onOpenPath?: (path: string) => void }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}
    urlTransform={url => isChatLocalPath(url) ? url : defaultUrlTransform(url)}
    components={{
      a: ({ href, children }) => isChatLocalPath(href || "") && onOpenPath
        ? <button type="button" className="chat-path-link" title={href} onClick={() => onOpenPath(href!)}>{children}</button>
        : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      code: ({ children, className }) => {
        const path = String(children).trim();
        return !className && !String(children).includes('\n') && isChatLocalPath(path) && onOpenPath
          ? <button type="button" className="chat-path-link chat-path-code" title={path} onClick={() => onOpenPath(path)}><code>{children}</code></button>
          : <code className={className}>{children}</code>;
      },
    }}>{children}</ReactMarkdown>;
}
