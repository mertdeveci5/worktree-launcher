import blessed from 'blessed';
import path from 'path';
import {
  isGitRepo,
  getGitRoot,
  getCurrentBranch,
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
let mainRepoPath: string;
let currentBranch: string;
let worktrees: WorktreeInfo[] = [];
let selectedIndex = 0;

export async function interactiveCommand(): Promise<void> {
  if (!await isGitRepo()) {
    console.error('Error: Not a git repository');
    process.exit(1);
  }

  mainRepoPath = await getGitRoot();
  currentBranch = await getCurrentBranch();
  const repoName = path.basename(mainRepoPath);

  screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: `wt - ${repoName}`,
    terminal: 'xterm-256color',
    warnings: false
  });

  // Header
  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ` ${repoName} (${currentBranch})`,
    style: { fg: 'black', bg: 'cyan' }
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
      selected: { bg: 'cyan', fg: 'black' },
      item: { fg: 'default' }
    },
    scrollbar: { ch: ' ', style: { bg: 'cyan' } }
  });

  // Status bar
  statusBar = blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    content: '',
    style: { fg: 'green' }
  });

  // Help bar
  blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' [n]ew  [d]elete  [c]laude  [x]codex  [p]ush  [Enter]cd  [q]uit',
    style: { fg: 'black', bg: 'cyan' }
  });

  await refreshWorktrees();

  // Key bindings
  worktreeList.on('select', (_item: blessed.Widgets.BlessedElement, index: number) => {
    selectedIndex = index;
    showPath();
  });

  screen.key(['q', 'C-c'], () => exitScreen());
  screen.key(['n'], () => showNewWorktreeForm());
  screen.key(['d'], () => deleteSelected());
  screen.key(['c'], () => launchTool('claude'));
  screen.key(['x'], () => launchTool('codex'));
  screen.key(['p'], () => pushSelected());
  screen.key(['r'], () => refreshWorktrees());
  screen.key(['enter'], () => {
    const wt = worktrees[selectedIndex];
    if (wt) exitScreen(`\ncd "${wt.path}"\n`);
  });

  worktreeList.focus();
  screen.render();
}

// ============ Helpers ============

async function refreshWorktrees(): Promise<void> {
  setStatus('Loading...');
  worktrees = await listWorktrees();

  const items = worktrees.map(wt => {
    const isMain = wt.path === mainRepoPath;
    const dirName = path.basename(wt.path);
    const branch = wt.branch || '(detached)';
    const tag = isMain ? '[main]' : '';
    return ` ${dirName.padEnd(40)} ${branch.padEnd(25)} ${tag}`;
  });

  worktreeList.setItems(items);
  worktreeList.select(selectedIndex);
  showPath();
}

function showPath(): void {
  const wt = worktrees[selectedIndex];
  setStatus(wt ? wt.path : '');
}

function setStatus(msg: string): void {
  statusBar.setContent(` ${msg}`);
  screen.render();
}

function cleanupScreen(): void {
  screen.program.clear();
  screen.program.disableMouse();
  screen.program.showCursor();
  screen.program.normalBuffer();
  screen.destroy();
}

function exitScreen(message?: string): void {
  cleanupScreen();
  if (message) console.log(message);
  process.exit(0);
}

// ============ New Worktree (2-step wizard) ============

function showNewWorktreeForm(): void {
  const form = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 10,
    border: { type: 'line' },
    style: { fg: 'default', border: { fg: 'cyan' } },
    label: ' New Worktree '
  });

  blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: `Repository: ${path.basename(mainRepoPath)} (from ${currentBranch})`,
    style: { fg: 'cyan' }
  });

  blessed.text({
    parent: form,
    top: 3,
    left: 2,
    content: 'Branch name:',
    style: { fg: 'default' }
  });

  const input = blessed.textbox({
    parent: form,
    top: 4,
    left: 2,
    width: 54,
    height: 1,
    style: { fg: 'black', bg: 'white' },
    inputOnFocus: true
  });

  blessed.text({
    parent: form,
    top: 6,
    left: 2,
    content: '[Enter] next  [Esc] cancel',
    style: { fg: 'cyan' }
  });

  input.focus();
  screen.render();

  input.on('submit', () => {
    const value = input.getValue()?.trim();
    if (!value) {
      form.destroy();
      screen.render();
      worktreeList.focus();
      return;
    }

    try {
      validateBranchName(value);
      form.destroy();
      screen.render();
      showAIToolSelector(value);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
      input.clearValue();
      input.focus();
      screen.render();
    }
  });

  input.on('cancel', () => {
    form.destroy();
    screen.render();
    worktreeList.focus();
  });

  input.readInput();
}

function showAIToolSelector(branchName: string): void {
  let handled = false;

  const form = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 40,
    height: 9,
    border: { type: 'line' },
    style: { fg: 'default', border: { fg: 'cyan' } },
    label: ' Launch AI Tool '
  });

  blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: 'Which AI assistant to launch?',
    style: { fg: 'default' }
  });

  blessed.text({
    parent: form,
    top: 3,
    left: 2,
    content: '  [1] Claude Code',
    style: { fg: 'default' }
  });

  blessed.text({
    parent: form,
    top: 4,
    left: 2,
    content: '  [2] Codex',
    style: { fg: 'default' }
  });

  blessed.text({
    parent: form,
    top: 5,
    left: 2,
    content: '  [3] Skip',
    style: { fg: 'default' }
  });

  blessed.text({
    parent: form,
    top: 7,
    left: 2,
    content: '[Esc] cancel',
    style: { fg: 'cyan' }
  });

  screen.render();

  const cleanup = (): void => {
    screen.unkey(['1'], onKey1);
    screen.unkey(['2'], onKey2);
    screen.unkey(['3'], onKey3);
    screen.unkey(['escape'], onEscape);
  };

  const selectTool = async (tool: AITool | null): Promise<void> => {
    if (handled) return;
    handled = true;
    cleanup();
    form.destroy();
    screen.render();
    try {
      await createNewWorktree(branchName, tool);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
      worktreeList.focus();
      screen.render();
    }
  };

  const cancel = (): void => {
    if (handled) return;
    handled = true;
    cleanup();
    form.destroy();
    screen.render();
    worktreeList.focus();
  };

  const onKey1 = () => selectTool('claude');
  const onKey2 = () => selectTool('codex');
  const onKey3 = () => selectTool(null);
  const onEscape = () => cancel();

  screen.key(['1'], onKey1);
  screen.key(['2'], onKey2);
  screen.key(['3'], onKey3);
  screen.key(['escape'], onEscape);
}

async function createNewWorktree(branchName: string, tool: AITool | null): Promise<void> {
  setStatus(`Creating ${branchName}...`);
  screen.render();

  try {
    const worktreePath = getWorktreePath(mainRepoPath, branchName);
    setStatus(`Path: ${worktreePath}`);
    screen.render();

    await createWorktree(worktreePath, branchName);
    setStatus(`Worktree created, copying .env...`);
    screen.render();

    await copyEnvFiles(mainRepoPath, worktreePath);
    setStatus(`Done! Refreshing list...`);
    screen.render();

    await refreshWorktrees();
    setStatus(`Created ${branchName}`);
    worktreeList.focus();
    screen.render();

    if (tool) {
      await launchInWorktree(worktreePath, tool);
    }
  } catch (e: any) {
    setStatus(`Error: ${e.message}`);
    worktreeList.focus();
    screen.render();
  }
}

// ============ Actions ============

async function launchInWorktree(worktreePath: string, tool: AITool): Promise<void> {
  const available = await isToolAvailable(tool);
  if (!available) {
    setStatus(`${tool} is not installed`);
    return;
  }

  cleanupScreen();
  launchAITool({ cwd: worktreePath, tool });
  console.log(`\n${tool} launched in: ${worktreePath}\n`);
  process.exit(0);
}

async function launchTool(tool: AITool): Promise<void> {
  const wt = worktrees[selectedIndex];
  if (!wt) return;

  const available = await isToolAvailable(tool);
  if (!available) {
    setStatus(`${tool} is not installed`);
    return;
  }

  cleanupScreen();
  launchAITool({ cwd: wt.path, tool });
  console.log(`\n${tool} launched in: ${path.basename(wt.path)}\n`);
  process.exit(0);
}

async function pushSelected(): Promise<void> {
  const wt = worktrees[selectedIndex];
  if (!wt?.branch) {
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

async function deleteSelected(): Promise<void> {
  const wt = worktrees[selectedIndex];
  if (!wt) return;

  if (wt.path === mainRepoPath) {
    setStatus('Cannot delete main worktree');
    return;
  }

  const dirName = path.basename(wt.path);

  const dialog = blessed.question({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 40,
    height: 5,
    border: { type: 'line' },
    style: { fg: 'default', border: { fg: 'red' } }
  });

  dialog.ask(`Delete ${dirName}?`, async (_err: Error | null, yes: string) => {
    dialog.destroy();

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
      screen.render();
      worktreeList.focus();
    }
  });
}
