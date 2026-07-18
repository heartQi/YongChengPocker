import assert from "node:assert/strict";
import {
  ANTE,
  MIN_BET,
  START_CHIPS,
  bestThreeIds,
  betChoices,
  callBet,
  callCost,
  canCompare,
  compareHands,
  compareTargets,
  createGame,
  describeHand,
  evaluateHand,
  fold,
  isSpecial235,
  lookCards,
  normalizePayAmount,
  placeBet,
  requestCompare,
  raiseBet,
  selectCardsForCompare
} from "../src/zhajinhua/game.js";

function card(rank, suit, rankValue) {
  const symbols = { spades: "♠", hearts: "♥", clubs: "♣", diamonds: "♦" };
  const colors = { spades: "black", hearts: "red", clubs: "black", diamonds: "red" };
  return {
    id: `${rank}-${suit}`,
    rank,
    rankValue,
    suit,
    suitSymbol: symbols[suit],
    color: colors[suit]
  };
}

// —— 牌型 ——
{
  const triple = evaluateHand([card("A", "spades", 14), card("A", "hearts", 14), card("A", "clubs", 14)]);
  assert.equal(triple.type, "triple");

  const sf = evaluateHand([card("9", "hearts", 9), card("8", "hearts", 8), card("7", "hearts", 7)]);
  assert.equal(sf.type, "straightFlush");

  const flush = evaluateHand([card("A", "clubs", 14), card("9", "clubs", 9), card("2", "clubs", 2)]);
  assert.equal(flush.type, "flush");

  const straight = evaluateHand([card("A", "spades", 14), card("2", "hearts", 2), card("3", "clubs", 3)]);
  assert.equal(straight.type, "straight");

  const pair = evaluateHand([card("K", "spades", 13), card("K", "hearts", 13), card("5", "clubs", 5)]);
  assert.equal(pair.type, "pair");

  assert.ok(
    compareHands(
      [card("A", "spades", 14), card("A", "hearts", 14), card("A", "clubs", 14)],
      [card("K", "spades", 13), card("Q", "spades", 12), card("J", "spades", 11)]
    ) > 0
  );
}

// —— 杂色 235 专杀豹子 ——
{
  const killer = [card("2", "spades", 2), card("3", "hearts", 3), card("5", "clubs", 5)];
  const tripleA = [card("A", "spades", 14), card("A", "hearts", 14), card("A", "clubs", 14)];
  const flush235 = [card("2", "hearts", 2), card("3", "hearts", 3), card("5", "hearts", 5)];
  assert.equal(isSpecial235(killer), true);
  assert.equal(isSpecial235(flush235), false);
  assert.ok(compareHands(killer, tripleA) > 0);
  assert.ok(compareHands(tripleA, killer) < 0);
  assert.equal(describeHand(killer), "235杀");
  // 同花 235 是金花，打不过豹子
  assert.ok(compareHands(flush235, tripleA) < 0);
  // 235 打不过同花顺
  const sf = [card("9", "spades", 9), card("8", "spades", 8), card("7", "spades", 7)];
  assert.ok(compareHands(killer, sf) < 0);
}

// —— 癞子大小王 ——
{
  const joker = { id: "big-joker", rank: "大王", rankValue: 16, suit: "joker", suitSymbol: "🃏", color: "red", isJoker: true };
  const withPair = evaluateHand([card("K", "spades", 13), card("K", "hearts", 13), joker]);
  assert.equal(withPair.type, "triple");

  const withStraight = evaluateHand([card("5", "clubs", 5), card("6", "diamonds", 6), joker]);
  assert.ok(["straight", "straightFlush", "flush", "pair"].includes(withStraight.type));
  assert.ok(withStraight.rank >= 2);

  const twoJokers = evaluateHand([
    card("9", "spades", 9),
    { id: "small-joker", rank: "小王", rankValue: 15, suit: "joker", suitSymbol: "🃏", color: "black", isJoker: true },
    joker
  ]);
  assert.equal(twoJokers.type, "triple");
  assert.deepEqual(twoJokers.values, [9, 9, 9]);

  const state = createGame({ playerCount: 2, cardsPerPlayer: 3, useJokers: true, random: () => 0.11 });
  assert.equal(state.useJokers, true);
  const totalCards = state.players.reduce((n, p) => n + p.hand.length, 0) + state.stock.length;
  assert.equal(totalCards, 54);
}

// —— 开局底注与闷跟 ——
{
  const state = createGame({ playerCount: 3, cardsPerPlayer: 3, random: () => 0.1 });
  assert.equal(state.players.length, 3);
  assert.equal(state.players[0].chips, START_CHIPS - ANTE);
  assert.equal(state.pot, ANTE * 3);
  assert.equal(state.roundCount, 1);
  assert.ok(state.players.every((p) => p.isBlind));
  assert.equal(state.players[0].hand.length, 3);

  const actor = state.currentPlayerId;
  const cost = callCost(state, actor);
  assert.equal(cost, MIN_BET);
  assert.equal(canCompare(state, actor, (actor + 1) % 3), false);

  assert.ok(callBet(state, actor));
  assert.equal(state.players[actor].chips, START_CHIPS - ANTE - MIN_BET);
}

// —— 看牌后跟注翻倍；第一轮不可比牌 ——
{
  const state = createGame({ playerCount: 2, cardsPerPlayer: 3, random: () => 0.2, dealerId: 1 });
  // dealer 1 → current starts at 0
  assert.equal(state.currentPlayerId, 0);
  assert.ok(lookCards(state, 0));
  assert.equal(state.players[0].isBlind, false);
  assert.equal(callCost(state, 0), MIN_BET * 2);
  assert.equal(canCompare(state, 0, 1), false);
  assert.ok(callBet(state, 0));
}

// —— 第二轮：看牌不能主动比闷牌；闷牌可以比看牌 ——
{
  const state = createGame({ playerCount: 2, cardsPerPlayer: 3, random: () => 0.3, dealerId: 1 });
  assert.equal(state.currentPlayerId, 0);
  // 走完第一轮
  assert.ok(callBet(state, 0));
  assert.ok(callBet(state, 1));
  assert.equal(state.roundCount, 2);

  assert.ok(lookCards(state, 0));
  assert.equal(state.players[1].isBlind, true);
  assert.equal(canCompare(state, 0, 1), false);
  assert.deepEqual(compareTargets(state, 0), []);

  // 让位到闷牌玩家
  assert.ok(callBet(state, 0));
  assert.equal(state.currentPlayerId, 1);
  assert.equal(canCompare(state, 1, 0), true);
}

// —— 看牌可以和看牌比牌 ——
{
  const state = createGame({ playerCount: 3, cardsPerPlayer: 3, random: () => 0.33, dealerId: 2 });
  while (state.roundCount < 2 && state.status === "betting") {
    assert.ok(callBet(state, state.currentPlayerId));
  }
  state.currentPlayerId = 0;
  state.players[0].isBlind = false;
  state.players[1].isBlind = false;
  state.players[2].isBlind = true;
  state.players.forEach((p) => {
    p.folded = false;
    p.betThisRound = 0;
  });
  assert.equal(canCompare(state, 0, 1), true);
  assert.equal(canCompare(state, 0, 2), false);
  assert.deepEqual(compareTargets(state, 0), [1]);
}

// —— 弃牌只剩一人结算 ——
{
  const state = createGame({ playerCount: 2, cardsPerPlayer: 3, random: () => 0.4, dealerId: 1 });
  const potBefore = state.pot;
  assert.ok(fold(state, 0));
  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, 1);
  assert.equal(state.players[1].chips, START_CHIPS - ANTE + potBefore);
}

// —— 比牌分出胜负 ——
{
  const state = createGame({ playerCount: 2, cardsPerPlayer: 3, random: () => 0.5, dealerId: 1 });
  assert.ok(callBet(state, 0));
  assert.ok(callBet(state, 1));
  assert.equal(state.roundCount, 2);

  // 强制牌型：玩家0豹子，玩家1散牌
  state.players[0].hand = [card("A", "spades", 14), card("A", "hearts", 14), card("A", "clubs", 14)];
  state.players[1].hand = [card("2", "spades", 2), card("5", "hearts", 5), card("9", "clubs", 9)];
  state.currentPlayerId = 0;
  state.players[0].isBlind = true;
  state.players[1].isBlind = true;

  assert.ok(requestCompare(state, 0, 1));
  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, 0);
  assert.equal(state.players[1].folded, true);
  assert.equal(state.players[1].eliminated, true);
}

// —— 三人局比牌后赢家继续与第三人玩 ——
{
  const state = createGame({ playerCount: 3, cardsPerPlayer: 3, random: () => 0.55, dealerId: 2 });
  // dealer 2 → 当前从 0 开始；走完第一轮
  while (state.roundCount < 2 && state.status === "betting") {
    assert.ok(callBet(state, state.currentPlayerId));
  }
  assert.equal(state.roundCount, 2);
  state.currentPlayerId = 0;
  state.players[0].hand = [card("A", "spades", 14), card("A", "hearts", 14), card("A", "clubs", 14)];
  state.players[1].hand = [card("2", "spades", 2), card("5", "hearts", 5), card("9", "clubs", 9)];
  state.players[0].isBlind = true;
  state.players[1].isBlind = true;
  state.players[2].isBlind = true;
  state.players[0].folded = false;
  state.players[1].folded = false;
  state.players[2].folded = false;

  assert.ok(requestCompare(state, 0, 1));
  assert.equal(state.status, "betting");
  assert.equal(state.players[1].folded, true);
  assert.equal(state.players[1].eliminated, true);
  assert.equal(state.players[0].folded, false);
  assert.equal(state.players[2].folded, false);
  assert.equal(state.lastAction.continues, true);
  assert.equal(state.pot > 0, true);
}

// —— 五张牌比牌需 5 选 3 ——
{
  const state = createGame({ playerCount: 2, cardsPerPlayer: 5, random: () => 0.6, dealerId: 1 });
  assert.equal(state.players[0].hand.length, 5);
  assert.ok(callBet(state, 0));
  assert.ok(callBet(state, 1));
  state.currentPlayerId = 0;
  state.players[0].isBlind = true;
  state.players[1].isBlind = true;

  state.players[0].hand = [
    card("A", "spades", 14),
    card("A", "hearts", 14),
    card("A", "clubs", 14),
    card("2", "diamonds", 2),
    card("3", "diamonds", 3)
  ];
  state.players[1].hand = [
    card("K", "spades", 13),
    card("K", "hearts", 13),
    card("K", "clubs", 13),
    card("4", "diamonds", 4),
    card("5", "diamonds", 5)
  ];

  assert.ok(requestCompare(state, 0, 1));
  assert.equal(state.status, "selecting");
  const ids0 = bestThreeIds(state.players[0].hand);
  assert.ok(selectCardsForCompare(state, 0, ids0));
  // AI 目标自动选牌并结算；AAA > KKK
  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, 0);
}

// —— 加注抬升水位 ——
{
  const state = createGame({ playerCount: 2, cardsPerPlayer: 3, random: () => 0.7, dealerId: 1 });
  assert.ok(raiseBet(state, 0, MIN_BET * 2));
  assert.equal(state.blindCallLevel, MIN_BET * 2);
  assert.equal(state.seenCallLevel, MIN_BET * 4);
  assert.equal(callCost(state, 1), MIN_BET * 2);
}

// —— 可设置出筹大小（闷牌 / 看牌）——
{
  const state = createGame({ playerCount: 2, cardsPerPlayer: 3, random: () => 0.72, dealerId: 1 });
  assert.equal(state.currentPlayerId, 0);
  const blindChoices = betChoices(state, 0);
  assert.ok(blindChoices.includes(MIN_BET));
  assert.ok(blindChoices.some((n) => n > MIN_BET));
  assert.equal(normalizePayAmount(state, 0, MIN_BET * 5), MIN_BET * 5);
  assert.ok(placeBet(state, 0, MIN_BET * 5));
  assert.equal(state.blindCallLevel, MIN_BET * 5);
  assert.equal(state.seenCallLevel, MIN_BET * 10);

  // 看牌后出筹不得低于看注水位
  assert.equal(state.currentPlayerId, 1);
  assert.ok(lookCards(state, 1));
  const seenMin = callCost(state, 1);
  assert.equal(seenMin, MIN_BET * 10);
  const seenPay = normalizePayAmount(state, 1, seenMin + MIN_BET * 2);
  assert.ok(seenPay >= seenMin + MIN_BET * 2);
  assert.ok(placeBet(state, 1, seenPay));
  assert.ok(state.seenCallLevel >= seenPay);
  assert.ok(state.blindCallLevel >= Math.ceil(state.seenCallLevel / 2 / MIN_BET) * MIN_BET - MIN_BET);
}

// —— 闷注/看注分别不能比前一次更低 ——
{
  const state = createGame({ playerCount: 3, cardsPerPlayer: 3, random: () => 0.74, dealerId: 2 });
  assert.equal(state.blindCallLevel, MIN_BET);
  assert.equal(state.seenCallLevel, MIN_BET * 2);

  assert.equal(state.currentPlayerId, 0);
  assert.ok(placeBet(state, 0, MIN_BET * 3)); // 闷加 3000
  assert.equal(state.blindCallLevel, MIN_BET * 3);
  assert.equal(state.seenCallLevel, MIN_BET * 6);

  // 下一闷牌玩家跟注不得低于 3000
  assert.equal(state.currentPlayerId, 1);
  assert.equal(callCost(state, 1), MIN_BET * 3);
  assert.ok(callBet(state, 1));
  assert.equal(state.blindCallLevel, MIN_BET * 3);

  // 看牌玩家至少 6000
  assert.equal(state.currentPlayerId, 2);
  assert.ok(lookCards(state, 2));
  assert.equal(callCost(state, 2), MIN_BET * 6);
  assert.ok(placeBet(state, 2, MIN_BET * 8)); // 看加 8000
  assert.equal(state.seenCallLevel, MIN_BET * 8);
  assert.ok(state.blindCallLevel >= MIN_BET * 4);
}

console.log("zhajinhua tests passed");
