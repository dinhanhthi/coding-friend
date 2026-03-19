import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { basename, join } from "path";
import { log } from "./log.js";

const MARKER_START = "# >>> coding-friend CLI completion >>>";
const MARKER_END = "# <<< coding-friend CLI completion <<<";

const BASH_BLOCK = `

${MARKER_START}
_cf_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local commands="install uninstall disable enable init config host mcp memory permission statusline update dev session"
  local scope_flags="--user --global --project --local"
  local update_flags="--cli --plugin --statusline --user --global --project --local"

  # Subcommands for 'dev'
  if [[ "\${COMP_WORDS[1]}" == "dev" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "on off status restart sync update" -- "$cur"))
    return
  fi

  # Subcommands for 'memory'
  if [[ "\${COMP_WORDS[1]}" == "memory" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "status search list rm init start-daemon stop-daemon rebuild mcp" -- "$cur"))
    return
  fi

  # Subcommands for 'session'
  if [[ "\${COMP_WORDS[1]}" == "session" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "save load" -- "$cur"))
    return
  fi

  # Path completion for 'dev on|restart|update'
  if [[ "\${COMP_WORDS[1]}" == "dev" && ("$prev" == "on" || "$prev" == "restart" || "$prev" == "update") ]]; then
    COMPREPLY=($(compgen -d -- "$cur"))
    return
  fi

  # Flag completion for install/uninstall/disable/enable
  if [[ "\${COMP_WORDS[1]}" == "install" || "\${COMP_WORDS[1]}" == "uninstall" || "\${COMP_WORDS[1]}" == "disable" || "\${COMP_WORDS[1]}" == "enable" ]] && [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "$scope_flags" -- "$cur"))
    return
  fi

  # Flag completion for update
  if [[ "\${COMP_WORDS[1]}" == "update" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "$update_flags" -- "$cur"))
    return
  fi

  # Flag completion for permission
  if [[ "\${COMP_WORDS[1]}" == "permission" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--all --user --project" -- "$cur"))
    return
  fi

  COMPREPLY=($(compgen -W "$commands" -- "$cur"))
}
complete -o default -F _cf_completions cf
${MARKER_END}
`;

const ZSH_FUNCTION_BODY = `_cf() {
  local -a commands
  commands=(
    'install:Install the Coding Friend plugin into Claude Code'
    'uninstall:Uninstall the Coding Friend plugin from Claude Code'
    'disable:Disable the Coding Friend plugin without uninstalling'
    'enable:Re-enable the Coding Friend plugin'
    'init:Initialize coding-friend in current project'
    'config:Manage Coding Friend configuration'
    'host:Build and serve learning docs as a static website'
    'mcp:Setup MCP server for learning docs'
    'memory:AI memory system — store and search project knowledge'
    'permission:Manage Claude Code permission rules for Coding Friend'
    'statusline:Setup coding-friend statusline in Claude Code'
    'update:Update coding-friend plugin and refresh statusline'
    'dev:Switch between local and remote plugin for development'
    'session:Save and load Claude Code sessions across machines'
  )

  local -a scope_flags
  scope_flags=(
    '--user[Install at user scope (all projects)]'
    '--global[Install at user scope (all projects)]'
    '--project[Install at project scope (shared via git)]'
    '--local[Install at local scope (this machine only)]'
  )

  local -a update_flags
  update_flags=(
    '--cli[Update only the CLI (npm package)]'
    '--plugin[Update only the Claude Code plugin]'
    '--statusline[Update only the statusline]'
    '--user[Update plugin at user scope (all projects)]'
    '--global[Update plugin at user scope (all projects)]'
    '--project[Update plugin at project scope]'
    '--local[Update plugin at local scope]'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "install" || "\${words[2]}" == "uninstall" || "\${words[2]}" == "disable" || "\${words[2]}" == "enable" ]]; then
    _values 'flags' \$scope_flags
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "update" ]]; then
    _values 'flags' \$update_flags
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "permission" ]]; then
    local -a permission_flags
    permission_flags=(
      '--all[Apply all recommended permissions without prompts]'
      '--user[Save to user-level settings]'
      '--project[Save to project-level settings]'
    )
    _values 'flags' \$permission_flags
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "dev" ]]; then
    local -a subcommands
    subcommands=(
      'on:Switch to local plugin source'
      'off:Switch back to remote marketplace'
      'status:Show current dev mode'
      'restart:Restart dev mode (re-apply local plugin)'
      'sync:Sync local plugin files without restarting'
      'update:Update local dev plugin to latest version'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "memory" ]]; then
    local -a subcommands
    subcommands=(
      'status:Show memory system status'
      'search:Search memories by query'
      'list:List memories (--projects for all DBs)'
      'rm:Remove a project database'
      'init:Initialize Tier 1 (SQLite + Hybrid Search)'
      'start-daemon:Start the memory daemon (Tier 2)'
      'stop-daemon:Stop the memory daemon'
      'rebuild:Rebuild the daemon search index'
      'mcp:Show MCP server setup instructions'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "session" ]]; then
    local -a subcommands
    subcommands=(
      'save:Save current session to docs/sessions/'
      'load:Load a saved session from docs/sessions/'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 4 )) && [[ "\${words[2]}" == "dev" && ("\${words[3]}" == "on" || "\${words[3]}" == "restart" || "\${words[3]}" == "update") ]]; then
    _path_files -/
  fi
}
compdef _cf cf`;

function buildZshBlock(needsCompinit: boolean): string {
  const compinit = needsCompinit ? "autoload -Uz compinit && compinit\n" : "";
  return `\n\n${MARKER_START}\n${compinit}${ZSH_FUNCTION_BODY}\n${MARKER_END}\n`;
}

const FISH_CONTENT = `# coding-friend CLI completions
complete -c cf -f
complete -c cf -n "__fish_use_subcommand" -a install -d "Install the Coding Friend plugin into Claude Code"
complete -c cf -n "__fish_use_subcommand" -a uninstall -d "Uninstall the Coding Friend plugin from Claude Code"
complete -c cf -n "__fish_use_subcommand" -a disable -d "Disable the Coding Friend plugin without uninstalling"
complete -c cf -n "__fish_use_subcommand" -a enable -d "Re-enable the Coding Friend plugin"
complete -c cf -n "__fish_use_subcommand" -a init -d "Initialize coding-friend in current project"
complete -c cf -n "__fish_use_subcommand" -a config -d "Manage Coding Friend configuration"
complete -c cf -n "__fish_use_subcommand" -a host -d "Build and serve learning docs as a static website"
complete -c cf -n "__fish_use_subcommand" -a mcp -d "Setup MCP server for learning docs"
complete -c cf -n "__fish_use_subcommand" -a memory -d "AI memory system — store and search project knowledge"
complete -c cf -n "__fish_use_subcommand" -a permission -d "Manage Claude Code permission rules"
complete -c cf -n "__fish_use_subcommand" -a statusline -d "Setup coding-friend statusline in Claude Code"
complete -c cf -n "__fish_use_subcommand" -a update -d "Update coding-friend plugin and refresh statusline"
complete -c cf -n "__fish_use_subcommand" -a dev -d "Switch between local and remote plugin for development"
complete -c cf -n "__fish_use_subcommand" -a session -d "Save and load Claude Code sessions across machines"
# Scope flags for install/uninstall/disable/enable
complete -c cf -n "__fish_seen_subcommand_from install uninstall disable enable" -l user -d "User scope (all projects)"
complete -c cf -n "__fish_seen_subcommand_from install uninstall disable enable" -l global -d "User scope (all projects)"
complete -c cf -n "__fish_seen_subcommand_from install uninstall disable enable" -l project -d "Project scope (shared via git)"
complete -c cf -n "__fish_seen_subcommand_from install uninstall disable enable" -l local -d "Local scope (this machine only)"
# Flags for update
complete -c cf -n "__fish_seen_subcommand_from update" -l cli -d "Update only the CLI"
complete -c cf -n "__fish_seen_subcommand_from update" -l plugin -d "Update only the plugin"
complete -c cf -n "__fish_seen_subcommand_from update" -l statusline -d "Update only the statusline"
complete -c cf -n "__fish_seen_subcommand_from update" -l user -d "User scope (all projects)"
complete -c cf -n "__fish_seen_subcommand_from update" -l global -d "User scope (all projects)"
complete -c cf -n "__fish_seen_subcommand_from update" -l project -d "Project scope"
complete -c cf -n "__fish_seen_subcommand_from update" -l local -d "Local scope"
# Flags for permission
complete -c cf -n "__fish_seen_subcommand_from permission" -l all -d "Apply all recommended permissions"
complete -c cf -n "__fish_seen_subcommand_from permission" -l user -d "Save to user-level settings"
complete -c cf -n "__fish_seen_subcommand_from permission" -l project -d "Save to project-level settings"
# Dev subcommands
complete -c cf -n "__fish_seen_subcommand_from dev" -a on -d "Switch to local plugin source"
complete -c cf -n "__fish_seen_subcommand_from dev" -a off -d "Switch back to remote marketplace"
complete -c cf -n "__fish_seen_subcommand_from dev" -a status -d "Show current dev mode"
complete -c cf -n "__fish_seen_subcommand_from dev" -a restart -d "Restart dev mode"
complete -c cf -n "__fish_seen_subcommand_from dev" -a sync -d "Sync local plugin files"
complete -c cf -n "__fish_seen_subcommand_from dev" -a update -d "Update local dev plugin"
# Memory subcommands
complete -c cf -n "__fish_seen_subcommand_from memory" -a status -d "Show memory system status"
complete -c cf -n "__fish_seen_subcommand_from memory" -a search -d "Search memories by query"
complete -c cf -n "__fish_seen_subcommand_from memory" -a list -d "List memories (--projects for all DBs)"
complete -c cf -n "__fish_seen_subcommand_from memory" -a rm -d "Remove a project database"
complete -c cf -n "__fish_seen_subcommand_from memory" -a init -d "Initialize Tier 1 (SQLite + Hybrid Search)"
complete -c cf -n "__fish_seen_subcommand_from memory" -a start-daemon -d "Start the memory daemon (Tier 2)"
complete -c cf -n "__fish_seen_subcommand_from memory" -a stop-daemon -d "Stop the memory daemon"
complete -c cf -n "__fish_seen_subcommand_from memory" -a rebuild -d "Rebuild the daemon search index"
complete -c cf -n "__fish_seen_subcommand_from memory" -a mcp -d "Show MCP server setup instructions"
# Session subcommands
complete -c cf -n "__fish_seen_subcommand_from session" -a save -d "Save current session to docs/sessions/"
complete -c cf -n "__fish_seen_subcommand_from session" -a load -d "Load a saved session from docs/sessions/"
`;

const POWERSHELL_BLOCK = `

${MARKER_START}
Register-ArgumentCompleter -Native -CommandName cf -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = @('install','uninstall','disable','enable','init','config','host','mcp','memory','permission','statusline','update','dev','session')
  $devSubcommands = @('on','off','status','restart','sync','update')
  $memorySubcommands = @('status','search','list','rm','init','start-daemon','stop-daemon','rebuild','mcp')
  $sessionSubcommands = @('save','load')
  $scopeFlags = @('--user','--global','--project','--local')
  $updateFlags = @('--cli','--plugin','--statusline','--user','--global','--project','--local')
  $words = $commandAst.CommandElements
  if ($words.Count -ge 2 -and $words[1].ToString() -eq 'dev') {
    $devSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'memory') {
    $memorySubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'session') {
    $sessionSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and ($words[1].ToString() -eq 'install' -or $words[1].ToString() -eq 'uninstall' -or $words[1].ToString() -eq 'disable' -or $words[1].ToString() -eq 'enable')) {
    $scopeFlags | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'permission') {
    @('--all','--user','--project') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'update') {
    $updateFlags | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } else {
    $commands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  }
}
${MARKER_END}
`;

// ─── Shell detection ─────────────────────────────────────────────────────────

type ShellType = "zsh" | "bash" | "fish" | "powershell" | "unsupported";

function detectShell(): ShellType {
  if (process.platform === "win32") return "powershell";
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("bash")) return "bash";
  if (shell.includes("fish")) return "fish";
  return "unsupported";
}

function getRcPath(shell: ShellType): string | null {
  const home = homedir();
  switch (shell) {
    case "zsh":
      return join(home, ".zshrc");
    case "bash":
      // macOS bash uses .bash_profile for login shells
      return process.platform === "darwin"
        ? join(home, ".bash_profile")
        : join(home, ".bashrc");
    case "fish":
      return join(home, ".config", "fish", "completions", "cf.fish");
    case "powershell":
      return join(
        process.env.USERPROFILE ?? home,
        "Documents",
        "PowerShell",
        "Microsoft.PowerShell_profile.ps1",
      );
    default:
      return null;
  }
}

// ─── Block helpers (for rc-file based shells) ────────────────────────────────

function extractExistingBlock(content: string): string | null {
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1) return null;
  return content.slice(startIdx, endIdx + MARKER_END.length);
}

function replaceBlock(content: string, newBlock: string): string {
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  let sliceStart = startIdx;
  while (sliceStart > 0 && content[sliceStart - 1] === "\n") sliceStart--;
  return (
    content.slice(0, sliceStart) +
    newBlock +
    content.slice(endIdx + MARKER_END.length)
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function hasShellCompletion(): boolean {
  const shell = detectShell();
  const rcPath = getRcPath(shell);
  if (!rcPath) return false;
  if (shell === "fish") return existsSync(rcPath);
  if (!existsSync(rcPath)) return false;
  return readFileSync(rcPath, "utf-8").includes(MARKER_START);
}

export function removeShellCompletion(): boolean {
  const shell = detectShell();
  const rcPath = getRcPath(shell);
  if (!rcPath) return false;

  if (shell === "fish") {
    if (!existsSync(rcPath)) return false;
    rmSync(rcPath);
    log.success(`Tab completion removed (${basename(rcPath)})`);
    return true;
  }

  if (!existsSync(rcPath)) return false;
  const content = readFileSync(rcPath, "utf-8");
  if (!content.includes(MARKER_START)) return false;

  writeFileSync(rcPath, replaceBlock(content, ""), "utf-8");
  log.success(`Tab completion removed from ~/${basename(rcPath)}`);
  return true;
}

export function ensureShellCompletion(opts?: { silent?: boolean }): boolean {
  const shell = detectShell();

  if (shell === "unsupported") {
    if (!opts?.silent)
      log.warn(
        `Shell not supported for tab completion (SHELL=${process.env.SHELL ?? ""}). Skipping.`,
      );
    return false;
  }

  const rcPath = getRcPath(shell)!;
  const rcName = basename(rcPath);

  // Fish: write a standalone file
  if (shell === "fish") {
    const dir = join(homedir(), ".config", "fish", "completions");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const existing = existsSync(rcPath) ? readFileSync(rcPath, "utf-8") : null;
    if (existing === FISH_CONTENT) {
      if (!opts?.silent)
        log.dim(`Tab completion already up-to-date (${rcName})`);
      return false;
    }
    writeFileSync(rcPath, FISH_CONTENT, "utf-8");
    if (!opts?.silent) {
      log.success(`Tab completion written to ${rcPath}`);
      log.dim("Open a new terminal to activate.");
    }
    return true;
  }

  // Determine new block
  let newBlock: string;
  if (shell === "zsh") {
    const existingContent = existsSync(rcPath)
      ? readFileSync(rcPath, "utf-8")
      : "";
    const needsCompinit = !existingContent.includes("autoload -Uz compinit");
    newBlock = buildZshBlock(needsCompinit);
  } else if (shell === "powershell") {
    newBlock = POWERSHELL_BLOCK;
  } else {
    newBlock = BASH_BLOCK;
  }

  if (existsSync(rcPath)) {
    const content = readFileSync(rcPath, "utf-8");
    if (content.includes(MARKER_START)) {
      const existing = extractExistingBlock(content);
      if (existing && existing.trim() === newBlock.trim()) {
        if (!opts?.silent)
          log.dim(`Tab completion already up-to-date in ~/${rcName}`);
        return false;
      }
      writeFileSync(rcPath, replaceBlock(content, newBlock), "utf-8");
      if (!opts?.silent) {
        log.success(`Tab completion updated in ~/${rcName}`);
        log.dim(
          `Run \`source ~/${rcName}\` or open a new terminal to activate.`,
        );
      }
      return true;
    }
  }

  appendFileSync(rcPath, newBlock);
  if (!opts?.silent) {
    log.success(`Tab completion added to ~/${rcName}`);
    if (shell !== "powershell")
      log.dim(`Run \`source ~/${rcName}\` or open a new terminal to activate.`);
    else log.dim("Open a new PowerShell terminal to activate.");
  }
  return true;
}
