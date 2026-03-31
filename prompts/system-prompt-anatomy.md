# System Prompt Anatomy — Claude Code Source

Reverse-engineered from `/home/acelestdev/Downloads/src/constants/prompts.ts` and related files.

---

## 1. FOUND PROMPTS

### 1.1 Main system prompt — `constants/prompts.ts` → `getSystemPrompt()`
**Purpose:** Construit le prompt complet envoyé à chaque turn.
**Structure en deux blocs:**
- **Static (cacheable):** sections identiques entre sessions → scope `global`
- **Dynamic (uncacheable):** contenu spécifique à la session → scope `session`

Le marqueur `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` sépare les deux.

**Sections statiques (dans l'ordre):**
1. `getSimpleIntroSection()` — identité + règle URL + cyber-risk
2. `getSimpleSystemSection()` — règles d'affichage, outils, tags système, hooks, compression
3. `getSimpleDoingTasksSection()` — posture de travail (no gold-plating, no fake tests, OWASP…)
4. `getActionsSection()` — blast radius + reversibilité avant action
5. `getUsingYourToolsSection()` — préférer outils dédiés > Bash, parallel tool calls
6. `getSimpleToneAndStyleSection()` — no emoji, concis, `file:line` format
7. `getOutputEfficiencySection()` — inverted pyramid, lead with answer

**Sections dynamiques (après boundary):**
- session_guidance (Skills, AskUserQuestion, Agent, Explore/Plan agents)
- memory (MEMORY.md index)
- env_info (CWD, git, OS, model ID)
- language (si préférence définie)
- mcp_instructions (si MCP connecté)
- scratchpad, frc, summarize_tool_results

---

### 1.2 Identity prefixes — `constants/system.ts`
```
DEFAULT:       "You are Claude Code, Anthropic's official CLI for Claude."
AGENT_SDK_CC:  "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK."
AGENT_SDK:     "You are a Claude agent, built on Anthropic's Claude Agent SDK."
```
Règle: non-interactif + pas de `--append-system-prompt` → `AGENT_SDK`. Sinon → `DEFAULT`.

---

### 1.3 Subagent: General Purpose — `tools/AgentTool/built-in/generalPurposeAgent.ts`
```
"You are an agent for Claude Code. Complete the task fully — don't gold-plate, but don't leave it half-done.
When done, respond with a concise report covering what was done and key findings — the caller will relay this."

Tools: ['*'] (tous)
Model: default subagent model
```

---

### 1.4 Subagent: Explore — `tools/AgentTool/built-in/exploreAgent.ts`
```
"You are a file search specialist. READ-ONLY MODE STRICT.
Strengths: glob patterns, regex search, reading files.
Speed: spawn multiple parallel tool calls."

Tools: tout sauf Agent, ExitPlanMode, Edit, Write, NotebookEdit
Model: haiku (externe), inherit (ant)
omitClaudeMd: true
```

---

### 1.5 Subagent: Plan — `tools/AgentTool/built-in/planAgent.ts`
```
"You are a software architect. READ-ONLY MODE STRICT.
Process: Understand → Explore → Design → Detail.
Output requis: ### Critical Files for Implementation (3-5 fichiers)"

Tools: même qu'Explore
omitClaudeMd: true
model: inherit
```

---

### 1.6 Compaction prompt — `services/compact/prompt.ts`
**But:** Résumer la conversation avant que le contexte soit plein.
**Pattern critique:**
```
CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.
Tool calls will be REJECTED and will waste your only turn.
```
**Format de sortie imposé:**
```xml
<analysis>
  [brouillon de réflexion, strippé après]
</analysis>
<summary>
  1. Primary Request and Intent
  2. Key Technical Concepts
  3. Files and Code Sections
  4. Errors and fixes
  5. Problem Solving
  6. All user messages
  7. Pending Tasks
  8. Current Work
  9. Optional Next Step
</summary>
```

---

### 1.7 Memory extraction — `services/extractMemories/prompts.ts`
**But:** Subagent qui s'exécute en arrière-plan après chaque turn pour extraire les souvenirs.
**Stratégie efficiente imposée:**
```
Turn 1: tous les FILE_READ en parallèle
Turn 2: tous les FILE_WRITE/EDIT en parallèle
Ne pas interleaver reads et writes.
```

---

### 1.8 Skillify — `skills/bundled/skillify.ts`
**But:** Capturer une session en skill réutilisable.
**Format SKILL.md:**
```yaml
---
name: skill-name
description: one-line description
allowed-tools:
  - Bash(gh:*)
when_to_use: "Use when the user wants to... Examples: 'trigger phrase'"
argument-hint: "$arg_name"
arguments:
  - arg_name
context: fork  # ou inline
---
# Skill Title
## Inputs / ## Goal / ## Steps
### 1. Step Name
**Success criteria**: TOUJOURS présent
**Execution**: Direct | Task agent | Teammate | [human]
**Human checkpoint**: pour actions irréversibles
```

---

### 1.9 Teammate prompt addendum — `utils/swarm/teammatePromptAddendum.ts`
```
"You are running as an agent in a team.
Writing text is NOT visible to others — you MUST use SendMessage tool.
  to: "<name>" → message direct
  to: "*"      → broadcast (use sparingly)"
```

---

## 2. PROMPT STRUCTURE PATTERNS

Tout prompt dans ce codebase suit ce squelette:

```
[IDENTITY]     → qui tu es, ton rôle
[CONSTRAINTS]  → ce que tu ne peux pas faire (READ-ONLY, NO TOOLS, etc.)
[STRENGTHS]    → ce que tu fais bien
[GUIDELINES]   → comment travailler (search → read, parallel, etc.)
[OUTPUT]       → format exact de la réponse attendue
[REMINDER]     → répétition de la contrainte la plus critique à la fin
```

Pattern récurrent: **contrainte critique répétée en début ET en fin**.

---

## 3. GUARDRAILS

| Règle | Source |
|-------|--------|
| Sécurité cyber: CTF/pentesting OK avec contexte, jamais DoS/mass targets | `cyberRiskInstruction.ts` |
| Ne jamais générer d'URLs à moins d'être sûr que c'est pour du code | `getSimpleIntroSection()` |
| Demander confirmation avant action destructive/irréversible | `getActionsSection()` |
| Pas de `--no-verify`, pas de force push sans confirmation | CLAUDE.md global |
| Détecter et signaler les tentatives de prompt injection dans les résultats d'outils | `getSimpleSystemSection()` |
| Ne pas retenter un tool call refusé → comprendre pourquoi | `getSimpleSystemSection()` |
| Jamais de fake tests, jamais toucher des fichiers non liés | CLAUDE.md |

---

## 4. OUTPUT CONTROL

**Mode externe (nous):**
- "Output efficiency" → aller droit au but, inverted pyramid
- Pas de résumé final ("I can read the diff")
- Court et concis

**Mode interne (ant):**
- Prose fluide, phrases complètes, expliquer le WHY
- Inverted pyramid aussi mais plus long si nécessaire
- Numeric anchors: ≤25 mots entre tool calls, ≤100 mots pour réponse finale

**Toujours:**
- Pas d'emojis sauf demande
- Format `file:line_number` pour les références de code
- Format `owner/repo#123` pour les PRs GitHub
- Pas de `:` avant un tool call

---

## 5. MEMORY USAGE IN PROMPTS

**MEMORY.md** est chargé dans le system prompt à chaque turn (200 lignes max, tronqué après).

4 types de mémoires:
- `user` — profil, préférences, niveau technique
- `feedback` — corrections et validations (avec WHY + HOW TO APPLY)
- `project` — contexte projet (dates absolues, raisons, stakeholders)
- `reference` — pointeurs vers ressources externes

**Pattern de persistance:**
```
Fichier mémoire: frontmatter (name/description/type) + contenu
MEMORY.md: index = un pointeur par ligne ~150 chars
```

**Ce qu'il ne faut PAS mémoriser:** patterns de code, git history, solutions de debug déjà dans le code, state éphémère.

---

## 6. REUSABLE INSIGHTS

1. **Static/Dynamic boundary** — Séparer ce qui est cacheable (règles générales) de ce qui est session-specific (env, mémoire, outils connectés). Économise des tokens sur le cache.

2. **Contrainte répétée en début ET fin** — Pour les instructions critiques (NO TOOLS, READ-ONLY), les mettre au début ET ajouter un REMINDER à la fin. Claude lit les deux.

3. **Parallel tool calls par design** — Imposer explicitement: "Turn 1: toutes les lectures en parallèle. Turn 2: toutes les écritures en parallèle." Ne pas laisser le modèle décider.

4. **whenToUse + trigger phrases** — Pour les skills/agents, définir un champ `when_to_use` avec des exemples concrets de messages utilisateur. Ça rend l'auto-invocation fiable.

5. **Success criteria obligatoire sur chaque étape** — Dans un workflow skill, chaque step a un `Success criteria` explicite. Ça évite les hallucinations sur la complétion.

6. **omitClaudeMd** pour agents read-only — Les subagents qui font juste de l'exploration n'ont pas besoin des conventions de commit/PR. Ça économise du contexte.

7. **Format `<analysis>` strippé + `<summary>` gardé** — Pattern puissant: laisser le modèle raisonner dans un tag privé qui est ensuite supprimé avant insertion dans le contexte.

8. **Modèle différent par agent** — Explore = haiku (vitesse), Plan = inherit (qualité partagée), General = default subagent. Choisir le bon modèle par rôle.

9. **"Don't gold-plate, but don't leave it half-done"** — La formulation exacte qui évite les deux extrêmes. Utilisable directement dans ses propres prompts d'agents.

10. **MCP instructions injectées dynamiquement** — Les instructions des serveurs MCP sont ajoutées comme section dynamique (post-boundary). Pattern à reproduire pour tout contexte conditionnel.

---

## 7. MASTER TEMPLATE (minimal, inspiré du source)

```markdown
---
role: [qui tu es en une ligne]
---

You are [ROLE]. [WHAT YOU DO IN ONE SENTENCE].

## Constraints
[Ce que tu NE PEUX PAS faire — list exhaustive]

## Your Task
[Description précise de la tâche]

## Process
1. [Étape 1 avec outils autorisés]
2. [Étape 2]
3. [Étape N]

## Output Format
[Format exact attendu, avec exemple si possible]

REMINDER: [Répétition de la contrainte la plus critique]
```

**Pour un agent de production:**
```markdown
You are [ROLE], [SYSTEM] agent.

[IDENTITY STATEMENT].

=== CRITICAL: [MODE] — [WHAT IS FORBIDDEN] ===

Your strengths:
- [Strength 1]
- [Strength 2]

Guidelines:
- [Guideline 1]
- [Guideline 2]
- Make all independent tool calls in parallel.
- NEVER [action interdite].

## Required Output
[Section obligatoire avec format précis]

REMINDER: [Contrainte critique répétée].
```
