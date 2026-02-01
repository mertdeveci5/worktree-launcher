import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import {
  isGitRepo,
  getGitRoot,
  findWorktree,
  removeWorktree
} from '../utils/git.js';
import { confirm } from '../ui/selector.js';

export interface RemoveCommandOptions {
  force?: boolean;
}

export async function removeCommand(identifier: string, options: RemoveCommandOptions): Promise<void> {
  // Validate we're in a git repo
  if (!await isGitRepo()) {
    console.error(chalk.red('Error: Not a git repository'));
    process.exit(1);
  }

  const mainRepoPath = await getGitRoot();

  // Find the worktree
  const spinner = ora('Finding worktree...').start();
  const worktree = await findWorktree(identifier);

  if (!worktree) {
    spinner.fail(chalk.red(`Worktree not found: ${identifier}`));
    console.log(chalk.dim('\nTip: Run "wt list" to see available worktrees'));
    process.exit(1);
  }

  spinner.stop();

  // Prevent removing main worktree
  if (worktree.path === mainRepoPath) {
    console.error(chalk.red('\nError: Cannot remove the main worktree'));
    process.exit(1);
  }

  // Show what we're about to remove
  console.log(chalk.cyan('\nWorktree to remove:'));
  console.log(chalk.dim(`  Path:   ${worktree.path}`));
  console.log(chalk.dim(`  Branch: ${worktree.branch || '(detached)'}`));

  // Confirm unless force flag is set
  if (!options.force) {
    const confirmed = await confirm('\nRemove this worktree?', false);
    if (!confirmed) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }
  }

  // Remove the worktree
  const removeSpinner = ora('Removing worktree...').start();

  try {
    await removeWorktree(worktree.path, false);
    removeSpinner.succeed(chalk.green(`Removed worktree: ${path.basename(worktree.path)}`));
  } catch (error: any) {
    // If normal removal fails, try with force
    if (options.force) {
      try {
        await removeWorktree(worktree.path, true);
        removeSpinner.succeed(chalk.green(`Removed worktree (forced): ${path.basename(worktree.path)}`));
      } catch (forceError: any) {
        removeSpinner.fail(chalk.red(`Failed to remove worktree: ${forceError.message}`));
        process.exit(1);
      }
    } else {
      removeSpinner.fail(chalk.red(`Failed to remove worktree: ${error.message}`));
      console.log(chalk.dim('\nTip: Use --force to force removal'));
      process.exit(1);
    }
  }
}
