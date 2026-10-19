import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runGit, isGitRepository } from './git-command.mjs';
import { parseGitStatusZ } from './git-changes.mjs';
import { taskPath } from './task-orchestration.mjs';

// Observe changes without resetting/staging any pre-existing work. This is a
// cooperative shared-workspace audit, not per-process filesystem attribution.
export async function taskFileSnapshot(folder) {
  try {
    if (!await isGitRepository(folder)) return { available: false, reason: 'Git 저장소가 아니므로 작업자 보고 범위만 검토합니다.' };
    const status = parseGitStatusZ(await runGit(folder, ['status', '--porcelain', '-z', '--untracked-files=all']));
    const paths = [...new Set([...status.staged, ...status.unstaged].map(f => f.relative_path))];
    if (paths.length >= 2000) return { available: false, reason: '변경 파일 2,000개 한도: 별도 검토 필요' };
    const files = {};
    for (const relative of paths) {
      const file = taskPath(folder, relative);
      try {
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink()) { files[relative] = 'symlink:' + await fs.readlink(file); continue; }
        files[relative] = stat.isFile() && stat.size <= 2 * 1024 * 1024
          ? createHash('sha256').update(await fs.readFile(file)).digest('hex')
          : `metadata:${stat.size}:${stat.mtimeMs}`;
      } catch (error) { if (error.code === 'ENOENT') files[relative] = 'deleted'; else throw error; }
    }
    return { available: true, files };
  } catch { return { available: false, reason: '작업 폴더의 Git 변경 확인 실패: 별도 검토 필요' }; }
}
