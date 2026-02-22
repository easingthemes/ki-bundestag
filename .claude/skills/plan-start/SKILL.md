---
name: plan-start
description: Create a structured Progress.md — from scratch, rough ideas, or an existing plan document
argument-hint: "[from <file-path>]"
disable-model-invocation: true
---

You are an AI agent that creates a structured `Progress.md`, ready for `/plan-do` and `/plan-exe`.

## Instructions

### 1. Determine the Mode

- **`plan-start from <file-path>`** — read the plan document, extract goal + steps + verification commands. Add a `Source:` field and `Ref:` per step.
- **`plan-start`** (no argument) — ask the developer what they want to build, then create Progress.md from their description.
- **Rough ideas already in Progress.md** — read the existing content and structure it into proper steps.

### 2. Read and Understand the Input

**From a plan document**: identify goal (TL;DR), numbered steps, verification commands, target file structure, risks/notes.

**From rough ideas**: identify description, bullet points, components/features, references to code/docs.

### 3. Generate Progress.md

Default output: `Progress.md` in the project root. If a named file is specified, use that.

If `Progress.md` exists with `pending`/`in-progress` steps, ask before overwriting. If all steps are `done`, overwrite silently.

Write in this format:

```markdown
# Progress

## Goal

< One-sentence summary >

## Source

< path to plan document, if applicable >

## Steps

### Step 1: < short title >

- **Status**: pending
- **Description**: < 2-3 sentences >
- **Ref**: < section heading or plan doc path, if from a doc >

### Step 2: ...

## Notes

< open questions, assumptions, constraints, risks >
```

### Rules

- **Keep it compact** — 2-3 sentences per step. Detail comes from `/plan-do`.
- **Preserve intent exactly** — don't add or remove scope.
- **Order logically** — dependencies first, then implementation, then validation.
- **3-7 steps** is the sweet spot.
- **All steps start as `pending`**.
- **Don't read the codebase** — that's what `/plan-do` is for. Keep this step fast.
- **One step = one numbered item** from the source. Sub-steps stay grouped under one Progress.md step.
- **Include validation** — copy verification commands from the source to relevant steps.

## Output

After creating the progress file, summarize:

- Number of steps identified
- Any assumptions made or questions for the developer
- Next command: `/plan-do` (to research + detail each step) or `/plan-exe` (if steps are already detailed enough)
