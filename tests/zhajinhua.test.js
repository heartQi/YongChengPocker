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
  evaluateHand,
  fold,
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
  assert.equal(state.callLevel, MIN_BET * 2);
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
  assert.equal(state.callLevel, MIN_BET * 5);

  // 看牌后出筹按两倍
  assert.equal(state.currentPlayerId, 1);
  assert.ok(lookCards(state, 1));
  const seenMin = callCost(state, 1);
  assert.equal(seenMin, MIN_BET * 5 * 2);
  const seenPay = normalizePayAmount(state, 1, seenMin + MIN_BET * 2);
  assert.ok(seenPay >= seenMin + MIN_BET * 2);
  assert.ok(placeBet(state, 1, seenPay));
  assert.ok(state.callLevel >= MIN_BET * 5);
}

console.log("zhajinhua tests passed");
