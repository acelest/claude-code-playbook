---
name: review
description: Code review skill - analyze code changes and provide feedback
allowed-tools:
  - Read
  - Grep
  - Bash(*)
when_to_use: "Use when the user wants code review, wants to check if code is correct, or asks for feedback on implementation. Examples: 'review this code', 'is this good?', 'check if this works', 'code review please'"
argument-hint: "[files or PR to review]"
context: inline
---

# Code Review Skill

Analyze code changes and provide focused, actionable feedback.

## When to use this skill

- User requests code review or feedback
- Checking if implementation is correct or efficient
- Analyzing changes before merge or deployment
- Verifying that code meets requirements

## How to use this skill

### 1. Read the Code

Examine the relevant files and understand what code changed.

**Success criteria**: You understand:
- What the code does
- What problems it solves
- How it integrates with existing code

**Human checkpoint**: If the code is too large or complex to review quickly, ask the user to provide context or focus area.

### 2. Check for Issues

Analyze the code against these criteria (in order of importance):

1. **Does it work?** (Correctness)
   - Logic is sound
   - Edge cases handled
   - No obvious bugs

2. **Is it safe?** (Security/Reliability)
   - No SQL injection or similar vulnerabilities
   - Proper error handling
   - No data loss risks

3. **Is it performant?** (Efficiency)
   - No obvious performance problems
   - Appropriate algorithms/data structures
   - Reasonable complexity

4. **Is it maintainable?** (Code quality)
   - Clear variable/function names
   - Reasonable function size (not too long)
   - Follows project conventions

**Success criteria**: For each issue found, you have:
- Clear description of what's wrong
- Why it matters (severity: critical/high/medium/low)
- Specific suggestion for improvement

### 3. Provide Feedback

Report findings in priority order (critical first).

**Success criteria**: Feedback is:
- Specific (point to exact lines)
- Actionable (include suggestions)
- Focused (signal over noise — only issues that matter)

### 4. Summarize

Provide a clear summary of review findings.

**Success criteria**: Summary indicates:
- Whether code is ready to merge
- Any blocking issues that must be fixed
- Optional improvements (nice-to-have)

## Core requirements

- **Only real issues**: Never comment on style, formatting, or trivial matters
- **Be specific**: Always include line numbers and code snippets
- **Be constructive**: Always suggest improvements, not just criticisms
- **Prioritize**: Critical issues first, optional improvements last
- **Focus on impact**: Security, correctness, and maintainability before style

## Common mistakes to avoid

- Nitpicking on style → Focus on substance only
- Not understanding context → Ask for context if needed
- Being vague → Always be specific with line numbers
- Over-reviewing → Only surface issues that genuinely matter
- Suggesting without understanding → Always understand why before suggesting

## Output format

After completing the workflow, provide a summary in this format:

```
**Status:** [Ready to merge / Needs fixes / Request changes]

**Critical Issues:**
1. [Issue] (line X) - [Why it matters] - [Suggestion]

**High Priority:**
2. [Issue] (line Y) - [Why it matters] - [Suggestion]

**Optional Improvements:**
3. [Issue] (line Z) - [Why it matters] - [Suggestion]

**Summary:** [1-2 sentences on overall quality and readiness]
```

## Example

User: "Review this authentication code"

**Step 1: Read Code**
- Function validates user credentials
- Returns JWT token on success
- Uses bcrypt for password comparison

**Step 2: Check for Issues**

1. ✅ Does it work? Yes, logic flows correctly
2. ⚠️ Is it safe? Token TTL is 24h (could be shorter for better security)
3. ✅ Is it performant? bcrypt comparison is standard
4. ✅ Is it maintainable? Names are clear, length is good

**Step 3: Provide Feedback**

```
**Status:** Ready to merge

**High Priority:**
1. Token TTL is 24 hours (line 42) - This is longer than typical for user sessions. Consider 1 hour with refresh token pattern.

**Optional Improvements:**
None

**Summary:** Code is correct and safe. Consider shortening token TTL for better security.
```
