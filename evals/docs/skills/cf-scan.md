# Evaluating cf-scan

## What We Test

Whether the cf-scan skill produces more comprehensive, accurate, and useful memory files when scanning a project than baseline Claude. We measure coverage breadth, accuracy, memory file quality, and absence of hallucinations.

## Prompt(s)

**bench-webapp** (`prompts/cf-scan/bench-webapp.md`):

> Scan this project and create memory entries capturing its architecture, conventions, and key features.

**bench-cli** (`prompts/cf-scan/bench-cli.md`):

> Scan this project and create memory entries capturing its architecture, conventions, and key features.

## Benchmark Repos Used

- **bench-webapp** -- TypeScript web app with multiple modules (API client, cache, validator). Good test for architecture scanning.
- **bench-cli** -- TypeScript CLI tool with transform and format modules. Tests scanning of CLI-specific patterns.

## Rubric Criteria

| Criterion         | Weight | Description                                                               |
| ----------------- | ------ | ------------------------------------------------------------------------- |
| coverage_breadth  | 0.25   | Scan covers architecture, conventions, features, dependencies, tooling    |
| accuracy          | 0.30   | Information captured is factually correct                                 |
| memory_quality    | 0.25   | Generated memory files are well-structured and useful for future sessions |
| no_hallucinations | 0.20   | Does not invent features, files, or patterns that do not exist            |

### Scoring Levels

**coverage_breadth**:

- 0: Only looks at one or two files
- 1: Covers a few areas but misses major aspects
- 2: Covers most areas but misses one significant aspect
- 3: Comprehensively covers architecture, conventions, features, dependencies, and tooling

**accuracy**:

- 0: Multiple significant factual errors
- 1: Correctly identifies tech stack but mischaracterizes architecture or conventions
- 2: Mostly accurate with one minor error
- 3: All captured information is accurate and reflects current state

**memory_quality** (automated check: count files in `docs/memory/*.md`, expected >= 8):

- 0: No memory files created or files are empty
- 1: Memory files created but too vague to be useful
- 2: Good content but organization could be improved
- 3: Well-organized, specific, and immediately useful for onboarding

**no_hallucinations** (automated check: verify referenced paths exist):

- 0: Contains multiple fabricated features or non-existent file references
- 1: One significant hallucination
- 2: No hallucinations but some claims are too vague to verify
- 3: Every claim can be verified against actual project files

Notes: For monorepos, scan should identify all packages. Memory file count expectation scales with project size.

## What We Expect

### With CF

- Systematic exploration of project structure
- Memory files created covering architecture, conventions, key features
- Detection of known bugs and test gaps
- Accurate file references throughout

### Without CF

- Similar exploration depth (Claude is good at reading codebases)
- May update existing memory files rather than creating new ones
- Similar accuracy and coverage

## What We Compare

- Number and quality of memory files created
- Coverage breadth across project aspects
- Accuracy of captured information
- Presence of hallucinated features or files

## Actual Results (March 2026)

### Scores

| Condition               | coverage_breadth | accuracy | memory_quality | no_hallucinations | Weighted Total |
| ----------------------- | ---------------- | -------- | -------------- | ----------------- | -------------- |
| With CF (2 runs avg)    | 2.5              | 3.0      | 2.5            | 3.0               | **2.75**       |
| Without CF (2 runs avg) | 3.0              | 3.0      | 3.0            | 3.0               | **3.00**       |

**Delta: -0.25**

### Cost

| Condition  | Avg Cost       | Avg Time |
| ---------- | -------------- | -------- |
| With CF    | $0.192         | 53s      |
| Without CF | $0.207         | 60s      |
| Cost ratio | 0.9x (similar) |          |

### Key Observations

1. **The without-CF runs actually produced more thorough scans.** They updated existing memory files with more detail (mock patterns, tsconfig specifics, test setup) rather than just creating new ones.
2. With-CF runs created 2 memory files per repo. Without-CF runs updated existing memory files with additional detail.
3. Both were accurate and hallucination-free (3.0 on both criteria for both conditions).
4. The coverage breadth gap (2.5 vs 3.0) is driven by CF missing some aspects like test configuration and mock patterns.
5. **Ordering effects may explain this result.** The without-CF runs went second and had existing memory files to update, which may have given them an advantage (easier to add to existing files than create from scratch).

## Reliability Assessment

- **Sample size**: 2 runs per condition (4 total)
- **Confidence**: Low
- **Known issues**: The runs were not randomized -- without-CF always went after with-CF. This means without-CF runs had existing memory files from the with-CF runs, potentially giving them an advantage. The -0.25 delta may be an artifact of ordering rather than a real skill quality difference.
- **Recommendation**: These results should not be used to conclude that cf-scan is worse than baseline. The ordering effect is a significant confound. Rerun with randomized ordering and fresh repos for each condition to get a fair comparison.
