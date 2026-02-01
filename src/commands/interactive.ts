import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  isGitRepo,
  getGitRoot,
  listWorktrees,
  removeWorktree,
  remoteBranchExists,
  isBranchMerged,
  WorktreeInfo
} from '../utils/git.js';
import { selectAITool } from '../ui/selector.js';
import { launchAITool, isToolAvailable } from '../utils/launcher.js';

const execFileAsync = promisify(execFile);

interface WorktreeChoice {
  name: string;
  value: WorktreeInfo | 'new' | 'quit';
  short: string;
}

async function getWorktreeStatus(branch: string | undefined, isMain: boolean): Promise<string> {
  if (isMain) return chalk.blue('main');
  if (!branch) return chalk.dim('detached');

  const merged = await isBranchMerged(branch);
  if (merged) return chalk.green('merged');

  const onRemote = await remoteBranchExists(branch);
  if (!onRemote) return chalk.yellow('local');

  return chalk.green('active');
}

export async function interactiveCommand(): Promise<void> {
  if (!await isGitRepo()) {
    console.error(chalk.red('Error: Not a git repository'));
    process.exit(1);
  }

  const mainRepoPath = await getGitRoot();
  const repoName = path.basename(mainRepoPath);

  while (true) {
    console.clear();
    console.log(chalk.cyan.bold(`\n  Worktrees: ${repoName}\n`));

    const worktrees = await listWorktrees();

    // Build choices
    const choices: WorktreeChoice[] = [];

    for (const wt of worktrees) {
      const isMain = wt.path === mainRepoPath;
      const status = await getWorktreeStatus(wt.branch, isMain);
      const branchDisplay = wt.branch || '(detached)';
      const dirName = path.basename(wt.path);

      choices.push({
        name: `  ${dirName.padEnd(35)} ${branchDisplay.padEnd(25)} ${status}`,
        value: wt,
        short: dirName
      });
    }

    choices.push({ name: chalk.dim('─'.repeat(70)), value: 'quit' as const, short: '' });
    choices.push({ name: chalk.green('  + Create new worktree'), value: 'new' as const, short: 'new' });
    choices.push({ name: chalk.dim('  q Quit'), value: 'quit' as const, short: 'quit' });

    const { selected } = await inquirer.prompt<{ selected: WorktreeInfo | 'new' | 'quit' }>([
      {
        type: 'list',
        name: 'selected',
        message: 'Select a worktree:',
        choices,
        pageSize: 15
      }
    ]);

    if (selected === 'quit') {
      console.log(chalk.dim('\nGoodbye.\n'));
      break;
    }

    if (selected === 'new') {
      await handleNewWorktree(mainRepoPath);
      continue;
    }

    // Show actions for selected worktree
    await handleWorktreeActions(selected, mainRepoPath);
  }
}

async function handleNewWorktree(mainRepoPath: string): Promise<void> {
  const { branchName } = await inquirer.prompt<{ branchName: string }>([
    {
      type: 'input',
      name: 'branchName',
      message: 'Branch name:',
      validate: (input) => {
        if (!input.trim()) return 'Branch name required';
        if (input.startsWith('-')) return 'Cannot start with -';
        if (input.includes('..')) return 'Cannot contain ..';
        return true;
      }
    }
  ]);

  if (!branchName.trim()) return;

  // Import dynamically to avoid circular deps
  const { newCommand } = await import('./new.js');
  await newCommand(branchName.trim(), { skipLaunch: false });
}

async function handleWorktreeActions(wt: WorktreeInfo, mainRepoPath: string): Promise<void> {
  const isMain = wt.path === mainRepoPath;
  const dirName = path.basename(wt.path);

  const actions = [
    { name: '  Open in terminal (cd)', value: 'cd' },
    { name: '  Launch AI assistant', value: 'launch' },
  ];

  if (!isMain) {
    actions.push({ name: chalk.red('  Delete worktree'), value: 'delete' });
  }

  actions.push({ name: chalk.dim('  Back'), value: 'back' });

  console.log(chalk.cyan(`\n  ${dirName}`));
  console.log(chalk.dim(`  ${wt.path}\n`));

  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'Action:',
      choices: actions
    }
  ]);

  switch (action) {
    case 'cd':
      console.log(chalk.green(`\nTo open this worktree, run:`));
      console.log(chalk.cyan(`  cd "${wt.path}"\n`));

      // Copy to clipboard using pbcopy (macOS)
      try {
        await execFileAsync('pbcopy', [], { input: wt.path });
        console.log(chalk.dim('(Path copied to clipboard)\n'));
      } catch {
        // Ignore clipboard errors on non-macOS
      }

      await pause();
      break;

    case 'launch':
      const tool = await selectAITool();
      const available = await isToolAvailable(tool);

      if (!available) {
        console.log(chalk.red(`\n${tool} is not installed or not in PATH\n`));
        await pause();
        break;
      }

      console.log(chalk.cyan(`\nLaunching ${tool} in ${dirName}...`));
      launchAITool({ cwd: wt.path, tool });
      console.log(chalk.green(`\n${tool} launched.\n`));
      await pause();
      break;

    case 'delete':
      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Delete ${dirName}?`,
          default: false
        }
      ]);

      if (confirm) {
        try {
          await removeWorktree(wt.path, false);
          console.log(chalk.green(`\nDeleted ${dirName}\n`));
        } catch {
          try {
            await removeWorktree(wt.path, true);
            console.log(chalk.green(`\nDeleted ${dirName} (forced)\n`));
          } catch (e: any) {
            console.log(chalk.red(`\nFailed to delete: ${e.message}\n`));
          }
        }
        await pause();
      }
      break;

    case 'back':
    default:
      break;
  }
}

async function pause(): Promise<void> {
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...'
    }
  ]);
}
