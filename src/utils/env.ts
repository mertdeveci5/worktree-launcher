import { glob } from 'glob';
import { copyFile } from 'fs/promises';
import path from 'path';

/**
 * Find all .env files in a directory (excludes .example, .sample, .template)
 */
export async function findEnvFiles(sourceDir: string): Promise<string[]> {
  const files = await glob('.env*', {
    cwd: sourceDir,
    dot: true,
    nodir: true
  });

  return files.filter(file => {
    // Must be .env or .env.something
    if (file !== '.env' && !file.startsWith('.env.')) return false;
    // Exclude template files
    if (file.endsWith('.example') || file.endsWith('.sample') || file.endsWith('.template')) return false;
    return true;
  });
}

/**
 * Copy env files from source to destination directory
 */
export async function copyEnvFiles(sourceDir: string, destDir: string): Promise<string[]> {
  const envFiles = await findEnvFiles(sourceDir);
  const copied: string[] = [];

  for (const file of envFiles) {
    try {
      await copyFile(path.join(sourceDir, file), path.join(destDir, file));
      copied.push(file);
    } catch (error) {
      console.warn(`Warning: Could not copy ${file}: ${error}`);
    }
  }

  return copied;
}
