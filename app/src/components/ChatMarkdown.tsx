import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { isValidElement, type ReactNode } from "react";
import { useAppLanguage } from "../lib/appLanguage";
import { ChatCopyButton } from "./ChatCopyButton";
import { ChatImage, ChatImageLinkContext } from "./ChatImage";
import { chatPathMatches, isChatImagePath, isChatLocalPath, normalizeChatPath } from "../lib/chatPaths";

export { isChatLocalPath } from "../lib/chatPaths";

type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] };
function remarkChatPaths() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (["code", "inlineCode", "link", "image"].includes(node.type) || !node.children) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== "text" || !child.value) { visit(child); return [child]; }
        const matches = chatPathMatches(child.value);
        if (!matches.length) return [child];
        const result: MarkdownNode[] = [];
        let offset = 0;
        for (const match of matches) {
          if (match.start > offset) result.push({ type: "text", value: child.value.slice(offset, match.start) });
          result.push({ type: "link", url: encodeURI(match.path).replace(/#/g, "%23"), children: [{ type: "text", value: match.path }] });
          offset = match.end;
        }
        if (offset < child.value.length) result.push({ type: "text", value: child.value.slice(offset) });
        return result;
      });
    };
    visit(tree);
  };
}

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

export function ChatMarkdown({ children, onOpenPath, folder }: { children: string; folder?: string; onOpenPath?: (path: string) => void }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkChatPaths]} rehypePlugins={[rehypeHighlight]}
    urlTransform={(url, key) => isChatLocalPath(normalizeChatPath(url, true)) || (key === "src" && /^data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml|x-icon|avif);base64,[a-z\d+/=]+$/i.test(url)) ? url : defaultUrlTransform(url)}
    components={{
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      a: ({ href, children, node }) => {
        const target = normalizeChatPath(href || "", true);
        const local = isChatLocalPath(target);
        const link = local && onOpenPath
          ? <a href={href} className="chat-path-link" title={target} onClick={event => { event.preventDefault(); onOpenPath(target); }}>{children}</a>
          : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        const hasImage = node?.children.some(child => child.type === "element" && child.tagName === "img");
        return <span className={local && isChatImagePath(target) ? "chat-image-link" : undefined}>
          <ChatImageLinkContext.Provider value>{link}</ChatImageLinkContext.Provider>
          {local && isChatImagePath(target) && !hasImage && <ChatImage path={target} folder={folder} onOpenPath={onOpenPath} />}
        </span>;
      },
      img: ({ src, alt }) => {
        if (!src) return <span className="chat-image-placeholder">{alt}</span>;
        const target = normalizeChatPath(src, true);
        return isChatLocalPath(target) ? <ChatImage path={target} alt={alt} folder={folder} onOpenPath={onOpenPath} />
          : <ChatImage dataUrl={src.startsWith("data:") ? src : undefined} url={src.startsWith("data:") ? undefined : src} alt={alt} />;
      },
      code: ({ children, className }) => {
        const path = String(children).trim();
        return !className && !String(children).includes('\n') && isChatLocalPath(path) && onOpenPath
          ? <span className={isChatImagePath(path) ? "chat-image-link" : undefined}><button type="button" className="chat-path-link chat-path-code" title={path} onClick={() => onOpenPath(normalizeChatPath(path))}><code>{children}</code></button>{isChatImagePath(path) && <ChatImage path={normalizeChatPath(path)} folder={folder} onOpenPath={onOpenPath} />}</span>
          : <code className={className}>{children}</code>;
      },
    }}>{children}</ReactMarkdown>;
}
