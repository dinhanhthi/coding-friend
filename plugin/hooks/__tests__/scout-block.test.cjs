const { execFileSync } = require('child_process');
const path = require('path');

const {
  DEFAULT_PATTERNS,
  normalizePath,
  parseIgnoreFile,
  buildEffectivePatterns,
  pathMatchesPattern,
  isBlocked,
  extractPaths,
} = require('../scout-block.cjs');

const SCRIPT = path.resolve(__dirname, '../scout-block.cjs');

// Helper: run the script with given JSON stdin, return { stdout, exitCode }
function run(jsonInput, env = {}) {
  const input = typeof jsonInput === 'string' ? jsonInput : JSON.stringify(jsonInput);
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      input,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 5000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', exitCode: err.status };
  }
}

// ---------------------------------------------------------------------------
// Unit tests — exported functions
// ---------------------------------------------------------------------------

describe('normalizePath', () => {
  it('strips ./ prefix', () => {
    expect(normalizePath('./src/app.ts')).toBe('src/app.ts');
  });

  it('strips leading /', () => {
    expect(normalizePath('/src/app.ts')).toBe('src/app.ts');
  });

  it('converts backslashes', () => {
    expect(normalizePath('src\\components\\Button.tsx')).toBe(
      'src/components/Button.tsx',
    );
  });

  it('returns empty string for falsy input', () => {
    expect(normalizePath('')).toBe('');
    expect(normalizePath(null)).toBe('');
    expect(normalizePath(undefined)).toBe('');
  });
});

describe('parseIgnoreFile', () => {
  it('parses block patterns', () => {
    const { blocks, negations } = parseIgnoreFile('foo\nbar/\nbaz');
    expect(blocks).toEqual(['foo', 'bar', 'baz']);
    expect(negations).toEqual([]);
  });

  it('parses negation patterns', () => {
    const { blocks, negations } = parseIgnoreFile('foo\n!bar\n!baz/');
    expect(blocks).toEqual(['foo']);
    expect(negations).toEqual(['bar', 'baz']);
  });

  it('skips comments and empty lines', () => {
    const { blocks } = parseIgnoreFile('# comment\n\nfoo\n  # another\nbar');
    expect(blocks).toEqual(['foo', 'bar']);
  });

  it('strips inline comments', () => {
    const { blocks } = parseIgnoreFile('foo # this is a comment');
    expect(blocks).toEqual(['foo']);
  });

  it('handles empty content', () => {
    const { blocks, negations } = parseIgnoreFile('');
    expect(blocks).toEqual([]);
    expect(negations).toEqual([]);
  });
});

describe('buildEffectivePatterns', () => {
  it('returns defaults when no user patterns', () => {
    const patterns = buildEffectivePatterns([], []);
    expect(patterns).toEqual(DEFAULT_PATTERNS);
  });

  it('appends user block patterns', () => {
    const patterns = buildEffectivePatterns(['my-dir'], []);
    expect(patterns).toContain('my-dir');
    expect(patterns).toContain('node_modules');
  });

  it('removes negated defaults', () => {
    const patterns = buildEffectivePatterns([], ['build']);
    expect(patterns).not.toContain('build');
    expect(patterns).toContain('node_modules');
  });

  it('does not duplicate existing patterns', () => {
    const patterns = buildEffectivePatterns(['node_modules'], []);
    const count = patterns.filter((p) => p === 'node_modules').length;
    expect(count).toBe(1);
  });
});

describe('pathMatchesPattern', () => {
  it('matches at start of path', () => {
    expect(pathMatchesPattern('node_modules/pkg/index.js', 'node_modules')).toBe(true);
  });

  it('matches as mid segment', () => {
    expect(pathMatchesPattern('src/node_modules/dep/file.js', 'node_modules')).toBe(true);
  });

  it('matches at end of path', () => {
    expect(pathMatchesPattern('project/node_modules', 'node_modules')).toBe(true);
  });

  it('matches exact path', () => {
    expect(pathMatchesPattern('node_modules', 'node_modules')).toBe(true);
  });

  it('does not match partial names', () => {
    expect(pathMatchesPattern('src/my_node_modules/file.js', 'node_modules')).toBe(false);
    expect(pathMatchesPattern('node_modules_extra/file.js', 'node_modules')).toBe(false);
  });

  it('returns false for empty inputs', () => {
    expect(pathMatchesPattern('', 'node_modules')).toBe(false);
    expect(pathMatchesPattern('src/file.ts', '')).toBe(false);
  });
});

describe('isBlocked', () => {
  const defaults = DEFAULT_PATTERNS;

  it('blocks node_modules paths', () => {
    expect(isBlocked('node_modules/package/index.js', defaults)).toBe('node_modules');
  });

  it('blocks .next paths', () => {
    expect(isBlocked('.next/cache/abc', defaults)).toBe('.next');
  });

  it('blocks nested node_modules', () => {
    expect(isBlocked('src/node_modules/dep/file.js', defaults)).toBe('node_modules');
  });

  it('blocks __pycache__', () => {
    expect(isBlocked('__pycache__/module.pyc', defaults)).toBe('__pycache__');
  });

  it('blocks .git', () => {
    expect(isBlocked('.git/objects/abc', defaults)).toBe('.git');
  });

  it('allows normal source files', () => {
    expect(isBlocked('src/components/Button.tsx', defaults)).toBeNull();
  });

  it('allows README.md', () => {
    expect(isBlocked('README.md', defaults)).toBeNull();
  });

  it('strips ./ prefix before matching', () => {
    expect(isBlocked('./node_modules/x.js', defaults)).toBe('node_modules');
  });

  it('handles leading / in paths', () => {
    expect(isBlocked('/node_modules/x.js', defaults)).toBe('node_modules');
  });

  it('returns null for empty path', () => {
    expect(isBlocked('', defaults)).toBeNull();
  });
});

describe('extractPaths', () => {
  it('extracts file_path', () => {
    expect(extractPaths({ file_path: '/src/app.ts' })).toEqual(['/src/app.ts']);
  });

  it('extracts path', () => {
    expect(extractPaths({ path: '/src' })).toEqual(['/src']);
  });

  it('extracts pattern', () => {
    expect(extractPaths({ pattern: '**/*.ts' })).toEqual(['**/*.ts']);
  });

  it('extracts multiple fields', () => {
    const paths = extractPaths({ file_path: '/a', path: '/b', pattern: '/c' });
    expect(paths).toEqual(['/a', '/b', '/c']);
  });

  it('returns empty for no matching fields', () => {
    expect(extractPaths({ command: 'git status' })).toEqual([]);
  });

  it('returns empty for null/undefined', () => {
    expect(extractPaths(null)).toEqual([]);
    expect(extractPaths(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — run the actual script
// ---------------------------------------------------------------------------

describe('integration: default patterns (no ignore file)', () => {
  it('blocks node_modules', () => {
    const { exitCode, stdout } = run({
      tool_name: 'Read',
      tool_input: { file_path: 'node_modules/pkg/index.js' },
    });
    expect(exitCode).toBe(2);
    expect(stdout).toContain('node_modules');
  });

  it('blocks .next', () => {
    const { exitCode } = run({
      tool_name: 'Read',
      tool_input: { file_path: '.next/cache/abc' },
    });
    expect(exitCode).toBe(2);
  });

  it('blocks .git', () => {
    const { exitCode } = run({
      tool_name: 'Read',
      tool_input: { file_path: '.git/objects/abc' },
    });
    expect(exitCode).toBe(2);
  });

  it('allows normal source files', () => {
    const { exitCode, stdout } = run({
      tool_name: 'Read',
      tool_input: { file_path: 'src/components/Button.tsx' },
    });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('{}');
  });

  it('allows README.md', () => {
    const { exitCode } = run({
      tool_name: 'Read',
      tool_input: { file_path: 'README.md' },
    });
    expect(exitCode).toBe(0);
  });
});

describe('integration: fail-open behavior', () => {
  it('allows on empty stdin', () => {
    const { exitCode, stdout } = run('');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('{}');
  });

  it('allows on malformed JSON', () => {
    const { exitCode, stdout } = run('not json at all');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('{}');
  });

  it('allows on missing tool_input', () => {
    const { exitCode, stdout } = run({ tool_name: 'Read' });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('{}');
  });

  it('allows on empty path values', () => {
    const { exitCode } = run({
      tool_name: 'Read',
      tool_input: { file_path: '' },
    });
    expect(exitCode).toBe(0);
  });
});

describe('integration: path extraction from different tools', () => {
  it('extracts file_path from Read', () => {
    const { exitCode } = run({
      tool_name: 'Read',
      tool_input: { file_path: 'node_modules/x.js' },
    });
    expect(exitCode).toBe(2);
  });

  it('extracts file_path from Edit', () => {
    const { exitCode } = run({
      tool_name: 'Edit',
      tool_input: { file_path: 'node_modules/x.js', old_string: 'a', new_string: 'b' },
    });
    expect(exitCode).toBe(2);
  });

  it('extracts file_path from Write', () => {
    const { exitCode } = run({
      tool_name: 'Write',
      tool_input: { file_path: 'node_modules/x.js', content: 'x' },
    });
    expect(exitCode).toBe(2);
  });

  it('extracts path from Glob', () => {
    const { exitCode } = run({
      tool_name: 'Glob',
      tool_input: { pattern: '**/*.ts', path: 'node_modules' },
    });
    expect(exitCode).toBe(2);
  });

  it('extracts path from Grep', () => {
    const { exitCode } = run({
      tool_name: 'Grep',
      tool_input: { pattern: 'import', path: 'node_modules/pkg' },
    });
    expect(exitCode).toBe(2);
  });

  it('extracts pattern from Glob for path-like patterns', () => {
    const { exitCode } = run({
      tool_name: 'Glob',
      tool_input: { pattern: 'node_modules/**/*.js' },
    });
    expect(exitCode).toBe(2);
  });
});
