import Anthropic from '@anthropic-ai/sdk'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
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

// ─── Engine ───────────────────────────────────────────────────────────────────

export class ClaudeEngine {
  private client: Anthropic
  private history: Message[] = []
  private model: string
  private maxHistory: number

  constructor(model = 'claude-sonnet-4-6', maxHistory = 6) {
    this.client = new Anthropic()
    this.model = model
    this.maxHistory = maxHistory // 3 turns (user + assistant pairs)
  }

  // Inspired by getSystemPrompt() in constants/prompts.ts
  // Pattern: identity → constraints → rules → output
  buildSystemPrompt(ctx: SystemPromptContext): string {
    return [
      `You are ${ctx.role}.`,
      ctx.constraints
        ? `## Constraints\n${ctx.constraints}`
        : null,
      ctx.rules
        ? `## Rules\n${ctx.rules}`
        : null,
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

    // Trim history: keep last N messages (sliding window like Claude Code)
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory)
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8096,
      system: systemPrompt,
      messages: this.history,
    })

    const text =
      response.content[0].type === 'text' ? response.content[0].text : ''

    this.history.push({ role: 'assistant', content: text })

    return text
  }

  clearMemory(): void {
    this.history = []
  }

  getHistory(): Message[] {
    return [...this.history]
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

  // Workflow: build feature
  const featureResult = await engine.ask(
    'Add a `createdAt` timestamp field to the User model in Prisma.',
    { systemPrompt: SYSTEM_PROMPTS.buildFeature },
  )
  console.log(featureResult)

  engine.clearMemory()

  // Workflow: debug
  const debugResult = await engine.ask(
    'TypeError: Cannot read properties of undefined (reading "id") at getUserById line 42.',
    { systemPrompt: SYSTEM_PROMPTS.debug },
  )
  console.log(debugResult)
}

main().catch(console.error)
