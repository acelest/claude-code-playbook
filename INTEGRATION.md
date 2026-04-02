# Integration Guide — Using Engine + Skills in Production

## Overview

The ClaudeEngine with integrated skills provides a complete system for debugging, building features, and reviewing code. This guide shows how to use it.

## Setup

```typescript
import { ClaudeEngine } from './engine/engine.js'

const engine = new ClaudeEngine({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-6',
})
```

## Available Skills

| Skill | When to Use | Command |
|-------|------------|---------|
| **debug** | Troubleshoot errors, fix bugs | `engine.ask('debug: TypeError in getUserById()', { skill: 'debug' })` |
| **build** | Implement new features | `engine.ask('build: Add CSV export', { skill: 'build' })` |
| **review** | Analyze code quality | `engine.ask('review: Check auth implementation', { skill: 'review' })` |

## Example 1: Debug a Failing Test

```typescript
// Step 1: Ask engine to debug
const result = await engine.ask(
  'Tests failing: "Cannot read property id of undefined" in getUserById.test.ts line 15',
  { skill: 'debug' }
)

console.log(result)
// Output:
// Step 1: Reproduce the Bug
// [runs test, shows error]
//
// Step 2: Hypothesize Root Cause
// Root cause: userId is undefined when user not logged in
//
// Step 3: Fix the Bug
// [shows code change]
//
// Step 4: Verify
// [reruns test, shows PASS]

// Step 2: Check cost tracking
const costs = engine.getCostSummary()
console.log(costs)
// {
//   "claude-sonnet-4-6": {
//     inputTokens: 2340,
//     outputTokens: 890,
//     costUSD: 0.0087
//   },
//   "claude-haiku-4-5": {
//     inputTokens: 450,  // compression summary
//     outputTokens: 180,
//     costUSD: 0.0003
//   }
// }
```

## Example 2: Build a New Feature

```typescript
// Request feature implementation with plan validation
const result = await engine.ask(
  'build: Add support for exporting results to CSV with headers (id, name, value, timestamp)',
  { skill: 'build' }
)

// Output includes:
// 1. Requirements clarification
// 2. Implementation plan (3 steps + files + test)
// 3. Request for user approval before proceeding
// 4. Implementation with minimal diffs
// 5. Test execution and verification
```

## Example 3: Code Review

```typescript
// Review specific file changes
const result = await engine.ask(
  'review: Check the new authentication.ts implementation. Focus on security.',
  { skill: 'review' }
)

// Output includes:
// - Critical issues (security, correctness)
// - High priority issues (maintainability, performance)
// - Optional improvements (style, clarity)
// - Clear recommendation: Ready to merge / Needs fixes
```

## Cost Control in Action

### Automatic Compression

When conversation exceeds `MAX_MESSAGES` (4 messages = 2 turns):

```typescript
// Turn 1: Initial request + response (2 messages)
// Turn 2: Follow-up + response (2 messages) — total 4
// Turn 3: User asks another question
// → Engine auto-compresses messages 1-2 using Haiku (cheap)
// → New history: [summary, msg3, msg4, msg5] — keeps context tight

// Real token savings:
// Without compression: 200k tokens × 5 messages = 1M tokens (OVERFLOW)
// With compression: 50k tokens (summary) + 150k tokens (last 3 msgs) = 200k tokens (FIT)
```

### Sliding Window Pattern

```typescript
// History management:
[
  { role: 'system', content: 'You are...' },
  { role: 'assistant', content: '[Summary of messages 1-2]' },
  { role: 'user', content: 'Message 3 from user' },
  { role: 'assistant', content: 'Message 3 response' },
  { role: 'user', content: 'Message 4 (current)' }
]

// Result:
// - Keeps full context of recent conversation
// - Maintains long-running continuity through summary
// - Prevents context window overflow
// - 12% cheaper via cache hits on system prompt
```

## Monitoring Costs

```typescript
// After each ask(), check costs
const summary = engine.getCostSummary()

// Example output:
// {
//   "session": {
//     "totalInputTokens": 12340,
//     "totalOutputTokens": 4560,
//     "totalCacheReadTokens": 5000,  // 90% discount applied
//     "totalCacheWriteTokens": 1200,  // 25% premium paid
//     "costUSD": 0.0456
//   },
//   "by-model": [
//     {
//       "model": "claude-sonnet-4-6",
//       "inputTokens": 12000,
//       "outputTokens": 4500,
//       "cacheRead": 5000,
//       "cacheWrite": 1200,
//       "costUSD": 0.0452
//     },
//     {
//       "model": "claude-haiku-4-5",
//       "inputTokens": 340,
//       "outputTokens": 60,
//       "cacheRead": 0,
//       "cacheWrite": 0,
//       "costUSD": 0.0004
//     }
//   ]
// }

// Formula for cost calculation:
// cost = (input × inputPrice + output × outputPrice 
//        + cacheRead × cacheReadPrice + cacheWrite × cacheWritePrice) / 1_000_000
```

## Context Window Management

```typescript
// Check context usage
const context = engine.getContextWindow()

console.log(context)
// {
//   total: 200000,
//   used: 45320,
//   remaining: 154680,
//   usedPercentage: 22.66
// }

// When used% > 75% and history > MAX_MESSAGES:
// → Auto-compress immediately
// → Prevents overflow and billing surprises
```

## Skill Customization

You can extend with custom skills by adding files to `playbook/skills/`:

```
playbook/skills/
├── debug/
│   └── SKILL.md         # 4-step debug workflow
├── build/
│   └── SKILL.md         # Feature implementation workflow
├── review/
│   └── SKILL.md         # Code review workflow
└── [custom]/
    └── SKILL.md         # Your custom skill
```

Each SKILL.md file requires:
- YAML frontmatter (name, description, when_to_use, allowed-tools)
- Clear workflow with success criteria
- Human checkpoints for critical decisions
- Example usage

## Best Practices

### 1. Use Skills for Clarity
```typescript
// ✅ Good: Skill name makes intent clear
await engine.ask('debug: TypeError in payment processing', { skill: 'debug' })

// ❌ Avoid: Ambiguous request
await engine.ask('Something is broken with payments')
```

### 2. Monitor Costs Regularly
```typescript
// After every ~5 asks, check costs
if (messageCount % 5 === 0) {
  const costs = engine.getCostSummary()
  console.log(`Session cost so far: $${costs.session.costUSD}`)
}
```

### 3. Provide Context Upfront
```typescript
// ✅ Good: Include error message and file
await engine.ask('debug: TypeError in getUserById(). Error: "Cannot read property id of undefined". File: services/user.ts line 42')

// ❌ Avoid: Vague
await engine.ask('Something in user service is broken')
```

### 4. Review Before Merging
```typescript
// Always review code before merge
await engine.ask('review: Check my auth changes in authentication.ts', { skill: 'review' })

// Read the feedback carefully
const feedback = /* result from ask */
if (feedback.includes('Critical Issues')) {
  console.log('Do not merge until critical issues are fixed')
}
```

## Troubleshooting

### Engine runs out of context
```
Solution: This should not happen with auto-compression enabled.
If it does: Check if MAX_MESSAGES is set correctly (should be 4)
           Verify compression is being triggered (check logs)
```

### Costs unexpectedly high
```
Solution: Check if compression is active
          Compare cost summary before/after compression
          Review which model is being used (Haiku is 5x cheaper for summaries)
```

### Skill not being selected
```
Solution: Check the when_to_use pattern in SKILL.md
          Verify the trigger phrase matches user input
          Add more specific patterns if needed
```

## Next Steps

1. **Copy this guide to your project**
2. **Set ANTHROPIC_API_KEY environment variable**
3. **Import ClaudeEngine and create instance**
4. **Start using skills for debugging, building, and reviewing**
5. **Monitor costs and tune MAX_MESSAGES if needed**

For detailed architecture, see: `playbook/engine/README.md`
For extraction patterns, see: `playbook/extractions/`
