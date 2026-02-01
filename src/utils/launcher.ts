import { spawn } from 'child_process';
import { access } from 'fs/promises';
import path from 'path';
import { constants } from 'fs';

export type AITool = 'claude' | 'codex';

export interface LaunchOptions {
  cwd: string;
  tool: AITool;
}

/**
 * Launch an AI coding assistant in the specified directory
 */
export function launchAITool(options: LaunchOptions): void {
  const { cwd, tool } = options;

  // Run the tool directly via shell
  spawn(tool, [], {
    cwd,
    stdio: 'inherit',
    shell: true,
  });
}

/**
 * Check if the AI tool is installed/available
 */
export async function isToolAvailable(tool: AITool): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('which', [tool]);
    child.on('close', (code) => {
      resolve(code === 0);
    });
    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Detect which package manager to use based on lockfiles
 */
export async function detectPackageManager(dir: string): Promise<'npm' | 'yarn' | 'pnpm' | 'bun' | null> {
  const lockfiles = [
    { file: 'bun.lockb', manager: 'bun' as const },
    { file: 'pnpm-lock.yaml', manager: 'pnpm' as const },
    { file: 'yarn.lock', manager: 'yarn' as const },
    { file: 'package-lock.json', manager: 'npm' as const },
  ];

  for (const { file, manager } of lockfiles) {
    try {
      await access(path.join(dir, file), constants.R_OK);
      return manager;
    } catch {
      // Continue to next lockfile
    }
  }

  // Check if package.json exists (use npm as default)
  try {
    await access(path.join(dir, 'package.json'), constants.R_OK);
    return 'npm';
  } catch {
    return null;
  }
}

/**
 * Run package manager install in the specified directory
 */
export function runInstall(dir: string, packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun'): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(packageManager, ['install'], {
      cwd: dir,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${packageManager} install failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}
