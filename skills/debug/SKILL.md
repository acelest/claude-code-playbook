---
name: debug
description: Debug skill - diagnose and fix bugs systematically
allowed-tools:
  - Read
  - Bash(*)
  - Grep
when_to_use: "Use when the user wants to debug an issue, fix a bug, or troubleshoot errors. Examples: 'help me debug this', 'fix this bug', 'something's not working', 'this is broken'"
argument-hint: "[bug description]"
context: inline
---

# Debug Skill

Systematically diagnose and fix bugs using a structured workflow.

## When to use this skill

- User reports an error or unexpected behavior
- Tests are failing
- Code is not working as expected
- Need to troubleshoot an issue

## How to use this skill

### 1. Reproduce the Bug

Run the failing test, command, or code to confirm the bug exists.

**Success criteria**: The bug is reproduced and you see the exact error message or unexpected behavior. If the bug cannot be reproduced, ask the user for more details or clarification.

**Human checkpoint**: If the bug cannot be reproduced in the current environment, confirm with the user before proceeding.

### 2. Hypothesize Root Cause

Analyze the error message, stack trace, and surrounding code to identify the most likely root cause.

**Success criteria**: You have a clear, one-sentence hypothesis about what is causing the bug. Example: "The variable `userId` is undefined because the function is called before the user object is initialized."

### 3. Fix the Bug

Implement the minimal change needed to fix the root cause. Do not refactor unrelated code or add unnecessary features.

**Success criteria**: The code change addresses the hypothesized root cause. The fix is minimal and focused.

### 4. Verify the Fix

Run the same test or command that initially failed to confirm the bug is fixed.

**Success criteria**: The test passes, the error no longer occurs, or the expected behavior is observed. If the bug persists, return to step 2 with a new hypothesis.

**Human checkpoint**: If the fix requires changes to critical code (authentication, payments, data deletion), ask the user to review before proceeding.

## Core requirements

- **Reproduce first**: Never attempt a fix without first confirming the bug exists
- **One fix at a time**: Test after each change before trying another fix
- **Minimal changes**: Only modify what's necessary to fix the bug
- **Verify always**: Run the test/command to prove the fix works

## Common mistakes to avoid

- Guessing without reproducing → Always reproduce first
- Fixing multiple issues at once → One bug at a time
- Refactoring during debugging → Fix first, refactor later (if asked)
- Skipping verification → Always run the test/command to confirm

## Output format

After completing the workflow, provide a summary in this format:

```
**Root cause:** [One sentence describing what caused the bug]
**Fix:** [What code changed and why]
**Verify:** [Command or test that confirms the fix]
```

## Example

User: "My tests are failing with 'TypeError: Cannot read property 'id' of undefined'"

**Step 1: Reproduce**
```bash
npm test
```
Output shows error at `getUserById(userId)` line 42.

**Step 2: Hypothesize**
Root cause: `userId` is undefined because the function is called with `null` when the user is not logged in.

**Step 3: Fix**
Add null check before accessing properties:
```typescript
function getUserById(userId: string | null): User | null {
  if (!userId) return null
  return users.find(u => u.id === userId) || null
}
```

**Step 4: Verify**
```bash
npm test
```
All tests pass ✓

**Summary:**
- **Root cause:** `userId` was null when user not logged in, causing undefined access
- **Fix:** Added null check to return early when userId is falsy
- **Verify:** `npm test` — all 42 tests pass
