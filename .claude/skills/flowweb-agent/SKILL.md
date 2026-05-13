---
name: flowweb-agent
description: Flowweb built-in agent capabilities. Handles both dialogue mode (user-agent conversation) and observation mode (user operates, agent observes and guides). Triggers on: agent setup, mode switching, TUI agent integration.
---

# Flowweb Built-in Agent

## Architecture

The agent runs in the TUI process using LangGraph. It communicates with the flowweb daemon via IPC for browser operations, and with the filesystem for spec/skill management.

## Interaction Modes

### Dialogue Mode (default)
User types commands or questions in the chat panel. The agent reasons, calls tools as needed, and responds with streaming text.

- User input → Agent reasoning → Tool calls (browser, spec, skills) → Response
- Supports slash commands: `/spec`, `/implement`, `/review`, `/skills`
- Streaming token output in the chat panel

### Observation Mode
User operates the browser manually. The agent observes browser state changes and provides:
- Proactive suggestions based on current page state
- Spec-driven guidance: tracks user progress against spec phases
- Error/warning detection when browser state doesn't match expected state
- Commentary that appears in the chat panel

## Tools Available

The agent has these tool categories:
- **Browser tools**: navigate, snapshot, list pages, extract content, take screenshot
- **Spec tools**: create spec, read spec, update spec phase, list specs, validate spec
- **Skill tools**: list skills, describe skill, load skill, unload skill

## Configuration

```json
{
  "llm": {
    "model": "claude-sonnet-4-20250514",
    "skillsDir": ".claude/skills",
    "specsDir": "specs",
    "interactionMode": "dialogue"
  }
}
```

Set `ANTHROPIC_API_KEY` in the environment for the agent to use Claude.
