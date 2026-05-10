# Fauward Codex Setup

This folder is the Codex-native equivalent of the existing `.claude` setup.

## Mapping

- `AGENTS.md`: project memory and working rules Codex reads automatically.
- `.codex/agents/`: project-scoped custom subagents.
- `.codex/hooks.json`: Codex lifecycle hook configuration.
- `.codex/hooks/`: hook scripts.
- `.codex/rules/`: command approval rules.
- `.agents/skills/`: reusable project workflows, replacing Claude-style slash commands/output styles.

Codex reads root and nested `AGENTS.md` files before work starts. It discovers custom agents, hooks, and rules from this `.codex` layer when the project is trusted.

