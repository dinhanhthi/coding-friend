import { appendFileSync, existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { log } from "./log.js";

const MARKER_START = "# >>> coding-friend CLI completion >>>";
const MARKER_END = "# <<< coding-friend CLI completion <<<";

const BASH_BLOCK = `

${MARKER_START}
_cf_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local commands="init host mcp statusline update"
  COMPREPLY=($(compgen -W "$commands" -- "$cur"))
}
complete -o default -F _cf_completions cf
${MARKER_END}
`;

const ZSH_BLOCK = `

${MARKER_START}
_cf() {
  local -a commands
  commands=(
    'init:Initialize coding-friend in current project'
    'host:Build and serve learning docs as a static website'
    'mcp:Setup MCP server for learning docs'
    'statusline:Setup coding-friend statusline in Claude Code'
    'update:Update coding-friend plugin and refresh statusline'
  )
  _describe 'command' commands
}
compdef _cf cf
${MARKER_END}
`;

function getShellRcPath(): string {
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) return `${homedir()}/.zshrc`;
  return `${homedir()}/.bashrc`;
}

function getRcName(rcPath: string): string {
  return rcPath.endsWith(".zshrc") ? ".zshrc" : ".bashrc";
}

function isZsh(rcPath: string): boolean {
  return rcPath.endsWith(".zshrc");
}

export function hasShellCompletion(): boolean {
  const rcPath = getShellRcPath();
  if (!existsSync(rcPath)) return false;
  return readFileSync(rcPath, "utf-8").includes(MARKER_START);
}

/**
 * Ensure shell completion is configured. Writes completion script directly
 * to shell rc file if not already present.
 */
export function ensureShellCompletion(opts?: { silent?: boolean }): boolean {
  const rcPath = getShellRcPath();
  const rcName = getRcName(rcPath);

  if (hasShellCompletion()) {
    if (!opts?.silent) log.dim(`Tab completion already in ~/${rcName}`);
    return false;
  }

  const block = isZsh(rcPath) ? ZSH_BLOCK : BASH_BLOCK;
  appendFileSync(rcPath, block);
  if (!opts?.silent) {
    log.success(`Tab completion added to ~/${rcName}`);
    log.dim(`Run \`source ~/${rcName}\` or open a new terminal to activate.`);
  }
  return true;
}
