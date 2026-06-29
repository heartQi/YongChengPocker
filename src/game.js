export const SUITS = [
  { id: "spades", label: "黑桃", symbol: "♠", color: "black" },
  { id: "hearts", label: "红桃", symbol: "♥", color: "red" },
  { id: "clubs", label: "梅花", symbol: "♣", color: "black" },
  { id: "diamonds", label: "方片", symbol: "♦", color: "red" }
];

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const JOKERS = [
  { id: "small-joker", rank: "小王", rankValue: 15, suit: "joker", suitSymbol: "王", color: "black", isJoker: true },
  { id: "big-joker", rank: "大王", rankValue: 16, suit: "joker", suitSymbol: "王", color: "red", isJoker: true }
];
const PLAYER_NAMES = ["A / 你", "B", "C / 队友", "D"];
const HAND_LIMIT = 8;

export const DIFFICULTIES = {
  easy: { id: "easy", label: "简单", attackBias: -1, defenseBias: -1 },
  normal: { id: "normal", label: "较难", attackBias: 0, defenseBias: 0 },
  hard: { id: "hard", label: "困难", attackBias: 1, defenseBias: 1 },
  expert: { id: "expert", label: "超难", attackBias: 2, defenseBias: 2 }
};

export function createDeck() {
  const standardCards = SUITS.flatMap((suit) =>
    RANKS.map((rank, index) => ({
      id: `${rank}-${suit.id}`,
      rank,
      rankValue: index + 2,
      suit: suit.id,
      suitSymbol: suit.symbol,
      color: suit.color
    }))
  );
  return [...standardCards, ...JOKERS.map((card) => ({ ...card }))];
}

export function shuffle(deck, random = Math.random) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function canBeat(attackCard, defenseCard, trumpSuit) {
  if (!attackCard || !defenseCard) return false;
  if (attackCard.isJoker) return false;
  if (defenseCard.isJoker) return true;
  if (defenseCard.suit === attackCard.suit && defenseCard.rankValue > attackCard.rankValue) {
    return true;
  }
  return defenseCard.suit === trumpSuit && attackCard.suit !== trumpSuit;
}

export function createGame(random = Math.random, difficulty = "normal") {
  const deck = shuffle(createDeck(), random);
  const trumpIndex = deck.findIndex((card) => !card.isJoker);
  const trumpCard = deck.splice(trumpIndex, 1)[0];
  const insertionIndex = Math.floor(random() * 32);
  deck.splice(insertionIndex, 0, trumpCard);
  const selectedDifficulty = DIFFICULTIES[difficulty] ?? DIFFICULTIES.normal;
  const players = PLAYER_NAMES.map((name, index) => ({
    id: index,
    name,
    team: index % 2,
    hand: []
  }));

  for (let round = 0; round < HAND_LIMIT; round += 1) {
    players.forEach((player) => {
      player.hand.push(deck.shift());
    });
  }
  const defenderId = players.find((player) => player.hand.some((card) => card.id === trumpCard.id))?.id ?? 1;
  const attackerId = previousOpponent(players, defenderId);

  return {
    players,
    stock: deck,
    trumpSuit: trumpCard.suit,
    trumpCard,
    attackerId,
    defenderId,
    attackTurnId: attackerId,
    battle: [],
    passedAttackers: [],
    status: "attacking",
    difficulty: selectedDifficulty.id,
    winnerTeam: null,
    winnerId: null,
    selectedDefenseSlot: null,
    log: [
      createLogEntry(
        "开局",
        `难度：${selectedDifficulty.label}。主牌：${cardLabel(trumpCard)}。${players[defenderId].name} 得到主牌先防守。`
      )
    ]
  };
}

export function getSuit(suitId) {
  return SUITS.find((suit) => suit.id === suitId);
}

export function legalAttackRanks(state) {
  if (state.battle.length === 0) return null;
  return new Set(state.battle.flatMap((pair) => [pair.attack.rank, pair.defense?.rank]).filter(Boolean));
}

export function canPlayerAttack(state, playerId) {
  const player = state.players[playerId];
  const defender = state.players[state.defenderId];
  return (
    ["attacking", "collecting"].includes(state.status) &&
    player.team !== defender.team &&
    playerId === state.attackTurnId &&
    !state.passedAttackers.includes(playerId)
  );
}

export function hasLegalAttackCard(state, playerId) {
  return state.players[playerId].hand.some((card) => canAttackWith(state, playerId, card));
}

export function canAttackWith(state, playerId, card) {
  if (!canPlayerAttack(state, playerId) || !card) return false;
  if (card.isJoker) return false;
  if (state.status === "collecting") return canGiveCardWith(state, playerId, card);
  const ranks = legalAttackRanks(state);
  return ranks === null || ranks.has(card.rank);
}

export function canPassAttack(state, playerId) {
  return canPlayerAttack(state, playerId) && (state.battle.length > 0 || state.status === "collecting");
}

export function playAttack(state, playerId, cardId) {
  const player = state.players[playerId];
  const card = removeCard(player.hand, cardId);
  if (!card || !canAttackWith(state, playerId, card)) {
    if (card) player.hand.push(card);
    return false;
  }

  state.battle.push({
    attack: card,
    defense: null,
    attackerId: playerId,
    attackType: state.status === "collecting" ? "give" : "attack"
  });
  if (state.status === "collecting") {
    state.passedAttackers = [];
    state.attackTurnId = playerId;
    addLog(state, createLogEntry("给牌", `${player.name} 给 ${state.players[state.defenderId].name} 多收`, cardLabel(card)));
    advanceAttackTurnIfNoLegalCards(state);
    return true;
  }
  state.passedAttackers = [];
  state.status = "defending";
  state.attackTurnId = null;
  state.selectedDefenseSlot = state.battle.length - 1;
  addLog(state, createLogEntry("进攻", `${player.name} → ${state.players[state.defenderId].name}`, cardLabel(card)));
  checkWin(state);
  return true;
}

export function canDefendWith(state, playerId, card, slotIndex = state.selectedDefenseSlot) {
  if (state.status !== "defending" || playerId !== state.defenderId || !card) return false;
  const pair = state.battle[slotIndex];
  return pair && !pair.defense && canBeat(pair.attack, card, state.trumpSuit);
}

export function playDefense(state, playerId, cardId, slotIndex = state.selectedDefenseSlot) {
  const player = state.players[playerId];
  const attackCard = state.battle[slotIndex]?.attack;
  const card = removeCard(player.hand, cardId);
  if (!card || !canDefendWith(state, playerId, card, slotIndex)) {
    if (card) player.hand.push(card);
    return false;
  }

  state.battle[slotIndex].defense = card;
  state.battle[slotIndex].defenderId = playerId;
  state.status = "attacking";
  state.attackTurnId = state.attackerId;
  advanceAttackTurnIfNoLegalCards(state);
  state.selectedDefenseSlot = null;
  addLog(state, createLogEntry("防守", `${player.name} 压住 ${cardLabel(attackCard)}`, cardLabel(card)));
  checkWin(state);
  return true;
}

export function passAttack(state, playerId) {
  if (!canPassAttack(state, playerId)) return false;
  if (!state.passedAttackers.includes(playerId)) {
    state.passedAttackers.push(playerId);
  }
  addLog(state, createLogEntry("放弃", `${state.players[playerId].name} ${state.status === "collecting" ? "不再给牌" : "放弃追加"}`));
  if (state.status === "collecting") {
    if (activeAttackers(state).every((id) => state.passedAttackers.includes(id))) {
      finishTakeCards(state);
    } else {
      state.attackTurnId = nextAttackTurn(state, playerId);
      advanceAttackTurnIfNoLegalCards(state);
    }
    return true;
  }
  if (activeAttackers(state).every((id) => state.passedAttackers.includes(id))) {
    if (state.defenderId === 0 && state.battle.every((pair) => pair.defense)) {
      state.status = "defense-choice";
      addLog(state, createLogEntry("选择", `${state.players[state.defenderId].name} 已防守成功，可以选择进攻或收牌`));
      return true;
    }
    completeDefense(state);
  } else {
    state.attackTurnId = nextAttackTurn(state, playerId);
    advanceAttackTurnIfNoLegalCards(state);
  }
  return true;
}

export function takeCards(state, playerId) {
  if (!canTakeCards(state, playerId)) return false;
  state.status = "collecting";
  state.attackTurnId = firstCollectingAttacker(state);
  state.passedAttackers = [];
  state.selectedDefenseSlot = null;
  addLog(state, createLogEntry("收牌", `${state.players[playerId].name} 准备收牌，进攻方可选择给牌`));
  advanceAttackTurnIfNoLegalCards(state);
  if (state.attackTurnId === null) {
    finishTakeCards(state);
  }
  return true;
}

export function finishTakeCards(state) {
  if (state.status !== "collecting") return false;
  const failedDefender = state.players[state.defenderId];
  const attackingTeam = state.players[state.attackerId].team;
  const taken = state.battle.flatMap((pair) => [pair.attack, pair.defense].filter(Boolean));
  const refillOrder = refillOrderForCurrentRound(state);
  failedDefender.hand.push(...taken);
  state.battle = [];
  state.attackerId = nextPlayerOnTeamAfter(state, attackingTeam, failedDefender.id);
  state.defenderId = nextOpponent(state, state.attackerId);
  state.attackTurnId = state.attackerId;
  state.status = "attacking";
  state.passedAttackers = [];
  state.selectedDefenseSlot = null;
  refillPlayers(state, refillOrder);
  addLog(
    state,
    createLogEntry("分隔", "防守方切换", `${state.players[state.attackerId].name} → ${state.players[state.defenderId].name}`)
  );
  addLog(
    state,
    createLogEntry(
      "收牌",
      `${failedDefender.name} 收走 ${taken.length} 张，按防守失败处理`,
      `${state.players[state.attackerId].name} → ${state.players[state.defenderId].name}`
    )
  );
  checkWin(state);
  return true;
}

export function canTakeCards(state, playerId) {
  if (playerId !== state.defenderId || state.battle.length === 0) return false;
  if (state.status === "defending") return true;
  return ["attacking", "defense-choice"].includes(state.status) && state.battle.every((pair) => pair.defense);
}

export function canGiveCardWith(state, playerId, card) {
  if (state.status !== "collecting" || !card) return false;
  if (card.isJoker) return false;
  const ranks = legalAttackRanks(state);
  return ranks !== null && ranks.has(card.rank) && state.players[playerId].team !== state.players[state.defenderId].team;
}

export function completeDefense(state) {
  const defender = state.players[state.defenderId];
  const refillOrder = refillOrderForCurrentRound(state);
  state.battle = [];
  state.attackerId = state.defenderId;
  state.defenderId = nextOpponent(state, state.attackerId);
  state.attackTurnId = state.attackerId;
  state.status = "attacking";
  state.passedAttackers = [];
  state.selectedDefenseSlot = null;
  refillPlayers(state, refillOrder);
  addLog(
    state,
    createLogEntry("分隔", "防守方切换", `${defender.name} → ${state.players[state.defenderId].name}`)
  );
  addLog(state, createLogEntry("结算", `${defender.name} 防守成功`, `${defender.name} → ${state.players[state.defenderId].name}`));
  checkWin(state);
}

export function activeAttackers(state) {
  const defenderTeam = state.players[state.defenderId].team;
  const attackers = state.players.filter((player) => player.team !== defenderTeam && player.hand.length > 0).map((player) => player.id);
  return orderedAttackers(state).filter((id) => attackers.includes(id));
}

export function orderedAttackers(state) {
  const attackerTeam = state.players[state.attackerId].team;
  const ordered = [];
  for (let offset = 0; offset < state.players.length; offset += 1) {
    const candidate = (state.attackerId + offset) % state.players.length;
    if (state.players[candidate].team === attackerTeam) {
      ordered.push(candidate);
    }
  }
  return ordered;
}

export function nextAttackTurn(state, afterId) {
  const attackers = orderedAttackers(state).filter(
    (id) => state.players[id].hand.length > 0 && !state.passedAttackers.includes(id)
  );
  if (attackers.length === 0) return null;
  const afterIndex = attackers.indexOf(afterId);
  return attackers[(afterIndex + 1 + attackers.length) % attackers.length];
}

export function advanceAttackTurnIfNoLegalCards(state) {
  if (!["attacking", "collecting"].includes(state.status) || state.attackTurnId === null) return false;
  let advanced = false;
  let guard = 0;
  while (guard < state.players.length && state.attackTurnId !== null && !hasLegalAttackCard(state, state.attackTurnId)) {
    const current = state.attackTurnId;
    if (!state.passedAttackers.includes(current)) {
      state.passedAttackers.push(current);
    }
    const active = activeAttackers(state);
    if (active.every((id) => state.passedAttackers.includes(id))) {
      if (state.status === "collecting") {
        finishTakeCards(state);
      } else if (state.defenderId === 0 && state.battle.every((pair) => pair.defense)) {
        state.status = "defense-choice";
        addLog(state, createLogEntry("选择", `${state.players[state.defenderId].name} 已防守成功，可以选择进攻或收牌`));
      } else {
        completeDefense(state);
      }
      return true;
    }
    state.attackTurnId = nextAttackTurn(state, current);
    advanced = true;
    guard += 1;
  }
  return advanced;
}

export function nextOpponent(state, playerId) {
  const team = state.players[playerId].team;
  for (let offset = 1; offset < state.players.length; offset += 1) {
    const candidate = (playerId + offset) % state.players.length;
    if (state.players[candidate].team !== team) return candidate;
  }
  return (playerId + 1) % state.players.length;
}

export function nextPlayerOnTeamAfter(state, team, afterId) {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = (afterId + offset) % state.players.length;
    if (state.players[candidate].team === team) return candidate;
  }
  return afterId;
}

function previousOpponent(players, defenderId) {
  const defenderTeam = players[defenderId].team;
  for (let offset = 1; offset < players.length; offset += 1) {
    const candidate = (defenderId - offset + players.length) % players.length;
    if (players[candidate].team !== defenderTeam) return candidate;
  }
  return (defenderId - 1 + players.length) % players.length;
}

export function chooseAiMove(state, playerId) {
  const player = state.players[playerId];
  if (state.status === "collecting" && playerId === state.attackTurnId) {
    const options = player.hand
      .filter((card) => canGiveCardWith(state, playerId, card))
      .sort((a, b) => cardStrength(a, state.trumpSuit) - cardStrength(b, state.trumpSuit));
    if (options[0] && shouldAiGiveCollectingCard(state, playerId, options[0])) {
      return { type: "attack", cardId: options[0].id };
    }
    return { type: "pass" };
  }

  if (state.status === "defending" && playerId === state.defenderId) {
    const slotIndex = state.battle.findIndex((pair) => !pair.defense);
    const options = player.hand
      .filter((card) => canDefendWith(state, playerId, card, slotIndex))
      .sort((a, b) => defenseChoiceScore(state, a) - defenseChoiceScore(state, b));
    return options[0] ? { type: "defend", cardId: options[0].id, slotIndex } : { type: "take" };
  }

  if (canPlayerAttack(state, playerId)) {
    const options = player.hand
      .filter((card) => canAttackWith(state, playerId, card))
      .sort((a, b) => cardStrength(a, state.trumpSuit) - cardStrength(b, state.trumpSuit));
    if (state.battle.length > 0 && shouldAiPassAttack(state, playerId, options)) {
      return { type: "pass" };
    }
    if (options[0]) return { type: "attack", cardId: options[0].id };
    return { type: "pass" };
  }

  return { type: "none" };
}

export function applyAiMove(state, playerId) {
  const move = chooseAiMove(state, playerId);
  if (move.type === "attack") return playAttack(state, playerId, move.cardId);
  if (move.type === "defend") return playDefense(state, playerId, move.cardId, move.slotIndex);
  if (move.type === "take") return takeCards(state, playerId);
  if (move.type === "pass") return passAttack(state, playerId);
  return false;
}

export function cardLabel(card) {
  return `${card.rank}${card.suitSymbol}`;
}

export function cardStrength(card, trumpSuit) {
  if (card.isJoker) return card.rankValue + 200;
  return card.rankValue + (card.suit === trumpSuit ? 100 : 0);
}

function shouldAiPassAttack(state, playerId, options) {
  if (options.length === 0) return true;
  const difficulty = DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.normal;
  const player = state.players[playerId];
  const defender = state.players[state.defenderId];
  const weakest = options[0];
  const isCostlyCard = weakest.suit === state.trumpSuit || weakest.rankValue >= 11;
  const defenderIsLoaded = defender.hand.length >= 10;
  const playerIsCloseToOut = state.stock.length === 0 && player.hand.length <= 2;
  if (playerIsCloseToOut) return false;
  if (difficulty.attackBias < 0 && state.battle.length > 0) return true;
  if (difficulty.attackBias > 1 && state.battle.length <= 3 && !weakest.isJoker) return false;
  if (difficulty.attackBias > 0 && !isCostlyCard) return false;
  if (difficulty.attackBias > 0 && defender.hand.length <= 4) return false;
  if (defenderIsLoaded && isCostlyCard) return true;
  return state.battle.length >= 2 && isCostlyCard;
}

function shouldAiGiveCollectingCard(state, playerId, card) {
  const difficulty = DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.normal;
  const player = state.players[playerId];
  if (state.stock.length === 0 && player.hand.length <= 2) return true;
  if (difficulty.attackBias < 0) return card.rankValue <= 8 && card.suit !== state.trumpSuit;
  if (difficulty.attackBias > 1) return card.rankValue <= 12 || state.players[state.defenderId].hand.length <= 7;
  if (difficulty.attackBias > 0) return card.rankValue <= 11 || state.players[state.defenderId].hand.length <= 6;
  return card.rankValue <= 10 && card.suit !== state.trumpSuit;
}

function defenseChoiceScore(state, card) {
  const difficulty = DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.normal;
  if (card.isJoker) return 220 + card.rankValue;
  const trumpPenalty = card.suit === state.trumpSuit ? 100 : 0;
  const honorPenalty = card.rankValue >= 11 ? difficulty.defenseBias * 8 : 0;
  return card.rankValue + trumpPenalty + honorPenalty;
}

function removeCard(hand, cardId) {
  const index = hand.findIndex((card) => card.id === cardId);
  if (index === -1) return null;
  return hand.splice(index, 1)[0];
}

function drawUpToEight(state, player) {
  while (player.hand.length < HAND_LIMIT && state.stock.length > 0) {
    player.hand.push(state.stock.shift());
  }
}

function refillOrderForCurrentRound(state) {
  return state.players.map((_, offset) => (state.attackerId + offset) % state.players.length);
}

function firstCollectingAttacker(state) {
  const attackers = orderedAttackers(state).filter((id) =>
    state.players[id].hand.some((card) => canGiveCardWith(state, id, card))
  );
  return attackers[0] ?? null;
}

function refillPlayers(state, playerIds) {
  playerIds.forEach((id) => drawUpToEight(state, state.players[id]));
}

function checkWin(state) {
  if (state.stock.length > 0 || state.winnerTeam !== null) return;
  const winner = state.players.find((player) => player.hand.length === 0);
  if (winner) {
    state.winnerTeam = winner.team;
    state.winnerId = winner.id;
    state.status = "finished";
    addLog(state, createLogEntry("胜利", `${winner.name} 玩家胜利`, `${winner.team === 0 ? "A/C" : "B/D"} 阵营获胜`));
  }
}

function addLog(state, message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 12);
}

function createLogEntry(type, main, detail = "") {
  return { type, main, detail };
}
