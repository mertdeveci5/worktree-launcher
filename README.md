# worktree-launcher

A CLI tool for managing git worktrees with AI coding assistants.

## The Problem

When working on multiple features or reviewing PRs, developers often need isolated environments. Git worktrees solve this by allowing multiple working directories from a single repository, but the workflow is clunky:

```bash
# The manual way
git worktree add ../myproject-feature-auth feature-auth
cp .env ../myproject-feature-auth/.env
cp .env.local ../myproject-feature-auth/.env.local
cd ../myproject-feature-auth
npm install
claude  # or codex
```

This gets tedious fast. Tools like Conductor exist to manage this complexity, but they add overhead for simple use cases.

## The Solution

`wt` streamlines the entire workflow into a single command:

```bash
wt new feature-auth
```

This creates the worktree, copies your environment files, and launches your AI coding assistant in the new directory.

## Installation

```bash
npm install -g worktree-launcher
```

Requires Node.js 18+ and git.

## Interactive Mode (TUI)

Run `wt` with no arguments to open a terminal UI:

```bash
wt
```

The TUI shows your repo name, current branch, and all existing worktrees.

| Key | Action |
|-----|--------|
| `n` | Create new worktree |
| `d` | Delete selected worktree |
| `c` | Launch Claude Code in selected worktree |
| `x` | Launch Codex in selected worktree |
| `p` | Push selected branch to remote |
| `Enter` | Print cd command for selected worktree |
| `r` | Refresh worktree list |
| `q` | Quit |

Navigate with arrow keys or vim-style `j`/`k`.

### Creating a New Worktree

Press `n` to create a new worktree:

1. Enter the branch name
2. Choose AI tool to launch (Claude Code, Codex, or Skip)

The worktree is created from your current branch, .env files are copied automatically.

## Commands

### wt

Run with no arguments for interactive mode.

```bash
wt
```

### wt new

Create a new worktree and optionally launch an AI assistant.

```bash
wt new <branch-name> [options]
```

Options:
- `-i, --install` - Run package manager install after creating worktree
- `-s, --skip-launch` - Create worktree without launching AI assistant
- `-p, --push` - Push branch to remote (makes it visible on GitHub immediately)

Examples:

```bash
# Create worktree and launch AI selector
wt new feature-auth

# Create worktree and push to GitHub
wt new feature-auth --push

# Create worktree and run npm/yarn/pnpm install
wt new feature-auth --install

# Just create the worktree
wt new feature-auth --skip-launch

# Combine options
wt new feature-auth --push --install --skip-launch
```

The worktree is created at `../<repo-name>-<branch-name>/`. For example, if you run `wt new feature-auth` in `/code/myproject`, the worktree is created at `/code/myproject-feature-auth`.

### wt list

List all worktrees for the current repository.

```bash
wt list
# or
wt ls
```

Output shows path, branch, and status (active, merged, local only).

### wt clean

Interactively remove worktrees for merged or deleted branches.

```bash
wt clean
```

This finds stale worktrees, shows an interactive selection, and removes the ones you choose.

### wt remove

Remove a specific worktree.

```bash
wt remove <name> [options]
# or
wt rm <name>
```

Options:
- `-f, --force` - Force removal even with uncommitted changes

## Workflow

A typical development workflow:

```bash
# 1. Start in your main repository
cd ~/code/myproject

# 2. Open interactive mode to see all worktrees
wt

# 3. Or create a worktree directly
wt new feature-user-auth
# Select Claude Code or Codex from the prompt
# AI assistant launches in the new worktree

# 4. Work on the feature, commit, push, create PR

# 5. After PR is merged, clean up
wt clean
# Select merged branches to remove
```

## Environment Files

The following files are automatically copied to new worktrees:

- `.env`
- `.env.local`
- `.env.development`
- `.env.development.local`
- `.env.test`
- `.env.test.local`
- `.env.production`
- `.env.production.local`
- Any other `.env.*` files

Template files (`.env.example`, `.env.sample`, `.env.template`) are excluded.

## AI Assistants

Currently supports:

- Claude Code
- Codex

The tool checks if your selected assistant is installed before launching. If not found, the worktree is still created and you can launch manually.

## Security

Branch names are validated to prevent:
- Path traversal attacks (`..` sequences)
- Git flag injection (names starting with `-`)

## License

MIT
