# Retrospective

## AI Tools Used

- Codex for planning, implementation, testing, and documentation.
- Web search was used earlier to compare similarly named local games, but the final implementation follows the user-provided 永城扑克 / 永城八张 rules.

## Development Workflow

The workflow was AI-native and iterative:

1. Clarify the game identity and local rules.
2. Convert the rules into a compact software specification.
3. Build a rules engine before building UI.
4. Add a browser interface around the rules engine.
5. Add automated tests for core rule decisions.
6. Document the result for reproducibility and review.

## What Worked Well

- Keeping the implementation dependency-free made the project fast to create and easy to review.
- Separating `game.js` from `app.js` made it possible to test the rules directly.
- The AI was effective at turning conversational rules into a playable state machine.
- Documentation was generated alongside implementation, which reduced end-of-project cleanup.

## What Did Not Work Well

- Public documentation for 永城扑克 / 永城八张 is sparse, so several rule details depended on human clarification.
- Some local variants may differ, especially around failed defense, exact refill timing, and joker usage.
- The AI implementation uses simple greedy opponents, not strong strategic play.

## Surprises and Discoveries

- The name "打八张" can refer to very different regional games.
- The same-rank follow-up rule is similar to Durak-style attacks, but the team arrangement changes the feel of the game.
- The initiative rule matters a lot: failed defense keeps the same team attacking, while successful defense flips the initiative to the other team.
- A small rules engine plus DOM adapter was enough for a complete playable MVP.

## Estimated Percentage of AI-Generated Code

Approximately 90%. Human input supplied the game choice, challenge requirements, and key local rules.

## Time Spent

Initial implementation and documentation: approximately 1.5 to 2 hours.

## What I Would Do Differently Next Time

- Record a short rule interview before coding.
- Add a rule-variant configuration screen for jokers, failed-defense behavior, and refill timing.
- Add a GitLab Pages deployment pipeline once the repository is created.
- Add screenshot automation for README images.

## Key Lessons Learned

- AI works best when local domain experts provide concrete examples.
- A testable rules module is valuable even for small games.
- Documentation should be created during the build, not after.
- For AI-native work, ambiguity should be captured explicitly as a design decision instead of hidden inside code.
