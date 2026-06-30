# Specification

## Game Rules

- The default game has four players: 东, 南, 西, and 北.
- 东/西 are one team. 南/北 are the other team.
- The game uses a standard 52-card deck without jokers.
- Each player starts with 8 cards.
- Before the 32 opening cards are dealt, one random card is drawn as the trump marker and inserted randomly into those 32 cards. Its suit is trump.
- The player who receives the trump marker is the first defender.
- Card rank from high to low is A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2.
- The attacker plays first. The next player from the opposing team is the defender.
- At the beginning of a new attack round, the main attacker must play at least one card before passing is allowed.
- The defender beats an attack with a higher card of the same suit, or with trump if the attack card is not trump.
- Once a rank appears on the table, attackers may add cards of that same rank. Example: if the defender uses an 8, attackers may add other 8s.
- Partners may help attack the same defender.
- Partners cannot attack each other.
- When both partners can attack the same defender, the main attacker decides first. The partner may attack only after the main attacker passes. Example: 东/西 attack 南, so 东 has priority and 西 acts only after 东 passes. 西/东 attack 北, so 西 has priority and 东 acts only after 西 passes.
- If the priority attacker has no legal follow-up card, they are skipped automatically and the partner may act without waiting for a manual pass.
- Cards are not refilled immediately after each play. Only after the current attack round ends do players draw back up to 8 cards while the stock still has cards, starting from the round's main attacker and continuing in seat order. For example, 东 attacking 南 refills 东, 南, 西, 北.
- Follow-up attacks are optional. Legal follow-up ranks come from cards already on the table, but attackers may pass when continuing would hurt their chance to win.
- If all active attackers pass after every attack card is defended, the defense succeeds. The defender's team becomes the attacking team.
- If the defender has already beaten all attack cards, they may still choose to collect every table card instead of taking the next attack turn. This is treated as failed defense.
- If the defender cannot or does not want to defend, the defender prepares to take the table cards. Before collection is finalized, the attacking side may choose to add any currently legal matching-rank cards for the defender to collect as well.
- If the priority attacker has no legal card to add during collection, they are skipped automatically; if no attacker can add, collection resolves immediately.
- After the collection decision is complete, the attacking team keeps initiative and the partner continues against the next opponent. Example: 东 attacks 南; if 南 fails, 西 attacks 北. Only a successful defense switches initiative to the other team.
- After the stock is empty, the first player to empty their hand wins for their team.

## Scope

Included:

- Single-browser playable game.
- Human player as 东.
- AI players for 南, 西, and 北.
- Four-player team mode.
- Trump suit, attack, defense, passing, taking cards, refill, and win detection.
- Lightweight automated tests for core rules.

Excluded:

- Online multiplayer.
- User accounts.
- Persistent match history.
- Optional local gambling/scoring variants.

## Functional Requirements

- Start a new shuffled game.
- Require the player to select 简单, 较难, 困难, or 超难 before play starts.
- Allow restarting the game and returning to the difficulty selector.
- Display player teams, hand counts, trump suit, stock count, and current role.
- Allow the human player to attack only with legal cards.
- Allow the human player to defend only with legal cards.
- Allow passing during attack and taking cards during defense.
- Resolve AI turns automatically, one visible action at a time.
- End the game when a player goes out after the stock is exhausted.

## Acceptance Criteria

- `npm test` passes.
- A player can complete a playable match from `index.html`.
- The first interaction is a difficulty choice with 简单, 较难, 困难, and 超难.
- Restart returns the player to the difficulty selector.
- All visible game UI is Chinese.
- Illegal cards are disabled in the UI.
- 东/西 and 南/北 are enforced as teams.
- Partner attacks follow the main-attacker priority rule.
- A partner may act immediately when the priority attacker has no legal follow-up card.
- The main attacker cannot pass before playing the first attack card of a new round.
- AI attacks, defenses, passes, and takes appear one step at a time with a readable pause between steps.
- Round history is displayed as tagged events rather than plain text.
- Follow-up attacks are limited to ranks already present on the table.
- Defense success switches initiative to the defender's team.
- Defense failure makes the defender take the table and the attacking side continue with the partner attacking the next opponent.
- Before failed-defense collection resolves, attackers may optionally add legal matching-rank cards for the defender to collect.
