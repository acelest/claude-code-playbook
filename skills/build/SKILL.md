---
name: build
description: Build skill - implement a new feature systematically
allowed-tools:
  - Read
  - Edit
  - Bash(*)
  - Grep
when_to_use: "Use when the user wants to implement a new feature, add functionality, or build something new. Examples: 'add feature X', 'implement Y', 'build a new Z', 'I need to add support for'"
argument-hint: "[feature description]"
context: inline
---

# Build Skill

Implement new features systematically with planning, validation, and testing.

## When to use this skill

- User requests a new feature or functionality
- Need to add support for something
- Implementing a user story or requirement
- Building a new component or module

## How to use this skill

### 1. Understand Requirements

Read relevant files and clarify what needs to be built. Ask for specifics if requirements are ambiguous.

**Success criteria**: You have a clear, written understanding of:
- What the feature does
- What files/systems it touches
- Acceptance criteria (how to verify it works)

**Human checkpoint**: If requirements are unclear, ask the user for clarification before proceeding.

### 2. Create Implementation Plan

Write a 3-step plan that will be validated before implementation.

**Success criteria**: Plan includes:
- 3 concrete steps (read → write → test)
- Which files will be created/modified
- One acceptance test that proves it works

**Format**:
```
Step 1: [What to read/understand]
Step 2: [What code to write]
Step 3: [How to test/verify]

Files: [list of files]
Test: [command or scenario that proves success]
```

### 3. Implement the Feature

Execute the plan exactly. Only write code that's in the plan. Minimal diffs.

**Success criteria**: 
- Code matches the plan
- Changes are minimal and focused
- No unrelated refactoring or cleanup

### 4. Test and Verify

Run the acceptance test from the plan. Confirm the feature works.

**Success criteria**: The test passes and the feature behaves as specified.

**Human checkpoint**: If the test fails, return to step 2 with an updated hypothesis. If implementation reveals better approach, ask user to approve plan change.

## Core requirements

- **Plan first**: Always create a plan before coding
- **Validate plan**: Get user approval before implementing
- **Minimal diffs**: Only code in the plan
- **Test after**: Always run the acceptance test
- **One feature at a time**: Complete one feature before starting another

## Common mistakes to avoid

- Skipping the plan → Always plan first
- Adding extra features → Stick to the plan
- Refactoring during implementation → Keep changes focused
- Unclear acceptance criteria → Define test before coding
- Not getting plan approval → Always validate with user

## Output format

After completing the workflow, provide a summary in this format:

```
**Feature:** [What was built]
**Plan:** [The 3-step plan that was executed]
**Implementation:** [What code changed]
**Test:** [Verification that it works]
```

## Example

User: "Add support for exporting results to CSV"

**Step 1: Understand Requirements**
- CSV file with headers: id, name, value, timestamp
- Save to `./output/export-{date}.csv`
- Include all results from current session

**Step 2: Create Plan**
```
Step 1: Read current export logic in services/export.ts
Step 2: Add CSV formatter and writeFile in services/exporters/csv.ts
Step 3: Test with npm test -- export.test.ts

Files: services/exporters/csv.ts (new), services/export.ts (modified)
Test: npm test -- export.test.ts | grep "CSV export"
```

**Step 3: Implement** (create csv.ts, update export.ts)

**Step 4: Verify**
```bash
npm test -- export.test.ts
# PASS  CSV export creates file with correct headers
# PASS  CSV export includes all rows
```

**Summary:**
- **Feature:** CSV export for session results
- **Files changed:** services/exporters/csv.ts (new), services/export.ts (1 line)
- **Test:** `npm test -- export.test.ts` — all 5 tests pass ✓
