import { describe, expect, it } from 'vitest';
import { stripTerminalEscapes } from './sanitize.ts';
import {
  applyAgentFilterMenuSelection,
  conflictsWithBackgroundUpdateCheck,
  createTuiState,
  moveAgentFilterMenu,
  openAgentFilterMenu,
  renderTuiFrame,
  resolveSkillSourceTarget,
  restoreInstalledAgentFilter,
} from './tui.ts';

describe('TUI renderer', () => {
  it('renders the dashboard navigation and workspace metrics', () => {
    const state = createTuiState();
    state.detectedAgents = ['codex'];
    state.installed = [
      {
        name: 'frontend-design',
        description: 'Build polished frontend experiences.',
        path: '/tmp/.agents/skills/frontend-design',
        canonicalPath: '/tmp/.agents/skills/frontend-design',
        scope: 'project',
        agents: ['codex'],
      },
    ];

    const output = renderTuiFrame(state, { columns: 100, rows: 28 }).join('\n');
    const plainOutput = stripTerminalEscapes(output);

    expect(plainOutput).toContain('███████╗██╗  ██╗██╗██╗     ██╗     ███████╗');
    expect(plainOutput).toContain('╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝');
    expect(plainOutput).toContain('The Open Agent Skills Ecosystem');
    expect(plainOutput).not.toContain('Discover');
    expect(output).toContain('Overview');
    expect(output).toContain('Project skills');
    expect(output).toContain('frontend-design');
    expect(output).toContain('\x1b[48;5;24m\x1b[1m\x1b[97m O Overview ');
    expect(output).toContain('\x1b[48;5;24m\x1b[1m\x1b[97m 1 SKILL ');
    expect(output).toContain('\x1b[48;5;22m\x1b[1m\x1b[97m 0 SKILLS ');
    expect(plainOutput).toContain('Available in this workspace');
    expect(plainOutput).toContain('Available in every workspace');
    expect(plainOutput).not.toContain('Scope Project · Skills');

    const lines = renderTuiFrame(state, { columns: 100, rows: 28 }).map(stripTerminalEscapes);
    const navigationLine = lines.findIndex(
      (line) => line.includes('O Overview') && line.includes('A Agents')
    );
    const contentLine = lines.findIndex((line) => line.includes('Project skills'));
    expect(navigationLine).toBeGreaterThanOrEqual(0);
    expect(navigationLine).toBeLessThan(contentLine);
    expect(lines.filter((line) => line.includes('O Overview'))).toHaveLength(1);

    const narrowLines = renderTuiFrame(state, { columns: 60, rows: 28 }).map(stripTerminalEscapes);
    const narrowMenu = narrowLines.find(
      (line) => line.includes('O Overview') && line.includes('A Agents')
    );
    expect(narrowMenu).toBeDefined();
    expect(narrowLines.filter((line) => line.includes('O Overview'))).toHaveLength(1);
  });

  it('renders installed skill details for the selected scope', () => {
    const state = createTuiState();
    state.screen = 'installed';
    state.scope = 'global';
    state.installed = [
      {
        name: 'project-helper',
        description: 'A project-local helper.',
        path: '/workspace/.agents/skills/project-helper',
        canonicalPath: '/workspace/.agents/skills/project-helper',
        scope: 'project',
        agents: ['codex'],
      },
      {
        name: 'release-notes',
        description: 'Prepare release notes from git history.',
        path: '/home/user/.agents/skills/release-notes',
        canonicalPath: '/home/user/.agents/skills/release-notes',
        scope: 'global',
        agents: ['codex'],
        disabled: true,
      },
    ];
    state.installedIndex = 1;
    state.lockEntries = {
      'project:release-notes': {
        source: 'project-owner/release-notes',
        sourceType: 'github',
        scope: 'project',
      },
      'global:release-notes': {
        source: 'global-owner/release-notes',
        sourceType: 'github',
        scope: 'global',
      },
    };

    const output = renderTuiFrame(state, { columns: 100, rows: 28 }).join('\n');
    const plainOutput = stripTerminalEscapes(output);

    expect(output).toContain('Installed skills');
    expect(output).toContain('project-helper');
    expect(output).toContain('release-notes');
    expect(output).toContain('Prepare release notes from git history.');
    expect(plainOutput).toMatch(/project-helper\s+project/);
    expect(plainOutput).toMatch(/release-notes\s+global/);
    expect(plainOutput).toContain('Status ○ disabled');
    expect(plainOutput).toContain('Source global-owner/release-notes');
    expect(plainOutput).toContain('f agent filter  Space enable  u update  o source');
    expect(output).toContain('\x1b[48;5;24m');
    expect(output).toContain('\x1b[38;5;245m○');
  });

  it('uses the full available height for the Installed list', () => {
    const state = createTuiState();
    state.screen = 'installed';
    state.installed = Array.from({ length: 30 }, (_, index) => ({
      name: `skill-${String(index + 1).padStart(2, '0')}`,
      description: `Skill ${index + 1}`,
      path: `/workspace/.agents/skills/skill-${index + 1}`,
      canonicalPath: `/workspace/.agents/skills/skill-${index + 1}`,
      scope: 'project' as const,
      agents: ['codex' as const],
    }));

    const standard = stripTerminalEscapes(
      renderTuiFrame(state, { columns: 100, rows: 24 }).join('\n')
    );
    const tall = stripTerminalEscapes(renderTuiFrame(state, { columns: 100, rows: 30 }).join('\n'));

    expect(standard).toContain('skill-14');
    expect(standard).not.toContain('skill-15');
    expect(tall).toContain('skill-20');
  });

  it('sanitizes metadata before rendering it to the terminal', () => {
    const state = createTuiState();
    state.screen = 'installed';
    state.installed = [
      {
        name: '\u001b]2;malicious\u0007safe-skill',
        description: 'A safe skill.',
        path: '/workspace/.agents/skills/safe-skill',
        canonicalPath: '/workspace/.agents/skills/safe-skill',
        scope: 'project',
        agents: ['codex'],
      },
    ];

    const output = renderTuiFrame(state, { columns: 100, rows: 28 }).join('\n');

    expect(output).toContain('safe-skill');
    expect(output).not.toContain('malicious');
    expect(output).not.toContain('\u001b]');
  });

  it('filters installed skills by the agents they are effective for', () => {
    const state = createTuiState();
    state.screen = 'installed';
    state.installedAgentFilter = 'codex';
    state.installed = [
      {
        name: 'codex-only',
        description: 'Effective for Codex.',
        path: '/workspace/.agents/skills/codex-only',
        canonicalPath: '/workspace/.agents/skills/codex-only',
        scope: 'project',
        agents: ['codex'],
      },
      {
        name: 'cursor-only',
        description: 'Effective for Cursor.',
        path: '/workspace/.agents/skills/cursor-only',
        canonicalPath: '/workspace/.agents/skills/cursor-only',
        scope: 'project',
        agents: ['cursor'],
      },
      {
        name: 'shared-skill',
        description: 'Effective for both agents.',
        path: '/workspace/.agents/skills/shared-skill',
        canonicalPath: '/workspace/.agents/skills/shared-skill',
        scope: 'project',
        agents: ['codex', 'cursor'],
      },
    ];

    const output = stripTerminalEscapes(
      renderTuiFrame(state, { columns: 100, rows: 28 }).join('\n')
    );

    expect(output).toContain('Agent Codex · 2/3');
    expect(output).toContain('codex-only');
    expect(output).toContain('shared-skill');
    expect(output).not.toContain('cursor-only');
    expect(output).toContain('f agent filter');
  });

  it('switches the detected-agent filter with a Tab-style picker', () => {
    const state = createTuiState();
    state.screen = 'installed';
    state.detectedAgents = ['cursor', 'codex'];
    openAgentFilterMenu(state);

    const output = stripTerminalEscapes(
      renderTuiFrame(state, { columns: 100, rows: 28 }).join('\n')
    );

    expect(output).toContain('Filter by detected agent');
    expect(output).toContain('2 detected agents');
    expect(output).toContain('All agents');
    expect(output).toContain('Codex');
    expect(output).toContain('Cursor');
    expect(output).toContain('Tab next · Shift+Tab previous · Enter apply · Esc/f close');

    moveAgentFilterMenu(state, 1);
    expect(applyAgentFilterMenuSelection(state)).toBe('codex');
    expect(state.installedAgentFilter).toBe('codex');
    expect(state.agentFilterMenuOpen).toBe(false);

    openAgentFilterMenu(state);
    moveAgentFilterMenu(state, -1);
    expect(applyAgentFilterMenuSelection(state)).toBeNull();
    expect(state.installedAgentFilter).toBeNull();
  });

  it('restores only a saved filter for an agent detected in this session', () => {
    const state = createTuiState();
    state.detectedAgents = ['codex'];

    restoreInstalledAgentFilter(state, 'codex');
    expect(state.installedAgentFilter).toBe('codex');

    restoreInstalledAgentFilter(state, 'cursor');
    expect(state.installedAgentFilter).toBeNull();
  });

  it('keeps update progress visible inside the TUI frame', () => {
    const state = createTuiState();
    state.screen = 'updates';
    state.loading = 'Checking for skill updates in background…';
    state.updateProgress = { checked: 1, total: 10, current: 'frontend-design' };

    const output = renderTuiFrame(state, { columns: 100, rows: 28 }).join('\n');
    const plainLines = stripTerminalEscapes(output).split('\n');
    const progressLine = plainLines.findIndex((line) => line.includes('Checking 1 of 10'));
    const contentLine = plainLines.findIndex((line) => line.includes('Available updates'));

    expect(stripTerminalEscapes(output)).toContain('◌ Checking for skill updates in background…');
    expect(stripTerminalEscapes(output)).toContain('frontend-design');
    expect(progressLine).toBeGreaterThanOrEqual(0);
    expect(progressLine).toBeLessThan(contentLine);
    expect(plainLines[progressLine - 1]).toContain('━');
    expect(output).toContain('\x1b[38;5;208m');
  });

  it('keeps menu navigation available during a background update check', () => {
    const state = createTuiState();
    state.screen = 'updates';

    expect(conflictsWithBackgroundUpdateCheck(state, { name: 'tab' })).toBe(false);
    expect(conflictsWithBackgroundUpdateCheck(state, { name: 'left' })).toBe(false);
    expect(conflictsWithBackgroundUpdateCheck(state, { name: 'i', shift: true })).toBe(false);
    expect(conflictsWithBackgroundUpdateCheck(state, { name: 's' })).toBe(true);
    expect(conflictsWithBackgroundUpdateCheck(state, { name: 'u' })).toBe(true);
  });

  it('keeps the footer visible in a standard 24-row terminal', () => {
    const state = createTuiState();

    const lines = renderTuiFrame(state, { columns: 80, rows: 24 }).map(stripTerminalEscapes);

    expect(lines).toHaveLength(24);
    expect(lines.at(-1)).toContain('navigate');
    expect(lines.at(-1)).toContain('quit');
  });

  it('renders an in-TUI confirmation before removing an installed skill', () => {
    const state = createTuiState();
    state.screen = 'installed';
    state.removeConfirmation = { name: 'release-notes', scope: 'global' };

    const lines = renderTuiFrame(state, { columns: 80, rows: 24 }).map(stripTerminalEscapes);

    expect(lines.at(-1)).toContain('Remove release-notes?');
    expect(lines.at(-1)).toContain('y / Enter confirm');
    expect(lines.at(-1)).toContain('n / Esc cancel');
  });

  it('renders available updates as a selectable list with selected and all actions', () => {
    const state = createTuiState();
    state.screen = 'updates';
    state.scope = 'project';
    state.availableUpdates = [
      {
        name: 'alpha-skill',
        scope: 'project',
        source: 'owner/alpha',
        sourceType: 'github',
      },
      {
        name: 'project-skill',
        scope: 'project',
        source: 'owner/project',
        sourceType: 'github',
      },
    ];
    state.updateIndex = 1;
    state.updateSummary = {
      checkedCount: 10,
      totalCount: 10,
      failedCount: 0,
      skippedCount: 0,
    };

    const rendered = renderTuiFrame(state, { columns: 100, rows: 28 }).join('\n');
    const output = stripTerminalEscapes(rendered);

    expect(output).toContain('Available updates · Project · 2 found');
    expect(output).toContain('10 checked · 0 failed · 0 skipped');
    expect(output).toContain('alpha-skill');
    expect(output).toContain('project-skill');
    expect(output).toContain('Source owner/project');
    expect(output).toContain('u update selected  U update all');
    expect(rendered).toContain('\x1b[48;5;24m');
  });

  it('shows a successful empty result after a completed update check', () => {
    const state = createTuiState();
    state.screen = 'updates';
    state.updateSummary = {
      checkedCount: 10,
      totalCount: 10,
      failedCount: 0,
      skippedCount: 0,
    };

    const output = stripTerminalEscapes(
      renderTuiFrame(state, { columns: 100, rows: 28 }).join('\n')
    );

    expect(output).toContain('All 10 checked project skills are up to date.');
  });

  it('shows the detected-agent total and sorts detected agents first', () => {
    const state = createTuiState();
    state.screen = 'agents';
    state.detectedAgents = ['cursor', 'codex'];

    const lines = renderTuiFrame(state, { columns: 100, rows: 28 }).map(stripTerminalEscapes);
    const output = lines.join('\n');
    const detectedRows = lines.filter((line) => line.includes('●'));

    expect(output).toContain('Detected 2 agents');
    expect(output).toMatch(/2 of \d+ supported agents detected/);
    expect(detectedRows[0]).toContain('Codex');
    expect(detectedRows[1]).toContain('Cursor');
  });

  it('resolves safe source targets for the open-source action', () => {
    expect(
      resolveSkillSourceTarget({ source: 'vercel-labs/agent-skills', sourceType: 'github' })
    ).toBe('https://github.com/vercel-labs/agent-skills');
    expect(
      resolveSkillSourceTarget({
        source: 'vercel-labs/agent-skills',
        sourceUrl: 'git+https://github.com/vercel-labs/agent-skills.git',
        sourceType: 'github',
      })
    ).toBe('https://github.com/vercel-labs/agent-skills');
    expect(
      resolveSkillSourceTarget({ source: 'npm-package', sourceType: 'node_modules' })
    ).toBeNull();
  });
});
