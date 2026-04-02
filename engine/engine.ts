import Anthropic from '@anthropic-ai/sdk'
import type { Usage } from '@anthropic-ai/sdk/resources/messages.mjs'
import { Summarizer } from './summarizer.js'
import { CostTracker, type ModelUsage } from './cost-tracker.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface SystemPromptContext {
  role: string
  constraints?: string
  rules?: string
  outputFormat?: string
}

interface AskOptions {
  systemPrompt?: string
  context?: SystemPromptContext
}

interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUSD: number
}

interface ContextWindow {
  total: number
  used: number
  remaining: number
  usedPercentage: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Cost control limits (inspired by Claude Code patterns)
const MAX_MESSAGES = 4 // 2 turns (user + assistant pairs)
const CONTEXT_WINDOW_DEFAULT = 200_000 // 200k tokens
const MAX_OUTPUT_TOKENS = 8_000 // Conservative start (escalate if needed)

// Pricing (USD per million tokens) — Claude 4.6 models
const PRICING = {
  'claude-sonnet-4-6': {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
    cacheRead: 0.3 / 1_000_000, // 10% of input
    cacheWrite: 3.75 / 1_000_000, // 125% of input
  },
  'claude-haiku-4-6': {
    input: 0.8 / 1_000_000,
    output: 4.0 / 1_000_000,
    cacheRead: 0.08 / 1_000_000,
    cacheWrite: 1.0 / 1_000_000,
  },
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class ClaudeEngine {
  private client: Anthropic
  private summarizer: Summarizer
  private costTracker: CostTracker
  private history: Message[] = []
  private summary: Message | null = null // Compressed history
  private model: string

  constructor(model = 'claude-sonnet-4-6') {
    this.client = new Anthropic()
    this.summarizer = new Summarizer() // Use Haiku for cheap summaries
    this.costTracker = new CostTracker()
    this.model = model
  }

  // Inspired by getSystemPrompt() in constants/prompts.ts
  // Pattern: identity → constraints → rules → output
  buildSystemPrompt(ctx: SystemPromptContext): string {
    return [
      `You are ${ctx.role}.`,
      ctx.constraints ? `## Constraints\n${ctx.constraints}` : null,
      ctx.rules ? `## Rules\n${ctx.rules}` : null,
      `## Output\nLead with the answer or action — not the reasoning.\nUse \`file:line\` format for code references.\nBe concise. No trailing summaries.`,
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  async ask(userMessage: string, options: AskOptions = {}): Promise<string> {
    const systemPrompt =
      options.systemPrompt ??
      (options.context
        ? this.buildSystemPrompt(options.context)
        : 'You are a helpful assistant.')

    this.history.push({ role: 'user', content: userMessage })

    // Cost control: sliding window + compression
    // Pattern from context.ts + compact/prompt.ts
    if (this.history.length > MAX_MESSAGES) {
      await this.compressHistory()
    }

    // Build messages: summary (if exists) + recent history
    const messages = [
      ...(this.summary ? [this.summary] : []),
      ...this.history,
    ]

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: messages as Anthropic.MessageParam[],
    })

    const text =
      response.content[0].type === 'text' ? response.content[0].text : ''

    this.history.push({ role: 'assistant', content: text })

    // Track cost (pattern from cost-tracker.ts)
    this.costTracker.track(response.usage, this.model)

    return text
  }

  private async compressHistory(): Promise<void> {
    // Pattern from compact/prompt.ts: compress old messages into summary
    if (this.history.length > MAX_MESSAGES) {
      const toCompress = this.history.slice(0, -MAX_MESSAGES)
      this.history = this.history.slice(-MAX_MESSAGES)

      console.log(
        `[Cost Control] Compressing ${toCompress.length} messages...`,
      )

      // Use Haiku (cheap) to summarize
      const summaryText = await this.summarizer.summarize(toCompress)

      // Replace old summary with new one (includes old + newly compressed)
      this.summary = {
        role: 'user',
        content: `This session is being continued from a previous conversation. The summary below covers the earlier portion.

${summaryText}

Recent messages are preserved verbatim.`,
      }

      console.log(`[Cost Control] ✓ Compressed to ${this.summary.content.length} chars`)
    }
  }

  getUsage(): ModelUsage | undefined {
    return this.costTracker.getUsage(this.model)
  }

  getTotalCost(): number {
    return this.costTracker.getTotalCost()
  }

  getContextWindow(): ContextWindow {
    // Estimate tokens (rough: ~4 chars per token)
    const estimateTokens = (text: string) => Math.ceil(text.length / 4)

    let used = 0
    if (this.summary) {
      used += estimateTokens(this.summary.content)
    }
    for (const msg of this.history) {
      used += estimateTokens(msg.content)
    }

    const usedPercentage = Math.round((used / CONTEXT_WINDOW_DEFAULT) * 100)

    return {
      total: CONTEXT_WINDOW_DEFAULT,
      used,
      remaining: CONTEXT_WINDOW_DEFAULT - used,
      usedPercentage: Math.min(100, Math.max(0, usedPercentage)),
    }
  }

  formatCostSummary(): string {
    return this.costTracker.formatSummary()
  }

  clearMemory(): void {
    this.history = []
    this.summary = null
    this.costTracker.reset()
  }

  getHistory(): Message[] {
    return [...this.history]
  }

  getSummary(): Message | null {
    return this.summary ? { ...this.summary } : null
  }
}

// ─── Preset system prompts ────────────────────────────────────────────────────

export const SYSTEM_PROMPTS = {
  buildFeature: `You are a senior software engineer.

## Constraints
- Read before writing. Never touch files unrelated to the task.
- No gold-plating. No speculative abstractions.
- TypeScript strict — zero \`any\`.
- Secrets always in \`.env.local\`.

## Process
1. Analyse the request and identify impacted files.
2. Write a 3-step plan (no code yet).
3. Implement — minimal diff, 1 file at a time.
4. State clearly what was changed and why.

## Output
Lead with the plan. Then the diff. No trailing summary.`,

  debug: `You are a debugging specialist.

## Constraints
- Diagnose before fixing. Never retry blindly.
- Reproduce the bug in the smallest possible case.
- One fix at a time. Verify before moving on.

## Process
1. Reproduce — confirm you can trigger the bug.
2. Hypothesise — root cause in one sentence.
3. Fix — minimal change only.
4. Verify — run the test or command that proves it.

## Output
Format:
**Root cause:** [one sentence]
**Fix:** [what changed and why]
**Verify:** [command to confirm]`,
}

// ─── Usage example ────────────────────────────────────────────────────────────

async function main() {
  const engine = new ClaudeEngine()

  console.log('=== Building Feature ===')
  const featureResult = await engine.ask(
    'Add a `createdAt` timestamp field to the User model in Prisma.',
    { systemPrompt: SYSTEM_PROMPTS.buildFeature },
  )
  console.log(featureResult)
  console.log('\n' + engine.formatCostSummary())

  console.log('\n=== Debugging ===')
  const debugResult = await engine.ask(
    'TypeError: Cannot read properties of undefined (reading "id") at getUserById line 42.',
    { systemPrompt: SYSTEM_PROMPTS.debug },
  )
  console.log(debugResult)
  console.log('\n' + engine.formatCostSummary())

  // Test cost control with many messages
  console.log('\n=== Testing Cost Control (10 messages) ===')
  for (let i = 1; i <= 10; i++) {
    await engine.ask(`Message ${i}: What's 2+2?`)
    const ctx = engine.getContextWindow()
    const usage = engine.getUsage()
    console.log(
      `[${i}] Context: ${ctx.usedPercentage}% | Cost: $${usage ? usage.costUSD.toFixed(4) : '0.0000'}`,
    )
  }
  
  console.log('\n' + engine.formatCostSummary())
}

// Uncomment to run:
// main().catch(console.error)
