import blessed from 'blessed';
import path from 'path';
import {
  isGitRepo,
  getGitRoot,
  getCurrentBranch,
  getDefaultBranch,
  listWorktrees,
  removeWorktree,
  createWorktree,
  pushBranch,
  validateBranchName,
  getWorktreePath,
  WorktreeInfo
} from '../utils/git.js';
import { copyEnvFiles } from '../utils/env.js';
import { launchAITool, isToolAvailable } from '../utils/launcher.js';
import type { AITool } from '../utils/launcher.js';

let screen: blessed.Widgets.Screen;
let worktreeList: blessed.Widgets.ListElement;
let statusBar: blessed.Widgets.BoxElement;
let helpBar: blessed.Widgets.BoxElement;
let headerBox: blessed.Widgets.BoxElement;
let mainRepoPath: string;
let currentBranch: string;
let defaultBranch: string;
let worktrees: WorktreeInfo[] = [];
let selectedIndex = 0;

export async function interactiveCommand(): Promise<void> {
  if (!await isGitRepo()) {
    console.error('Error: Not a git repository');
    process.exit(1);
  }

  mainRepoPath = await getGitRoot();
  currentBranch = await getCurrentBranch();
  defaultBranch = await getDefaultBranch();
  const repoName = path.basename(mainRepoPath);

  screen = blessed.screen({
    smartCSR: true,
    title: `wt - ${repoName}`
  });

  // Header with repo info
  headerBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ` ${repoName} (${currentBranch})`,
    style: {
      fg: 'white',
      bg: 'blue',
      bold: true
    }
  });

  // Worktree list
  worktreeList = blessed.list({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: '100%-3',
    keys: true,
    vi: true,
    mouse: true,
    style: {
      selected: {
        bg: 'blue',
        fg: 'white'
      },
      item: {
        fg: 'white'
      }
    },
    scrollbar: {
      ch: ' ',
      style: { bg: 'grey' }
    }
  });

  // Status bar
  statusBar = blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    content: '',
    style: {
      fg: 'yellow',
      bg: 'black'
    }
  });

  // Help bar
  helpBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' [n]ew  [d]elete  [c]laude  [x]codex  [Enter]cd  [q]uit',
    style: {
      fg: 'black',
      bg: 'white'
    }
  });

  await refreshWorktrees();

  // Key bindings
  worktreeList.on('select', (_item: blessed.Widgets.BlessedElement, index: number) => {
    selectedIndex = index;
    showPath();
  });

  screen.key(['q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(['n'], () => {
    startCreationWizard();
  });

  screen.key(['d'], async () => {
    await deleteSelected();
  });

  screen.key(['c'], async () => {
    await launchAI('claude');
  });

  screen.key(['x'], async () => {
    await launchAI('codex');
  });

  screen.key(['enter'], () => {
    const wt = worktrees[selectedIndex];
    if (wt) {
      screen.destroy();
      console.log(`\ncd "${wt.path}"\n`);
      process.exit(0);
    }
  });

  screen.key(['r'], async () => {
    await refreshWorktrees();
  });

  worktreeList.focus();
  screen.render();
}

async function refreshWorktrees(): Promise<void> {
  setStatus('Loading...');
  worktrees = await listWorktrees();

  const items = worktrees.map(wt => {
    const isMain = wt.path === mainRepoPath;
    const dirName = path.basename(wt.path);
    const branch = wt.branch || '(detached)';
    const status = isMain ? '[main]' : '';

    return ` ${dirName.padEnd(40)} ${branch.padEnd(25)} ${status}`;
  });

  worktreeList.setItems(items);
  worktreeList.select(selectedIndex);
  showPath();
  screen.render();
}

function showPath(): void {
  const wt = worktrees[selectedIndex];
  if (wt) {
    setStatus(wt.path);
  } else {
    setStatus('');
  }
}

function setStatus(msg: string): void {
  statusBar.setContent(` ${msg}`);
  screen.render();
}

// ============ Creation Wizard ============

interface WizardState {
  branchName: string;
  baseBranch: 'current' | 'default';
  copyEnv: boolean;
  pushToRemote: boolean;
  aiTool: 'claude' | 'codex' | 'skip';
}

function startCreationWizard(): void {
  const state: WizardState = {
    branchName: '',
    baseBranch: 'current',
    copyEnv: true,
    pushToRemote: false,
    aiTool: 'claude'
  };

  askBranchName(state);
}

function askBranchName(state: WizardState): void {
  const form = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 12,
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'blue' }
    },
    label: ' New Worktree '
  });

  blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: `Repository: ${path.basename(mainRepoPath)}`,
    style: { fg: 'cyan' }
  });

  blessed.text({
    parent: form,
    top: 2,
    left: 2,
    content: `Current branch: ${currentBranch}`,
    style: { fg: 'grey' }
  });

  blessed.text({
    parent: form,
    top: 4,
    left: 2,
    content: 'Branch name:',
    style: { fg: 'white' }
  });

  const input = blessed.textbox({
    parent: form,
    top: 5,
    left: 2,
    width: 54,
    height: 1,
    style: {
      fg: 'white',
      bg: 'grey'
    },
    inputOnFocus: true
  });

  blessed.text({
    parent: form,
    top: 7,
    left: 2,
    content: '[Enter] next  [Esc] cancel',
    style: { fg: 'grey' }
  });

  input.focus();
  screen.render();

  input.on('submit', (value: string) => {
    if (!value || !value.trim()) {
      form.destroy();
      screen.render();
      return;
    }

    try {
      validateBranchName(value.trim());
      state.branchName = value.trim();
      form.destroy();
      askBaseBranch(state);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
      input.focus();
      screen.render();
    }
  });

  input.on('cancel', () => {
    form.destroy();
    screen.render();
  });

  input.readInput();
}

function askBaseBranch(state: WizardState): void {
  const form = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 10,
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'blue' }
    },
    label: ' Base Branch '
  });

  blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: 'Create worktree from:',
    style: { fg: 'white' }
  });

  const list = blessed.list({
    parent: form,
    top: 3,
    left: 2,
    width: 44,
    height: 3,
    keys: true,
    vi: true,
    style: {
      selected: { bg: 'blue', fg: 'white' },
      item: { fg: 'white' }
    },
    items: [
      ` Current branch (${currentBranch})`,
      ` Default branch (${defaultBranch})`
    ]
  });

  blessed.text({
    parent: form,
    top: 7,
    left: 2,
    content: '[Enter] select  [Esc] cancel',
    style: { fg: 'grey' }
  });

  list.focus();
  screen.render();

  list.on('select', (_item: blessed.Widgets.BlessedElement, index: number) => {
    state.baseBranch = index === 0 ? 'current' : 'default';
    form.destroy();
    askCopyEnv(state);
  });

  list.key(['escape'], () => {
    form.destroy();
    screen.render();
  });
}

function askCopyEnv(state: WizardState): void {
  const form = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 40,
    height: 8,
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'blue' }
    },
    label: ' Environment Files '
  });

  blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: 'Copy .env files to worktree?',
    style: { fg: 'white' }
  });

  const list = blessed.list({
    parent: form,
    top: 3,
    left: 2,
    width: 34,
    height: 2,
    keys: true,
    vi: true,
    style: {
      selected: { bg: 'blue', fg: 'white' },
      item: { fg: 'white' }
    },
    items: [' Yes (recommended)', ' No']
  });

  list.focus();
  screen.render();

  list.on('select', (_item: blessed.Widgets.BlessedElement, index: number) => {
    state.copyEnv = index === 0;
    form.destroy();
    askPushToRemote(state);
  });

  list.key(['escape'], () => {
    form.destroy();
    screen.render();
  });
}

function askPushToRemote(state: WizardState): void {
  const form = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 45,
    height: 8,
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'blue' }
    },
    label: ' Push to Remote '
  });

  blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: 'Push branch to GitHub immediately?',
    style: { fg: 'white' }
  });

  const list = blessed.list({
    parent: form,
    top: 3,
    left: 2,
    width: 39,
    height: 2,
    keys: true,
    vi: true,
    style: {
      selected: { bg: 'blue', fg: 'white' },
      item: { fg: 'white' }
    },
    items: [' No (push later)', ' Yes (visible on GitHub now)']
  });

  list.focus();
  screen.render();

  list.on('select', (_item: blessed.Widgets.BlessedElement, index: number) => {
    state.pushToRemote = index === 1;
    form.destroy();
    askAITool(state);
  });

  list.key(['escape'], () => {
    form.destroy();
    screen.render();
  });
}

function askAITool(state: WizardState): void {
  const form = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 40,
    height: 10,
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'blue' }
    },
    label: ' Launch AI Tool '
  });

  blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: 'Which AI assistant to launch?',
    style: { fg: 'white' }
  });

  const list = blessed.list({
    parent: form,
    top: 3,
    left: 2,
    width: 34,
    height: 3,
    keys: true,
    vi: true,
    style: {
      selected: { bg: 'blue', fg: 'white' },
      item: { fg: 'white' }
    },
    items: [' Claude Code', ' Codex', ' Skip (just create worktree)']
  });

  list.focus();
  screen.render();

  list.on('select', (_item: blessed.Widgets.BlessedElement, index: number) => {
    state.aiTool = index === 0 ? 'claude' : index === 1 ? 'codex' : 'skip';
    form.destroy();
    executeCreation(state);
  });

  list.key(['escape'], () => {
    form.destroy();
    screen.render();
  });
}

async function executeCreation(state: WizardState): Promise<void> {
  const { branchName, baseBranch, copyEnv, pushToRemote, aiTool } = state;

  setStatus(`Creating ${branchName}...`);

  try {
    // If using default branch, checkout to it first temporarily
    if (baseBranch === 'default' && currentBranch !== defaultBranch) {
      // We need to create the branch from the default branch
      // Use git worktree add with a start point
      const worktreePath = getWorktreePath(mainRepoPath, branchName);
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      await execFileAsync('git', ['worktree', 'add', '-b', branchName, '--', worktreePath, defaultBranch]);

      if (copyEnv) {
        await copyEnvFiles(mainRepoPath, worktreePath);
      }

      if (pushToRemote) {
        setStatus(`Pushing ${branchName}...`);
        await pushBranch(branchName, worktreePath);
      }

      await refreshWorktrees();
      setStatus(`Created ${branchName}`);

      if (aiTool !== 'skip') {
        await launchInWorktree(worktreePath, aiTool);
      }
    } else {
      // Create from current branch (default behavior)
      const worktreePath = getWorktreePath(mainRepoPath, branchName);
      await createWorktree(worktreePath, branchName);

      if (copyEnv) {
        await copyEnvFiles(mainRepoPath, worktreePath);
      }

      if (pushToRemote) {
        setStatus(`Pushing ${branchName}...`);
        await pushBranch(branchName, worktreePath);
      }

      await refreshWorktrees();
      setStatus(`Created ${branchName}`);

      if (aiTool !== 'skip') {
        await launchInWorktree(worktreePath, aiTool);
      }
    }
  } catch (e: any) {
    setStatus(`Error: ${e.message}`);
  }
}

async function launchInWorktree(worktreePath: string, tool: AITool): Promise<void> {
  const available = await isToolAvailable(tool);
  if (!available) {
    setStatus(`${tool} is not installed`);
    return;
  }

  setStatus(`Launching ${tool}...`);
  screen.destroy();
  launchAITool({ cwd: worktreePath, tool });
  console.log(`\n${tool} launched in: ${worktreePath}\n`);
  process.exit(0);
}

// ============ Management Actions ============

async function deleteSelected(): Promise<void> {
  const wt = worktrees[selectedIndex];
  if (!wt) return;

  if (wt.path === mainRepoPath) {
    setStatus('Cannot delete main worktree');
    return;
  }

  const dirName = path.basename(wt.path);

  const confirm = blessed.question({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 40,
    height: 5,
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'red' }
    }
  });

  confirm.ask(`Delete ${dirName}?`, async (err: Error | null, yes: string) => {
    confirm.destroy();

    if (yes) {
      setStatus(`Deleting ${dirName}...`);
      try {
        await removeWorktree(wt.path, false);
        setStatus(`Deleted ${dirName}`);
      } catch {
        try {
          await removeWorktree(wt.path, true);
          setStatus(`Deleted ${dirName} (forced)`);
        } catch (e: any) {
          setStatus(`Error: ${e.message}`);
        }
      }
      if (selectedIndex > 0) selectedIndex--;
      await refreshWorktrees();
    } else {
      await refreshWorktrees();
    }
  });
}

async function launchAI(tool: AITool): Promise<void> {
  const wt = worktrees[selectedIndex];
  if (!wt) return;

  const available = await isToolAvailable(tool);
  if (!available) {
    setStatus(`${tool} is not installed`);
    return;
  }

  setStatus(`Launching ${tool}...`);
  screen.destroy();
  launchAITool({ cwd: wt.path, tool });
  console.log(`\n${tool} launched in: ${path.basename(wt.path)}\n`);
  process.exit(0);
}
