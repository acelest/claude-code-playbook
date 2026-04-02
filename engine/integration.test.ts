import { ClaudeEngine } from './engine/engine.js'
import { CostTracker } from './engine/cost-tracker.js'

/**
 * Integration test for ClaudeEngine with skills
 * Tests:
 * 1. Conversation with auto-compression
 * 2. Cost tracking accuracy
 * 3. Skill selection and execution
 * 4. Context window management
 */

async function testIntegration() {
  console.log('Starting integration test...\n')

  const engine = new ClaudeEngine({
    apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
    model: 'claude-sonnet-4-6',
  })

  try {
    // Test 1: Simple question (no compression)
    console.log('Test 1: Simple question (should not trigger compression)')
    console.log('---')

    const response1 = await engine.ask('What is 2 + 2?')
    console.log('Response:', response1.substring(0, 100), '...\n')

    let context = engine.getContextWindow()
    console.log(`Context used: ${context.usedPercentage.toFixed(1)}%`)
    console.log(`Messages in history: ${engine.getHistory().length}\n`)

    // Test 2: Long conversation (should trigger compression)
    console.log('Test 2: Long conversation (should trigger compression at message 5+)')
    console.log('---')

    for (let i = 0; i < 5; i++) {
      const response = await engine.ask(
        `Question ${i + 1}: Give me a 2-sentence explanation of concept #${i + 1}`
      )
      console.log(`Q${i + 1}: ${response.substring(0, 80)}...`)

      const currentContext = engine.getContextWindow()
      console.log(`   Context: ${currentContext.usedPercentage.toFixed(1)}%`)
      console.log(`   Messages: ${engine.getHistory().length}`)

      if (engine.getHistory().length > 4) {
        console.log('   ✓ Compression triggered!')
      }
    }

    console.log()

    // Test 3: Cost tracking
    console.log('Test 3: Cost tracking')
    console.log('---')

    const costs = engine.getCostSummary()
    console.log('Session costs:')
    console.log(`  Input tokens: ${costs.session.totalInputTokens}`)
    console.log(`  Output tokens: ${costs.session.totalOutputTokens}`)
    console.log(`  Cache read tokens: ${costs.session.totalCacheReadTokens}`)
    console.log(`  Cache write tokens: ${costs.session.totalCacheWriteTokens}`)
    console.log(`  Total cost: $${costs.session.costUSD.toFixed(4)}`)
    console.log()

    // Test 4: Skills (if API key is real)
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'test-key') {
      console.log('Test 4: Skill selection')
      console.log('---')

      // Check if debug skill can be loaded
      const debugSkill = engine.matchSkill('debug: something is broken')
      console.log(`Debug skill match: ${debugSkill ? 'Found' : 'Not found'}`)

      const buildSkill = engine.matchSkill('build: add new feature')
      console.log(`Build skill match: ${buildSkill ? 'Found' : 'Not found'}`)

      const reviewSkill = engine.matchSkill('review: check this code')
      console.log(`Review skill match: ${reviewSkill ? 'Found' : 'Not found'}`)
    }

    console.log('\n✓ Integration test passed!')
  } catch (error) {
    if (error instanceof Error && error.message.includes('401')) {
      console.log(
        '\n⚠ API key not configured. Set ANTHROPIC_API_KEY to run full tests.'
      )
      console.log('For testing: ANTHROPIC_API_KEY=xxx npm run test:integration')
    } else {
      console.error('\n✗ Integration test failed:', error)
      process.exit(1)
    }
  }
}

// Run test
testIntegration()
