import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
  detached: boolean;
}

/**
 * Check if we're inside a git repository
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root directory of the git repository
 */
export async function getGitRoot(): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel']);
  return stdout.trim();
}

/**
 * Check if a branch exists locally
 */
export async function branchExists(branchName: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', branchName]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a branch exists on remote
 */
export async function remoteBranchExists(branchName: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '-r']);
    const remoteBranches = stdout.split('\n').map(b => b.trim());
    return remoteBranches.some(b =>
      b === `origin/${branchName}` || b.endsWith(`/${branchName}`)
    );
  } catch {
    return false;
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout.trim();
  } catch {
    return 'HEAD';
  }
}

/**
 * Get the default branch (main or master)
 */
export async function getDefaultBranch(): Promise<string> {
  try {
    // Try to get the default branch from remote
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD']);
    return stdout.trim().replace('refs/remotes/origin/', '');
  } catch {
    // Fallback: check if main or master exists
    if (await branchExists('main')) return 'main';
    if (await branchExists('master')) return 'master';
    return 'main'; // Default fallback
  }
}

/**
 * Create a worktree at the specified path for the given branch
 * @param startPoint - Optional branch/commit to create the new branch from
 */
export async function createWorktree(worktreePath: string, branchName: string, startPoint?: string): Promise<void> {
  validateBranchName(branchName);

  const exists = await branchExists(branchName);

  if (exists) {
    await execFileAsync('git', ['worktree', 'add', '--', worktreePath, branchName]);
  } else if (startPoint) {
    await execFileAsync('git', ['worktree', 'add', '-b', branchName, '--', worktreePath, startPoint]);
  } else {
    await execFileAsync('git', ['worktree', 'add', '-b', branchName, '--', worktreePath]);
  }
}

/**
 * List all worktrees
 */
export async function listWorktrees(): Promise<WorktreeInfo[]> {
  const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain']);

  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        worktrees.push(current as WorktreeInfo);
      }
      current = {
        path: line.substring(9),
        bare: false,
        detached: false
      };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring(7).replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    }
  }

  // Don't forget the last one
  if (current.path) {
    worktrees.push(current as WorktreeInfo);
  }

  return worktrees;
}

/**
 * Remove a worktree
 */
export async function removeWorktree(worktreePath: string, force: boolean = false): Promise<void> {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(worktreePath);

  await execFileAsync('git', args);
}

/**
 * Prune stale worktree references
 */
export async function pruneWorktrees(): Promise<void> {
  await execFileAsync('git', ['worktree', 'prune']);
}

/**
 * Check if a branch has been merged into the default branch
 */
export async function isBranchMerged(branchName: string): Promise<boolean> {
  try {
    const defaultBranch = await getDefaultBranch();
    const { stdout } = await execFileAsync('git', ['branch', '--merged', defaultBranch]);
    const mergedBranches = stdout.split('\n').map(b => b.trim().replace('* ', ''));
    return mergedBranches.includes(branchName);
  } catch {
    return false;
  }
}

/**
 * Validate branch name for security
 */
export function validateBranchName(branchName: string): void {
  if (!branchName || branchName.trim() === '') {
    throw new Error('Branch name cannot be empty');
  }
  if (branchName.startsWith('-')) {
    throw new Error('Branch name cannot start with -');
  }
  if (branchName.includes('..')) {
    throw new Error('Branch name cannot contain ..');
  }
  if (branchName.length > 250) {
    throw new Error('Branch name too long (max 250 characters)');
  }
}

/**
 * Get worktree path for a given branch name
 */
export function getWorktreePath(mainRepoPath: string, branchName: string): string {
  validateBranchName(branchName);
  const repoName = path.basename(mainRepoPath);
  // Sanitize branch name for filesystem (replace / with -)
  const safeBranchName = branchName.replace(/\//g, '-');
  return path.join(path.dirname(mainRepoPath), `${repoName}-${safeBranchName}`);
}

/**
 * Find worktree by branch name or path
 */
export async function findWorktree(identifier: string): Promise<WorktreeInfo | undefined> {
  const worktrees = await listWorktrees();

  return worktrees.find(wt =>
    wt.branch === identifier ||
    wt.path === identifier ||
    path.basename(wt.path) === identifier ||
    wt.path.endsWith(identifier)
  );
}

/**
 * Push a branch to remote
 */
export async function pushBranch(branchName: string, cwd?: string): Promise<void> {
  const args = ['push', '-u', 'origin', branchName];
  await execFileAsync('git', args, cwd ? { cwd } : undefined);
}
