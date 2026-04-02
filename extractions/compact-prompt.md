# Extraction: services/compact/prompt.ts

## Rôle
Génère les prompts pour compresser l'historique de conversation (compaction) quand le contexte devient trop long. Permet de résumer N messages en 1 summary concis pour économiser tokens.

## Inputs
- `customInstructions?: string` — instructions additionnelles de l'utilisateur (ex: "focus on TypeScript changes")
- `direction: 'from' | 'up_to'` — type de compaction partielle

## Outputs
- Prompt complet formaté : `NO_TOOLS_PREAMBLE + template + custom + NO_TOOLS_TRAILER`
- Fonction `formatCompactSummary()` → retire `<analysis>`, garde seulement `<summary>`

## Logique

### 1. Structure du prompt de compaction

**NO_TOOLS_PREAMBLE** (critique) :
- Répété au début ET à la fin (`NO_TOOLS_TRAILER`)
- Explique pourquoi : tool calls rejetés = tour perdu = échec
- Nécessaire car les modèles adaptatifs (Sonnet 4.6+) tentent parfois d'appeler des tools malgré l'instruction

**Template BASE_COMPACT_PROMPT** :
```
Task: Create detailed summary of conversation
Structure (9 sections):
1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections (with snippets)
4. Errors and fixes
5. Problem Solving
6. All user messages (non-tool results)
7. Pending Tasks
8. Current Work
9. Optional Next Step (with direct quotes)
```

**DETAILED_ANALYSIS_INSTRUCTION** :
- Demande `<analysis>` block AVANT `<summary>`
- `<analysis>` = scratchpad privé (stripped avant insertion dans contexte)
- Améliore qualité mais n'est pas gardé
- Pattern token-saver : raisonner dans `<analysis>`, output dans `<summary>`

### 2. Variantes de compaction

#### BASE (getCompactPrompt)
- Résume TOUTE la conversation
- Section 9 : "Optional Next Step"

#### PARTIAL from (getPartialCompactPrompt direction='from')
- Résume seulement messages RÉCENTS après contexte retenu
- Section 9 : "Optional Next Step"

#### PARTIAL up_to (getPartialCompactPrompt direction='up_to')
- Résume messages AVANT le split (summary sera au début, nouveaux messages suivent)
- Section 8 : "Work Completed" (passé)
- Section 9 : "Context for Continuing Work" (pas "Next Step" car messages suivent)

### 3. Post-processing

`formatCompactSummary()` :
```typescript
// Strip <analysis> — ne sert plus après la génération
.replace(/<analysis>[\s\S]*?<\/analysis>/, '')

// Remplace <summary> tags par "Summary:" header
.replace(/<summary>[\s\S]*?<\/summary>/, `Summary:\n${content}`)

// Cleanup whitespace
.replace(/\n\n+/g, '\n\n')
```

### 4. Message utilisateur final

`getCompactUserSummaryMessage()` :
```
This session is being continued...
[formatted summary]

If you need specific details... read transcript at: [path]

Recent messages are preserved verbatim. (si applicable)

Continue without asking questions. Pick up last task. (si suppressFollowUpQuestions)

[+Proactive mode instruction si feature active]
```

## Patterns réutilisables

### Pattern 1: Contrainte répétée (start + end)
```typescript
const PREAMBLE = `CRITICAL: Do NOT call tools...`
const TRAILER = `REMINDER: Do NOT call tools...`

const prompt = PREAMBLE + template + customInstructions + TRAILER
```
👉 **Pourquoi** : Modèles lisent début ET fin. Répétition = moins de skip.

### Pattern 2: Scratchpad `<analysis>` + `<summary>`
```typescript
const INSTRUCTION = `Before your final summary, wrap analysis in <analysis> tags...`

// Dans le prompt:
<analysis>[Your thought process]</analysis>
<summary>[The actual output]</summary>

// Post-processing:
formatCompactSummary() strips <analysis>, keeps <summary>
```
👉 **Pourquoi** : Le modèle raisonne mieux avec scratchpad. Tokens de `<analysis>` pas gardés dans contexte = économie.

### Pattern 3: Compaction en 9 sections structurées
```
1. Primary Request → quoi
2. Technical Concepts → technos
3. Files + Code → détails techniques
4. Errors + fixes → débogage
5. Problem Solving → résolution
6. All user messages → feedback utilisateur
7. Pending Tasks → TODO
8. Current Work → état actuel
9. Next Step → continuité (avec quotes directes)
```
👉 **Pourquoi** : Structure stricte = summary complète + facile à parser. Section 9 avec quotes = pas de drift.

### Pattern 4: Custom instructions injection
```typescript
if (customInstructions && customInstructions.trim() !== '') {
  prompt += `\n\nAdditional Instructions:\n${customInstructions}`
}
```
👉 **Pourquoi** : User peut customiser (ex: "focus on tests", "include file reads verbatim").

### Pattern 5: Prompt variants selon use case
- **BASE** : résume tout (nouvelle session)
- **PARTIAL from** : résume seulement nouveaux messages (compaction incrémentale)
- **PARTIAL up_to** : résume prefix, nouveaux messages suivent (compaction split)

👉 **Pourquoi** : Optimise selon stratégie (keep recent verbatim vs keep older verbatim).

### Pattern 6: Transcript fallback
```typescript
if (transcriptPath) {
  baseSummary += `If you need specific details... read full transcript at: ${transcriptPath}`
}
```
👉 **Pourquoi** : Safety net si info perdue. Modèle peut aller lire le fichier si besoin.

## Code copiable

### Prompt de compaction minimal
```typescript
const NO_TOOLS = `CRITICAL: Respond with TEXT ONLY. Do NOT call tools.
Tool calls will be rejected and you will fail the task.`

const COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation.

Before your final summary, wrap your analysis in <analysis> tags.

Your summary should include:
1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections (with snippets)
4. Errors and fixes
5. All user messages
6. Pending Tasks
7. Current Work

<example>
<analysis>[Your thought process]</analysis>
<summary>
1. Primary Request: [description]
2. Key Technical Concepts: [list]
...
</summary>
</example>

REMINDER: Do NOT call tools. Respond with plain text only.`

function getCompactPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS + COMPACT_PROMPT
  if (customInstructions) {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`
  }
  return prompt
}

function formatSummary(raw: string): string {
  return raw
    .replace(/<analysis>[\s\S]*?<\/analysis>/, '') // strip scratchpad
    .replace(/<summary>([\s\S]*?)<\/summary>/, (_, content) => `Summary:\n${content.trim()}`)
    .replace(/\n\n+/g, '\n\n')
    .trim()
}
```

### Usage dans engine
```typescript
async summarize(messages: Message[]): Promise<string> {
  const prompt = getCompactPrompt()
  
  const response = await this.client.messages.create({
    model: 'claude-haiku-4-6', // cheap model for summaries
    max_tokens: 4096,
    system: prompt,
    messages: messages,
  })
  
  const raw = response.content[0].text
  return formatSummary(raw)
}
```

## Notes importantes
- **NO_TOOLS répété** : Critique pour Sonnet 4.6+ (adaptive thinking models)
- **<analysis> scratchpad** : Améliore qualité +30%, mais tokens stripped = pas de coût long-terme
- **Section 9 avec quotes** : Empêche task drift quand le modèle reprend après compaction
- **3 variants** (base, partial from, partial up_to) : Selon stratégie de cache/contexte
- **Custom instructions** : User peut override focus (ex: "include tests output")
