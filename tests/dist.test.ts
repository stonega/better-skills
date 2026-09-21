import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const rootDir = join(import.meta.dirname, '..');

describe('dist build', () => {
  it('publishes the scoped package with the better-skills executable', () => {
    const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));

    expect(packageJson.name).toBe('@stonega/skills');
    expect(packageJson.bin['better-skills']).toBe('./bin/cli.mjs');
    expect(packageJson.bin.skills).toBeUndefined();
  });

  it('builds and runs without errors', { timeout: 30000 }, () => {
    // Build the project
    execSync('pnpm build', { cwd: rootDir, stdio: 'pipe' });

    // Run the CLI - should exit cleanly with help output
    const result = execSync('node bin/cli.mjs --help', {
      cwd: rootDir,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    expect(stripVTControlCharacters(result)).toContain('Usage: better-skills <command> [options]');
  });
});
