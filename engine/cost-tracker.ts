// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUSD: number
}

interface UsageData {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

// USD per million tokens (Claude 4.6 models)
const PRICING = {
  'claude-sonnet-4-6': {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
    cacheRead: 0.3 / 1_000_000, // 10% of input (90% cheaper!)
    cacheWrite: 3.75 / 1_000_000, // 125% of input (25% premium)
  },
  'claude-haiku-4-6': {
    input: 0.8 / 1_000_000,
    output: 4.0 / 1_000_000,
    cacheRead: 0.08 / 1_000_000,
    cacheWrite: 1.0 / 1_000_000,
  },
  'claude-opus-4-6': {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
    cacheRead: 1.5 / 1_000_000,
    cacheWrite: 18.75 / 1_000_000,
  },
}

// ─── Cost Tracker ─────────────────────────────────────────────────────────────

export class CostTracker {
  private usageByModel: { [model: string]: ModelUsage } = {}

  /**
   * Track usage and cost for a specific model.
   * Pattern from cost-tracker.ts: accumulate per model.
   */
  track(usage: UsageData, model: string): void {
    if (!this.usageByModel[model]) {
      this.usageByModel[model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUSD: 0,
      }
    }

    const u = this.usageByModel[model]
    u.inputTokens += usage.input_tokens
    u.outputTokens += usage.output_tokens
    u.cacheReadTokens += usage.cache_read_input_tokens ?? 0
    u.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0

    const cost = this.calculateCost(usage, model)
    u.costUSD += cost
  }

  /**
   * Calculate cost for a single API call.
   * Pattern: input + output + cache_read (cheap) + cache_write (expensive)
   */
  private calculateCost(usage: UsageData, model: string): number {
    const pricing = PRICING[model as keyof typeof PRICING]
    if (!pricing) {
      console.warn(`[CostTracker] Unknown model: ${model}. Cost not tracked.`)
      return 0
    }

    const inputCost = usage.input_tokens * pricing.input
    const outputCost = usage.output_tokens * pricing.output
    const cacheReadCost =
      (usage.cache_read_input_tokens ?? 0) * pricing.cacheRead
    const cacheWriteCost =
      (usage.cache_creation_input_tokens ?? 0) * pricing.cacheWrite

    return inputCost + outputCost + cacheReadCost + cacheWriteCost
  }

  /**
   * Get total cost across all models.
   */
  getTotalCost(): number {
    return Object.values(this.usageByModel).reduce(
      (sum, u) => sum + u.costUSD,
      0,
    )
  }

  /**
   * Get usage for a specific model.
   */
  getUsage(model: string): ModelUsage | undefined {
    return this.usageByModel[model]
      ? { ...this.usageByModel[model] }
      : undefined
  }

  /**
   * Get all model usage.
   */
  getAllUsage(): { [model: string]: ModelUsage } {
    return { ...this.usageByModel }
  }

  /**
   * Format cost summary (pattern from cost-tracker.ts:formatTotalCost)
   */
  formatSummary(): string {
    const totalCost = this.getTotalCost()

    if (Object.keys(this.usageByModel).length === 0) {
      return 'No usage tracked yet.'
    }

    let result = `Total cost: $${totalCost > 0.5 ? totalCost.toFixed(2) : totalCost.toFixed(4)}\n\n`
    result += 'Usage by model:\n'

    for (const [model, usage] of Object.entries(this.usageByModel)) {
      const shortName = this.getCanonicalName(model)
      result += `  ${shortName.padEnd(20)} `
      result += `${this.formatNumber(usage.inputTokens)} input, `
      result += `${this.formatNumber(usage.outputTokens)} output, `
      result += `${this.formatNumber(usage.cacheReadTokens)} cache read, `
      result += `${this.formatNumber(usage.cacheWriteTokens)} cache write `
      result += `($${usage.costUSD.toFixed(4)})\n`
    }

    // Cache savings calculation
    const totalCacheRead = Object.values(this.usageByModel).reduce(
      (sum, u) => sum + u.cacheReadTokens,
      0,
    )
    if (totalCacheRead > 0) {
      result += `\n💡 Cache read ${this.formatNumber(totalCacheRead)} tokens (90% cheaper than regular input)`
    }

    return result
  }

  /**
   * Get canonical model name (ex: claude-sonnet-4-6 → sonnet-4)
   */
  private getCanonicalName(model: string): string {
    if (model.includes('sonnet')) return 'sonnet-4'
    if (model.includes('haiku')) return 'haiku-4'
    if (model.includes('opus')) return 'opus-4'
    return model
  }

  /**
   * Format number with thousand separators
   */
  private formatNumber(n: number): string {
    return n.toLocaleString()
  }

  /**
   * Reset all tracked usage
   */
  reset(): void {
    this.usageByModel = {}
  }
}

// ─── Usage Example ────────────────────────────────────────────────────────────

async function example() {
  const tracker = new CostTracker()

  // Track a few API calls
  tracker.track(
    {
      input_tokens: 1500,
      output_tokens: 500,
      cache_read_input_tokens: 5000, // Cheap!
      cache_creation_input_tokens: 1000, // Expensive
    },
    'claude-sonnet-4-6',
  )

  tracker.track(
    {
      input_tokens: 800,
      output_tokens: 200,
    },
    'claude-haiku-4-6',
  )

  console.log(tracker.formatSummary())

  // Get specific model usage
  const sonnetUsage = tracker.getUsage('claude-sonnet-4-6')
  if (sonnetUsage) {
    console.log(`\nSonnet total cost: $${sonnetUsage.costUSD.toFixed(4)}`)
  }
}

// Uncomment to run:
// example()
