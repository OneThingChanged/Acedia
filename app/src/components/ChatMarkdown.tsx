import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { isValidElement, type ReactNode } from "react";
import { useAppLanguage } from "../lib/appLanguage";
import { ChatCopyButton } from "./ChatCopyButton";

function codeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(codeText).join("");
  return isValidElement<{ children?: ReactNode }>(node) ? codeText(node.props.children) : "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const { text } = useAppLanguage();
  const className = isValidElement<{ className?: string }>(children) ? children.props.className : "";
  const language = /(?:^|\s)language-([^\s]+)/.exec(className || "")?.[1];
  return <div className="chat-codeblock">
    <div className="chat-codeblock-head"><span>{language || text("코드", "Code")}</span><ChatCopyButton value={codeText(children).replace(/\n$/, "")} label={text("코드 복사", "Copy code")} /></div>
    <pre>{children}</pre>
  </div>;
}

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
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
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
