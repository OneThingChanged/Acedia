import * as links from "./chat-markup.js";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appScript = fs.readFileSync(fileURLToPath(new URL("./app.js", import.meta.url)), "utf8");

describe("Remote chat file links", () => {
  const agent = { id: "agent-1", projectId: "project-1" };

  it("links plain, code-formatted, and Markdown-linked project files", () => {
    const html = links.inlineMd([
      "docs/README.md",
      "`images/result.png`",
      "[상세 문서](docs/guide.markdown)",
      "[HTML 결과](reports/result.html)",
    ].join("\n"), agent);

    expect(html).toContain('data-chat-file-path="docs/README.md"');
    expect(html).toContain('data-chat-file-kind="markdown"');
    expect(html).toContain('data-chat-file-path="images/result.png"');
    expect(html).toContain('data-chat-file-kind="image"');
    expect(html).toContain('data-chat-file-agent="agent-1"');
    expect(html).toContain('data-chat-file-path="reports/result.html"');
    expect(html).toContain('data-chat-file-kind="html"');
    expect(html).toContain(">상세 문서</button>");
    expect(html.match(/class="chat-file-link/g)).toHaveLength(4);
  });

  it("normalizes terminal line suffixes and preserves Windows paths", () => {
    expect(links.cleanChatFilePath("C:\\Project\\docs\\README.md:72:4"))
      .toBe("C:\\Project\\docs\\README.md");
    expect(links.chatFileKind("C:\\Project\\shots\\result.webp")).toBe("image");
    expect(links.chatFileKind("reports/result.htm")).toBe("html");
    expect(links.cleanChatFilePath("/G:/Project/docs/report.html"))
      .toBe("G:/Project/docs/report.html");
    expect(links.isAbsoluteChatFilePath("/G:/Project/docs/report.html")).toBe(true);
    expect(links.inlineMd("/G:/Project/docs/report.html", agent))
      .toContain('data-chat-file-path="G:/Project/docs/report.html"');
    expect(links.inlineMd("(K:/Project/UProject1/Saved/EndfieldWuling/placement-report.json)", agent))
      .toContain('data-chat-file-path="K:/Project/UProject1/Saved/EndfieldWuling/placement-report.json"');
    expect(links.chatFileKind("K:/Project/UProject1/Saved/EndfieldWuling/placement-report.json")).toBe("text");
  });

  it("keeps external image URLs external and does not link without a project", () => {
    const external = links.inlineMd("https://example.com/result.png", agent);
    const noProject = links.inlineMd("docs/README.md", null);

    expect(external).toContain('href="https://example.com/result.png"');
    expect(external).not.toContain("data-chat-file-path");
    expect(noProject).not.toContain("data-chat-file-path");
  });

  it("opens HTML links directly through the capability preview", () => {
    const start = appScript.indexOf("async function openChatHtmlDocument");
    const end = appScript.indexOf("async function openChatFilePreview", start);
    const implementation = appScript.slice(start, end);

    expect(implementation).toContain("await openRemoteHtmlPreview(projectId, path, agentId);");
    expect(implementation).not.toContain("selectDocuments(");
  });
});
