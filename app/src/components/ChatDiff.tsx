import type { ChatDiffLine } from "../platform/ipcContract";

export function ChatDiff({ diff }: { diff: ChatDiffLine[] }) {
  return <div className="chat-diff">{diff.map((line, index) => <div key={index} className={`chat-diff-line ${line.type}`}>
    <span className="chat-diff-gutter">{line.type === "add" ? "+" : line.type === "del" ? "-" : " "}</span>{line.text || " "}
  </div>)}</div>;
}
