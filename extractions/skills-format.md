# Extraction: skills/ (format SKILL.md + auto-invocation)

## Rôle
Format standardisé pour packager des workflows répétables (skills) que Claude peut auto-invoquer ou que l'utilisateur peut appeler explicitement. Structure claire : frontmatter YAML + markdown avec steps, success criteria, human checkpoints.

## Inputs
- Frontmatter YAML : `name`, `description`, `allowed-tools`, `when_to_use`, `argument-hint`, etc.
- Markdown body : Goal → Steps (avec success criteria) → Instructions
- User invocation : `/skill-name [args]` ou auto-detection par description

## Outputs
- Prompt formaté injecté dans le contexte
- Workflow structuré avec checkpoints
- Tool permissions scope limité (whitelist)

## Logique

### 1. Structure SKILL.md

```markdown
---
name: skill-name
description: one-line description for auto-invocation matching
allowed-tools:
  - Read
  - Bash(*)
  - Edit
when_to_use: "Use when the user wants to... Examples: 'trigger phrase', 'another phrase'"
argument-hint: "[optional args description]"
context: fork  # or inline (default)
---

# Skill Title

Brief overview of what this skill does.

## When to use this skill

Explicit trigger conditions. Be specific with examples.

## How to use this skill

1. **Step 1 Name**
   - Action description
   - **Success criteria**: What proves this step is done
   - **Human checkpoint**: Ask before proceeding (for irreversible actions)

2. **Step 2 Name**
   - Action description
   - **Success criteria**: Specific, verifiable outcome

## Core requirements

- Requirement 1
- Requirement 2

## Common mistakes to avoid

- Mistake 1 → correct approach
- Mistake 2 → correct approach
```

### 2. Frontmatter Fields

```yaml
---
name: debug                           # Kebab-case identifier
description: Help diagnose issues     # For auto-invocation matching
allowed-tools:                        # Tool whitelist (scope permissions)
  - Read
  - Grep
  - Glob
  - Bash(git:*)                       # Pattern-based (git commands only)
when_to_use: "Use when the user wants to debug. Examples: 'help me fix this bug', 'something's not working'"
argument-hint: "[issue description]"  # Shown in UI
context: inline                       # inline (default) or fork (sub-agent)
disableModelInvocation: true          # Require explicit user call (no auto)
userInvocable: true                   # Can user call with /skill-name
---
```

**Key fields** :
- `name` : Identifier (kebab-case)
- `description` : Short description for matching
- `allowed-tools` : Whitelist (ex: `Bash(git:*)` = only git commands)
- `when_to_use` : **Critical** — trigger phrases pour auto-invocation. Doit être précis.
- `argument-hint` : Optional args description
- `context` : `inline` (current conversation) ou `fork` (sub-agent avec propre contexte)
- `disableModelInvocation` : Si `true`, nécessite `/skill-name` explicite (pas auto)
- `userInvocable` : Si `true`, user peut appeler avec `/skill-name`

### 3. Step Format (Success Criteria Mandatory)

```markdown
### 1. Reproduce the Issue

Run the failing test or command to confirm the bug exists.

**Success criteria**: Test fails with error message showing the exact problem. If the test passes, this may not be the right bug.

**Human checkpoint**: If the bug can't be reproduced, ask the user for more details before proceeding.
```

**Pattern** :
- **Step title** : Action verb + object (ex: "Reproduce the Issue")
- **Description** : What to do
- **Success criteria** : **MANDATORY** — How to verify step completion. Prévient hallucinations.
- **Human checkpoint** : Si action irréversible (merge, deploy, delete)

### 4. Bundled Skill Registration

```typescript
// skills/bundled/debug.ts
import { registerBundledSkill } from '../bundledSkills.js'

export function registerDebugSkill(): void {
  registerBundledSkill({
    name: 'debug',
    description: 'Enable debug logging and help diagnose issues',
    allowedTools: ['Read', 'Grep', 'Glob'],
    argumentHint: '[issue description]',
    disableModelInvocation: true,  // Require explicit /debug
    userInvocable: true,
    async getPromptForCommand(args) {
      // Dynamic prompt generation (ex: read log file, check settings)
      const debugLogPath = getDebugLogPath()
      
      const prompt = `# Debug Skill

Help the user debug an issue.

## Session Debug Log

The debug log is at: \`${debugLogPath}\`

## Issue Description

${args || 'No specific issue described. Read the log and summarize errors.'}

## Instructions

1. Review the issue description
2. Look for [ERROR] and [WARN] entries in the log
3. Explain what you found in plain language
4. Suggest concrete fixes
`
      return [{ type: 'text', text: prompt }]
    }
  })
}
```

**Pattern** : Dynamic prompt avec context réel (paths, status, etc.).

### 5. Skillify Pattern (Meta-Skill)

Le skill `skillify` capture une session en skill réutilisable.

```typescript
const SKILLIFY_PROMPT = `# Skillify

You are capturing this session's repeatable process as a reusable skill.

## Your Session Context

<session_memory>
{{sessionMemory}}
</session_memory>

<user_messages>
{{userMessages}}
</user_messages>

## Your Task

### Step 1: Analyze the Session

Before asking questions, analyze:
- What repeatable process was performed
- What the inputs/parameters were
- The distinct steps (in order)
- The success criteria for each step
- Where the user corrected you
- What tools/permissions were needed

### Step 2: Interview the User

Use AskUserQuestion for ALL questions. Never ask via plain text.

**Round 1: High-level confirmation**
- Suggest name and description
- Suggest goals and success criteria
- Ask for confirmation or rename

**Round 2: Details**
- Present steps as numbered list
- Suggest arguments (if needed)
- Ask: inline or forked context?
- Ask: where to save? (repo .claude/skills/ or personal ~/.claude/skills/)

**Round 3: Break down each step**
For each step:
- What does it produce?
- What proves success?
- Human checkpoint needed?
- Can run in parallel?
- Hard constraints?

Use multiple rounds of AskUserQuestion, especially if >3 steps.
`
```

**Pattern** : Interview-driven. Capture intent, params, steps, success criteria.

### 6. Context: Inline vs Fork

```yaml
context: inline   # Default — run in current conversation
```
- **inline** : Steps exécutés dans la conversation courante. User peut interrompre/corriger.
- **fork** : Sub-agent avec propre contexte. Self-contained, pas de mid-process steering.

**Quand fork ?**
- Task indépendante (ex: code review complet)
- Pas besoin d'input utilisateur mid-process
- Veux isolation du contexte principal

**Quand inline ?**
- User veut steering mid-process
- Task nécessite context de la conversation
- Interactive workflow

### 7. Tool Permissions Scoping

```yaml
allowed-tools:
  - Read            # Read tool (any file)
  - Bash(*)         # All bash commands
  - Bash(git:*)     # Only git commands
  - Edit            # Edit tool
  - Grep            # Grep tool
```

**Pattern** : Whitelist explicite. `Bash(git:*)` = pattern-based filtering.

### 8. Auto-Invocation Matching

```yaml
when_to_use: "Use when the user wants to create a playground, explorer, or interactive tool. Examples: 'make a playground for', 'build an explorer', 'create an interactive tool'"
```

**Critical** : Trigger phrases doivent être **précis**. Le modèle match sur description + when_to_use.

**Bon** :
```yaml
when_to_use: "Use when the user wants to debug. Examples: 'help me fix this', 'something's broken', 'this isn't working'"
```

**Mauvais** :
```yaml
when_to_use: "For debugging"  # Trop vague
```

## Patterns réutilisables

### Pattern 1: Success criteria mandatory
```markdown
### 1. Run Tests

Execute the test suite.

**Success criteria**: All 247 tests pass. If any fail, this step is incomplete.
```
👉 **Pourquoi** : Prévient hallucinations. Modèle doit vérifier outcome, pas assumer.

### Pattern 2: Human checkpoint for irreversible actions
```markdown
### 3. Merge PR

**Human checkpoint**: Ask user to confirm before merging. This cannot be undone.

Merge the PR to main branch.

**Success criteria**: PR is merged and main branch is updated.
```
👉 **Pourquoi** : Safety. Deploy, delete, merge = demander confirmation.

### Pattern 3: Dynamic prompt with real context
```typescript
async getPromptForCommand(args) {
  const currentBranch = await getBranch()
  const status = await getGitStatus()
  
  return [{
    type: 'text',
    text: `# Skill Name

Current branch: ${currentBranch}

${status}

Instructions:
1. ...
`
  }]
}
```
👉 **Pourquoi** : Prompt avec état réel > template statique.

### Pattern 4: Argument parsing
```typescript
argumentHint: "[branch-name] [--force]"

async getPromptForCommand(args) {
  const parts = args?.split(/\s+/) || []
  const branchName = parts[0] || 'main'
  const force = parts.includes('--force')
  
  return [{
    type: 'text',
    text: `Branch: ${branchName}, Force: ${force}`
  }]
}
```
👉 **Pourquoi** : Args parsed = custom behavior.

### Pattern 5: Tool whitelist with patterns
```yaml
allowed-tools:
  - Read
  - Bash(git:*)     # Only git commands
  - Bash(npm:*)     # Only npm commands
  - Edit
```
👉 **Pourquoi** : Scope permissions. Git skill = git only, pas tout Bash.

### Pattern 6: Inline vs fork context
```yaml
# Inline (default) — user can steer mid-process
context: inline

# Fork — sub-agent, self-contained, no steering
context: fork
```
👉 **Pourquoi** : Inline = interactive. Fork = fire-and-forget.

### Pattern 7: when_to_use with specific examples
```yaml
when_to_use: "Use when the user wants to create a playground, explorer, or interactive tool for a topic. Examples: 'make a playground for regex', 'build a color picker explorer', 'create an interactive API tester'"
```
👉 **Pourquoi** : Exemples concrets = meilleur matching. "make a playground for" = trigger.

## Code copiable

### Minimal SKILL.md template
```markdown
---
name: my-skill
description: Short one-line description
allowed-tools:
  - Read
  - Bash(*)
when_to_use: "Use when... Examples: 'trigger phrase 1', 'trigger phrase 2'"
argument-hint: "[optional-arg]"
context: inline
---

# Skill Name

Brief description of what this skill does.

## When to use this skill

- Condition 1
- Condition 2

## How to use this skill

### 1. First Step

Description of what to do.

**Success criteria**: Specific, verifiable outcome. Example: "All tests pass."

### 2. Second Step

Description.

**Success criteria**: Another specific outcome.

**Human checkpoint**: If this action is irreversible (deploy, delete, merge), ask before proceeding.

### 3. Final Step

Description.

**Success criteria**: Final outcome.

## Core requirements

- Requirement 1
- Requirement 2

## Common mistakes

- Mistake 1 → Correct approach
- Mistake 2 → Correct approach
```

### Bundled skill registration
```typescript
import { registerBundledSkill } from '../bundledSkills.js'

export function registerMySkill(): void {
  registerBundledSkill({
    name: 'my-skill',
    description: 'Short description for matching',
    allowedTools: ['Read', 'Bash(git:*)'],
    argumentHint: '[branch-name]',
    disableModelInvocation: false,  // Allow auto-invocation
    userInvocable: true,            // Allow /my-skill
    async getPromptForCommand(args) {
      // Dynamic context
      const branch = await getCurrentBranch()
      
      const prompt = `# My Skill

Current branch: ${branch}
User args: ${args || 'none'}

## Instructions

1. Step 1
   - Action
   - **Success criteria**: Outcome

2. Step 2
   - Action
   - **Success criteria**: Outcome
`
      return [{ type: 'text', text: prompt }]
    }
  })
}
```

### Usage pattern
```typescript
// User calls skill
/my-skill feature-branch

// Model auto-invokes (if when_to_use matches)
User: "Help me debug this issue"
→ Model detects "debug" → auto-invokes /debug skill
```

## Notes importantes
- **Success criteria MANDATORY** : Chaque step doit avoir success criteria explicite. Prévient hallucinations.
- **when_to_use avec exemples** : Trigger phrases précis = meilleur auto-invocation matching.
- **Human checkpoint** : Toujours pour actions irréversibles (merge, deploy, delete).
- **Tool whitelist** : Scope permissions. `Bash(git:*)` = pattern filtering.
- **Dynamic prompt** : Inject real context (paths, status, branch) > static template.
- **Inline vs fork** : Inline = steering, fork = fire-and-forget.
- **disableModelInvocation** : Si true, nécessite `/skill-name` explicite (pas auto).
- **Skillify meta-pattern** : Interview user → capture process → generate SKILL.md.
