import chalk from 'chalk';
import path from 'path';
import {
  isGitRepo,
  getGitRoot,
  listWorktrees,
  remoteBranchExists,
  isBranchMerged
} from '../utils/git.js';

export async function listCommand(): Promise<void> {
  // Validate we're in a git repo
  if (!await isGitRepo()) {
    console.error(chalk.red('Error: Not a git repository'));
    process.exit(1);
  }

  const mainRepoPath = await getGitRoot();
  const worktrees = await listWorktrees();

  if (worktrees.length === 0) {
    console.log(chalk.yellow('No worktrees found'));
    return;
  }

  console.log(chalk.cyan(`\nWorktrees for: ${chalk.bold(path.basename(mainRepoPath))}\n`));

  // Table header
  console.log(
    chalk.dim('─'.repeat(100))
  );
  console.log(
    chalk.bold(padEnd('Path', 50)) +
    chalk.bold(padEnd('Branch', 25)) +
    chalk.bold('Status')
  );
  console.log(
    chalk.dim('─'.repeat(100))
  );

  for (const wt of worktrees) {
    const isMain = wt.path === mainRepoPath;
    const status = await getWorktreeStatus(wt.branch, wt.detached, isMain);

    // Shorten path for display
    const displayPath = shortenPath(wt.path, 48);
    const displayBranch = wt.detached ? chalk.yellow('(detached)') : (wt.branch || 'N/A');

    console.log(
      padEnd(isMain ? chalk.bold(displayPath) : displayPath, 50) +
      padEnd(displayBranch, 25) +
      status
    );
  }

  console.log(chalk.dim('─'.repeat(100)));
  console.log(chalk.dim(`\nTotal: ${worktrees.length} worktree(s)`));
}

async function getWorktreeStatus(
  branch: string | undefined,
  detached: boolean,
  isMain: boolean
): Promise<string> {
  if (isMain) {
    return chalk.blue('main');
  }

  if (detached) {
    return chalk.yellow('detached');
  }

  if (!branch) {
    return chalk.dim('unknown');
  }

  // Check if branch still exists on remote
  const existsOnRemote = await remoteBranchExists(branch);

  // Check if branch has been merged
  const isMerged = await isBranchMerged(branch);

  if (isMerged) {
    return chalk.green('merged') + chalk.dim(' (can clean)');
  }

  if (!existsOnRemote) {
    return chalk.yellow('local only');
  }

  return chalk.green('active');
}

function padEnd(str: string, length: number): string {
  // Remove chalk codes for length calculation
  const visibleLength = str.replace(/\x1B\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, length - visibleLength);
  return str + ' '.repeat(padding);
}

function shortenPath(p: string, maxLength: number): string {
  if (p.length <= maxLength) return p;

  // Try to show the last meaningful parts
  const parts = p.split(path.sep);
  let result = parts[parts.length - 1];

  // Add parent directories until we hit the limit
  for (let i = parts.length - 2; i >= 0; i--) {
    const newResult = path.join(parts[i], result);
    if (newResult.length > maxLength - 3) {
      return '...' + path.sep + result;
    }
    result = newResult;
  }

  return result;
}
