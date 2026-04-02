# Engine Usage Guide

Production-ready engine with cost control, memory compression, and skill support — built from patterns extracted from Claude Code.

## Quick Start

```typescript
import { ClaudeEngine } from './engine/engine.js'

const engine = new ClaudeEngine('claude-sonnet-4-6')

// Ask a question
const response = await engine.ask('What is 2+2?')
console.log(response)

// Check cost
console.log(engine.formatCostSummary())
```

## Core Features

### 1. Cost Control (Automatic)

**Pattern from**: `cost-tracker.ts` + `context.ts`

- **MAX_MESSAGES = 4** (2 turns) — keeps context tight
- **Auto-compression** — when > 4 messages, old messages → summary (using cheap Haiku)
- **Sliding window** — summary + last 4 messages sent to API
- **Token tracking** — tracks input, output, cache read/write separately

```typescript
const engine = new ClaudeEngine()

// After 10 messages:
for (let i = 1; i <= 10; i++) {
  await engine.ask(`Message ${i}`)
}

// Automatic compression kicked in at message 5
// Context window stays small = lower cost
console.log(engine.formatCostSummary())
```

**Output**:
```
Total cost: $0.0234

Usage by model:
  sonnet-4             1,500 input, 800 output, 5,000 cache read, 1,000 cache write ($0.0234)

💡 Cache read 5,000 tokens (90% cheaper than regular input)
```

### 2. Memory Compression

**Pattern from**: `services/compact/prompt.ts`

When history exceeds MAX_MESSAGES, the engine automatically:
1. Takes old messages (beyond last 4)
2. Sends them to **Haiku** (5× cheaper) with special compaction prompt
3. Generates structured summary with 9 sections:
   - Primary Request
   - Technical Concepts
   - Files & Code
   - Errors & Fixes
   - All User Messages
   - Pending Tasks
   - Current Work
   - Next Step (with direct quotes)
4. Replaces old messages with summary

```typescript
// Manual compression (if you want to force it)
await engine.compressHistory()

// Get summary
const summary = engine.getSummary()
if (summary) {
  console.log('Summary length:', summary.content.length, 'chars')
}
```

### 3. Cost Tracking

**Pattern from**: `cost-tracker.ts`

Tracks usage per model with separate cache token counting:

```typescript
const usage = engine.getUsage()
if (usage) {
  console.log('Input tokens:', usage.inputTokens)
  console.log('Output tokens:', usage.outputTokens)
  console.log('Cache read (90% cheaper):', usage.cacheReadTokens)
  console.log('Cache write (25% premium):', usage.cacheWriteTokens)
  console.log('Total cost:', usage.costUSD)
}

// Context window usage
const ctx = engine.getContextWindow()
console.log(`Context: ${ctx.usedPercentage}% (${ctx.used} / ${ctx.total})`)
```

### 4. Skills Support

**Pattern from**: `skills/` + SKILL.md format

Load and auto-invoke skills:

```typescript
import { SkillLoader } from './engine/skills.js'

const loader = new SkillLoader('./skills')
await loader.loadSkills()

// User message
const userMessage = "Help me debug this error"

// Match skills
const matches = loader.matchSkills(userMessage)
if (matches.length > 0) {
  const skill = matches[0]
  const skillPrompt = loader.formatSkillPrompt(skill, userMessage)
  
  // Use skill as system prompt
  const response = await engine.ask(userMessage, {
    systemPrompt: skillPrompt
  })
}
```

### 5. Custom System Prompts

**Pattern from**: `constants/prompts.ts`

```typescript
// Preset prompts
import { SYSTEM_PROMPTS } from './engine/engine.js'

await engine.ask('Add authentication', {
  systemPrompt: SYSTEM_PROMPTS.buildFeature
})

await engine.ask('Fix this TypeError', {
  systemPrompt: SYSTEM_PROMPTS.debug
})

// Custom context
await engine.ask('Refactor this code', {
  context: {
    role: 'a senior software engineer',
    constraints: '- TypeScript strict mode\n- No external dependencies',
    rules: '- Minimal diffs only\n- Test after each change',
    outputFormat: 'Code block + explanation'
  }
})
```

## Complete Example

```typescript
import { ClaudeEngine } from './engine/engine.js'
import { SkillLoader } from './engine/skills.js'

async function main() {
  // Initialize
  const engine = new ClaudeEngine('claude-sonnet-4-6')
  const skills = new SkillLoader('./skills')
  await skills.loadSkills()

  console.log('=== Session Start ===\n')

  // Conversation
  const messages = [
    "Help me add JWT authentication to my Express app",
    "I'm getting 'secret or publicKey must be provided' error",
    "How do I test this?",
    "Can you refactor to use TypeScript?",
    "What about refresh tokens?",
  ]

  for (const msg of messages) {
    console.log(`\n👤 User: ${msg}`)
    
    // Check for skill match
    const matches = skills.matchSkills(msg)
    const options = matches.length > 0
      ? { systemPrompt: skills.formatSkillPrompt(matches[0], msg) }
      : {}
    
    const response = await engine.ask(msg, options)
    console.log(`🤖 Assistant: ${response.substring(0, 200)}...`)
    
    // Show cost after each turn
    const ctx = engine.getContextWindow()
    const cost = engine.getTotalCost()
    console.log(`   [Context: ${ctx.usedPercentage}% | Cost: $${cost.toFixed(4)}]`)
  }

  console.log('\n=== Session Summary ===')
  console.log(engine.formatCostSummary())
  
  const ctx = engine.getContextWindow()
  console.log(`\nContext window: ${ctx.usedPercentage}% used`)
  
  if (engine.getSummary()) {
    console.log('✓ History was compressed to save tokens')
  }
}

main().catch(console.error)
```

## Cost Optimization Tips

### 1. Use Haiku for Simple Tasks
```typescript
const cheapEngine = new ClaudeEngine('claude-haiku-4-6')
await cheapEngine.ask('What is 2+2?')
// 5× cheaper than Sonnet
```

### 2. Leverage Cache Reads
```typescript
// Cache reads are 90% cheaper
// Repeated context (system prompts, files) → cache read tokens
const usage = engine.getUsage()
if (usage) {
  console.log(`Saved: ${usage.cacheReadTokens * 0.9} tokens via cache`)
}
```

### 3. Monitor Context Window
```typescript
const ctx = engine.getContextWindow()
if (ctx.usedPercentage > 80) {
  console.warn('Context window getting full — consider compressing or clearing')
  // Auto-compression will kick in, but you can monitor
}
```

### 4. Clear Memory Between Independent Tasks
```typescript
// Task 1
await engine.ask('Build feature X')

// Task 2 (unrelated) — clear to avoid wasting context
engine.clearMemory()
await engine.ask('Build feature Y')
```

## Pricing Reference

| Model | Input | Output | Cache Read | Cache Write |
|-------|-------|--------|------------|-------------|
| Sonnet 4.6 | $3/MTok | $15/MTok | $0.30/MTok (90% off) | $3.75/MTok (+25%) |
| Haiku 4.6 | $0.80/MTok | $4/MTok | $0.08/MTok (90% off) | $1.00/MTok (+25%) |
| Opus 4.6 | $15/MTok | $75/MTok | $1.50/MTok (90% off) | $18.75/MTok (+25%) |

**MTok** = Million tokens

## Metrics

See `playbook/results/` for real-world test results with token counts and cost breakdowns.

## Architecture

```
ClaudeEngine
├── Summarizer (Haiku)  — compress history when > MAX_MESSAGES
├── CostTracker         — track tokens + cost per model
└── SkillLoader         — load/match SKILL.md files

Flow:
User message → Check history length → Compress if needed → Build messages (summary + recent) → API call → Track cost → Return response
```

## Files

```
playbook/
├── engine/
│   ├── engine.ts           — Main engine (ClaudeEngine class)
│   ├── summarizer.ts       — Memory compaction (Summarizer class)
│   ├── cost-tracker.ts     — Token & cost tracking (CostTracker class)
│   └── skills.ts           — Skill loader (SkillLoader class)
├── skills/
│   └── debug/
│       └── SKILL.md        — Debug workflow skill
└── extractions/
    ├── compact-prompt.md   — Compaction patterns extracted
    ├── cost-tracking.md    — Cost tracking patterns
    ├── context-memory.md   — Context window management
    └── skills-format.md    — SKILL.md format reference
```

## Next Steps

1. **Test on real bug** — Use debug skill on actual project
2. **Measure metrics** — Track tokens/cost over 10-message conversation
3. **Optimize** — Tune MAX_MESSAGES, compression strategy based on metrics
4. **Add skills** — Create more workflows (build-feature, code-review, etc.)
