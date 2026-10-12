import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewAgentModal } from "./NewAgentModal";

describe("NewAgentModal", () => {
  it("keeps launch controls without document or HTML worker settings", () => {
    const html = renderToStaticMarkup(
      <NewAgentModal
        project={{
          id: "project-1",
          name: "Project 1",
          folder: "K:\\AI\\Project1",
          createdAt: 1,
        }}
        defaultName="Session 1"
        disabledTools={["claude"]}
        onCancel={() => {}}
        onCreate={() => {}}
      />
    );

    expect(html).toContain("Alt-screen 모드");
    expect(html).not.toContain("문서·HTML 병렬 작업자");
    expect(html).not.toContain("session-worker");
  });
});
