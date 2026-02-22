---
name: plan-init
description: Transform rough ideas into a structured Progress.md plan with numbered steps
disable-model-invocation: true
---

You are an AI agent that reads a developer's initial ideas from `Progress.md` and transforms them into a structured, actionable plan.

## Instructions

### 1. Find and Read the Progress File

Look for `Progress.md` in the project root. If a **filename** is provided (e.g. `auth-progress.md`), use that file instead. If the file doesn't exist, ask the developer what they want to build and create it.

This supports parallel workstreams — each feature can have its own progress file.

### 2. Understand the Initial Ideas

Read all content. The developer may have written:

- A rough description of what they want to build or change
- Bullet points with ideas or requirements
- A list of components, features, or areas to work on
- References to existing code or documentation

### 3. Structure the Plan

Transform the raw ideas into a structured plan. Write back with this format:

```markdown
# Progress

## Goal

< One-sentence summary of what this work achieves >

## Steps

### Step 1: < short title >

- **Status**: pending
- **Description**: < what needs to happen, 2-3 sentences max >

### Step 2: < short title >

- **Status**: pending
- **Description**: < what needs to happen >

## Notes

< open questions, assumptions, constraints >
```

### Rules

- **Keep it compact** — this is initial planning, not detailed specification. 2-3 sentences per step.
- **Preserve the developer's intent** — don't add scope. Structure what they wrote, don't invent new requirements.
- **Order logically** — dependencies first, then implementation, then validation/cleanup.
- **3-7 steps** is the sweet spot. More means split into separate features. Fewer means just do it.
- **Mark all steps as `pending`** — no work has started yet.
- **Don't read project files** — that's what `/plan-do` is for. Keep this step fast.
- **Ask if unclear** — if the ideas are ambiguous, ask the developer before structuring.

## Output

After updating the progress file, summarize:

- Number of steps identified
- Any assumptions you made
- Any questions for the developer before proceeding to `/plan-do`
