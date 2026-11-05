import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import { log } from "./log.js";
import { PROVIDERS } from "./orchestrator/providers/index.js";
import { PROVIDER_NAMES } from "./orchestrator/store.js";

const MARKER_START = "# >>> coding-friend CLI completion >>>";
const MARKER_END = "# <<< coding-friend CLI completion <<<";

/** Provider lists for flag descriptions (no "[", "]" or ":" for zsh). */
const WORKER_PROVIDERS = PROVIDER_NAMES.join(", ");
const CHEF_PROVIDER_LIST = PROVIDER_NAMES.filter(
  (p) => PROVIDERS[p].caps.chef,
).join(", ");

const BASH_BLOCK = `

${MARKER_START}
_cf_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local commands="install uninstall disable enable init config learn mcp memory permission statusline update status version doctor docs project ask reply done task supervisor chef clean dev session sync decide guide"
  local scope_flags="--user --global --project --local"
  local update_flags="--cli --plugin --statusline --user --global --project --local --check --yes --json"

  # Subcommands for 'dev'
  if [[ "\${COMP_WORDS[1]}" == "dev" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "on off status restart sync update" -- "$cur"))
    return
  fi

  # Subcommands for 'memory'
  if [[ "\${COMP_WORDS[1]}" == "memory" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "status search list show edit delete rm init config start-daemon stop-daemon rebuild mcp" -- "$cur"))
    return
  fi

  # Subcommands for 'project'
  if [[ "\${COMP_WORDS[1]}" == "project" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "list add remove" -- "$cur"))
    return
  fi

  # Subcommands for 'docs'
  if [[ "\${COMP_WORDS[1]}" == "docs" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "list show" -- "$cur"))
    return
  fi

  # Subcommands for 'task'
  if [[ "\${COMP_WORDS[1]}" == "task" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "run list show cancel" -- "$cur"))
    return
  fi

  # Subcommands for 'supervisor'
  if [[ "\${COMP_WORDS[1]}" == "supervisor" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "install uninstall status tick" -- "$cur"))
    return
  fi

  # Subcommands for 'chef'
  if [[ "\${COMP_WORDS[1]}" == "chef" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "start say status inbox show stop resume" -- "$cur"))
    return
  fi

  # Subcommands for 'config'
  if [[ "\${COMP_WORDS[1]}" == "config" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "get set schema" -- "$cur"))
    return
  fi

  # Subcommands for 'session'
  if [[ "\${COMP_WORDS[1]}" == "session" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "list show export save load status" -- "$cur"))
    return
  fi

  # Subcommands for 'sync'
  if [[ "\${COMP_WORDS[1]}" == "sync" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "status" -- "$cur"))
    return
  fi

  # Subcommands for 'decide'
  if [[ "\${COMP_WORDS[1]}" == "decide" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "test eval log review-fp" -- "$cur"))
    return
  fi

  # Subcommands for 'guide'
  if [[ "\${COMP_WORDS[1]}" == "guide" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "create list" -- "$cur"))
    return
  fi

  # Subcommands for 'learn'
  if [[ "\${COMP_WORDS[1]}" == "learn" && \${COMP_CWORD} -eq 2 ]]; then
    COMPREPLY=($(compgen -W "status list search show edit delete host push" -- "$cur"))
    return
  fi

  # Path completion for 'dev on|restart|update'
  if [[ "\${COMP_WORDS[1]}" == "dev" && ("$prev" == "on" || "$prev" == "restart" || "$prev" == "update") ]]; then
    COMPREPLY=($(compgen -d -- "$cur"))
    return
  fi

  # Flag completion for install
  if [[ "\${COMP_WORDS[1]}" == "install" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "$scope_flags --mods --yes --json" -- "$cur"))
    return
  fi

  # Flag completion for config get/set
  if [[ "\${COMP_WORDS[1]}" == "config" && ("\${COMP_WORDS[2]}" == "get" || "\${COMP_WORDS[2]}" == "set") && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--global --local --project-dir --json" -- "$cur"))
    return
  fi

  # Flag completion for docs list/show
  if [[ "\${COMP_WORDS[1]}" == "docs" && ("\${COMP_WORDS[2]}" == "list" || "\${COMP_WORDS[2]}" == "show") && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--project-dir --json" -- "$cur"))
    return
  fi

  # Flag completion for memory search/list/show/edit/delete
  if [[ "\${COMP_WORDS[1]}" == "memory" && ("\${COMP_WORDS[2]}" == "search" || "\${COMP_WORDS[2]}" == "list" || "\${COMP_WORDS[2]}" == "show") && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--project-dir --json" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "memory" && "\${COMP_WORDS[2]}" == "edit" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--stdin --if-match --project-dir --json" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "memory" && "\${COMP_WORDS[2]}" == "delete" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--yes --if-match --project-dir --json" -- "$cur"))
    return
  fi

  # Flag completion for learn status/list/search/show/edit/delete
  if [[ "\${COMP_WORDS[1]}" == "learn" && ("\${COMP_WORDS[2]}" == "status" || "\${COMP_WORDS[2]}" == "list" || "\${COMP_WORDS[2]}" == "search" || "\${COMP_WORDS[2]}" == "show") && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--json" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "learn" && "\${COMP_WORDS[2]}" == "edit" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--stdin --if-match --json" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "learn" && "\${COMP_WORDS[2]}" == "delete" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--yes --if-match --json" -- "$cur"))
    return
  fi

  # Flag completion for task run
  if [[ "\${COMP_WORDS[1]}" == "task" && "\${COMP_WORDS[2]}" == "run" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--provider --model --read-only --no-fallback --json" -- "$cur"))
    return
  fi

  # Flag completion for chef start
  if [[ "\${COMP_WORDS[1]}" == "chef" && "\${COMP_WORDS[2]}" == "start" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--provider --no-commit --json" -- "$cur"))
    return
  fi

  # Flag completion for supervisor install/uninstall/status
  if [[ "\${COMP_WORDS[1]}" == "supervisor" && ("\${COMP_WORDS[2]}" == "install" || "\${COMP_WORDS[2]}" == "uninstall" || "\${COMP_WORDS[2]}" == "status") && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--label --json" -- "$cur"))
    return
  fi

  # Flag completion for ask
  if [[ "\${COMP_WORDS[1]}" == "ask" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--task --timeout --json" -- "$cur"))
    return
  fi

  # Flag completion for reply
  if [[ "\${COMP_WORDS[1]}" == "reply" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--task --json" -- "$cur"))
    return
  fi

  # Flag completion for done
  if [[ "\${COMP_WORDS[1]}" == "done" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--task --outcome --summary --handoff --json" -- "$cur"))
    return
  fi

  # Flag completion for doctor
  if [[ "\${COMP_WORDS[1]}" == "doctor" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--project-dir --json" -- "$cur"))
    return
  fi

  # Flag completion for session list/show/export/save/status/load
  if [[ "\${COMP_WORDS[1]}" == "session" && "\${COMP_WORDS[2]}" == "list" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--json --provider --project-dir --limit" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "session" && "\${COMP_WORDS[2]}" == "show" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--json --include-tool-output --offset --limit --project-dir" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "session" && "\${COMP_WORDS[2]}" == "export" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--json --include-tool-output --project-dir --out --force --redact-model --summary" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "session" && "\${COMP_WORDS[2]}" == "save" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--json --session-id --project-dir -l --label" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "session" && "\${COMP_WORDS[2]}" == "status" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--json" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "session" && "\${COMP_WORDS[2]}" == "load" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--json --yes --target --force --project-dir" -- "$cur"))
    return
  fi

  # Flag completion for sync status
  if [[ "\${COMP_WORDS[1]}" == "sync" && "\${COMP_WORDS[2]}" == "status" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--json" -- "$cur"))
    return
  fi

  # Value completion for decide eval --point
  if [[ "\${COMP_WORDS[1]}" == "decide" && "$prev" == "--point" ]]; then
    COMPREPLY=($(compgen -W "redact review-fp" -- "$cur"))
    return
  fi

  # Flag completion for decide test/eval/log/review-fp
  if [[ "\${COMP_WORDS[1]}" == "decide" && "\${COMP_WORDS[2]}" == "test" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--json" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "decide" && "\${COMP_WORDS[2]}" == "eval" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--point --json" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "decide" && "\${COMP_WORDS[2]}" == "log" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--since --threshold --json" -- "$cur"))
    return
  fi
  if [[ "\${COMP_WORDS[1]}" == "decide" && "\${COMP_WORDS[2]}" == "review-fp" && "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--snapshot-dir --report --json" -- "$cur"))
    return
  fi

  # --json for status, mcp, version, doctor, memory status, config schema, project *, task *, supervisor *, chef *
  if [[ "$cur" == -* ]] && [[ "\${COMP_WORDS[1]}" == "status" || "\${COMP_WORDS[1]}" == "mcp" || "\${COMP_WORDS[1]}" == "version" || "\${COMP_WORDS[1]}" == "doctor" || "\${COMP_WORDS[1]}" == "project" || "\${COMP_WORDS[1]}" == "task" || "\${COMP_WORDS[1]}" == "supervisor" || "\${COMP_WORDS[1]}" == "chef" || ("\${COMP_WORDS[1]}" == "config" && "\${COMP_WORDS[2]}" == "schema") || ("\${COMP_WORDS[1]}" == "memory" && "\${COMP_WORDS[2]}" == "status") ]]; then
    COMPREPLY=($(compgen -W "--json" -- "$cur"))
    return
  fi

  # Flag completion for uninstall/disable/enable
  if [[ "\${COMP_WORDS[1]}" == "uninstall" || "\${COMP_WORDS[1]}" == "disable" || "\${COMP_WORDS[1]}" == "enable" ]] && [[ "$cur" == -* ]]; then
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
    'learn:Manage learning docs — browse, edit, host as a website or push to git'
    'mcp:Setup MCP server for learning docs'
    'memory:AI memory system — store and search project knowledge'
    'permission:Manage Claude Code permission rules for Coding Friend'
    'statusline:Setup coding-friend statusline in Claude Code'
    'update:Update coding-friend plugin and refresh statusline'
    'dev:Switch between local and remote plugin for development'
    'status:Show comprehensive Coding Friend status'
    'version:Show CLI and plugin versions'
    'doctor:Check the Coding Friend setup (read-only)'
    "docs:Browse the project's markdown docs"
    'project:Manage the registry of Coding Friend projects'
    'ask:Ask the user a question from a task and wait for the answer'
    'reply:Answer a question asked by a task'
    'done:Mark a task finished with an outcome and summary'
    'task:Run and manage sandboxed worker tasks'
    'supervisor:Resume paused tasks in the background (launchd on macOS)'
    'chef:Run a coordinating agent that works through a plan with tasks'
    'clean:Clean files generated by Coding Friend in docs/'
    'session:View Claude Code and Codex sessions, export them redacted, save and load'
    'sync:Show where learn notes and saved sessions sync (cloud folders, placeholders, conflicts)'
    'decide:Decision model (beta) — test the provider, run the eval, read the shadow log'
    'guide:Manage custom skill guides'
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
    '--check[Only report installed vs latest versions]'
    '--yes[Run without confirmation (needed with --json)]'
    '--json[Output a JSON envelope (requires --check or --yes)]'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "install" ]]; then
    _values 'flags' \$scope_flags '--mods[Also install coding-friend-mods (Claude Code only)]' '--yes[Skip prompts (default scope: user)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "uninstall" || "\${words[2]}" == "disable" || "\${words[2]}" == "enable" ]]; then
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
      'show:Print one memory (<category/slug>)'
      'edit:Replace a memory body from stdin (--stdin --if-match)'
      'delete:Delete a memory and its CLAUDE.md / AGENTS.md entry'
      'rm:Remove a project database'
      'init:Initialize memory system (interactive wizard)'
      'config:Configure memory system settings'
      'start-daemon:Start the memory daemon (Tier 2)'
      'stop-daemon:Stop the memory daemon'
      'rebuild:Rebuild the daemon search index'
      'mcp:Show MCP server setup instructions'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "project" ]]; then
    local -a subcommands
    subcommands=(
      'list:List registered projects'
      'add:Register a project (default: current directory)'
      'remove:Unregister a project'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "docs" ]]; then
    local -a subcommands
    subcommands=(
      'list:List markdown files under the docs dir'
      'show:Print one markdown file (path relative to the docs dir)'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "docs" && ("\${words[3]}" == "list" || "\${words[3]}" == "show") ]]; then
    _values 'flags' '--project-dir[Run against this project (resolved to its main repo root)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "memory" && ("\${words[3]}" == "search" || "\${words[3]}" == "list" || "\${words[3]}" == "show") ]]; then
    _values 'flags' '--project-dir[Run against this project (resolved to its main repo root)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "memory" && "\${words[3]}" == "edit" ]]; then
    _values 'flags' '--stdin[Read the new body from stdin (required)]' '--if-match[sha256 from memory show (required)]' '--project-dir[Run against this project (resolved to its main repo root)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "memory" && "\${words[3]}" == "delete" ]]; then
    _values 'flags' '--yes[Skip the confirmation prompt (required with --json)]' '--if-match[sha256 from memory show]' '--project-dir[Run against this project (resolved to its main repo root)]' '--json[Output a JSON envelope]'
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "task" ]]; then
    local -a subcommands
    subcommands=(
      'run:Start a detached worker task in the current checkout'
      'list:List tasks, newest first'
      "show:Show a task's state, questions and result"
      'cancel:Cancel a running or paused task'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "supervisor" ]]; then
    local -a subcommands
    subcommands=(
      'install:Install the launchd agent that runs supervisor tick every minute'
      'uninstall:Unload the launchd agent and remove its plist'
      'status:Show the agent, the last tick and paused tasks'
      'tick:Adopt paused tasks whose runner is gone (run by launchd/cron)'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "chef" ]]; then
    local -a subcommands
    subcommands=(
      'start:Start a chef for a plan in the current checkout'
      'say:Send a message to a chef'
      'status:Show chefs and their state'
      'inbox:Show what chefs need from you'
      "show:Show a chef's decisions, tasks, commits and progress"
      'stop:Stop a chef'
      'resume:Resume a paused chef'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "config" ]]; then
    local -a subcommands
    subcommands=(
      'get:Read a config value'
      'set:Write a config value'
      'schema:Print the config JSON schema'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "config" && ("\${words[3]}" == "get" || "\${words[3]}" == "set") ]]; then
    _values 'flags' '--global[Use the global config]' '--local[Use the local project config]' '--project-dir[Run against this project (resolved to its main repo root)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "doctor" ]]; then
    _values 'flags' '--project-dir[Check only this project (resolved to its main repo root)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "status" || "\${words[2]}" == "mcp" || "\${words[2]}" == "version" || "\${words[2]}" == "doctor" ]]; then
    _values 'flags' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "ask" ]]; then
    _values 'flags' '--task[Task id (default: $CF_TASK_ID)]' '--timeout[Seconds to wait for an answer (default: 100)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "reply" ]]; then
    _values 'flags' '--task[Task that asked the question]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 3 )) && [[ "\${words[2]}" == "done" ]]; then
    _values 'flags' '--task[Task id (default: $CF_TASK_ID)]' '--outcome[succeeded or failed]' '--summary[Short summary of the result]' '--handoff[Path to a handoff file]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "task" && "\${words[3]}" == "run" ]]; then
    _values 'flags' '--provider[Worker CLI (${WORKER_PROVIDERS})]' '--model[Model of the provider given by --provider]' '--read-only[Worker may not edit the checkout (no writer lease)]' '--no-fallback[On a quota limit, wait for the reset instead of switching provider]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "chef" && "\${words[3]}" == "start" ]]; then
    _values 'flags' '--provider[Chef CLI (${CHEF_PROVIDER_LIST})]' '--no-commit[Never commit; leave changes in the checkout]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "supervisor" && ("\${words[3]}" == "install" || "\${words[3]}" == "uninstall" || "\${words[3]}" == "status") ]]; then
    _values 'flags' '--label[launchd label (default: com.coding-friend.supervisor)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "project" || "\${words[2]}" == "task" || "\${words[2]}" == "supervisor" || "\${words[2]}" == "chef" || ("\${words[2]}" == "config" && "\${words[3]}" == "schema") || ("\${words[2]}" == "memory" && "\${words[3]}" == "status") ]]; then
    _values 'flags' '--json[Output a JSON envelope]'
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "session" ]]; then
    local -a subcommands
    subcommands=(
      'list:List Claude Code, Codex and saved sessions, newest first'
      "show:Print a session's turns, always redacted"
      'export:Print a session as redacted Markdown'
      'save:Save a Claude Code session verbatim (not redacted) to session.dir'
      'load:Load a saved session from session.dir'
      'status:Show session.dir, its cloud folder and suggested folders'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "session" && "\${words[3]}" == "list" ]]; then
    _values 'flags' '--json[Output a JSON envelope]' '--provider[Only sessions of this provider (claude|codex|saved)]' '--project-dir[Only sessions of this project (resolved to its main repo root)]' '--limit[At most this many sessions (1-500, default 50)]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "session" && "\${words[3]}" == "show" ]]; then
    _values 'flags' '--json[Output a JSON envelope]' '--include-tool-output[Include tool output (redacted, cut)]' '--offset[First turn to print (default 0)]' '--limit[At most this many turns (1-1000, default 200)]' "--project-dir[Prefer this project's copy of the session]"
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "session" && "\${words[3]}" == "export" ]]; then
    _values 'flags' '--json[Output a JSON envelope]' '--include-tool-output[Include tool output (redacted, cut)]' "--project-dir[Prefer this project's copy of the session]" '--out[Write the full Markdown to this file (mode 0600)]' '--force[With --out: overwrite an existing file]' '--redact-model[Also drop parts the decision model flags as secret or personal data]' '--summary[Keep only the parts the decision model rates most important]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "session" && "\${words[3]}" == "save" ]]; then
    _values 'flags' '--json[Output a JSON envelope]' '--session-id[Session UUID to save (default: newest)]' '--project-dir[Look for the session in this project (resolved to its main repo root)]' '-l[Label for this session]' '--label[Label for this session]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "session" && "\${words[3]}" == "status" ]]; then
    _values 'flags' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "session" && "\${words[3]}" == "load" ]]; then
    _values 'flags' '--json[Output a JSON envelope]' '--yes[With --json: load without asking]' '--target[With --json: project directory to load into]' '--force[Overwrite a transcript that is already there]' "--project-dir[Also list this project's legacy docs sessions]"
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "sync" ]]; then
    local -a subcommands
    subcommands=(
      'status:Show the learn and session folders, their cloud folder, placeholders and conflict copies'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "sync" && "\${words[3]}" == "status" ]]; then
    _values 'flags' '--json[Output a JSON envelope]'
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "decide" ]]; then
    local -a subcommands
    subcommands=(
      'test:Send one built-in synthetic request and print the answer'
      'eval:Score the model on the built-in golden sets (accuracy, fallback, latency)'
      'log:Summarize the decision log (numbers only, read-only)'
      'review-fp:Ask the model whether each /cf-review finding shows in the code (shadow, logs only)'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT >= 5 )) && [[ "\${words[2]}" == "decide" && "\${words[3]}" == "eval" && "\${words[CURRENT-1]}" == "--point" ]]; then
    _values 'point' 'redact' 'review-fp'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "decide" && "\${words[3]}" == "test" ]]; then
    _values 'flags' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "decide" && "\${words[3]}" == "eval" ]]; then
    _values 'flags' '--point[Only this golden set (redact or review-fp, default both)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "decide" && "\${words[3]}" == "log" ]]; then
    _values 'flags' '--since[Only lines from this date (YYYY-MM-DD or ISO)]' '--threshold[Noul below this counts as a likely false positive (0-1, default 0.2)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "decide" && "\${words[3]}" == "review-fp" ]]; then
    _values 'flags' '--snapshot-dir[Review snapshot under /tmp/coding-friend/review/]' '--report[Review report under /tmp/coding-friend/review/]' '--json[Output a JSON envelope]'
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "guide" ]]; then
    local -a subcommands
    subcommands=(
      'create:Create a custom guide for a skill'
      'list:List existing custom guides'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT == 3 )) && [[ "\${words[2]}" == "learn" ]]; then
    local -a subcommands
    subcommands=(
      'status:Show the learn folder, its mode (git or folder) and cloud folders'
      'list:List learn notes (and cloud files not downloaded yet)'
      'search:Search learn notes by title, tags and body'
      'show:Print one learn note (<category/slug>)'
      'edit:Replace a learn note body from stdin (--stdin --if-match)'
      'delete:Delete a learn note'
      'host:Build and serve learning docs as a static website'
      'push:Commit and push learning docs to origin'
    )
    _describe 'subcommand' subcommands
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "learn" && ("\${words[3]}" == "status" || "\${words[3]}" == "list" || "\${words[3]}" == "search" || "\${words[3]}" == "show") ]]; then
    _values 'flags' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "learn" && "\${words[3]}" == "edit" ]]; then
    _values 'flags' '--stdin[Read the new body from stdin (required)]' '--if-match[sha256 from learn show (required)]' '--json[Output a JSON envelope]'
  elif (( CURRENT >= 4 )) && [[ "\${words[2]}" == "learn" && "\${words[3]}" == "delete" ]]; then
    _values 'flags' '--yes[Skip the confirmation prompt (required with --json)]' '--if-match[sha256 from learn show]' '--json[Output a JSON envelope]'
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
complete -c cf -n "__fish_use_subcommand" -a learn -d "Manage learning docs — browse, edit, host as a website or push to git"
complete -c cf -n "__fish_use_subcommand" -a mcp -d "Setup MCP server for learning docs"
complete -c cf -n "__fish_use_subcommand" -a memory -d "AI memory system — store and search project knowledge"
complete -c cf -n "__fish_use_subcommand" -a permission -d "Manage Claude Code permission rules"
complete -c cf -n "__fish_use_subcommand" -a statusline -d "Setup coding-friend statusline in Claude Code"
complete -c cf -n "__fish_use_subcommand" -a update -d "Update coding-friend plugin and refresh statusline"
complete -c cf -n "__fish_use_subcommand" -a dev -d "Switch between local and remote plugin for development"
complete -c cf -n "__fish_use_subcommand" -a status -d "Show comprehensive Coding Friend status"
complete -c cf -n "__fish_use_subcommand" -a version -d "Show CLI and plugin versions"
complete -c cf -n "__fish_use_subcommand" -a doctor -d "Check the Coding Friend setup (read-only)"
complete -c cf -n "__fish_use_subcommand" -a docs -d "Browse the project's markdown docs"
complete -c cf -n "__fish_use_subcommand" -a project -d "Manage the registry of Coding Friend projects"
complete -c cf -n "__fish_use_subcommand" -a ask -d "Ask the user a question from a task and wait for the answer"
complete -c cf -n "__fish_use_subcommand" -a reply -d "Answer a question asked by a task"
complete -c cf -n "__fish_use_subcommand" -a done -d "Mark a task finished with an outcome and summary"
complete -c cf -n "__fish_use_subcommand" -a task -d "Run and manage sandboxed worker tasks"
complete -c cf -n "__fish_use_subcommand" -a supervisor -d "Resume paused tasks in the background (launchd on macOS)"
complete -c cf -n "__fish_use_subcommand" -a chef -d "Run a coordinating agent that works through a plan with tasks"
complete -c cf -n "__fish_use_subcommand" -a clean -d "Clean files generated by Coding Friend in docs/"
complete -c cf -n "__fish_use_subcommand" -a session -d "View Claude Code and Codex sessions, export them redacted, save and load"
complete -c cf -n "__fish_use_subcommand" -a sync -d "Show where learn notes and saved sessions sync (cloud folders, placeholders, conflicts)"
complete -c cf -n "__fish_use_subcommand" -a decide -d "Decision model (beta): test the provider, run the eval, read the shadow log"
complete -c cf -n "__fish_use_subcommand" -a guide -d "Manage custom skill guides"
# Scope flags for install/uninstall/disable/enable
complete -c cf -n "__fish_seen_subcommand_from install uninstall disable enable; and not __fish_seen_subcommand_from supervisor" -l user -d "User scope (all projects)"
complete -c cf -n "__fish_seen_subcommand_from install uninstall disable enable; and not __fish_seen_subcommand_from supervisor" -l global -d "User scope (all projects)"
complete -c cf -n "__fish_seen_subcommand_from install uninstall disable enable; and not __fish_seen_subcommand_from supervisor" -l project -d "Project scope (shared via git)"
complete -c cf -n "__fish_seen_subcommand_from install uninstall disable enable; and not __fish_seen_subcommand_from supervisor" -l local -d "Local scope (this machine only)"
# Flags for update
complete -c cf -n "__fish_seen_subcommand_from update" -l cli -d "Update only the CLI"
complete -c cf -n "__fish_seen_subcommand_from update" -l plugin -d "Update only the plugin"
complete -c cf -n "__fish_seen_subcommand_from update" -l statusline -d "Update only the statusline"
complete -c cf -n "__fish_seen_subcommand_from update" -l user -d "User scope (all projects)"
complete -c cf -n "__fish_seen_subcommand_from update" -l global -d "User scope (all projects)"
complete -c cf -n "__fish_seen_subcommand_from update" -l project -d "Project scope"
complete -c cf -n "__fish_seen_subcommand_from update" -l local -d "Local scope"
complete -c cf -n "__fish_seen_subcommand_from update" -l check -d "Only report installed vs latest versions"
complete -c cf -n "__fish_seen_subcommand_from update" -l yes -d "Run without confirmation (needed with --json)"
# Flags for install
complete -c cf -n "__fish_seen_subcommand_from install; and not __fish_seen_subcommand_from supervisor" -l yes -d "Skip prompts (default scope: user)"
complete -c cf -n "__fish_seen_subcommand_from install; and not __fish_seen_subcommand_from supervisor" -l mods -d "Also install coding-friend-mods (Claude Code only)"
# --json for machine-callable commands
complete -c cf -n "__fish_seen_subcommand_from status mcp version doctor project config install update ask reply done task supervisor chef" -l json -d "Output a JSON envelope"
complete -c cf -n "__fish_seen_subcommand_from doctor" -l project-dir -r -d "Check only this project (resolved to its main repo root)"
complete -c cf -n "__fish_seen_subcommand_from memory; and __fish_seen_subcommand_from search list show edit delete" -l json -d "Output a JSON envelope"
# Project subcommands
complete -c cf -n "__fish_seen_subcommand_from project" -a list -d "List registered projects"
complete -c cf -n "__fish_seen_subcommand_from project" -a add -d "Register a project (default: current directory)"
complete -c cf -n "__fish_seen_subcommand_from project" -a remove -d "Unregister a project"
# Docs subcommands and flags
complete -c cf -n "__fish_seen_subcommand_from docs" -a list -d "List markdown files under the docs dir"
complete -c cf -n "__fish_seen_subcommand_from docs" -a show -d "Print one markdown file (path relative to the docs dir)"
complete -c cf -n "__fish_seen_subcommand_from docs; and __fish_seen_subcommand_from list show" -l project-dir -r -d "Run against this project (resolved to its main repo root)"
complete -c cf -n "__fish_seen_subcommand_from docs; and __fish_seen_subcommand_from list show" -l json -d "Output a JSON envelope"
# Task subcommands and flags
complete -c cf -n "__fish_seen_subcommand_from task" -a run -d "Start a detached worker task in the current checkout"
complete -c cf -n "__fish_seen_subcommand_from task" -a list -d "List tasks, newest first"
complete -c cf -n "__fish_seen_subcommand_from task" -a show -d "Show a task's state, questions and result"
complete -c cf -n "__fish_seen_subcommand_from task" -a cancel -d "Cancel a running or paused task"
complete -c cf -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from run" -l provider -d "Worker CLI: ${WORKER_PROVIDERS}"
complete -c cf -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from run" -l model -d "Model of the provider given by --provider"
complete -c cf -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from run" -l read-only -d "Worker may not edit the checkout"
complete -c cf -n "__fish_seen_subcommand_from task; and __fish_seen_subcommand_from run" -l no-fallback -d "On a quota limit, wait for the reset instead of switching provider"
# Supervisor subcommands and flags
complete -c cf -n "__fish_seen_subcommand_from supervisor" -a install -d "Install the launchd agent that runs supervisor tick every minute"
complete -c cf -n "__fish_seen_subcommand_from supervisor" -a uninstall -d "Unload the launchd agent and remove its plist"
complete -c cf -n "__fish_seen_subcommand_from supervisor" -a status -d "Show the agent, the last tick and paused tasks"
complete -c cf -n "__fish_seen_subcommand_from supervisor" -a tick -d "Adopt paused tasks whose runner is gone"
complete -c cf -n "__fish_seen_subcommand_from supervisor; and __fish_seen_subcommand_from install uninstall status" -l label -d "launchd label"
# Chef subcommands and flags
complete -c cf -n "__fish_seen_subcommand_from chef" -a start -d "Start a chef for a plan in the current checkout"
complete -c cf -n "__fish_seen_subcommand_from chef" -a say -d "Send a message to a chef"
complete -c cf -n "__fish_seen_subcommand_from chef" -a status -d "Show chefs and their state"
complete -c cf -n "__fish_seen_subcommand_from chef" -a inbox -d "Show what chefs need from you"
complete -c cf -n "__fish_seen_subcommand_from chef" -a show -d "Show a chef's decisions, tasks, commits and progress"
complete -c cf -n "__fish_seen_subcommand_from chef" -a stop -d "Stop a chef"
complete -c cf -n "__fish_seen_subcommand_from chef" -a resume -d "Resume a paused chef"
complete -c cf -n "__fish_seen_subcommand_from chef; and __fish_seen_subcommand_from start" -l provider -d "Chef CLI: ${CHEF_PROVIDER_LIST}"
complete -c cf -n "__fish_seen_subcommand_from chef; and __fish_seen_subcommand_from start" -l no-commit -d "Never commit; leave changes in the checkout"
# Flags for ask/reply/done
complete -c cf -n "__fish_seen_subcommand_from ask reply done" -l task -d "Task id"
complete -c cf -n "__fish_seen_subcommand_from ask" -l timeout -d "Seconds to wait for an answer"
complete -c cf -n "__fish_seen_subcommand_from done" -l outcome -d "succeeded or failed"
complete -c cf -n "__fish_seen_subcommand_from done" -l summary -d "Short summary of the result"
complete -c cf -n "__fish_seen_subcommand_from done" -l handoff -d "Path to a handoff file"
# Config subcommands and flags
complete -c cf -n "__fish_seen_subcommand_from config" -a get -d "Read a config value"
complete -c cf -n "__fish_seen_subcommand_from config" -a set -d "Write a config value"
complete -c cf -n "__fish_seen_subcommand_from config" -a schema -d "Print the config JSON schema"
complete -c cf -n "__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get set" -l global -d "Use the global config"
complete -c cf -n "__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get set" -l local -d "Use the local project config"
complete -c cf -n "__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get set" -l project-dir -r -d "Run against this project (resolved to its main repo root)"
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
complete -c cf -n "__fish_seen_subcommand_from memory" -a show -d "Print one memory (<category/slug>)"
complete -c cf -n "__fish_seen_subcommand_from memory" -a edit -d "Replace a memory body from stdin (--stdin --if-match)"
complete -c cf -n "__fish_seen_subcommand_from memory" -a delete -d "Delete a memory and its CLAUDE.md / AGENTS.md entry"
complete -c cf -n "__fish_seen_subcommand_from memory" -a rm -d "Remove a project database"
complete -c cf -n "__fish_seen_subcommand_from memory" -a init -d "Initialize memory system (interactive wizard)"
complete -c cf -n "__fish_seen_subcommand_from memory" -a config -d "Configure memory system settings"
complete -c cf -n "__fish_seen_subcommand_from memory" -a start-daemon -d "Start the memory daemon (Tier 2)"
complete -c cf -n "__fish_seen_subcommand_from memory" -a stop-daemon -d "Stop the memory daemon"
complete -c cf -n "__fish_seen_subcommand_from memory" -a rebuild -d "Rebuild the daemon search index"
complete -c cf -n "__fish_seen_subcommand_from memory" -a mcp -d "Show MCP server setup instructions"
complete -c cf -n "__fish_seen_subcommand_from memory; and __fish_seen_subcommand_from search list show edit delete" -l project-dir -r -d "Run against this project (resolved to its main repo root)"
complete -c cf -n "__fish_seen_subcommand_from memory; and __fish_seen_subcommand_from edit" -l stdin -d "Read the new body from stdin (required)"
complete -c cf -n "__fish_seen_subcommand_from memory; and __fish_seen_subcommand_from edit delete" -l if-match -r -d "sha256 from memory show"
complete -c cf -n "__fish_seen_subcommand_from memory; and __fish_seen_subcommand_from delete" -l yes -d "Skip the confirmation prompt (required with --json)"
# Session subcommands and flags
complete -c cf -n "__fish_seen_subcommand_from session" -a list -d "List Claude Code, Codex and saved sessions, newest first"
complete -c cf -n "__fish_seen_subcommand_from session" -a show -d "Print a session's turns, always redacted"
complete -c cf -n "__fish_seen_subcommand_from session" -a export -d "Print a session as redacted Markdown"
complete -c cf -n "__fish_seen_subcommand_from session" -a save -d "Save a Claude Code session verbatim (not redacted) to session.dir"
complete -c cf -n "__fish_seen_subcommand_from session" -a load -d "Load a saved session from session.dir"
complete -c cf -n "__fish_seen_subcommand_from session" -a status -d "Show session.dir, its cloud folder and suggested folders"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from list show export save status load" -l json -d "Output a JSON envelope"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from list show export save load" -l project-dir -r -d "Run against this project (resolved to its main repo root)"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from list" -l provider -r -d "Only sessions of this provider: claude|codex|saved"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from save" -l session-id -r -d "Session UUID to save (default: newest)"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from save" -s l -l label -r -d "Label for this session"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from list show" -l limit -r -d "At most this many sessions or turns"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from show" -l offset -r -d "First turn to print (default 0)"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from show export" -l include-tool-output -d "Include tool output (redacted, cut)"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from export" -l out -r -d "Write the full Markdown to this file (mode 0600)"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from export" -l redact-model -d "Also drop parts the decision model flags as secret or personal data"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from export" -l summary -d "Keep only the parts the decision model rates most important"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from export load" -l force -d "Overwrite an existing file or transcript"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from load" -l yes -d "With --json: load without asking"
complete -c cf -n "__fish_seen_subcommand_from session; and __fish_seen_subcommand_from load" -l target -r -d "With --json: project directory to load into"
# Sync subcommands and flags
complete -c cf -n "__fish_seen_subcommand_from sync; and not __fish_seen_subcommand_from dev" -a status -d "Show the learn and session folders, their cloud folder, placeholders and conflict copies"
complete -c cf -n "__fish_seen_subcommand_from sync; and __fish_seen_subcommand_from status" -l json -d "Output a JSON envelope"
# Decide subcommands and flags
complete -c cf -n "__fish_seen_subcommand_from decide" -a test -d "Send one built-in synthetic request and print the answer"
complete -c cf -n "__fish_seen_subcommand_from decide" -a eval -d "Score the model on the built-in golden sets (accuracy, fallback, latency)"
complete -c cf -n "__fish_seen_subcommand_from decide" -a log -d "Summarize the decision log (numbers only, read-only)"
complete -c cf -n "__fish_seen_subcommand_from decide" -a review-fp -d "Ask the model whether each /cf-review finding shows in the code (shadow, logs only)"
complete -c cf -n "__fish_seen_subcommand_from decide; and __fish_seen_subcommand_from test eval log review-fp" -l json -d "Output a JSON envelope"
complete -c cf -n "__fish_seen_subcommand_from decide; and __fish_seen_subcommand_from eval" -l point -r -a "redact review-fp" -d "Only this golden set (default both)"
complete -c cf -n "__fish_seen_subcommand_from decide; and __fish_seen_subcommand_from log" -l since -r -d "Only lines from this date (YYYY-MM-DD or ISO)"
complete -c cf -n "__fish_seen_subcommand_from decide; and __fish_seen_subcommand_from log" -l threshold -r -d "Noul below this counts as a likely false positive (0-1, default 0.2)"
complete -c cf -n "__fish_seen_subcommand_from decide; and __fish_seen_subcommand_from review-fp" -l snapshot-dir -r -d "Review snapshot under /tmp/coding-friend/review/"
complete -c cf -n "__fish_seen_subcommand_from decide; and __fish_seen_subcommand_from review-fp" -l report -r -d "Review report under /tmp/coding-friend/review/"
# Guide subcommands
complete -c cf -n "__fish_seen_subcommand_from guide" -a create -d "Create a custom guide for a skill"
complete -c cf -n "__fish_seen_subcommand_from guide" -a list -d "List existing custom guides"
# Learn subcommands
complete -c cf -n "__fish_seen_subcommand_from learn" -a status -d "Show the learn folder, its mode (git or folder) and cloud folders"
complete -c cf -n "__fish_seen_subcommand_from learn" -a list -d "List learn notes (and cloud files not downloaded yet)"
complete -c cf -n "__fish_seen_subcommand_from learn" -a search -d "Search learn notes by title, tags and body"
complete -c cf -n "__fish_seen_subcommand_from learn" -a show -d "Print one learn note (<category/slug>)"
complete -c cf -n "__fish_seen_subcommand_from learn" -a edit -d "Replace a learn note body from stdin (--stdin --if-match)"
complete -c cf -n "__fish_seen_subcommand_from learn" -a delete -d "Delete a learn note"
complete -c cf -n "__fish_seen_subcommand_from learn" -a host -d "Build and serve learning docs as a static website"
complete -c cf -n "__fish_seen_subcommand_from learn" -a push -d "Commit and push learning docs to origin"
complete -c cf -n "__fish_seen_subcommand_from learn; and __fish_seen_subcommand_from status list search show edit delete" -l json -d "Output a JSON envelope"
complete -c cf -n "__fish_seen_subcommand_from learn; and __fish_seen_subcommand_from edit" -l stdin -d "Read the new body from stdin (required)"
complete -c cf -n "__fish_seen_subcommand_from learn; and __fish_seen_subcommand_from edit delete" -l if-match -r -d "sha256 from learn show"
complete -c cf -n "__fish_seen_subcommand_from learn; and __fish_seen_subcommand_from delete" -l yes -d "Skip the confirmation prompt (required with --json)"
`;

const POWERSHELL_BLOCK = `

${MARKER_START}
Register-ArgumentCompleter -Native -CommandName cf -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = @('install','uninstall','disable','enable','init','config','learn','mcp','memory','permission','statusline','update','status','version','doctor','docs','project','ask','reply','done','task','supervisor','chef','clean','dev','session','sync','decide','guide')
  $devSubcommands = @('on','off','status','restart','sync','update')
  $memorySubcommands = @('status','search','list','show','edit','delete','rm','init','config','start-daemon','stop-daemon','rebuild','mcp')
  $sessionSubcommands = @('list','show','export','save','load','status')
  $syncSubcommands = @('status')
  $decideSubcommands = @('test','eval','log','review-fp')
  $docsSubcommands = @('list','show')
  $projectSubcommands = @('list','add','remove')
  $taskSubcommands = @('run','list','show','cancel')
  $supervisorSubcommands = @('install','uninstall','status','tick')
  $chefSubcommands = @('start','say','status','inbox','show','stop','resume')
  $configSubcommands = @('get','set','schema')
  $guideSubcommands = @('create','list')
  $learnSubcommands = @('status','list','search','show','edit','delete','host','push')
  $scopeFlags = @('--user','--global','--project','--local')
  $updateFlags = @('--cli','--plugin','--statusline','--user','--global','--project','--local','--check','--yes','--json')
  $words = $commandAst.CommandElements
  if ($wordToComplete -like '-*' -and $words.Count -ge 2 -and $words[1].ToString() -eq 'config' -and $words.Count -ge 3 -and ($words[2].ToString() -eq 'get' -or $words[2].ToString() -eq 'set')) {
    @('--global','--local','--project-dir','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'docs' -and @('list','show') -contains $words[2].ToString()) {
    @('--project-dir','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'memory' -and @('search','list','show') -contains $words[2].ToString()) {
    @('--project-dir','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'memory' -and $words[2].ToString() -eq 'edit') {
    @('--stdin','--if-match','--project-dir','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'memory' -and $words[2].ToString() -eq 'delete') {
    @('--yes','--if-match','--project-dir','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'learn' -and @('status','list','search','show') -contains $words[2].ToString()) {
    @('--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'learn' -and $words[2].ToString() -eq 'edit') {
    @('--stdin','--if-match','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'learn' -and $words[2].ToString() -eq 'delete') {
    @('--yes','--if-match','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'task' -and $words[2].ToString() -eq 'run') {
    @('--provider','--model','--read-only','--no-fallback','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'chef' -and $words[2].ToString() -eq 'start') {
    @('--provider','--no-commit','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'supervisor' -and @('install','uninstall','status') -contains $words[2].ToString()) {
    @('--label','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'session' -and $words[2].ToString() -eq 'list') {
    @('--json','--provider','--project-dir','--limit') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'session' -and $words[2].ToString() -eq 'show') {
    @('--json','--include-tool-output','--offset','--limit','--project-dir') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'session' -and $words[2].ToString() -eq 'export') {
    @('--json','--include-tool-output','--project-dir','--out','--force','--redact-model','--summary') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'session' -and $words[2].ToString() -eq 'save') {
    @('--json','--session-id','--project-dir','-l','--label') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'session' -and $words[2].ToString() -eq 'status') {
    @('--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'session' -and $words[2].ToString() -eq 'load') {
    @('--json','--yes','--target','--force','--project-dir') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'sync' -and $words[2].ToString() -eq 'status') {
    @('--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -notlike '-*' -and $words.Count -ge 4 -and $words[1].ToString() -eq 'decide' -and $words[2].ToString() -eq 'eval' -and ($words[$words.Count - 1].ToString() -eq '--point' -or ($wordToComplete -ne '' -and $words[$words.Count - 2].ToString() -eq '--point'))) {
    @('redact','review-fp') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'decide' -and $words[2].ToString() -eq 'test') {
    @('--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'decide' -and $words[2].ToString() -eq 'eval') {
    @('--point','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'decide' -and $words[2].ToString() -eq 'log') {
    @('--since','--threshold','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 3 -and $words[1].ToString() -eq 'decide' -and $words[2].ToString() -eq 'review-fp') {
    @('--snapshot-dir','--report','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 2 -and $words[1].ToString() -eq 'doctor') {
    @('--project-dir','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($wordToComplete -like '-*' -and $words.Count -ge 2 -and @('status','mcp','version','doctor','project','config','memory','task','supervisor','chef') -contains $words[1].ToString()) {
    @('--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'dev') {
    $devSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'memory') {
    $memorySubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'docs') {
    $docsSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'project') {
    $projectSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'task') {
    $taskSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'supervisor') {
    $supervisorSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'chef') {
    $chefSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'ask') {
    @('--task','--timeout','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'reply') {
    @('--task','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'done') {
    @('--task','--outcome','--summary','--handoff','--json') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'config') {
    $configSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'session') {
    $sessionSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'sync') {
    $syncSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'decide') {
    $decideSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'guide') {
    $guideSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'learn') {
    $learnSubcommands | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and $words[1].ToString() -eq 'install') {
    ($scopeFlags + @('--mods','--yes','--json')) | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
  } elseif ($words.Count -ge 2 -and ($words[1].ToString() -eq 'uninstall' -or $words[1].ToString() -eq 'disable' -or $words[1].ToString() -eq 'enable')) {
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

  const rcDir = dirname(rcPath);
  if (!existsSync(rcDir)) mkdirSync(rcDir, { recursive: true });
  appendFileSync(rcPath, newBlock);
  if (!opts?.silent) {
    log.success(`Tab completion added to ~/${rcName}`);
    if (shell !== "powershell")
      log.dim(`Run \`source ~/${rcName}\` or open a new terminal to activate.`);
    else log.dim("Open a new PowerShell terminal to activate.");
  }
  return true;
}
