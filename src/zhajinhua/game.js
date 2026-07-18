/** 炸金花规则引擎 */

export const SUITS = [
  { id: "spades", label: "黑桃", symbol: "♠", color: "black" },
  { id: "hearts", label: "红桃", symbol: "♥", color: "red" },
  { id: "clubs", label: "梅花", symbol: "♣", color: "black" },
  { id: "diamonds", label: "方片", symbol: "♦", color: "red" }
];

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export const JOKERS = [
  { id: "small-joker", rank: "小王", rankValue: 15, suit: "joker", suitSymbol: "🃏", color: "black", isJoker: true },
  { id: "big-joker", rank: "大王", rankValue: 16, suit: "joker", suitSymbol: "🃏", color: "red", isJoker: true }
];

export const START_CHIPS = 100_000;
export const ANTE = 1_000;
export const MIN_BET = 1_000;

const HAND_TYPES = {
  triple: { rank: 6, label: "豹子" },
  straightFlush: { rank: 5, label: "同花顺" },
  flush: { rank: 4, label: "金花" },
  straight: { rank: 3, label: "顺子" },
  pair: { rank: 2, label: "对子" },
  high: { rank: 1, label: "散牌" }
};

const PLAYER_NAME_POOL = ["你", "阿强", "小美", "老周", "阿杰", "小雨"];

export function createDeck(useJokers = false) {
  const standard = SUITS.flatMap((suit) =>
    RANKS.map((rank, index) => ({
      id: `${rank}-${suit.id}`,
      rank,
      rankValue: index + 2,
      suit: suit.id,
      suitSymbol: suit.symbol,
      color: suit.color,
      isJoker: false
    }))
  );
  if (!useJokers) return standard;
  return [...standard, ...JOKERS.map((card) => ({ ...card }))];
}

export function shuffle(deck, random = Math.random) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function cardLabel(card) {
  if (!card) return "";
  if (card.isJoker) return card.rank;
  return `${card.suitSymbol}${card.rank}`;
}

function createLogEntry(type, main, detail = "") {
  return { type, main, detail, at: Date.now() };
}

function clonePlayerChips(prevPlayers, playerCount) {
  if (!prevPlayers?.length) return null;
  return Array.from({ length: playerCount }, (_, i) => prevPlayers[i]?.chips ?? START_CHIPS);
}

/**
 * @param {{ playerCount?: number, cardsPerPlayer?: 3|5, useJokers?: boolean, random?: () => number, prevPlayers?: object[] }} options
 */
export function createGame(options = {}) {
  const playerCount = clamp(options.playerCount ?? 4, 2, 6);
  const cardsPerPlayer = options.cardsPerPlayer === 5 ? 5 : 3;
  const useJokers = Boolean(options.useJokers);
  const random = options.random ?? Math.random;
  const chipSeed = clonePlayerChips(options.prevPlayers, playerCount);

  const deck = shuffle(createDeck(useJokers), random);
  const dealerId = options.dealerId != null ? options.dealerId % playerCount : Math.floor(random() * playerCount);

  let pot = 0;
  const players = Array.from({ length: playerCount }, (_, id) => {
    const chips = chipSeed ? chipSeed[id] : START_CHIPS;
    const antePaid = Math.min(ANTE, chips);
    pot += antePaid;
    return {
      id,
      name: PLAYER_NAME_POOL[id] ?? `玩家${id + 1}`,
      chips: chips - antePaid,
      hand: [],
      isBlind: true,
      folded: false,
      /** 比牌失败淘汰（与主动弃牌区分，UI 显示「淘汰」） */
      eliminated: false,
      out: chips < ANTE,
      betThisRound: 0,
      totalBet: antePaid,
      selectedCardIds: []
    };
  });

  for (let i = 0; i < cardsPerPlayer; i += 1) {
    for (const player of players) {
      if (player.out) continue;
      player.hand.push(deck.shift());
    }
  }

  const activeIds = players.filter((p) => !p.out && !p.folded).map((p) => p.id);
  const currentPlayerId = nextActiveId(players, dealerId);

  const state = {
    players,
    stock: deck,
    pot,
    ante: ANTE,
    minBet: MIN_BET,
    /** 当前闷注水位（看牌跟注为其两倍） */
    blindStake: MIN_BET,
    /** 本轮每人已跟到的闷注口径（看牌玩家按 2 倍计入） */
    callLevel: MIN_BET,
    dealerId,
    currentPlayerId,
    roundCount: 1,
    actedThisRound: [],
    cardsPerPlayer,
    playerCount,
    useJokers,
    status: activeIds.length < 2 ? "finished" : "betting",
    winnerId: null,
    comparePending: null,
    selectPending: null,
    lastAction: null,
    log: [
      createLogEntry(
        "开局",
        `${playerCount} 人局，每人 ${cardsPerPlayer} 张牌${useJokers ? "，含大小王癞子" : ""}`,
        useJokers
          ? `底注 ${ANTE}。大小王可当任意牌组成最大牌型。`
          : `底注 ${ANTE}，起始筹码 ${START_CHIPS}。每人先下底注。`
      )
    ]
  };

  if (state.status === "finished") {
    const survivor = players.find((p) => !p.out && !p.folded);
    if (survivor) finishWithWinner(state, survivor.id, "其余玩家筹码不足，直接获胜");
  }

  return state;
}

export function activePlayers(state) {
  return state.players.filter((p) => !p.out && !p.folded);
}

export function isHuman(playerId) {
  return playerId === 0;
}

export function callCost(state, playerId) {
  const player = state.players[playerId];
  if (!player || player.folded || player.out) return 0;
  const target = player.isBlind ? state.callLevel : state.callLevel * 2;
  return Math.max(0, target - player.betThisRound);
}

/** 闷牌按底注步进，看牌按两倍步进 */
export function betUnit(state, playerId) {
  const player = state.players[playerId];
  if (!player) return state.minBet;
  return player.isBlind ? state.minBet : state.minBet * 2;
}

export function minRaiseTo(state, playerId) {
  const player = state.players[playerId];
  const unit = betUnit(state, playerId);
  const currentTarget = player.isBlind ? state.callLevel : state.callLevel * 2;
  return currentTarget + unit;
}

export function raiseCost(state, playerId, raiseTo) {
  const player = state.players[playerId];
  return Math.max(0, raiseTo - player.betThisRound);
}

/** 本次最少要出的筹码（跟注额） */
export function minPayAmount(state, playerId) {
  return callCost(state, playerId);
}

/** 加到最小加注时，本次需再出的筹码 */
export function minRaisePayAmount(state, playerId) {
  return raiseCost(state, playerId, minRaiseTo(state, playerId));
}

/**
 * 把玩家选择的出筹金额规范到合法值：
 * - 不低于跟注额
 * - 按闷/看步进对齐
 * - 若大于跟注但不足最小加注，则抬到最小加注
 */
export function normalizePayAmount(state, playerId, payAmount) {
  const player = state.players[playerId];
  if (!player) return 0;
  const unit = betUnit(state, playerId);
  const minPay = minPayAmount(state, playerId);
  let amount = Math.max(minPay, Math.round(payAmount / unit) * unit);
  if (amount > minPay) {
    const minRaisePay = minRaisePayAmount(state, playerId);
    if (amount < minRaisePay) amount = minRaisePay;
  }
  return Math.min(amount, player.chips);
}

/** 快捷筹码选项（本次出筹金额） */
export function betChoices(state, playerId) {
  const player = state.players[playerId];
  if (!player || player.folded || player.out) return [];
  const unit = betUnit(state, playerId);
  const minPay = minPayAmount(state, playerId);
  const multipliers = player.isBlind ? [1, 2, 5, 10, 20] : [1, 2, 5, 10];
  const raw = new Set([minPay, minRaisePayAmount(state, playerId)]);
  for (const m of multipliers) {
    raw.add(normalizePayAmount(state, playerId, Math.max(minPay, unit * m)));
  }
  return [...raw]
    .filter((n) => n > 0 && n <= player.chips)
    .filter((n) => n === minPay || n >= minRaisePayAmount(state, playerId))
    .sort((a, b) => a - b);
}

/**
 * 按「本次出筹金额」下注：等于跟注额则跟，大于则加注。
 */
export function placeBet(state, playerId, payAmount) {
  const amount = normalizePayAmount(state, playerId, payAmount);
  const minPay = minPayAmount(state, playerId);
  if (amount < minPay) return false;
  if (amount === minPay) return callBet(state, playerId);
  const raiseTo = state.players[playerId].betThisRound + amount;
  return raiseBet(state, playerId, raiseTo);
}

export function compareCost(state, playerId) {
  return callCost(state, playerId) || (state.players[playerId].isBlind ? state.callLevel : state.callLevel * 2);
}

export function canLook(state, playerId) {
  return (
    state.status === "betting" &&
    state.currentPlayerId === playerId &&
    state.players[playerId]?.isBlind &&
    !state.players[playerId]?.folded
  );
}

export function canFold(state, playerId) {
  return (
    ["betting", "selecting"].includes(state.status) &&
    state.currentPlayerId === playerId &&
    !state.players[playerId]?.folded &&
    !state.players[playerId]?.out
  );
}

export function canCall(state, playerId) {
  if (state.status !== "betting" || state.currentPlayerId !== playerId) return false;
  const player = state.players[playerId];
  if (!player || player.folded || player.out) return false;
  const cost = callCost(state, playerId);
  return cost > 0 ? player.chips >= cost : true;
}

export function canRaise(state, playerId, raiseTo) {
  if (state.status !== "betting" || state.currentPlayerId !== playerId) return false;
  const player = state.players[playerId];
  if (!player || player.folded || player.out) return false;
  const minTo = minRaiseTo(state, playerId);
  if (raiseTo < minTo) return false;
  const cost = raiseCost(state, playerId, raiseTo);
  return cost > 0 && player.chips >= cost;
}

export function canCompare(state, playerId, targetId) {
  if (state.status !== "betting" || state.currentPlayerId !== playerId) return false;
  if (state.roundCount <= 1) return false;
  const actor = state.players[playerId];
  const target = state.players[targetId];
  if (!actor || !target) return false;
  if (actor.folded || actor.out || target.folded || target.out) return false;
  if (playerId === targetId) return false;
  // 看牌玩家不能主动和闷牌玩家比牌
  if (!actor.isBlind && target.isBlind) return false;
  const cost = compareCost(state, playerId);
  return actor.chips >= cost;
}

export function compareTargets(state, playerId) {
  return activePlayers(state)
    .filter((p) => p.id !== playerId)
    .filter((p) => canCompare(state, playerId, p.id))
    .map((p) => p.id);
}

export function lookCards(state, playerId) {
  if (!canLook(state, playerId)) return false;
  const player = state.players[playerId];
  player.isBlind = false;
  state.lastAction = { type: "look", playerId };
  state.log.push(createLogEntry("看牌", `${player.name} 看牌`, "之后跟注按闷注两倍计算"));
  return true;
}

export function fold(state, playerId) {
  if (!canFold(state, playerId)) return false;
  const player = state.players[playerId];
  player.folded = true;
  player.eliminated = false;
  state.lastAction = { type: "fold", playerId };
  state.log.push(createLogEntry("弃牌", `${player.name} 弃牌`));
  state.comparePending = null;
  state.selectPending = null;
  if (state.status === "selecting") state.status = "betting";
  return afterAction(state, playerId, false);
}

export function callBet(state, playerId) {
  if (!canCall(state, playerId)) return false;
  const player = state.players[playerId];
  const cost = callCost(state, playerId);
  if (!pay(state, player, cost)) return false;
  const label = player.isBlind ? "闷跟" : "跟注";
  state.lastAction = { type: "call", playerId, amount: cost, label };
  state.log.push(createLogEntry(label, `${player.name} ${label} ${cost}`, `池内 ${state.pot}`));
  markActed(state, playerId);
  return afterAction(state, playerId, false);
}

/**
 * @param {number} raiseTo 目标本轮下注额（看牌口径下为看牌金额）
 */
export function raiseBet(state, playerId, raiseTo) {
  if (!canRaise(state, playerId, raiseTo)) return false;
  const player = state.players[playerId];
  const cost = raiseCost(state, playerId, raiseTo);
  if (!pay(state, player, cost)) return false;

  // 抬升闷注水位：看牌加注金额按两倍口径折算
  const newBlindLevel = player.isBlind ? raiseTo : Math.ceil(raiseTo / 2);
  state.callLevel = Math.max(state.callLevel, newBlindLevel);
  state.blindStake = state.callLevel;
  state.actedThisRound = [playerId];
  const label = player.isBlind ? "闷加" : "加注";
  state.lastAction = { type: "raise", playerId, amount: cost, raiseTo, label };
  state.log.push(
    createLogEntry(label, `${player.name} ${label} 至 ${raiseTo}`, `闷注水位 ${state.callLevel}，池内 ${state.pot}`)
  );
  return afterAction(state, playerId, true);
}

export function requestCompare(state, playerId, targetId) {
  if (!canCompare(state, playerId, targetId)) return false;
  const actor = state.players[playerId];

  if (state.cardsPerPlayer === 5) {
    state.selectPending = {
      actorId: playerId,
      targetId,
      actorPicks: [],
      targetPicks: [],
      phase: "actor"
    };
    state.status = "selecting";
    state.lastAction = { type: "select", playerId, targetId };
    state.log.push(createLogEntry("选牌", `${actor.name} 发起比牌`, "双方需从 5 张中各选 3 张"));
    if (!isHuman(playerId)) {
      autoSelectForCompare(state);
    }
    return true;
  }

  return resolveCompare(state, playerId, targetId, null, null);
}

export function selectCardsForCompare(state, playerId, cardIds) {
  if (state.status !== "selecting" || !state.selectPending) return false;
  const pending = state.selectPending;
  const unique = [...new Set(cardIds)];
  if (unique.length !== 3) return false;

  if (pending.phase === "actor" && playerId === pending.actorId) {
    if (!ownsCards(state.players[playerId], unique)) return false;
    pending.actorPicks = unique;
    pending.phase = "target";
    if (!isHuman(pending.targetId)) {
      autoSelectForCompare(state);
    }
    return true;
  }

  if (pending.phase === "target" && playerId === pending.targetId) {
    if (!ownsCards(state.players[playerId], unique)) return false;
    pending.targetPicks = unique;
    const { actorId, targetId, actorPicks, targetPicks } = pending;
    state.selectPending = null;
    state.status = "betting";
    return resolveCompare(state, actorId, targetId, actorPicks, targetPicks);
  }

  return false;
}

function autoSelectForCompare(state) {
  const pending = state.selectPending;
  if (!pending) return;
  if (pending.phase === "actor" && !isHuman(pending.actorId)) {
    const picks = bestThreeIds(state.players[pending.actorId].hand);
    selectCardsForCompare(state, pending.actorId, picks);
  }
  if (state.selectPending?.phase === "target" && !isHuman(state.selectPending.targetId)) {
    const picks = bestThreeIds(state.players[state.selectPending.targetId].hand);
    selectCardsForCompare(state, state.selectPending.targetId, picks);
  }
}

function resolveCompare(state, actorId, targetId, actorPickIds, targetPickIds) {
  const actor = state.players[actorId];
  const target = state.players[targetId];
  const cost = compareCost(state, actorId);
  if (!pay(state, actor, cost)) return false;

  const actorHand = pickHand(actor.hand, actorPickIds);
  const targetHand = pickHand(target.hand, targetPickIds);
  const cmp = compareHands(actorHand, targetHand);
  const winnerId = cmp >= 0 ? actorId : targetId;
  const loserId = cmp >= 0 ? targetId : actorId;
  const loser = state.players[loserId];
  loser.folded = true;
  loser.eliminated = true;

  // 记录比牌前是否闷牌（闷比不亮牌面给闷牌方看）
  const actorWasBlind = actor.isBlind;
  const targetWasBlind = target.isBlind;

  // 比牌后双方记为已看牌；输家淘汰，赢家留下继续与其他人玩
  actor.isBlind = false;
  target.isBlind = false;

  const remaining = activePlayers(state).length;
  state.lastAction = {
    type: "compare",
    playerId: actorId,
    targetId,
    winnerId,
    loserId,
    amount: cost,
    actorCards: actorHand.map((c) => ({ ...c })),
    targetCards: targetHand.map((c) => ({ ...c })),
    actorType: describeHand(actorHand),
    targetType: describeHand(targetHand),
    actorWasBlind,
    targetWasBlind,
    continues: remaining > 1
  };
  state.log.push(
    createLogEntry(
      "比牌",
      `${actor.name} 与 ${target.name} 比牌，${state.players[winnerId].name} 胜，${loser.name} 淘汰`,
      remaining > 1
        ? `${state.lastAction.actorType} vs ${state.lastAction.targetType}。${state.players[winnerId].name} 留下，仍有 ${remaining} 人在局`
        : `${state.lastAction.actorType} vs ${state.lastAction.targetType}，支付 ${cost}`
    )
  );

  markActed(state, actorId);
  return afterAction(state, actorId, false);
}

export function evaluateHand(cards) {
  const hand = [...cards];
  const jokers = hand.filter((c) => c.isJoker);
  const natural = hand.filter((c) => !c.isJoker);

  if (jokers.length === 0) return evaluateNatural(hand);

  // 两张癞子 + 一张牌 → 必成该点数豹子；两张癞子无自然牌不应出现在三张手牌
  if (jokers.length >= 2) {
    const rankValue = natural[0]?.rankValue ?? 14;
    const rank = natural[0]?.rank ?? "A";
    const suit = natural[0]?.suit ?? "spades";
    const suitSymbol = natural[0]?.suitSymbol ?? "♠";
    const filled = [
      natural[0] ?? { id: "wild-a", rank, rankValue, suit, suitSymbol, color: "black" },
      { id: "wild-b", rank, rankValue, suit, suitSymbol, color: "black", fromJoker: true },
      { id: "wild-c", rank, rankValue, suit, suitSymbol, color: "black", fromJoker: true }
    ];
    return {
      type: "triple",
      rank: HAND_TYPES.triple.rank,
      values: [rankValue, rankValue, rankValue],
      cards: filled,
      wildCount: jokers.length
    };
  }

  // 一张癞子：枚举成任意牌，取最大牌型
  let best = null;
  for (const suit of SUITS) {
    for (let index = 0; index < RANKS.length; index += 1) {
      const wild = {
        id: "wild-temp",
        rank: RANKS[index],
        rankValue: index + 2,
        suit: suit.id,
        suitSymbol: suit.symbol,
        color: suit.color,
        fromJoker: true
      };
      const result = evaluateNatural([...natural, wild]);
      if (!best || compareEval(result, best) > 0) best = { ...result, wildCount: 1 };
    }
  }
  return best ?? evaluateNatural(natural);
}

function evaluateNatural(cards) {
  const three = [...cards].sort((a, b) => b.rankValue - a.rankValue || a.suit.localeCompare(b.suit));
  const values = three.map((c) => c.rankValue);
  const flush = three[0].suit === three[1].suit && three[1].suit === three[2].suit;
  const straight = isStraight(values);

  if (values[0] === values[1] && values[1] === values[2]) {
    return { type: "triple", rank: HAND_TYPES.triple.rank, values, cards: three };
  }
  if (flush && straight) {
    return { type: "straightFlush", rank: HAND_TYPES.straightFlush.rank, values: straightValues(values), cards: three };
  }
  if (flush) {
    return { type: "flush", rank: HAND_TYPES.flush.rank, values, cards: three };
  }
  if (straight) {
    return { type: "straight", rank: HAND_TYPES.straight.rank, values: straightValues(values), cards: three };
  }
  if (values[0] === values[1] || values[1] === values[2] || values[0] === values[2]) {
    const pairValue = values[0] === values[1] || values[0] === values[2] ? values[0] : values[1];
    const kicker = values.find((v) => v !== pairValue);
    return { type: "pair", rank: HAND_TYPES.pair.rank, values: [pairValue, kicker], cards: three };
  }
  return { type: "high", rank: HAND_TYPES.high.rank, values, cards: three };
}

function compareEval(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i += 1) {
    const dv = (a.values[i] ?? 0) - (b.values[i] ?? 0);
    if (dv !== 0) return dv;
  }
  return 0;
}

/**
 * 杂色 2-3-5（非同花）专杀豹子。
 * 同花 235 按金花计，不触发专杀。
 */
export function isSpecial235(cards) {
  if (!cards || cards.length !== 3) return false;
  if (cards.some((c) => c.isJoker)) return false;
  const values = cards.map((c) => c.rankValue).sort((a, b) => a - b);
  if (values[0] !== 2 || values[1] !== 3 || values[2] !== 5) return false;
  const flush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
  return !flush;
}

export function compareHands(aCards, bCards) {
  const a = evaluateHand(aCards);
  const b = evaluateHand(bCards);
  const a235 = isSpecial235(aCards);
  const b235 = isSpecial235(bCards);
  // 2-3-5 专杀豹子（含癞子凑成的豹子）
  if (a235 && b.type === "triple") return 1;
  if (b235 && a.type === "triple") return -1;
  return compareEval(a, b);
}

export function handLabel(evalResult) {
  const base = HAND_TYPES[evalResult.type]?.label ?? "牌型";
  if (evalResult.wildCount) return `${base}(癞子)`;
  return base;
}

export function describeHand(cards) {
  if (isSpecial235(cards)) return "235杀";
  return handLabel(evaluateHand(cards));
}

export function bestThree(cards) {
  if (cards.length <= 3) return [...cards];
  let best = null;
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      for (let k = j + 1; k < cards.length; k += 1) {
        const combo = [cards[i], cards[j], cards[k]];
        if (!best || compareHands(combo, best) > 0) best = combo;
      }
    }
  }
  return best;
}

export function bestThreeIds(cards) {
  return bestThree(cards).map((c) => c.id);
}

/** AI 决策 */
export function chooseAiMove(state, playerId) {
  const player = state.players[playerId];
  if (!player || state.currentPlayerId !== playerId) return null;

  if (state.status === "selecting" && state.selectPending) {
    const pending = state.selectPending;
    if (pending.phase === "actor" && playerId === pending.actorId) {
      return { type: "select", cardIds: bestThreeIds(player.hand) };
    }
    if (pending.phase === "target" && playerId === pending.targetId) {
      return { type: "select", cardIds: bestThreeIds(player.hand) };
    }
  }

  if (state.status !== "betting") return null;

  const strength = handStrength(player);
  const cost = callCost(state, playerId);
  const potOdds = cost / Math.max(1, state.pot + cost);

  // 偶尔看牌
  if (player.isBlind && strength >= 0.45 && Math.random() < 0.35) {
    return { type: "look" };
  }
  if (player.isBlind && strength < 0.25 && state.roundCount >= 2 && Math.random() < 0.4) {
    return { type: "look" };
  }

  // 弱牌弃牌
  if (!player.isBlind && strength < 0.22 && cost > 0 && potOdds > 0.35) {
    return { type: "fold" };
  }
  if (strength < 0.12 && state.roundCount >= 2 && cost >= state.minBet * 2) {
    return { type: "fold" };
  }

  // 比牌
  const targets = compareTargets(state, playerId);
  if (targets.length && strength >= 0.55 && state.roundCount >= 2 && Math.random() < 0.45) {
    const targetId = targets[Math.floor(Math.random() * targets.length)];
    return { type: "compare", targetId };
  }

  // 加注：可按筹码档位加大
  if (strength >= 0.65 && Math.random() < 0.45) {
    const choices = betChoices(state, playerId).filter((n) => n > cost);
    if (choices.length) {
      const pick = strength >= 0.85 ? choices[choices.length - 1] : choices[Math.min(1, choices.length - 1)];
      return { type: "bet", payAmount: pick };
    }
  }

  if (canCall(state, playerId)) {
    if (cost === 0) return { type: "bet", payAmount: 0 };
    if (strength >= 0.3 || player.isBlind) return { type: "bet", payAmount: cost };
  }

  return { type: "fold" };
}

export function applyAiMove(state, playerId) {
  const move = chooseAiMove(state, playerId);
  if (!move) return false;
  if (move.type === "look") return lookCards(state, playerId);
  if (move.type === "fold") return fold(state, playerId);
  if (move.type === "call") return callBet(state, playerId);
  if (move.type === "raise") return raiseBet(state, playerId, move.raiseTo);
  if (move.type === "bet") return placeBet(state, playerId, move.payAmount);
  if (move.type === "compare") return requestCompare(state, playerId, move.targetId);
  if (move.type === "select") return selectCardsForCompare(state, playerId, move.cardIds);
  return false;
}

export function handStrength(player) {
  const cards = player.isBlind ? null : bestThree(player.hand);
  if (!cards) {
    // 闷牌：用随机偏置 + 粗估
    return 0.35 + Math.random() * 0.25;
  }
  // 235 专杀对豹子很强，对其它牌型仍偏弱
  if (isSpecial235(cards)) return 0.68;
  const ev = evaluateHand(cards);
  const base = (ev.rank - 1) / 5;
  const tip = (ev.values[0] ?? 0) / 14 / 6;
  return Math.min(0.98, base * 0.75 + tip + 0.05);
}

function pay(state, player, amount) {
  if (amount <= 0) return true;
  if (player.chips < amount) return false;
  player.chips -= amount;
  player.betThisRound += amount;
  player.totalBet += amount;
  state.pot += amount;
  return true;
}

function markActed(state, playerId) {
  if (!state.actedThisRound.includes(playerId)) state.actedThisRound.push(playerId);
}

function afterAction(state, playerId, isRaise) {
  const alive = activePlayers(state);
  if (alive.length === 1) {
    finishWithWinner(state, alive[0].id, "其余玩家弃牌");
    return true;
  }

  if (state.status === "selecting") return true;

  // 检查是否本轮所有人已跟平且都行动过
  if (!isRaise && bettingRoundComplete(state)) {
    state.roundCount += 1;
    state.actedThisRound = [];
    // 新一轮重置本轮下注计数（水位保留）
    for (const p of state.players) {
      p.betThisRound = 0;
    }
    state.log.push(createLogEntry("回合", `进入第 ${state.roundCount} 轮`, state.roundCount === 2 ? "现在可以比牌了" : ""));
  }

  state.currentPlayerId = nextActiveId(state.players, playerId);
  return true;
}

function bettingRoundComplete(state) {
  const alive = activePlayers(state);
  if (alive.length < 2) return false;
  const allMatched = alive.every((p) => {
    const target = p.isBlind ? state.callLevel : state.callLevel * 2;
    return p.betThisRound >= target;
  });
  const allActed = alive.every((p) => state.actedThisRound.includes(p.id));
  return allMatched && allActed;
}

function finishWithWinner(state, winnerId, reason) {
  const winner = state.players[winnerId];
  winner.chips += state.pot;
  state.log.push(createLogEntry("结算", `${winner.name} 赢得 ${state.pot}`, reason));
  state.pot = 0;
  state.status = "finished";
  state.winnerId = winnerId;
  state.currentPlayerId = null;
  // 亮出所有未弃牌者的牌
  for (const p of state.players) {
    if (!p.folded && !p.out) p.isBlind = false;
  }
}

function nextActiveId(players, fromId) {
  const n = players.length;
  for (let step = 1; step <= n; step += 1) {
    const id = (fromId + step) % n;
    const p = players[id];
    if (!p.out && !p.folded) return id;
  }
  return null;
}

function ownsCards(player, ids) {
  const set = new Set(player.hand.map((c) => c.id));
  return ids.every((id) => set.has(id));
}

function pickHand(hand, ids) {
  if (!ids || ids.length !== 3) return bestThree(hand);
  return ids.map((id) => hand.find((c) => c.id === id)).filter(Boolean);
}

function isStraight(sortedDesc) {
  const v = [...sortedDesc].sort((a, b) => a - b);
  // A-2-3
  if (v[0] === 2 && v[1] === 3 && v[2] === 14) return true;
  return v[0] + 1 === v[1] && v[1] + 1 === v[2];
}

function straightValues(sortedDesc) {
  const v = [...sortedDesc].sort((a, b) => a - b);
  if (v[0] === 2 && v[1] === 3 && v[2] === 14) return [3]; // A23 最小顺
  return [v[2]];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
