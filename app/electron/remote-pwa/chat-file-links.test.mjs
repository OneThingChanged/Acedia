import * as links from "./chat-markup.js";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { filesForTurn } from './chat-files.js';

const appScript = fs.readFileSync(fileURLToPath(new URL("./app.js", import.meta.url)), "utf8");

describe("Remote chat file links", () => {
  const agent = { id: "agent-1", projectId: "project-1" };

  it('resolves filename-only results from the same answer to their recorded full path', () => {
    const file = { path:'G:/Unreal/Saved/ToonStyleClaude/video/ToonStylePlus_WithCharacter.mp4', sourceSequence:2 };
    const turn = [{sequence:2,kind:'tool-result'}, {sequence:3,kind:'text'}];
    const files = filesForTurn([file, {path:'G:/Other/ToonStylePlus_WithCharacter.mp4',sourceSequence:1}],turn);
    for (const text of ['`ToonStylePlus_WithCharacter.mp4`','[영상](ToonStylePlus_WithCharacter.mp4)','ToonStylePlus_WithCharacter.mp4']) {
      const html = links.inlineMd(text,agent,files);
      expect(html).toContain(`data-chat-file-path="${file.path}"`);
      expect(html).toContain('data-chat-file-kind="video"');
      expect(html).toContain('ToonStylePlus_WithCharacter.mp4');
    }
    expect(links.mdToHtml('**영상**\n- `ToonStylePlus_WithCharacter.mp4`',agent,files)).toContain(`data-chat-file-path="${file.path}"`);
    expect(links.inlineMd('`ToonStylePlus_WithCharacter.mp4`',agent,filesForTurn([file],[{sequence:4}]))).toContain('data-chat-file-path="ToonStylePlus_WithCharacter.mp4"');
  });

  it('keeps explicit paths and ambiguous, missing or deleted filename references unchanged', () => {
    const files=[{path:'G:/A/demo.mp4'},{path:'G:/B/demo.mp4'}];
    for(const path of ['demo.mp4','./demo.mp4','videos/demo.mp4','G:/Exact/demo.mp4','missing.mp4'])expect(links.resolveChatFileReference(path,files)).toBe(path);
    expect(links.resolveChatFileReference('demo.mp4',[{path:'G:/A/demo.mp4',change:{operation:'delete'}}])).toBe('demo.mp4');
    expect(links.resolveChatFileReference('demo.mp4',[{path:'G:/A/demo.mp4'},{path:'g:\\a\\demo.mp4'}])).toMatch(/^[gG]:/);
    expect(links.resolveChatFileReference('DEMO.MP4',[{path:'G:/A/demo.mp4'}])).toBe('G:/A/demo.mp4');
    expect(links.resolveChatFileReference('demo.mp4',[{path:'https://example.com/demo.mp4'}])).toBe('demo.mp4');
  });

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

  it('links ZIP results in Markdown, code spans, bare paths and encoded file URLs as archives', () => {
    const archive = 'D:/AI/AXWiki/data-dev/webcanvas-integration-review/webcanvas-artax-live-handoff.zip';
    for (const message of [archive, `\`${archive}\``, `[연동 묶음](${archive})`, `(${archive}).`]) {
      const html = links.inlineMd(message, agent);
      expect(html).toContain(`data-chat-file-path="${archive}"`);
      expect(html).toContain('data-chat-file-kind="archive"');
      expect(html.match(/class="chat-file-link/g)).toHaveLength(1);
    }
    expect(links.inlineMd('[공개키 묶음](file:///C:/Users/test/Downloads/webcanvas%20공개키.ZIP)', agent))
      .toContain('data-chat-file-path="C:/Users/test/Downloads/webcanvas 공개키.ZIP"');
    expect(links.inlineMd('`exports/결과.zip`', agent)).toContain('data-chat-file-kind="archive"');
    const windows = 'C:\\Users\\mgr_neo_svr\\Downloads\\webcanvas-artax-public-20261014.zip';
    expect(links.inlineMd(windows, agent)).toContain(`data-chat-file-path="${windows}"`);
    expect(links.inlineMd('/G:/Project/exports/result.zip', agent)).toContain('data-chat-file-path="G:/Project/exports/result.zip"');
    expect(links.inlineMd('https://example.com/result.zip', agent)).toContain('href="https://example.com/result.zip"');
    expect(links.chatFileKind('exports/result.zip.exe')).toBeNull();
    expect(links.inlineMd('exports/result.zip.exe', agent)).not.toContain('data-chat-file-path');
  });

  it('opens complete code extensions and file URLs without truncating a path', () => {
    for (const extension of ['ts', 'tsx', 'cpp', 'hpp', 'css', 'cmake', 'jsonc', 'yaml']) {
      const file = `G:/Project/source/main.${extension}`;
      expect(links.inlineMd(`${file}:42`, agent)).toContain(`data-chat-file-path="${file}"`);
      expect(links.chatFileKind(file)).toBe('text');
    }
    expect(links.cleanChatFilePath('file:///G:/Project/source/with%20space.ts')).toBe('G:/Project/source/with space.ts');
    expect(links.inlineMd('[Source](file:///G:/Project/source/main.ts)', agent)).toContain('data-chat-file-path="G:/Project/source/main.ts"');
    expect(links.chatFileKind('result.exe')).toBeNull();
  });

  it("keeps external image URLs external and does not link without a project", () => {
    const external = links.inlineMd("https://example.com/result.png", agent);
    const noProject = links.inlineMd("docs/README.md", null);

    expect(external).toContain('href="https://example.com/result.png"');
    expect(external).not.toContain("data-chat-file-path");
    expect(noProject).not.toContain("data-chat-file-path");
  });

  it('opens an extensionless Windows result folder from a Markdown link or inline code', () => {
    const folder = 'K:/Assets/Unreal/UnrealAssetFinder/TheFirstDescendant/FBX_Packages/SummerSix-20261007';
    for (const message of [`[결과 폴더](${folder})`, `\`${folder}\``]) {
      const html = links.inlineMd(message, agent);
      expect(html).toContain('data-chat-file-kind="folder"');
      expect(html).toContain(`data-chat-file-path="${folder}"`);
      expect(html).not.toContain(`[결과 폴더](`);
    }
    expect(links.chatFileKind('https://example.com/folder')).toBeNull();
  });

  it('routes local server links through Hosting in Markdown, plain text and code', () => {
    const url = 'http://127.0.0.1:3010/docs/UIMapComparison.html?mode=side&x=1#overlay';
    for (const message of [url, `\`${url}\``, `[항공뷰](${url})`, `(${url}).`]) {
      const html = links.inlineMd(message, { ...agent, name: 'UI' });
      expect(html).toContain('data-chat-hosting-url="http://127.0.0.1:3010/docs/UIMapComparison.html?mode=side&amp;x=1#overlay"');
      expect(html).not.toContain('<a ');
      expect(html).not.toContain('data-chat-file-path');
    }
    expect(links.inlineMd('[UI](http://localhost:3010/)', null)).toContain('data-chat-hosting-url');
    expect(links.localHostingUrl('http://[::1]:3010/page.html')).toBe('http://[::1]:3010/page.html');
  });

  it('never automatically registers external, credentialed or unsupported URLs', () => {
    for (const url of ['http://localhost.example.com:3010/a.html', 'http://192.168.0.1:3010/a.html',
      'http://user:pass@localhost:3010/a.html', 'https://localhost:3010/a.html', 'http://localhost/a.html']) {
      expect(links.localHostingUrl(url)).toBeNull();
      expect(links.inlineMd(`[page](${url})`, agent)).not.toContain('data-chat-hosting-url');
    }
  });

  it("opens HTML links directly through the capability preview", () => {
    const start = appScript.indexOf("async function openChatHtmlDocument");
    const end = appScript.indexOf("async function openChatFilePreview", start);
    const implementation = appScript.slice(start, end);

    expect(implementation).toContain("await openRemoteHtmlPreview(projectId, path, agentId);");
    expect(implementation).not.toContain("selectDocuments(");
  });
});
