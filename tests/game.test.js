import assert from "node:assert/strict";
import {
  canAttackWith,
  canBeat,
  canPassAttack,
  canPlayerAttack,
  canTakeCards,
  completeDefense,
  createDeck,
  createGame,
  passAttack,
  playAttack,
  playDefense,
  takeCards
} from "../src/game.js";

function card(rank, suit, value) {
  return { id: `${rank}-${suit}`, rank, rankValue: value, suit, suitSymbol: "?", color: "black" };
}

function joker(rank = "小王", value = 15) {
  return { id: `${rank}-joker`, rank, rankValue: value, suit: "joker", suitSymbol: "王", color: "black", isJoker: true };
}

assert.equal(createDeck().length, 54, "deck contains 54 cards including jokers");
assert.equal(new Set(createDeck().map((c) => c.id)).size, 54, "deck cards are unique");
assert.equal(createDeck().filter((c) => c.isJoker).length, 2, "deck contains big joker and small joker");

assert.equal(canBeat(card("8", "hearts", 8), card("9", "hearts", 9), "spades"), true);
assert.equal(canBeat(card("8", "hearts", 8), card("7", "hearts", 7), "spades"), false);
assert.equal(canBeat(card("A", "hearts", 14), card("2", "spades", 2), "spades"), true);
assert.equal(canBeat(card("A", "spades", 14), card("2", "hearts", 2), "spades"), false);
assert.equal(canBeat(card("A", "spades", 14), joker("小王", 15), "spades"), true, "joker can defend against any normal attack");
assert.equal(canBeat(joker("小王", 15), joker("大王", 16), "spades"), false, "joker cannot be an attack card");

const state = createGame(() => 0.42);
assert.equal(state.players.length, 4, "default game has four players");
assert.equal(state.difficulty, "normal", "default difficulty is normal");
assert.equal(state.winnerId, null, "winner player is empty before the game finishes");
assert.equal(state.players.every((p) => p.hand.length === 8), true, "each player starts with 8 cards");
assert.equal(state.players[0].team, state.players[2].team, "A and C share a team");
assert.equal(state.players[1].team, state.players[3].team, "B and D share a team");
assert.equal(state.players[state.defenderId].hand.some((c) => c.id === state.trumpCard.id), true, "player holding trump card defends first");
assert.equal(state.players.flatMap((p) => p.hand).some((c) => c.id === state.trumpCard.id), true, "trump card is dealt in the first 32 cards");
assert.equal(state.trumpCard.isJoker, undefined, "trump card is always a normal suited card");
state.attackerId = 0;
state.defenderId = 1;
state.attackTurnId = 0;
assert.equal(canPassAttack(state, 0), false, "main attacker cannot pass before opening the round");
assert.equal(passAttack(state, 0), false, "empty opening attack cannot be passed");

state.players[0].hand = [card("5", "clubs", 5), card("8", "diamonds", 8)];
state.stock = Array.from({ length: 20 }, (_, index) => card(String((index % 9) + 2), "hearts", (index % 9) + 2));
assert.equal(playAttack(state, 0, "5-clubs"), true, "A can open with any card");
assert.equal(state.players[0].hand.length, 1, "attacker does not refill until the round ends");
assert.equal(canAttackWith(state, 0, card("8", "diamonds", 8)), false, "A cannot add an unrelated rank");
assert.equal(canAttackWith(state, 0, joker("小王", 15)), false, "joker cannot be used to attack");

state.players[1].hand = [card("8", "clubs", 8), card("9", "spades", 9), joker("小王", 15)];
state.players[2].hand = [card("8", "diamonds", 8)];
assert.equal(playDefense(state, 1, "8-clubs", 0), true, "B can defend with higher same suit");
assert.equal(state.players[1].hand.length, 2, "defender does not refill until the round ends");
assert.equal(canAttackWith(state, 0, card("8", "diamonds", 8)), true, "defense rank becomes legal for follow-up attack");
assert.equal(canAttackWith(state, 2, card("8", "diamonds", 8)), false, "C cannot attack B before A decides");

passAttack(state, 0);
assert.equal(canAttackWith(state, 2, card("8", "diamonds", 8)), true, "C can attack B after A passes");
passAttack(state, 2);
assert.equal(state.attackerId, 1, "successful defense makes defender the next attacker");
assert.equal(state.defenderId, 2, "next opponent defends");
assert.equal(state.log.some((entry) => entry.type === "分隔" && entry.main === "防守方切换"), true, "successful defense logs a clear defender switch divider");
assert.equal(state.players[0].hand.length, 8, "attacker refills after successful defense resolves the round");
assert.equal(state.players[1].hand.length, 8, "defender refills after successful defense resolves the round");

const jokerDefenseState = createGame(() => 0.42);
jokerDefenseState.attackerId = 0;
jokerDefenseState.defenderId = 1;
jokerDefenseState.attackTurnId = 0;
jokerDefenseState.players[0].hand = [card("A", "spades", 14)];
jokerDefenseState.players[1].hand = [joker("大王", 16)];
assert.equal(playAttack(jokerDefenseState, 0, "A-spades"), true, "A can attack with a normal card before joker defense");
assert.equal(playDefense(jokerDefenseState, 1, "大王-joker", 0), true, "B can defend with a joker");

const autoSkipState = createGame(() => 0.42);
autoSkipState.players[0].hand = [card("5", "clubs", 5)];
autoSkipState.players[1].hand = [card("8", "clubs", 8), card("9", "spades", 9)];
autoSkipState.players[2].hand = [card("8", "diamonds", 8)];
autoSkipState.stock = Array.from({ length: 20 }, (_, index) => card(String((index % 9) + 2), "clubs", (index % 9) + 2));
assert.equal(playAttack(autoSkipState, 0, "5-clubs"), true, "A opens the attack");
assert.equal(playDefense(autoSkipState, 1, "8-clubs", 0), true, "B defends");
assert.equal(autoSkipState.attackTurnId, 2, "A has no legal follow-up, so C gets the turn automatically");
assert.equal(canPlayerAttack(autoSkipState, 0), false, "A does not need to pass when A has no legal card");
assert.equal(canPlayerAttack(autoSkipState, 2), true, "C can attack immediately");

const refillOrderState = createGame(() => 0.42);
refillOrderState.attackerId = 0;
refillOrderState.defenderId = 1;
refillOrderState.attackTurnId = 0;
refillOrderState.players[0].hand = [
  card("5", "clubs", 5),
  ...Array.from({ length: 7 }, (_, index) => card(`A${index}`, "diamonds", index + 2))
];
refillOrderState.players[1].hand = [
  card("8", "clubs", 8),
  ...Array.from({ length: 7 }, (_, index) => card(`B${index}`, "diamonds", index + 2))
];
refillOrderState.players[2].hand = Array.from({ length: 7 }, (_, index) => card(`C${index}`, "hearts", index + 2));
refillOrderState.players[3].hand = Array.from({ length: 7 }, (_, index) => card(`D${index}`, "spades", index + 2));
refillOrderState.stock = [
  card("A补", "clubs", 2),
  card("B补", "clubs", 3),
  card("C补", "clubs", 4),
  card("D补", "clubs", 5)
];
assert.equal(playAttack(refillOrderState, 0, "5-clubs"), true, "A attacks B before refill-order check");
assert.equal(playDefense(refillOrderState, 1, "8-clubs", 0), true, "B defends and ends the round");
assert.equal(refillOrderState.players[0].hand.at(-1).rank, "A补", "A refills first when A attacks B");
assert.equal(refillOrderState.players[1].hand.at(-1).rank, "B补", "B refills second when A attacks B");
assert.equal(refillOrderState.players[2].hand.at(-1).rank, "C补", "C refills third when A attacks B");
assert.equal(refillOrderState.players[3].hand.at(-1).rank, "D补", "D refills fourth when A attacks B");

const aiDefenseState = createGame(() => 0.42);
aiDefenseState.attackerId = 0;
aiDefenseState.defenderId = 1;
aiDefenseState.attackTurnId = 0;
aiDefenseState.players[0].hand = [];
aiDefenseState.players[1].hand = [card("8", "clubs", 8)];
aiDefenseState.players[2].hand = [];
aiDefenseState.stock = Array.from({ length: 20 }, (_, index) => card(String((index % 9) + 2), "hearts", (index % 9) + 2));
assert.equal(playAttack(aiDefenseState, 0, "5-clubs"), false, "missing card cannot be played");
aiDefenseState.players[0].hand = [card("5", "clubs", 5)];
assert.equal(playAttack(aiDefenseState, 0, "5-clubs"), true, "A attacks B before B defends");
assert.doesNotThrow(() => playDefense(aiDefenseState, 1, "8-clubs", 0), "AI defender can resolve the round without freezing");
assert.equal(aiDefenseState.status, "attacking", "AI successful defense resolves to the next attack round");
assert.equal(aiDefenseState.attackerId, 1, "B becomes attacker after successful defense");

const partnerPriorityState = createGame(() => 0.42);
partnerPriorityState.attackerId = 2;
partnerPriorityState.defenderId = 3;
partnerPriorityState.attackTurnId = 2;
partnerPriorityState.status = "attacking";
partnerPriorityState.battle = [{ attack: card("9", "clubs", 9), defense: card("10", "clubs", 10), attackerId: 2 }];
partnerPriorityState.players[2].hand = [card("9", "diamonds", 9)];
partnerPriorityState.players[0].hand = [card("9", "hearts", 9)];
assert.equal(canPlayerAttack(partnerPriorityState, 2), true, "C has priority when C is main attacker");
assert.equal(canPlayerAttack(partnerPriorityState, 0), false, "A waits while C can decide");
assert.equal(passAttack(partnerPriorityState, 2), true, "C can pass priority");
assert.equal(canPlayerAttack(partnerPriorityState, 0), true, "A can attack D after C passes");

const choiceState = createGame(() => 0.42);
choiceState.attackerId = 1;
choiceState.defenderId = 0;
choiceState.attackTurnId = 1;
choiceState.players[1].hand = [card("5", "clubs", 5)];
choiceState.players[0].hand = [card("8", "clubs", 8)];
choiceState.stock = Array.from({ length: 20 }, (_, index) => card(String((index % 9) + 2), "hearts", (index % 9) + 2));
assert.equal(playAttack(choiceState, 1, "5-clubs"), true, "B can attack A");
assert.equal(playDefense(choiceState, 0, "8-clubs", 0), true, "A can defend");
passAttack(choiceState, 1);
passAttack(choiceState, 3);
assert.equal(choiceState.status, "defense-choice", "human defender can choose after successful defense");
assert.equal(canTakeCards(choiceState, 0), true, "human defender can collect after successful defense");
assert.equal(completeDefense(choiceState), undefined, "human can confirm successful defense");
assert.equal(choiceState.attackerId, 0, "after confirming, A attacks");
assert.equal(choiceState.defenderId, 1, "after confirming, A attacks B");

const failState = createGame(() => 0.42);
failState.players[0].hand = [card("A", "clubs", 14)];
failState.players[1].hand = [card("2", "diamonds", 2), card("3", "diamonds", 3)];
failState.players[2].hand = [card("A", "spades", 14)];
failState.stock = Array.from({ length: 20 }, (_, index) => card(String((index % 9) + 2), "spades", (index % 9) + 2));
assert.equal(playAttack(failState, 0, "A-clubs"), true, "A can attack B");
assert.equal(takeCards(failState, 1), true, "B can start taking after failed defense");
assert.equal(failState.status, "collecting", "attackers can decide whether to give extra cards before collection resolves");
assert.equal(failState.attackTurnId, 2, "C can give B a matching card when A has none");
assert.equal(playAttack(failState, 2, "A-spades"), true, "C can give a legal matching card to be collected");
assert.equal(failState.status, "attacking", "collection resolves automatically when no attacker can give more cards");
assert.equal(failState.attackerId, 2, "after B fails, C continues attacking for A/C");
assert.equal(failState.defenderId, 3, "after B fails, C attacks D");
assert.equal(failState.log.some((entry) => entry.type === "分隔" && entry.main === "防守方切换"), true, "failed defense logs a clear defender switch divider");
assert.equal(failState.players[0].hand.length, 8, "failed-defense round refills the attacker after collection");
assert.equal(failState.players[1].hand.length, 8, "failed defender refills after collecting the table");

const giveUpState = createGame(() => 0.42);
giveUpState.attackerId = 1;
giveUpState.defenderId = 0;
giveUpState.attackTurnId = 1;
giveUpState.players[1].hand = [card("5", "clubs", 5)];
giveUpState.players[0].hand = [card("8", "clubs", 8)];
giveUpState.stock = Array.from({ length: 20 }, (_, index) => card(String((index % 9) + 2), "diamonds", (index % 9) + 2));
playAttack(giveUpState, 1, "5-clubs");
playDefense(giveUpState, 0, "8-clubs", 0);
assert.equal(canTakeCards(giveUpState, 0), true, "defender can give up after defending the table");
takeCards(giveUpState, 0);
while (giveUpState.status === "collecting") {
  passAttack(giveUpState, giveUpState.attackTurnId);
}
assert.equal(giveUpState.attackerId, 1, "if A gives up after defending, B continues for B/D");
assert.equal(giveUpState.defenderId, 2, "B attacks C after A gives up");

const noGiveState = createGame(() => 0.42);
noGiveState.players[0].hand = [card("K", "clubs", 13)];
noGiveState.players[1].hand = [card("2", "diamonds", 2), card("3", "diamonds", 3)];
noGiveState.players[2].hand = [card("4", "spades", 4)];
noGiveState.stock = Array.from({ length: 20 }, (_, index) => card(String((index % 9) + 2), "clubs", (index % 9) + 2));
playAttack(noGiveState, 0, "K-clubs");
takeCards(noGiveState, 1);
assert.equal(noGiveState.status, "attacking", "collection resolves immediately when no attacker has a legal card to give");
assert.equal(noGiveState.attackerId, 2, "C attacks D after B collects and nobody can give cards");

const hardState = createGame(() => 0.42, "hard");
assert.equal(hardState.difficulty, "hard", "selected difficulty is stored in game state");
const expertState = createGame(() => 0.42, "expert");
assert.equal(expertState.difficulty, "expert", "expert difficulty is stored in game state");

const dWinState = createGame(() => 0.42);
dWinState.stock = [];
dWinState.attackerId = 3;
dWinState.defenderId = 0;
dWinState.attackTurnId = 3;
dWinState.status = "attacking";
dWinState.players[3].hand = [card("7", "clubs", 7)];
assert.equal(playAttack(dWinState, 3, "7-clubs"), true, "D can play the last card");
assert.equal(dWinState.status, "finished", "game finishes when a player runs out of cards after the stock is empty");
assert.equal(dWinState.winnerId, 3, "D is recorded as the winning player");
assert.equal(dWinState.winnerTeam, 1, "D's team is recorded as the winning team");

console.log("All game tests passed.");
