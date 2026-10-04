import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FileTreePanel } from "../../src/components/FileTreePanel";
import "../../src/App.css";

const projects = window.fixtureProjects;
const bridgeInvoke = window.multiAgentElectron.invoke.bind(window.multiAgentElectron);
let mode = "error";
let releasePending;
window.fixturePending = false;
window.fixtureSetMode = next => { mode = next; };
window.fixtureRelease = () => releasePending?.();
window.multiAgentElectron.invoke = async (command, args) => {
  if (command === "git_changes") {
    if (mode === "error") throw Error("Git 조회 실패 검증: 경로를 확인하고 다시 시도하세요.");
    if (mode === "slow" || mode === "stale-error") {
      const currentMode = mode;
      window.fixturePending = true;
      await new Promise(resolve => { releasePending = resolve; });
      window.fixturePending = false;
      if (currentMode === "stale-error") throw Error("이전 프로젝트의 오래된 오류");
    }
  }
  return bridgeInvoke(command, args);
};
function Harness() {
  const [activeProject, setActiveProject] = useState(projects[0]);
  window.fixtureSelect = index => setActiveProject(projects[index]);
  return <div className="app app-theme-soft" style={{ height: "100vh" }}>
    <FileTreePanel projects={projects} activeProject={activeProject} width={480} theme="soft"
      onOpenFile={() => {}} onOpenGitHistory={() => {}} onClose={() => {}} />
  </div>;
}
createRoot(document.getElementById("root")).render(<Harness />);
