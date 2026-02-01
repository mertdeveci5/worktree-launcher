import inquirer from 'inquirer';
import type { AITool } from '../utils/launcher.js';

export interface AIToolChoice {
  name: string;
  value: AITool;
  description: string;
}

const AI_TOOLS: AIToolChoice[] = [
  {
    name: 'Claude Code',
    value: 'claude',
    description: 'Anthropic\'s Claude coding assistant'
  },
  {
    name: 'Codex',
    value: 'codex',
    description: 'OpenAI\'s Codex coding assistant'
  }
];

/**
 * Show interactive selector for AI coding assistant
 */
export async function selectAITool(): Promise<AITool> {
  const { tool } = await inquirer.prompt<{ tool: AITool }>([
    {
      type: 'list',
      name: 'tool',
      message: 'Select AI coding assistant:',
      choices: AI_TOOLS.map(t => ({
        name: `${t.name} - ${t.description}`,
        value: t.value,
        short: t.name
      }))
    }
  ]);

  return tool;
}

/**
 * Confirm an action with the user
 */
export async function confirm(message: string, defaultValue: boolean = true): Promise<boolean> {
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue
    }
  ]);

  return confirmed;
}

/**
 * Multi-select items from a list
 */
export async function selectMultiple<T>(
  message: string,
  choices: { name: string; value: T; checked?: boolean }[]
): Promise<T[]> {
  const { selected } = await inquirer.prompt<{ selected: T[] }>([
    {
      type: 'checkbox',
      name: 'selected',
      message,
      choices
    }
  ]);

  return selected;
}
