import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewProjectModal } from "./NewProjectModal";

describe("NewProjectModal", () => {
  it("requires an explicit first-session tool instead of preselecting Claude", () => {
    const html = renderToStaticMarkup(
      <NewProjectModal
        defaultName="Project 1"
        disabledTools={[]}
        onCancel={() => {}}
        onCreate={() => {}}
      />
    );

    expect(html).toContain("첫 세션 도구");
    expect(html).toContain("도구 선택");
    expect(html).toContain('<option value="" disabled="" selected="">');
    expect(html).toContain('value="claude"');
    expect(html).toContain('value="codex"');
    expect(html).not.toContain("Dangerous 모드");
    expect(html).toContain("<button class=\"btn-primary\" disabled=\"\">");
  });

  it("omits tools disabled in Settings while keeping Shell available", () => {
    const html = renderToStaticMarkup(
      <NewProjectModal
        defaultName="Project 1"
        disabledTools={["claude", "qwen"]}
        onCancel={() => {}}
        onCreate={() => {}}
      />
    );

    expect(html).not.toContain('value="claude"');
    expect(html).not.toContain('value="qwen"');
    expect(html).toContain('value="codex"');
    expect(html).toContain('value="none"');
  });
});
