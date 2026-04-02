# Extraction: cost-tracker.ts + costHook.ts

## Rôle
Tracking complet des tokens, coûts, et métriques de performance par session. Permet de :
- Accumuler input/output/cache tokens par modèle
- Calculer coût $$$ en temps réel
- Sauvegarder/restaurer état pour reprendre sessions
- Afficher summary formaté à la fin

## Inputs
- `usage: Usage` — objet retourné par Anthropic API (input_tokens, output_tokens, cache_*, etc.)
- `cost: number` — coût calculé en USD
- `model: string` — nom du modèle utilisé

## Outputs
- État global accumulé (getters)
- `formatTotalCost()` → string formaté pour affichage
- `saveCurrentSessionCosts()` → persist vers project config
- `restoreCostStateForSession()` → restore depuis project config

## Logique

### 1. Structure ModelUsage
```typescript
type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number    // cache hit = cheap
  cacheCreationInputTokens: number // cache write = expensive
  webSearchRequests: number
  costUSD: number
  contextWindow: number
  maxOutputTokens: number
}
```

### 2. Accumulation par modèle
```typescript
function addToTotalModelUsage(cost: number, usage: Usage, model: string): ModelUsage {
  const modelUsage = getUsageForModel(model) ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    costUSD: 0,
    contextWindow: 0,
    maxOutputTokens: 0,
  }

  modelUsage.inputTokens += usage.input_tokens
  modelUsage.outputTokens += usage.output_tokens
  modelUsage.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0
  modelUsage.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0
  modelUsage.webSearchRequests += usage.server_tool_use?.web_search_requests ?? 0
  modelUsage.costUSD += cost
  
  return modelUsage
}
```

### 3. Tracking global
```typescript
export function addToTotalSessionCost(cost: number, usage: Usage, model: string): number {
  const modelUsage = addToTotalModelUsage(cost, usage, model)
  addToTotalCostState(cost, modelUsage, model) // global state
  
  // Metrics counters (Prometheus-style)
  getCostCounter()?.add(cost, { model })
  getTokenCounter()?.add(usage.input_tokens, { model, type: 'input' })
  getTokenCounter()?.add(usage.output_tokens, { model, type: 'output' })
  getTokenCounter()?.add(usage.cache_read_input_tokens ?? 0, { model, type: 'cacheRead' })
  getTokenCounter()?.add(usage.cache_creation_input_tokens ?? 0, { model, type: 'cacheCreation' })
  
  // Advisor usage (nested model calls)
  let totalCost = cost
  for (const advisorUsage of getAdvisorUsage(usage)) {
    const advisorCost = calculateUSDCost(advisorUsage.model, advisorUsage)
    totalCost += addToTotalSessionCost(advisorCost, advisorUsage, advisorUsage.model)
  }
  
  return totalCost
}
```

### 4. Persistence (session-aware)
```typescript
type StoredCostState = {
  totalCostUSD: number
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  lastDuration: number | undefined
  modelUsage: { [modelName: string]: ModelUsage } | undefined
}

// Sauvegarder
export function saveCurrentSessionCosts(fpsMetrics?: FpsMetrics): void {
  saveCurrentProjectConfig(current => ({
    ...current,
    lastCost: getTotalCostUSD(),
    lastAPIDuration: getTotalAPIDuration(),
    lastAPIDurationWithoutRetries: getTotalAPIDurationWithoutRetries(),
    lastToolDuration: getTotalToolDuration(),
    lastDuration: getTotalDuration(),
    lastLinesAdded: getTotalLinesAdded(),
    lastLinesRemoved: getTotalLinesRemoved(),
    lastTotalInputTokens: getTotalInputTokens(),
    lastTotalOutputTokens: getTotalOutputTokens(),
    lastTotalCacheCreationInputTokens: getTotalCacheCreationInputTokens(),
    lastTotalCacheReadInputTokens: getTotalCacheReadInputTokens(),
    lastTotalWebSearchRequests: getTotalWebSearchRequests(),
    lastFpsAverage: fpsMetrics?.averageFps,
    lastFpsLow1Pct: fpsMetrics?.low1PctFps,
    lastModelUsage: Object.fromEntries(
      Object.entries(getModelUsage()).map(([model, usage]) => [
        model,
        {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
          webSearchRequests: usage.webSearchRequests,
          costUSD: usage.costUSD,
        },
      ]),
    ),
    lastSessionId: getSessionId(),
  }))
}

// Restaurer
export function restoreCostStateForSession(sessionId: string): boolean {
  const data = getStoredSessionCosts(sessionId)
  if (!data) return false
  
  // Only restore if session ID matches (avoid mixing sessions)
  if (projectConfig.lastSessionId !== sessionId) return false
  
  setCostStateForRestore(data)
  return true
}
```

### 5. Format display
```typescript
export function formatTotalCost(): string {
  const costDisplay = formatCost(getTotalCostUSD()) +
    (hasUnknownModelCost() ? ' (costs may be inaccurate...)' : '')

  const modelUsageDisplay = formatModelUsage()

  return chalk.dim(
    `Total cost:            ${costDisplay}\n` +
    `Total duration (API):  ${formatDuration(getTotalAPIDuration())}\n` +
    `Total duration (wall): ${formatDuration(getTotalDuration())}\n` +
    `Total code changes:    ${getTotalLinesAdded()} lines added, ${getTotalLinesRemoved()} lines removed\n` +
    `${modelUsageDisplay}`
  )
}

function formatModelUsage(): string {
  const usageByShortName: { [shortName: string]: ModelUsage } = {}
  
  // Accumulate by canonical name (ex: claude-sonnet-4-6 → sonnet-4)
  for (const [model, usage] of Object.entries(getModelUsage())) {
    const shortName = getCanonicalName(model)
    if (!usageByShortName[shortName]) {
      usageByShortName[shortName] = { inputTokens: 0, outputTokens: 0, ... }
    }
    const acc = usageByShortName[shortName]
    acc.inputTokens += usage.inputTokens
    acc.outputTokens += usage.outputTokens
    acc.cacheReadInputTokens += usage.cacheReadInputTokens
    acc.cacheCreationInputTokens += usage.cacheCreationInputTokens
    acc.costUSD += usage.costUSD
  }
  
  let result = 'Usage by model:'
  for (const [shortName, usage] of Object.entries(usageByShortName)) {
    result += `\n  ${shortName}: ${formatNumber(usage.inputTokens)} input, ` +
              `${formatNumber(usage.outputTokens)} output, ` +
              `${formatNumber(usage.cacheReadInputTokens)} cache read, ` +
              `${formatNumber(usage.cacheCreationInputTokens)} cache write ` +
              `(${formatCost(usage.costUSD)})`
  }
  return result
}

function formatCost(cost: number, maxDecimalPlaces: number = 4): string {
  return `$${cost > 0.5 ? round(cost, 100).toFixed(2) : cost.toFixed(maxDecimalPlaces)}`
}
```

### 6. React Hook (auto-save on exit)
```typescript
// costHook.ts
export function useCostSummary(getFpsMetrics?: () => FpsMetrics): void {
  useEffect(() => {
    const f = () => {
      if (hasConsoleBillingAccess()) {
        process.stdout.write('\n' + formatTotalCost() + '\n')
      }
      saveCurrentSessionCosts(getFpsMetrics?.())
    }
    process.on('exit', f)
    return () => {
      process.off('exit', f)
    }
  }, [])
}
```

## Patterns réutilisables

### Pattern 1: Accumulation par modèle
```typescript
const modelUsage: { [model: string]: ModelUsage } = {}

function trackUsage(usage: Usage, model: string) {
  if (!modelUsage[model]) {
    modelUsage[model] = { inputTokens: 0, outputTokens: 0, costUSD: 0, ... }
  }
  modelUsage[model].inputTokens += usage.input_tokens
  modelUsage[model].outputTokens += usage.output_tokens
  modelUsage[model].costUSD += calculateCost(usage, model)
}
```

### Pattern 2: Session-aware persistence
```typescript
type CostState = {
  sessionId: string
  totalCost: number
  modelUsage: { [model: string]: ModelUsage }
}

function saveCosts(sessionId: string) {
  storage.set(sessionId, {
    sessionId,
    totalCost: getTotalCost(),
    modelUsage: getModelUsage(),
  })
}

function restoreCosts(sessionId: string): boolean {
  const state = storage.get(sessionId)
  if (!state || state.sessionId !== sessionId) return false
  
  // Restore state
  setTotalCost(state.totalCost)
  setModelUsage(state.modelUsage)
  return true
}
```
👉 **Pourquoi** : Évite de mélanger les coûts de sessions différentes. Session ID = guard.

### Pattern 3: Metrics counters (Prometheus-style)
```typescript
getCostCounter()?.add(cost, { model, speed: 'fast' })
getTokenCounter()?.add(tokens, { model, type: 'input' })
```
👉 **Pourquoi** : Permet aggregation par dimensions (model, type, speed) pour analytics.

### Pattern 4: Cache tokens tracking séparé
```typescript
cacheReadInputTokens += usage.cache_read_input_tokens ?? 0     // cheap (~10%)
cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0 // expensive (~100%)
```
👉 **Pourquoi** : Cache read = 90% moins cher. Tracking séparé = optimisation visible.

### Pattern 5: Nested model tracking (advisors)
```typescript
let totalCost = cost
for (const advisorUsage of getAdvisorUsage(usage)) {
  const advisorCost = calculateCost(advisorUsage.model, advisorUsage)
  totalCost += addToTotalSessionCost(advisorCost, advisorUsage, advisorUsage.model)
}
```
👉 **Pourquoi** : Certains modèles appellent d'autres modèles (ex: advisor tools). Compte tout.

### Pattern 6: Format display with short names
```typescript
// claude-sonnet-4-6 → sonnet-4
const shortName = getCanonicalName(model)
```
👉 **Pourquoi** : Versions multiples → aggregate par famille pour clarté.

## Code copiable

### Cost tracker minimal
```typescript
type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUSD: number
}

class CostTracker {
  private usage: { [model: string]: ModelUsage } = {}
  
  track(usage: Usage, cost: number, model: string) {
    if (!this.usage[model]) {
      this.usage[model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUSD: 0,
      }
    }
    
    const u = this.usage[model]
    u.inputTokens += usage.input_tokens
    u.outputTokens += usage.output_tokens
    u.cacheReadTokens += usage.cache_read_input_tokens ?? 0
    u.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0
    u.costUSD += cost
  }
  
  getTotalCost(): number {
    return Object.values(this.usage).reduce((sum, u) => sum + u.costUSD, 0)
  }
  
  getUsage(model: string): ModelUsage | undefined {
    return this.usage[model]
  }
  
  formatSummary(): string {
    let result = `Total cost: $${this.getTotalCost().toFixed(4)}\n\nUsage by model:\n`
    for (const [model, usage] of Object.entries(this.usage)) {
      result += `  ${model}:\n`
      result += `    Input: ${usage.inputTokens.toLocaleString()} tokens\n`
      result += `    Output: ${usage.outputTokens.toLocaleString()} tokens\n`
      result += `    Cache read: ${usage.cacheReadTokens.toLocaleString()} tokens\n`
      result += `    Cache write: ${usage.cacheWriteTokens.toLocaleString()} tokens\n`
      result += `    Cost: $${usage.costUSD.toFixed(4)}\n`
    }
    return result
  }
}
```

### Usage dans engine
```typescript
import Anthropic from '@anthropic-ai/sdk'

const PRICING = {
  'claude-sonnet-4-6': {
    input: 3.00 / 1_000_000,      // $3 per MTok
    output: 15.00 / 1_000_000,    // $15 per MTok
    cacheRead: 0.30 / 1_000_000,  // $0.30 per MTok (10%)
    cacheWrite: 3.75 / 1_000_000, // $3.75 per MTok (125%)
  },
  'claude-haiku-4-6': {
    input: 0.80 / 1_000_000,
    output: 4.00 / 1_000_000,
    cacheRead: 0.08 / 1_000_000,
    cacheWrite: 1.00 / 1_000_000,
  },
}

function calculateCost(usage: Usage, model: string): number {
  const pricing = PRICING[model]
  if (!pricing) return 0
  
  const inputCost = usage.input_tokens * pricing.input
  const outputCost = usage.output_tokens * pricing.output
  const cacheReadCost = (usage.cache_read_input_tokens ?? 0) * pricing.cacheRead
  const cacheWriteCost = (usage.cache_creation_input_tokens ?? 0) * pricing.cacheWrite
  
  return inputCost + outputCost + cacheReadCost + cacheWriteCost
}

class ClaudeEngine {
  private client: Anthropic
  private costTracker = new CostTracker()
  
  async ask(message: string): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: message }],
    })
    
    // Track usage
    const cost = calculateCost(response.usage, 'claude-sonnet-4-6')
    this.costTracker.track(response.usage, cost, 'claude-sonnet-4-6')
    
    return response.content[0].text
  }
  
  getCostSummary(): string {
    return this.costTracker.formatSummary()
  }
}
```

## Notes importantes
- **Session ID guard** : Évite de mélanger coûts de sessions différentes
- **Cache tokens séparés** : Cache read = 90% moins cher → optimisation visible
- **Nested models** : Advisor usage compte aussi (some tools call other models)
- **Canonical names** : Aggregate par famille (sonnet-4, haiku-4) pas par version patch
- **Auto-save on exit** : Hook React pour persist automatiquement
- **Metrics counters** : Pattern Prometheus pour analytics (dimensions: model, type, speed)
