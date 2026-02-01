#!/usr/bin/env node

import { Command } from 'commander';
import { newCommand } from './commands/new.js';
import { listCommand } from './commands/list.js';
import { cleanCommand } from './commands/clean.js';
import { removeCommand } from './commands/remove.js';
import { interactiveCommand } from './commands/interactive.js';

const program = new Command();

program
  .name('wt')
  .description('CLI tool to streamline git worktrees with AI coding assistants')
  .version('1.1.0')
  .action(async () => {
    // Default action: interactive mode
    await interactiveCommand();
  });

program
  .command('new <branch-name>')
  .description('Create a new worktree and launch AI assistant')
  .option('-i, --install', 'Run package manager install after creating worktree')
  .option('-s, --skip-launch', 'Create worktree without launching AI assistant')
  .action(async (branchName: string, options) => {
    await newCommand(branchName, {
      install: options.install,
      skipLaunch: options.skipLaunch
    });
  });

program
  .command('list')
  .alias('ls')
  .description('List all worktrees for the current repository')
  .action(async () => {
    await listCommand();
  });

program
  .command('clean')
  .description('Remove worktrees for merged or deleted branches')
  .action(async () => {
    await cleanCommand();
  });

program
  .command('remove <name>')
  .alias('rm')
  .description('Remove a specific worktree')
  .option('-f, --force', 'Force removal even if there are uncommitted changes')
  .action(async (name: string, options) => {
    await removeCommand(name, {
      force: options.force
    });
  });

program.parse();
