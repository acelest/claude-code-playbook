# Extraction: context.ts + history.ts + utils/context.ts

## Rôle
Gestion du contexte (session context, user context, history) et calcul de la fenêtre contextuelle (context window) pour optimiser l'usage des tokens et éviter de dépasser les limites.

## Inputs
- `model: string` — nom du modèle pour déterminer context window
- `betas?: string[]` — features beta (ex: 1M context)
- `usage: { input_tokens, cache_creation_input_tokens, cache_read_input_tokens }` — tokens utilisés

## Outputs
- `getSystemContext()` → git status + cache breaker
- `getUserContext()` → CLAUDE.md + current date
- `getContextWindowForModel()` → taille max du contexte (200k ou 1M)
- `calculateContextPercentages()` → % utilisé / restant

## Logique

### 1. Context Layers

#### System Context (cached for session)
```typescript
export const getSystemContext = memoize(async (): Promise<{ [k: string]: string }> => {
  // Skip git status in remote mode or when disabled
  const gitStatus = isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ||
                    !shouldIncludeGitInstructions()
    ? null
    : await getGitStatus()
  
  // Cache breaker injection (ant-only, for debugging)
  const injection = feature('BREAK_CACHE_COMMAND')
    ? getSystemPromptInjection()
    : null
  
  return {
    ...(gitStatus && { gitStatus }),
    ...(injection && { cacheBreaker: `[CACHE_BREAKER: ${injection}]` }),
  }
})
```

**Git Status format** :
```
This is the git status at the start of the conversation. Note: snapshot in time.

Current branch: feature/auth
Main branch (for PRs): main
Git user: Aubin

Status:
M  src/auth.ts
?? src/utils/

Recent commits:
abc123 feat: add JWT auth
def456 refactor: extract validation
```

**Truncation** : Max 2000 chars. Si dépassé → truncate + message explicatif.

#### User Context (cached for session)
```typescript
export const getUserContext = memoize(async (): Promise<{ [k: string]: string }> => {
  // CLAUDE.md discovery (unless disabled or bare mode without explicit --add-dir)
  const shouldDisableClaudeMd =
    isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS) ||
    (isBareMode() && getAdditionalDirectoriesForClaudeMd().length === 0)
  
  const claudeMd = shouldDisableClaudeMd
    ? null
    : getClaudeMds(filterInjectedMemoryFiles(await getMemoryFiles()))
  
  // Cache for other components
  setCachedClaudeMdContent(claudeMd || null)
  
  return {
    ...(claudeMd && { claudeMd }),
    currentDate: `Today's date is ${getLocalISODate()}.`,
  }
})
```

**Pattern** : Memoize cache, cleared via `getUserContext.cache.clear?.()` si injection change.

### 2. Context Window Calculation

```typescript
// Constantes
const MODEL_CONTEXT_WINDOW_DEFAULT = 200_000  // 200k tokens
const MAX_OUTPUT_TOKENS_DEFAULT = 32_000
const CAPPED_DEFAULT_MAX_TOKENS = 8_000       // slot-reservation optimization
const ESCALATED_MAX_TOKENS = 64_000           // retry si dépassement

export function getContextWindowForModel(model: string, betas?: string[]): number {
  // 1. Override env variable (ant-only, pour cap le contexte)
  if (process.env.USER_TYPE === 'ant' && process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS) {
    const override = parseInt(process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, 10)
    if (!isNaN(override) && override > 0) return override
  }
  
  // 2. [1m] suffix → explicit 1M context opt-in
  if (has1mContext(model)) {
    return 1_000_000
  }
  
  // 3. Model capabilities (from registry)
  const cap = getModelCapability(model)
  if (cap?.max_input_tokens && cap.max_input_tokens >= 100_000) {
    if (cap.max_input_tokens > 200_000 && is1mContextDisabled()) {
      return MODEL_CONTEXT_WINDOW_DEFAULT  // HIPAA/C4E: cap to 200k
    }
    return cap.max_input_tokens
  }
  
  // 4. Beta header (prompt caching + 1M context beta)
  if (betas?.includes(CONTEXT_1M_BETA_HEADER) && modelSupports1M(model)) {
    return 1_000_000
  }
  
  // 5. Experiment treatment (growth book)
  if (getSonnet1mExpTreatmentEnabled(model)) {
    return 1_000_000
  }
  
  // 6. Default fallback
  return MODEL_CONTEXT_WINDOW_DEFAULT  // 200k
}

// Helpers
function has1mContext(model: string): boolean {
  if (is1mContextDisabled()) return false
  return /\[1m\]/i.test(model)  // ex: claude-sonnet-4-6[1m]
}

function modelSupports1M(model: string): boolean {
  if (is1mContextDisabled()) return false
  const canonical = getCanonicalName(model)
  return canonical.includes('claude-sonnet-4') || canonical.includes('opus-4-6')
}

function is1mContextDisabled(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT)  // C4E/HIPAA compliance
}
```

### 3. Context Usage Calculation

```typescript
export function calculateContextPercentages(
  currentUsage: {
    input_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  } | null,
  contextWindowSize: number,
): { used: number | null; remaining: number | null } {
  if (!currentUsage) {
    return { used: null, remaining: null }
  }
  
  // Total = regular input + cache write + cache read
  const totalInputTokens =
    currentUsage.input_tokens +
    currentUsage.cache_creation_input_tokens +
    currentUsage.cache_read_input_tokens
  
  const usedPercentage = Math.round((totalInputTokens / contextWindowSize) * 100)
  const clampedUsed = Math.min(100, Math.max(0, usedPercentage))
  
  return {
    used: clampedUsed,
    remaining: 100 - clampedUsed,
  }
}
```

### 4. History Management

#### Pasted Content References
```typescript
// Format: [Pasted text #1 +10 lines] or [Image #2]
function formatPastedTextRef(id: number, numLines: number): string {
  if (numLines === 0) return `[Pasted text #${id}]`
  return `[Pasted text #${id} +${numLines} lines]`
}

// Expand placeholders inline
export function expandPastedTextRefs(
  input: string,
  pastedContents: Record<number, PastedContent>,
): string {
  const refs = parseReferences(input)  // Find all [Pasted text #N]
  let expanded = input
  
  // Reverse order to keep offsets valid after replacement
  for (let i = refs.length - 1; i >= 0; i--) {
    const ref = refs[i]!
    const content = pastedContents[ref.id]
    if (content?.type !== 'text') continue
    
    expanded =
      expanded.slice(0, ref.index) +
      content.content +
      expanded.slice(ref.index + ref.match.length)
  }
  
  return expanded
}
```

**Pattern** : Petits textes inline, gros textes → hash + external store.

```typescript
type StoredPastedContent = {
  id: number
  type: 'text' | 'image'
  content?: string       // inline si < 1024 chars
  contentHash?: string   // hash si > 1024 chars (external store)
  mediaType?: string
  filename?: string
}

const MAX_PASTED_CONTENT_LENGTH = 1024
```

#### History Reader (reverse chronological)
```typescript
async function* makeLogEntryReader(): AsyncGenerator<LogEntry> {
  const currentSession = getSessionId()
  
  // 1. Pending entries (not yet flushed)
  for (let i = pendingEntries.length - 1; i >= 0; i--) {
    yield pendingEntries[i]!
  }
  
  // 2. Disk entries (global history.jsonl file)
  const historyPath = join(getClaudeConfigHomeDir(), 'history.jsonl')
  
  for await (const line of readLinesReverse(historyPath)) {
    try {
      const entry = deserializeLogEntry(line)
      
      // Filter skipped timestamps (removeLastFromHistory fast path)
      if (entry.sessionId === currentSession && skippedTimestamps.has(entry.timestamp)) {
        continue
      }
      
      yield entry
    } catch (error) {
      logForDebugging(`Failed to parse history line: ${error}`)
    }
  }
}
```

**Pattern** : Generator pour streaming + reverse reading (most recent first).

### 5. Max Output Tokens Optimization

```typescript
// Slot-reservation optimization:
// - Default 32k (over-reserves 8× vs p99 = 4.9k)
// - Capped default 8k (<1% hit limit)
// - Escalate to 64k on retry if hit limit

const CAPPED_DEFAULT_MAX_TOKENS = 8_000
const ESCALATED_MAX_TOKENS = 64_000

export function getModelMaxOutputTokens(model: string): {
  default: number
  upperLimit: number
} {
  // Model-specific caps (from registry)
  const cap = getModelCapability(model)
  if (cap?.max_output_tokens) {
    return {
      default: cap.max_output_tokens,
      upperLimit: cap.max_output_tokens,
    }
  }
  
  // Use capped default if enabled (slot optimization)
  const defaultTokens = shouldUseCappedDefault()
    ? CAPPED_DEFAULT_MAX_TOKENS
    : MAX_OUTPUT_TOKENS_DEFAULT
  
  return {
    default: defaultTokens,
    upperLimit: MAX_OUTPUT_TOKENS_UPPER_LIMIT,  // 64k
  }
}
```

**Pattern** : Start conservateur (8k), escalate si besoin (64k retry).

## Patterns réutilisables

### Pattern 1: Memoized context with cache clear
```typescript
export const getSystemContext = memoize(async (): Promise<Context> => {
  // Expensive operations (git status, file reads)
  const data = await fetchExpensiveData()
  return data
})

// Clear cache when state changes
export function setSystemPromptInjection(value: string | null): void {
  systemPromptInjection = value
  getSystemContext.cache.clear?.()  // Force recompute
}
```
👉 **Pourquoi** : Évite recompute coûteux (git, fs) par message. Clear explicite si state change.

### Pattern 2: Context window resolution cascade
```typescript
function getContextWindow(model: string): number {
  // Priority order (highest to lowest):
  // 1. Env override (ant-only cap)
  // 2. [1m] suffix (explicit opt-in)
  // 3. Model capabilities registry
  // 4. Beta header (feature flag)
  // 5. Experiment treatment (A/B test)
  // 6. Default fallback (200k)
  
  if (envOverride) return envOverride
  if (explicitSuffix) return 1_000_000
  if (modelCap) return modelCap
  if (betaEnabled) return 1_000_000
  if (experimentOn) return 1_000_000
  return DEFAULT
}
```
👉 **Pourquoi** : Flexible resolution avec fallbacks. Override env = safety valve pour cap.

### Pattern 3: Context usage percentage with clamping
```typescript
function calculateUsage(tokens: number, window: number): number {
  const percentage = Math.round((tokens / window) * 100)
  return Math.min(100, Math.max(0, percentage))  // clamp [0, 100]
}
```
👉 **Pourquoi** : Affichage UI (progress bar). Clamp évite bugs si malformed data.

### Pattern 4: Pasted content inline vs external
```typescript
type StoredContent = {
  content?: string       // inline si petit
  contentHash?: string   // hash → external store si gros
}

function storePaste(text: string): StoredContent {
  if (text.length <= MAX_LENGTH) {
    return { content: text }  // inline
  }
  const hash = hashText(text)
  writeToExternalStore(hash, text)
  return { contentHash: hash }  // reference
}
```
👉 **Pourquoi** : Évite bloat du history.jsonl. Gros pastes → external, petits → inline.

### Pattern 5: History reverse reading (generator)
```typescript
async function* readHistory(): AsyncGenerator<Entry> {
  // 1. In-memory pending first (most recent)
  for (let i = pending.length - 1; i >= 0; i--) {
    yield pending[i]
  }
  
  // 2. Disk entries second (older)
  for await (const line of readLinesReverse(filePath)) {
    yield parseLine(line)
  }
}
```
👉 **Pourquoi** : Streaming + most recent first. Generator = memory efficient pour gros logs.

### Pattern 6: Max tokens escalation strategy
```typescript
const DEFAULT = 8_000   // Conservative start
const ESCALATE = 64_000 // Retry if hit limit

async function call(prompt: string, retries = 1): Promise<string> {
  try {
    return await api.call({ max_tokens: DEFAULT, ... })
  } catch (e) {
    if (isMaxTokensError(e) && retries > 0) {
      return await api.call({ max_tokens: ESCALATE, ... })  // Retry with higher cap
    }
    throw e
  }
}
```
👉 **Pourquoi** : Slot-reservation optimization. <1% hit limit → escalate, rest save 4×.

## Code copiable

### Context manager minimal
```typescript
type Context = {
  systemContext: { [k: string]: string }
  userContext: { [k: string]: string }
}

class ContextManager {
  private systemCache: Context['systemContext'] | null = null
  private userCache: Context['userContext'] | null = null
  
  async getSystemContext(): Promise<Context['systemContext']> {
    if (this.systemCache) return this.systemCache
    
    // Expensive: git status, etc.
    const gitStatus = await getGitStatus()
    
    this.systemCache = {
      ...(gitStatus && { gitStatus }),
      timestamp: new Date().toISOString(),
    }
    
    return this.systemCache
  }
  
  async getUserContext(): Promise<Context['userContext']> {
    if (this.userCache) return this.userCache
    
    // Expensive: file system walk for CLAUDE.md
    const claudeMd = await loadClaudeMd()
    const today = new Date().toISOString().split('T')[0]
    
    this.userCache = {
      ...(claudeMd && { claudeMd }),
      currentDate: `Today's date is ${today}.`,
    }
    
    return this.userCache
  }
  
  clearCache() {
    this.systemCache = null
    this.userCache = null
  }
}
```

### Context window calculator
```typescript
const CONTEXT_WINDOWS = {
  'claude-sonnet-4-6': 200_000,
  'claude-sonnet-4-6[1m]': 1_000_000,  // explicit 1M opt-in
  'claude-haiku-4-6': 200_000,
  'claude-opus-4-6': 200_000,
}

function getContextWindow(model: string): number {
  // Check for [1m] suffix
  if (/\[1m\]/i.test(model)) {
    return 1_000_000
  }
  
  return CONTEXT_WINDOWS[model] ?? 200_000  // default fallback
}

function calculateUsage(
  inputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  contextWindow: number,
): { used: number; remaining: number } {
  const total = inputTokens + cacheCreationTokens + cacheReadTokens
  const used = Math.round((total / contextWindow) * 100)
  const clamped = Math.min(100, Math.max(0, used))
  
  return {
    used: clamped,
    remaining: 100 - clamped,
  }
}
```

### Usage dans engine
```typescript
class ClaudeEngine {
  private contextManager = new ContextManager()
  private model = 'claude-sonnet-4-6'
  
  async ask(message: string): Promise<string> {
    // Build context
    const systemCtx = await this.contextManager.getSystemContext()
    const userCtx = await this.contextManager.getUserContext()
    
    const systemPrompt = buildSystemPrompt(systemCtx, userCtx)
    
    // Calculate window
    const contextWindow = getContextWindow(this.model)
    
    // Check usage before call
    const currentUsage = this.estimateCurrentUsage()
    const { used, remaining } = calculateUsage(
      currentUsage.input,
      currentUsage.cacheWrite,
      currentUsage.cacheRead,
      contextWindow,
    )
    
    if (used > 80) {
      console.warn(`Context usage: ${used}% - consider compaction`)
    }
    
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8_000,  // conservative start
      system: systemPrompt,
      messages: [...],
    })
    
    return response.content[0].text
  }
}
```

## Notes importantes
- **Memoize avec cache clear** : Évite recompute git/fs coûteux. Clear si injection change.
- **Context window cascade** : 6 fallbacks (env override → [1m] → capabilities → beta → experiment → default)
- **1M context opt-in** : [1m] suffix ou beta header. Disabled pour HIPAA/C4E (compliance).
- **Git status truncation** : Max 2000 chars. Large repos → partial view + message explicatif.
- **Pasted content** : Inline < 1024 chars, hash + external > 1024 chars (évite bloat history.jsonl)
- **History reverse reading** : Generator + most recent first. Memory efficient.
- **Max tokens escalation** : Start 8k (slot optimization), retry 64k si hit limit (<1% cases)
