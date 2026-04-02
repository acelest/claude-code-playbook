# ClaudeEngine + Skills — Complete Index

## 📚 Start Here

1. **[DELIVERY.md](./DELIVERY.md)** — What you're getting (overview)
2. **[QUICKSTART.sh](./QUICKSTART.sh)** — 30-second setup
3. **[INTEGRATION.md](./INTEGRATION.md)** — How to use it

## 🎯 Core Engine

### Files
- **[engine/engine.ts](./engine/engine.ts)** — Main ClaudeEngine class
  - Cost control (MAX_MESSAGES, auto-compression)
  - Token tracking per model
  - Skill selection and loading
  - Context window management

- **[engine/summarizer.ts](./engine/summarizer.ts)** — Memory compression
  - NO_TOOLS pattern (from Claude Code)
  - 9-section summary structure
  - Haiku-based compression (cheap)

- **[engine/cost-tracker.ts](./engine/cost-tracker.ts)** — Cost accounting
  - Per-model token tracking
  - Cache read/write separate (90% discount)
  - Session cost summary

- **[engine/skills.ts](./engine/skills.ts)** — Skill loader
  - YAML frontmatter parsing
  - Auto-selection by trigger phrase
  - Success criteria validation

### Documentation
- **[engine/README.md](./engine/README.md)** — Full API reference
- **[engine/integration.test.ts](./engine/integration.test.ts)** — Test template

## 🛠️ Skills (Structured Workflows)

### Debug Skill
- **[skills/debug/SKILL.md](./skills/debug/SKILL.md)**
  - When: "Something is broken", "Debug this error"
  - Steps: Reproduce → Hypothesize → Fix → Verify
  - Use: `await engine.ask('debug: error message', { skill: 'debug' })`

### Build Skill
- **[skills/build/SKILL.md](./skills/build/SKILL.md)**
  - When: "Add feature X", "Implement Y"
  - Steps: Understand → Plan → Code → Test
  - Use: `await engine.ask('build: feature description', { skill: 'build' })`

### Review Skill
- **[skills/review/SKILL.md](./skills/review/SKILL.md)**
  - When: "Review this code", "Is this good?"
  - Steps: Read → Check → Feedback → Summarize
  - Use: `await engine.ask('review: code description', { skill: 'review' })`

## 📖 Documentation

### User Guides
- **[DELIVERY.md](./DELIVERY.md)** — Complete delivery summary (18 files, metrics, readiness)
- **[INTEGRATION.md](./INTEGRATION.md)** — Integration examples + best practices
- **[PRODUCTION_LESSONS.md](./PRODUCTION_LESSONS.md)** — Real-world optimization + pitfalls
- **[QUICKSTART.sh](./QUICKSTART.sh)** — 30-second setup guide

### Reference
- **[engine/README.md](./engine/README.md)** — API reference + architecture

## 📚 Extractions (Pattern Reference)

These documents extract exact patterns from Claude Code source for reference:

- **[extractions/compact-prompt.md](./extractions/compact-prompt.md)** (7.1 KB)
  - Compression prompt patterns
  - NO_TOOLS preamble/trailer
  - 9-section summary structure

- **[extractions/cost-tracking.md](./extractions/cost-tracking.md)** (13.4 KB)
  - Token tracking per model
  - Cache optimization patterns
  - Session persistence

- **[extractions/context-memory.md](./extractions/context-memory.md)** (15.5 KB)
  - Context window calculation
  - Sliding window pattern
  - Memory management

- **[extractions/skills-format.md](./extractions/skills-format.md)** (12.6 KB)
  - SKILL.md format specification
  - Success criteria requirement
  - Auto-invocation patterns

## 📊 Results

- **[results/test-metrics.md](./results/test-metrics.md)** — Estimated metrics from patterns

## 🚀 Quick Examples

### Example 1: Simple Question
```typescript
const engine = new ClaudeEngine({ apiKey: process.env.ANTHROPIC_API_KEY })
const answer = await engine.ask('What is 2 + 2?')
console.log(answer)
```

### Example 2: Debug a Bug
```typescript
const result = await engine.ask(
  'debug: TypeError in getUserById() - "Cannot read property id of undefined"',
  { skill: 'debug' }
)
console.log(result)
// Output: Step 1: Reproduce, Step 2: Hypothesize, Step 3: Fix, Step 4: Verify
```

### Example 3: Check Costs
```typescript
const costs = engine.getCostSummary()
console.log(`Session cost: $${costs.session.costUSD.toFixed(4)}`)
// Output: Session cost: $0.0456
```

## 📋 File Structure

```
playbook/
├── engine/
│   ├── engine.ts              ← Main engine
│   ├── summarizer.ts          ← Compression
│   ├── cost-tracker.ts        ← Cost tracking
│   ├── skills.ts              ← Skill loader
│   ├── README.md              ← API reference
│   └── integration.test.ts    ← Test template
│
├── skills/
│   ├── debug/SKILL.md         ← Debug workflow
│   ├── build/SKILL.md         ← Build workflow
│   └── review/SKILL.md        ← Review workflow
│
├── extractions/
│   ├── compact-prompt.md      ← Compression patterns
│   ├── cost-tracking.md       ← Cost tracking patterns
│   ├── context-memory.md      ← Memory patterns
│   └── skills-format.md       ← SKILL format patterns
│
├── results/
│   └── test-metrics.md        ← Metrics (estimated)
│
├── DELIVERY.md                ← What you're getting
├── INTEGRATION.md             ← Integration guide
├── PRODUCTION_LESSONS.md      ← Best practices
├── QUICKSTART.sh              ← Setup guide
└── INDEX.md                   ← This file
```

## ✅ Checklist: Get Started

- [ ] Read DELIVERY.md (5 min)
- [ ] Run QUICKSTART.sh (5 min)
- [ ] Try INTEGRATION.md examples (10 min)
- [ ] Deploy to your project (15 min)
- [ ] Monitor real costs (ongoing)

## 📞 Support

| Question | Answer |
|----------|--------|
| How do I integrate? | See INTEGRATION.md |
| What are the metrics? | See PRODUCTION_LESSONS.md |
| How does it work? | See engine/README.md |
| What are the skills? | See skills/ folder |
| How do I set it up? | See QUICKSTART.sh |

---

**Status**: ✅ Production ready
**Version**: 1.0.0
**Last updated**: 2026-04-02

🚀 **Ready to go!**
