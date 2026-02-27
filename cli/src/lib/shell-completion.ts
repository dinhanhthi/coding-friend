import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { log } from "./log.js";

const MARKER_START = "# >>> coding-friend CLI completion >>>";
const MARKER_END = "# <<< coding-friend CLI completion <<<";

const BASH_BLOCK = `

${MARKER_START}
_cf_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local commands="init host mcp statusline update dev"

  # Subcommands for 'dev'
  if [[ "\${COMP_WORDS[1]}" == "dev" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "on off status restart sync" -- "$cur"))
    return
  fi

  # Path completion for 'dev on'
  if [[ "\${COMP_WORDS[1]}" == "dev" && "$prev" == "on" ]]; then
    COMPREPLY=($(compgen -d -- "$cur"))
    return
  fi

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
    'dev:Switch between local and remote plugin for development'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "dev" ]]; then
    local -a subcommands
    subcommands=(
      'on:Switch to local plugin source'
      'off:Switch back to remote marketplace'
      'status:Show current dev mode'
      'restart:Restart dev mode (re-apply local plugin)'
      'sync:Sync local plugin files without restarting'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 4 )) && [[ "\${words[2]}" == "dev" && "\${words[3]}" == "on" ]]; then
    _path_files -/
  fi
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
 * Extract the current completion block content from an rc file.
 * Returns null if no block found.
 */
function extractExistingBlock(content: string): string | null {
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1) return null;
  return content.slice(startIdx, endIdx + MARKER_END.length);
}

/**
 * Replace the existing completion block in rc file content.
 */
function replaceBlock(content: string, newBlock: string): string {
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  // Include any leading newlines before the marker
  let sliceStart = startIdx;
  while (sliceStart > 0 && content[sliceStart - 1] === "\n") sliceStart--;
  return content.slice(0, sliceStart) + newBlock + content.slice(endIdx + MARKER_END.length);
}

/**
 * Ensure shell completion is configured and up-to-date.
 * Adds the completion block if missing, or replaces it if outdated.
 */
export function ensureShellCompletion(opts?: { silent?: boolean }): boolean {
  const rcPath = getShellRcPath();
  const rcName = getRcName(rcPath);
  const newBlock = isZsh(rcPath) ? ZSH_BLOCK : BASH_BLOCK;

  if (hasShellCompletion()) {
    // Check if the existing block is outdated
    const content = readFileSync(rcPath, "utf-8");
    const existing = extractExistingBlock(content);
    const expectedBlock = newBlock.trim();
    if (existing && existing.trim() === expectedBlock) {
      if (!opts?.silent) log.dim(`Tab completion already up-to-date in ~/${rcName}`);
      return false;
    }

    // Replace outdated block
    const updated = replaceBlock(content, newBlock);
    writeFileSync(rcPath, updated, "utf-8");
    if (!opts?.silent) {
      log.success(`Tab completion updated in ~/${rcName}`);
      log.dim(`Run \`source ~/${rcName}\` or open a new terminal to activate.`);
    }
    return true;
  }

  appendFileSync(rcPath, newBlock);
  if (!opts?.silent) {
    log.success(`Tab completion added to ~/${rcName}`);
    log.dim(`Run \`source ~/${rcName}\` or open a new terminal to activate.`);
  }
  return true;
}
