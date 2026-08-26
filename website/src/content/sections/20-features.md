## Features

Workflows, memory, and hooks you opt into after install.

### Workflow

You plan, implement, review, commit, then ship. Bugs loop through `/cf-fix` and `cf-sys-debug`.

```text
┌─────────┐   ┌─────────────────┐   ┌───────────┐
│ /cf-plan│ → │ cf-tdd/implement│ → │ /cf-review│
└─────────┘   └─────────────────┘   └───────────┘
                     ↓                     ↓
              ┌─────────────┐       ┌───────────┐
              │ /cf-fix     │       │ /cf-commit│
              │      ↓      │       └───────────┘
              │ cf-sys-debug│              ↓
              │      ↓      │       ┌───────────┐
              │ /cf-fix     │       │ /cf-ship  │
              └─────────────┘       └───────────┘
                                           ↓
                            ┌──────────────────────────┐
                            │ cf-verification          │
                            │ before "done"            │
                            │ /cf-learn /cf-remember   │
                            │               → docs/    │
                            └──────────────────────────┘
```

### Memory

Search falls through three local tiers: SQLite (FTS5 + vectors), then MiniSearch, then grep. Markdown in `docs/memory/` is the source of truth.

```text
┌─────────────────────────┐
│ SQLite (FTS5 + vectors) │
└─────────────────────────┘
             ↓
┌─────────────────────────┐
│ MiniSearch              │
└─────────────────────────┘
             ↓
┌─────────────────────────┐
│ grep                    │
└─────────────────────────┘
```

### Auto-approve

Claude classifies in three steps. Codex, agy, and omp use deterministic rules only.

```text
┌───────┐   ┌─────────────┐   ┌──────────────────────────────┐
│ rules │ → │ working-dir │ → │ LLM classifier (Claude only) │
└───────┘   └─────────────┘   └──────────────────────────────┘
```

### Security

Three layers: isolation, extraction, then alert. Fetched content is data, never instructions.

```text
┌────────────┐   ┌────────────┐   ┌───────┐
│ isolation  │ → │ extraction │ → │ alert │
└────────────┘   └────────────┘   └───────┘
```

### Learn & teach

Extract notes with `/cf-learn` or `/cf-teach`. Host them with `cf learn host`, or share them with `cf mcp`.

```text
┌───────────┐     ┌─────────────┐     ┌───────────────┐
│ /cf-learn │     │             │     │ cf learn host │
│     |     │  →  │ docs/learn/ │  →  │      |        │
│ /cf-teach │     │             │     │ cf mcp        │
└───────────┘     └─────────────┘     └───────────────┘
```

![Learn host](/cf-host.png)

### Research

Run `/cf-research` for web search with parallel subagents. Output lands in `docs/research/`.

```text
┌──────────────┐   ┌────────────────────┐   ┌────────────────┐
│ /cf-research │ → │ parallel subagents │ → │ docs/research/ │
└──────────────┘   └────────────────────┘   └────────────────┘
```

### Cross-agent review

Pass `--codex`, `--gemini`, `--cursor`, or `--grok` on `/cf-review` to run a second review in parallel, then merge. Or export with `/cf-review-out` and collect with `/cf-review-in`.

```text
┌─────────────────────────────────────────┐
│ /cf-review                              │
│   --codex|--gemini|--cursor|--grok      │
│   parallel, then merge                  │
└─────────────────────────────────────────┘
                  ↓
┌───────────────┐   ┌────────┐   ┌──────────────┐
│ /cf-review-out│ → │ any AI │ → │ /cf-review-in│
└───────────────┘   └────────┘   └──────────────┘
```

### Sessions & checkpoints

`/cf-session` save and restore is Claude only. `/cf-checkpoint` writes a note; `/cf-checkpoint-from` loads it in a new chat.

```text
┌─────────────┐
│ /cf-session │
└─────────────┘
  Claude only

┌─────────────────┐     ┌──────────────────────┐
│ /cf-checkpoint  │  →  │ /cf-checkpoint-from  │
└─────────────────┘     └──────────────────────┘
```

### Statusline

Claude only. Run `cf statusline` to install the renderer.

![Statusline](/statusline.png)
