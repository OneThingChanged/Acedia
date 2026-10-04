import { execFile } from "node:child_process";
import fs from "node:fs";
import { gitWorktreeRoot, resolveGitExecutable } from "./git-runtime.mjs";

export const GIT_COMMAND_TIMEOUT_MS = 30_000;

export function describeGitCommandFailure(error, stderr, timeout) {
  const detail = String(stderr || error?.message || "Git 명령을 실행하지 못했습니다.").trim();
  if (error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return { code: "GIT_OUTPUT_TOO_LARGE", message: "Git 조회 결과가 너무 큽니다. 하위 저장소를 선택해서 다시 조회하세요." };
  }
  const timedOut =
    Boolean(error?.killed) ||
    error?.code === "ETIMEDOUT" ||
    error?.signal === "SIGTERM";
  if (timedOut) {
    return {
      code: "GIT_TIMEOUT",
      message: `Git 상태 조회가 ${Math.round(timeout / 1000)}초를 초과했습니다. 잠시 후 새로고침해 주세요.`,
    };
  }
  if (error?.code === "ENOENT") {
    return {
      code: "GIT_NOT_FOUND",
      message: "Git 실행 파일을 찾을 수 없습니다. Git 설치 경로와 Acedia의 내장 Git을 확인하세요.",
    };
  }
  if (/fatal: not a git repository\b/i.test(detail)) return { code: "GIT_NOT_REPOSITORY", message: detail };
  if (/detected dubious ownership|unsafe repository/i.test(detail)) return { code: "GIT_UNSAFE_REPOSITORY", message: detail };
  if (/filename too long/i.test(detail)) return { code: "GIT_PATH_TOO_LONG", message: detail };
  return {
    code: "GIT_FAILED",
    message: detail,
  };
}

export async function runGit(root, args, timeout = GIT_COMMAND_TIMEOUT_MS) {
  const executable = resolveGitExecutable();
  if (!executable) {
    const failure = describeGitCommandFailure({ code: "ENOENT" }, "", timeout);
    throw Object.assign(new Error(failure.message), { code: failure.code });
  }
  const cwd = fs.realpathSync(root);
  const repository = gitWorktreeRoot(cwd) || cwd;
  // Trust only the selected worktree for this invocation. Do not change the
  // user's global configuration or permit arbitrary repositories with '*'.
  const configuration = ["-c", "core.quotepath=false", "-c", "safe.directory=", "-c", `safe.directory=${repository.replaceAll("\\", "/")}`];
  if (process.platform === "win32") configuration.push("-c", "core.longpaths=true");
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...configuration, ...args],
      { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        const failure = describeGitCommandFailure(error, stderr, timeout);
        const wrapped = new Error(failure.message, { cause: error });
        wrapped.code = failure.code;
        reject(wrapped);
      }
    );
  });
}

export async function isGitRepository(root) {
  try {
    const result = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
    return result.trim() === "true";
  } catch (error) {
    if (error?.code === "GIT_NOT_REPOSITORY" && !gitWorktreeRoot(root)) return false;
    throw error;
  }
}
