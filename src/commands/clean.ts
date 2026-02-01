import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import {
  isGitRepo,
  getGitRoot,
  listWorktrees,
  remoteBranchExists,
  isBranchMerged,
  removeWorktree,
  pruneWorktrees,
  WorktreeInfo
} from '../utils/git.js';
import { selectMultiple, confirm } from '../ui/selector.js';

interface StaleWorktree extends WorktreeInfo {
  reason: 'merged' | 'local-only';
}

export async function cleanCommand(): Promise<void> {
  // Validate we're in a git repo
  if (!await isGitRepo()) {
    console.error(chalk.red('Error: Not a git repository'));
    process.exit(1);
  }

  const mainRepoPath = await getGitRoot();

  // First, prune any stale worktree references
  const pruneSpinner = ora('Pruning stale references...').start();
  await pruneWorktrees();
  pruneSpinner.succeed('Pruned stale references');

  // Get all worktrees
  const worktrees = await listWorktrees();

  // Find stale worktrees
  const spinner = ora('Checking worktree status...').start();
  const staleWorktrees: StaleWorktree[] = [];

  for (const wt of worktrees) {
    // Skip main worktree
    if (wt.path === mainRepoPath) continue;

    // Skip detached or bare worktrees
    if (wt.detached || wt.bare || !wt.branch) continue;

    // Check if branch was merged
    const merged = await isBranchMerged(wt.branch);
    if (merged) {
      staleWorktrees.push({ ...wt, reason: 'merged' });
      continue;
    }

    // Check if branch exists on remote
    const existsOnRemote = await remoteBranchExists(wt.branch);
    if (!existsOnRemote) {
      staleWorktrees.push({ ...wt, reason: 'local-only' });
    }
  }

  spinner.stop();

  if (staleWorktrees.length === 0) {
    console.log(chalk.green('\n✓ No stale worktrees found'));
    return;
  }

  console.log(chalk.yellow(`\nFound ${staleWorktrees.length} potentially stale worktree(s):\n`));

  // Build choices for selection
  const choices = staleWorktrees.map(wt => {
    const reasonText = wt.reason === 'merged'
      ? chalk.green('merged')
      : chalk.yellow('local only');

    return {
      name: `${path.basename(wt.path)} (${wt.branch}) - ${reasonText}`,
      value: wt,
      checked: wt.reason === 'merged' // Pre-select merged branches
    };
  });

  // Let user select which to remove
  const selected = await selectMultiple<StaleWorktree>(
    'Select worktrees to remove:',
    choices
  );

  if (selected.length === 0) {
    console.log(chalk.yellow('\nNo worktrees selected for removal'));
    return;
  }

  // Confirm removal
  const confirmed = await confirm(
    `Remove ${selected.length} worktree(s)?`,
    true
  );

  if (!confirmed) {
    console.log(chalk.yellow('Cancelled'));
    return;
  }

  // Remove selected worktrees
  console.log('');
  let removed = 0;
  let failed = 0;

  for (const wt of selected) {
    const removeSpinner = ora(`Removing ${path.basename(wt.path)}...`).start();

    try {
      await removeWorktree(wt.path, false);
      removeSpinner.succeed(chalk.green(`Removed ${path.basename(wt.path)}`));
      removed++;
    } catch (error: any) {
      // Try with force
      try {
        await removeWorktree(wt.path, true);
        removeSpinner.succeed(chalk.green(`Removed ${path.basename(wt.path)} (forced)`));
        removed++;
      } catch (forceError: any) {
        removeSpinner.fail(chalk.red(`Failed to remove ${path.basename(wt.path)}: ${forceError.message}`));
        failed++;
      }
    }
  }

  console.log('');
  if (removed > 0) {
    console.log(chalk.green(`✓ Removed ${removed} worktree(s)`));
  }
  if (failed > 0) {
    console.log(chalk.red(`✗ Failed to remove ${failed} worktree(s)`));
  }
}
