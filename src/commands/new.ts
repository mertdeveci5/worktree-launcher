import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import {
  isGitRepo,
  getGitRoot,
  createWorktree,
  getWorktreePath,
  pushBranch
} from '../utils/git.js';
import { copyEnvFiles } from '../utils/env.js';
import {
  launchAITool,
  isToolAvailable,
  detectPackageManager,
  runInstall
} from '../utils/launcher.js';
import { selectAITool } from '../ui/selector.js';

export interface NewCommandOptions {
  install?: boolean;
  skipLaunch?: boolean;
  push?: boolean;
}

export async function newCommand(branchName: string, options: NewCommandOptions): Promise<void> {
  // 1. Validate we're in a git repo
  if (!await isGitRepo()) {
    console.error(chalk.red('Error: Not a git repository'));
    process.exit(1);
  }

  const mainRepoPath = await getGitRoot();
  const repoName = path.basename(mainRepoPath);
  const worktreePath = getWorktreePath(mainRepoPath, branchName);

  console.log(chalk.cyan(`\nCreating worktree for branch: ${chalk.bold(branchName)}`));
  console.log(chalk.dim(`Repository: ${repoName}`));
  console.log(chalk.dim(`Worktree path: ${worktreePath}\n`));

  // 2. Create worktree
  const spinner = ora('Creating worktree...').start();

  try {
    await createWorktree(worktreePath, branchName);
    spinner.succeed(chalk.green('Worktree created successfully'));
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to create worktree'));
    console.error(chalk.red(error.message || error));
    process.exit(1);
  }

  // 3. Push branch to remote if requested
  if (options.push) {
    const pushSpinner = ora('Pushing branch to remote...').start();
    try {
      await pushBranch(branchName, worktreePath);
      pushSpinner.succeed(chalk.green(`Pushed ${branchName} to origin`));
    } catch (error: any) {
      pushSpinner.fail(chalk.yellow(`Could not push: ${error.message}`));
    }
  }

  // 4. Copy .env files
  const envSpinner = ora('Copying .env files...').start();

  try {
    const copiedFiles = await copyEnvFiles(mainRepoPath, worktreePath);
    if (copiedFiles.length > 0) {
      envSpinner.succeed(chalk.green(`Copied ${copiedFiles.length} env file(s): ${copiedFiles.join(', ')}`));
    } else {
      envSpinner.info(chalk.yellow('No .env files found to copy'));
    }
  } catch (error: any) {
    envSpinner.warn(chalk.yellow(`Warning: Could not copy env files: ${error.message}`));
  }

  // 5. Optionally run package manager install
  if (options.install) {
    const packageManager = await detectPackageManager(worktreePath);
    if (packageManager) {
      const installSpinner = ora(`Running ${packageManager} install...`).start();
      try {
        await runInstall(worktreePath, packageManager);
        installSpinner.succeed(chalk.green(`${packageManager} install completed`));
      } catch (error: any) {
        installSpinner.fail(chalk.red(`${packageManager} install failed: ${error.message}`));
      }
    }
  } else {
    // Check if there's a package.json and suggest install
    const packageManager = await detectPackageManager(worktreePath);
    if (packageManager) {
      console.log(chalk.dim(`\nTip: Run '${packageManager} install' in the worktree, or use 'wt new --install' next time`));
    }
  }

  // 6. Skip launch if requested
  if (options.skipLaunch) {
    console.log(chalk.green(`\n✓ Worktree ready at: ${worktreePath}`));
    console.log(chalk.dim(`  cd "${worktreePath}"`));
    return;
  }

  // 7. Show AI tool selector
  console.log(''); // Empty line for spacing
  const selectedTool = await selectAITool();

  // 8. Check if tool is available
  const toolAvailable = await isToolAvailable(selectedTool);
  if (!toolAvailable) {
    console.error(chalk.red(`\nError: ${selectedTool} is not installed or not in PATH`));
    console.log(chalk.dim(`Worktree is ready at: ${worktreePath}`));
    console.log(chalk.dim(`You can manually launch your AI tool there.`));
    process.exit(1);
  }

  // 9. Launch the selected tool
  console.log(chalk.cyan(`\nLaunching ${selectedTool} in worktree...`));

  launchAITool({
    cwd: worktreePath,
    tool: selectedTool
  });

  console.log(chalk.green(`\n✓ ${selectedTool} launched in: ${worktreePath}`));
}
