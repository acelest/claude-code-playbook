import { readFile, readdir } from 'fs/promises'
import { join } from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillMetadata {
  name: string
  description: string
  allowedTools?: string[]
  whenToUse?: string
  argumentHint?: string
  context?: 'inline' | 'fork'
  disableModelInvocation?: boolean
  userInvocable?: boolean
}

export interface Skill {
  metadata: SkillMetadata
  content: string
  path: string
}

// ─── YAML Frontmatter Parser ──────────────────────────────────────────────────

function parseFrontmatter(fileContent: string): {
  metadata: Partial<SkillMetadata>
  content: string
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = fileContent.match(frontmatterRegex)

  if (!match) {
    return { metadata: {}, content: fileContent }
  }

  const [, yaml, content] = match
  const metadata: Partial<SkillMetadata> = {}

  // Simple YAML parser for our needs (no dependencies)
  const lines = yaml.split('\n')
  let currentKey: string | null = null
  let currentArray: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed.startsWith('-')) {
      // Array item
      const value = trimmed.slice(1).trim()
      currentArray.push(value)
    } else if (trimmed.includes(':')) {
      // Key-value pair
      if (currentKey && currentArray.length > 0) {
        ;(metadata as any)[currentKey] = currentArray
        currentArray = []
      }

      const [key, ...valueParts] = trimmed.split(':')
      const value = valueParts.join(':').trim()
      currentKey = key.trim()

      if (value && value !== '') {
        // Simple value
        ;(metadata as any)[currentKey] =
          value === 'true' ? true : value === 'false' ? false : value
      } else {
        // Start of array (next lines will be items)
        currentArray = []
      }
    }
  }

  // Flush last array
  if (currentKey && currentArray.length > 0) {
    ;(metadata as any)[currentKey] = currentArray
  }

  return { metadata, content }
}

// ─── Skill Loader ─────────────────────────────────────────────────────────────

export class SkillLoader {
  private skills: Skill[] = []
  private skillsDir: string

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir
  }

  /**
   * Load all skills from the skills directory.
   * Pattern: scan for SKILL.md files in subdirectories
   */
  async loadSkills(): Promise<void> {
    try {
      const entries = await readdir(this.skillsDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillPath = join(this.skillsDir, entry.name, 'SKILL.md')
        try {
          const content = await readFile(skillPath, 'utf-8')
          const { metadata, content: skillContent } =
            parseFrontmatter(content)

          if (!metadata.name) {
            console.warn(
              `[SkillLoader] Skipping ${skillPath}: missing 'name' in frontmatter`,
            )
            continue
          }

          this.skills.push({
            metadata: metadata as SkillMetadata,
            content: skillContent,
            path: skillPath,
          })
        } catch (e) {
          // Skill folder exists but no SKILL.md, skip silently
        }
      }

      console.log(`[SkillLoader] Loaded ${this.skills.length} skills`)
    } catch (e) {
      console.error(`[SkillLoader] Failed to load skills from ${this.skillsDir}:`, e)
    }
  }

  /**
   * Find a skill by exact name match.
   */
  getSkillByName(name: string): Skill | undefined {
    return this.skills.find((s) => s.metadata.name === name)
  }

  /**
   * Match skills by user message.
   * Pattern from Claude Code: use description + when_to_use for matching
   */
  matchSkills(userMessage: string): Skill[] {
    const message = userMessage.toLowerCase()
    const matches: Skill[] = []

    for (const skill of this.skills) {
      // Skip if auto-invocation is disabled
      if (skill.metadata.disableModelInvocation) continue

      // Match on description
      if (skill.metadata.description?.toLowerCase().includes(message)) {
        matches.push(skill)
        continue
      }

      // Match on when_to_use trigger phrases
      if (skill.metadata.whenToUse) {
        const phrases = skill.metadata.whenToUse
          .toLowerCase()
          .split('.')
          .map((p) => p.trim())

        for (const phrase of phrases) {
          if (phrase && message.includes(phrase)) {
            matches.push(skill)
            break
          }
        }
      }
    }

    return matches
  }

  /**
   * Get all loaded skills.
   */
  getAllSkills(): Skill[] {
    return [...this.skills]
  }

  /**
   * Get user-invocable skills (can be called with /skill-name).
   */
  getUserInvocableSkills(): Skill[] {
    return this.skills.filter((s) => s.metadata.userInvocable !== false)
  }

  /**
   * Format skill as prompt (inject full SKILL.md content).
   */
  formatSkillPrompt(skill: Skill, args?: string): string {
    let prompt = skill.content

    // Replace {{args}} placeholder if exists
    if (args) {
      prompt = prompt.replace(/\{\{args\}\}/g, args)
    }

    return prompt
  }
}

// ─── Usage Example ────────────────────────────────────────────────────────────

async function example() {
  const loader = new SkillLoader('/home/acelestdev/Downloads/src/playbook/skills')

  // Load all skills
  await loader.loadSkills()

  // Get skill by name
  const debugSkill = loader.getSkillByName('debug')
  if (debugSkill) {
    console.log('Debug skill loaded:', debugSkill.metadata.name)
    console.log('Description:', debugSkill.metadata.description)
  }

  // Match skills by message
  const userMessage = "Help me debug this error"
  const matches = loader.matchSkills(userMessage)
  console.log(`\nMatched ${matches.length} skills for: "${userMessage}"`)
  for (const match of matches) {
    console.log(`  - ${match.metadata.name}: ${match.metadata.description}`)
  }

  // Format skill as prompt
  if (debugSkill) {
    const prompt = loader.formatSkillPrompt(
      debugSkill,
      'TypeError: Cannot read property "id"',
    )
    console.log('\nSkill prompt:\n', prompt.substring(0, 500) + '...')
  }

  // List all user-invocable skills
  const userSkills = loader.getUserInvocableSkills()
  console.log(`\nUser-invocable skills (${userSkills.length}):`)
  for (const skill of userSkills) {
    console.log(`  /${skill.metadata.name} ${skill.metadata.argumentHint || ''}`)
  }
}

// Uncomment to run:
// example().catch(console.error)
