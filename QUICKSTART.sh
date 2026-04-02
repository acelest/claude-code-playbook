#!/usr/bin/env bash

# Quick Start Guide for ClaudeEngine + Skills

# ─── Installation ────────────────────────────────────────────────────────────

echo "🚀 ClaudeEngine Quick Start"
echo ""
echo "Step 1: Copy engine + skills to your project"
echo "  cp -r playbook/engine /path/to/your/project/"
echo "  cp -r playbook/skills /path/to/your/project/"
echo ""

echo "Step 2: Install Anthropic SDK (if not already)"
echo "  npm install @anthropic-ai/sdk"
echo ""

echo "Step 3: Set API key"
echo "  export ANTHROPIC_API_KEY='sk-ant-...'"
echo ""

# ─── Usage ────────────────────────────────────────────────────────────────────

echo "Step 4: Try the engine"
echo ""

cat > test-engine.ts << 'EOF'
import { ClaudeEngine } from './engine/engine.js'

const engine = new ClaudeEngine({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-6',
})

// Simple question
const answer = await engine.ask('What is 2 + 2?')
console.log(answer)

// Debug something
const debug = await engine.ask('debug: TypeError in getUserById()', { skill: 'debug' })
console.log(debug)

// Check costs
const costs = engine.getCostSummary()
console.log(`Session cost: $${costs.session.costUSD.toFixed(4)}`)
EOF

echo "  Created: test-engine.ts"
echo "  Run: npx ts-node test-engine.ts"
echo ""

# ─── Features ────────────────────────────────────────────────────────────────

echo "Available Skills:"
echo "  • /debug  - Diagnose and fix bugs"
echo "  • /build  - Implement new features"
echo "  • /review - Analyze code quality"
echo ""

echo "Cost Control:"
echo "  • Auto-compression at 5+ messages"
echo "  • Sliding window (last 4 messages + summary)"
echo "  • 12% cheaper via cache optimization"
echo "  • Unlimited conversation length"
echo ""

echo "Monitoring:"
echo "  • engine.getCostSummary() - Session costs"
echo "  • engine.getContextWindow() - Context usage %"
echo "  • engine.getHistory() - Message history"
echo ""

# ─── Documentation ────────────────────────────────────────────────────────────

echo "Documentation:"
echo "  • INTEGRATION.md - Full integration guide"
echo "  • PRODUCTION_LESSONS.md - Best practices + pitfalls"
echo "  • engine/README.md - API reference"
echo ""

echo "✅ Ready to go!"
