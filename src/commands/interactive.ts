import blessed from 'blessed';
import path from 'path';
import {
  isGitRepo,
  getGitRoot,
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
let mainRepoPath: string;
let worktrees: WorktreeInfo[] = [];
let selectedIndex = 0;

export async function interactiveCommand(): Promise<void> {
  if (!await isGitRepo()) {
    console.error('Error: Not a git repository');
    process.exit(1);
  }

  mainRepoPath = await getGitRoot();
  const repoName = path.basename(mainRepoPath);

  // Create screen
  screen = blessed.screen({
    smartCSR: true,
    title: `wt - ${repoName}`
  });

  // Header
  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ` Worktrees: ${repoName}`,
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
    content: ' [n]ew  [d]elete  [c]laude  [x]codex  [p]ush  [Enter]cd  [q]uit',
    style: {
      fg: 'black',
      bg: 'white'
    }
  });

  // Load worktrees
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

  screen.key(['n'], async () => {
    await createNewWorktree();
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

  screen.key(['p'], async () => {
    await pushSelected();
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

async function createNewWorktree(): Promise<void> {
  const input = blessed.textbox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 3,
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'blue' }
    },
    label: ' Branch name ',
    inputOnFocus: true
  });

  input.focus();
  screen.render();

  input.on('submit', async (value: string) => {
    input.destroy();

    if (!value || !value.trim()) {
      await refreshWorktrees();
      return;
    }

    const branchName = value.trim();

    try {
      validateBranchName(branchName);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
      return;
    }

    setStatus(`Creating ${branchName}...`);

    try {
      const worktreePath = getWorktreePath(mainRepoPath, branchName);
      await createWorktree(worktreePath, branchName);
      await copyEnvFiles(mainRepoPath, worktreePath);
      setStatus(`Created ${branchName}`);
      await refreshWorktrees();
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  });

  input.on('cancel', () => {
    input.destroy();
    refreshWorktrees();
  });

  input.readInput();
}

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
  launchAITool({ cwd: wt.path, tool });
  setStatus(`${tool} launched in ${path.basename(wt.path)}`);
}

async function pushSelected(): Promise<void> {
  const wt = worktrees[selectedIndex];
  if (!wt || !wt.branch) {
    setStatus('No branch to push');
    return;
  }

  setStatus(`Pushing ${wt.branch}...`);
  try {
    await pushBranch(wt.branch, wt.path);
    setStatus(`Pushed ${wt.branch} to origin`);
  } catch (e: any) {
    setStatus(`Error: ${e.message}`);
  }
}
