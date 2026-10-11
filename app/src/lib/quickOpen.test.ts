import { describe, expect, it } from "vitest";
import { rankQuickOpenItems, type QuickOpenItem } from "./quickOpen";

const items: QuickOpenItem[] = [
  { id: "p", kind: "project", title: "ProjectA", subtitle: "D:/A", searchText: "" },
  { id: "s", kind: "session", title: "KawaiiPhysics", subtitle: "ProjectA", searchText: "codex" },
  { id: "d", kind: "document", title: "빌드 문서", subtitle: "docs/BUILD.md", searchText: "ProjectA" },
  { id: "c", kind: "command", title: "설정 열기", subtitle: "Ctrl+Comma", searchText: "preferences" },
];

describe("quick open ranking", () => {
  it("searches titles, metadata and Korean text", () => {
    expect(rankQuickOpenItems(items, "kawaii")[0].id).toBe("s");
    expect(rankQuickOpenItems(items, "빌드")[0].id).toBe("d");
  });

  it("supports command and document prefixes", () => {
    expect(rankQuickOpenItems(items, "> 설정").map((item) => item.id)).toEqual(["c"]);
    expect(rankQuickOpenItems(items, "/ build").map((item) => item.id)).toEqual(["d"]);
  });

  it("finds projects and sessions with pasted Windows paths without fuzzy path matches", () => {
    const folder = "G:/AI/01_GameDev/Unreal/PureProject/NiagaraLab";
    const windows = folder.split("/").join("\\");
    const paths: QuickOpenItem[] = [
      { id: "project", kind: "project", title: "FX Lab", subtitle: folder, searchText: "project" },
      { id: "session", kind: "session", title: "Fire effect", subtitle: "FX Lab · Codex", searchText: folder + "/Effects" },
      { id: "unrelated", kind: "project", title: "Backup", subtitle: folder.replace("/AI/", "/AI/Archive/"), searchText: "" },
    ];
    for (const query of [folder, windows, ` "${windows.toLowerCase()}\\" `]) {
      expect(rankQuickOpenItems(paths, query).map(item => item.id)).toEqual(["project", "session"]);
    }
    expect(rankQuickOpenItems(paths, "@ " + windows).map(item => item.id)).toEqual(["session"]);
  });

  it("keeps remote and UNC paths separate from the document shortcut", () => {
    for (const folder of ["/work/remote", "//server/share/project"]) {
      const paths: QuickOpenItem[] = [
        { id: "project", kind: "project", title: "Project", subtitle: folder, searchText: "" },
        { id: "session", kind: "session", title: "Session", subtitle: "Project", searchText: folder },
      ];
      expect(rankQuickOpenItems(paths, folder).map(item => item.id)).toEqual(["project", "session"]);
    }
  });
});
