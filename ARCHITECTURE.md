# Architecture

## Technology Stack

- HTML, CSS, and vanilla JavaScript.
- ES modules for browser and test reuse.
- Node.js built-in `assert` for tests.
- No runtime dependencies.

## Architecture Overview

The project is split into a small rules engine and a DOM adapter.

- `src/game.js` contains the game model, card comparisons, legal move checks, attack/defense transitions, AI move selection, refill logic, and win detection.
- `src/app.js` renders the current state, wires difficulty selection, restart, buttons and card clicks, schedules AI turns one visible action at a time, and formats the round log as tagged events.
- `src/styles.css` defines the responsive tabletop layout.
- `tests/game.test.js` imports the same rules module used by the browser and verifies core behavior.

## Major Design Decisions

- Use a static browser app so reviewers can play without installing a framework.
- Keep game state in a plain JavaScript object to make AI-generated changes easy to inspect.
- Reuse `src/game.js` in tests so the tested rules match the playable rules.
- Implement one explicit local rotation rule: when defense fails, the defender takes the table and the attacker's partner continues against the next opponent. A team keeps initiative until the other team successfully defends.
- Use four AI difficulty profiles: 简单 is conservative, 较难 is balanced, 困难 is aggressive, and 超难 adds the most pressure during follow-up attacks and collection.

## AI Tooling Used

- Codex was used to clarify the local rules, design the project structure, implement the first working version, add tests, and draft documentation.
- The workflow intentionally kept AI output reviewable by using small modules and direct tests.

## Agent Workflow

1. Gathered requirements from the challenge brief and user-provided 永城扑克 / 永城八张 rules.
2. Converted rules into a minimal playable specification.
3. Designed a static browser architecture with a reusable rules engine.
4. Implemented game logic first, then UI rendering.
5. Added automated rule tests.
6. Wrote challenge deliverables: README, SPEC, ARCHITECTURE, and RETROSPECTIVE.
