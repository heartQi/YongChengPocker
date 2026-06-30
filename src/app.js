import {
  applyAiMove,
  canAttackWith,
  canDefendWith,
  canPassAttack,
  canPlayerAttack,
  canTakeCards,
  cardLabel,
  createGame,
  DIFFICULTIES,
  advanceAttackTurnIfNoLegalCards,
  hasLegalAttackCard,
  getSuit,
  passAttack,
  playAttack,
  playDefense,
  takeCards,
  completeDefense
} from "./game.js";

const DEFAULT_DIFFICULTY = "hard";

let selectedDifficulty = null;
let pendingDifficulty = DEFAULT_DIFFICULTY;
let state = createGame(Math.random, pendingDifficulty);
let aiTimer = null;
let aiStepDelayMs = 1900;
let selectedCardId = null;

const handEl = document.querySelector("#hand");
const tableEl = document.querySelector("#table");
const playersEl = document.querySelector("#players");
const logEl = document.querySelector("#log");
const hintEl = document.querySelector("#hint");
const difficultyBadgeEl = document.querySelector("#difficultyBadge");
const trumpBadgeEl = document.querySelector("#trumpBadge");
const stockBadgeEl = document.querySelector("#stockBadge");
const turnBadgeEl = document.querySelector("#turnBadge");
const passButton = document.querySelector("#passButton");
const takeButton = document.querySelector("#takeButton");
const playSelectedButton = document.querySelector("#playSelectedButton");
const restartButton = document.querySelector("#restartButton");
const difficultyScreen = document.querySelector("#difficultyScreen");
const startGameButton = document.querySelector("#startGameButton");
const speedSelect = document.querySelector("#speedSelect");
const difficultySelect = document.querySelector("#difficultySelect");
const victoryScreen = document.querySelector("#victoryScreen");
const victoryTitle = document.querySelector("#victoryTitle");
const victoryDetail = document.querySelector("#victoryDetail");
const nextRoundButton = document.querySelector("#nextRoundButton");
const rulesButton = document.querySelector("#rulesButton");
const rulesScreen = document.querySelector("#rulesScreen");
const rulesCloseButton = document.querySelector("#rulesCloseButton");

restartButton.addEventListener("click", () => {
  clearAiTimer();
  selectedCardId = null;
  selectedDifficulty = null;
  difficultyScreen.classList.remove("hidden");
  victoryScreen.classList.add("hidden");
  render();
});

startGameButton.addEventListener("click", () => {
  startNewGame(pendingDifficulty);
});

difficultySelect.addEventListener("change", () => {
  pendingDifficulty = difficultySelect.value;
  if (!selectedDifficulty) {
    state = createGame(Math.random, pendingDifficulty);
    render();
    return;
  }
  clearAiTimer();
  startNewGame(pendingDifficulty);
});

function startNewGame(difficulty) {
  selectedDifficulty = difficulty;
  pendingDifficulty = difficulty;
  difficultySelect.value = difficulty;
  state = createGame(Math.random, selectedDifficulty);
  selectedCardId = null;
  difficultyScreen.classList.add("hidden");
  victoryScreen.classList.add("hidden");
  render();
  scheduleAiStep();
}

nextRoundButton.addEventListener("click", () => {
  clearAiTimer();
  state = createGame(Math.random, selectedDifficulty ?? pendingDifficulty);
  selectedDifficulty = state.difficulty;
  pendingDifficulty = state.difficulty;
  difficultySelect.value = state.difficulty;
  selectedCardId = null;
  victoryScreen.classList.add("hidden");
  difficultyScreen.classList.add("hidden");
  render();
  scheduleAiStep();
});

rulesButton.addEventListener("click", () => {
  rulesScreen.classList.remove("hidden");
});

rulesCloseButton.addEventListener("click", () => {
  rulesScreen.classList.add("hidden");
});

rulesScreen.addEventListener("click", (event) => {
  if (event.target === rulesScreen) rulesScreen.classList.add("hidden");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") rulesScreen.classList.add("hidden");
});

speedSelect.addEventListener("change", () => {
  aiStepDelayMs = Number(speedSelect.value);
  if (aiTimer) scheduleAiStep();
});

passButton.addEventListener("click", () => {
  selectedCardId = null;
  if (state.status === "defense-choice" && state.defenderId === 0) {
    completeDefense(state);
    render();
    scheduleAiStep();
    return;
  }
  if (passAttack(state, 0)) {
    render();
    scheduleAiStep();
  }
});

takeButton.addEventListener("click", () => {
  selectedCardId = null;
  if (takeCards(state, 0)) {
    render();
    scheduleAiStep();
  }
});

playSelectedButton.addEventListener("click", () => {
  const card = selectedCard();
  if (!card || !isHumanCardLegal(card)) return;
  playSelectedCard(card);
});

function render() {
  const trump = getSuit(state.trumpSuit);
  const difficulty = DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.normal;
  difficultyBadgeEl.textContent = `难度：${difficulty.label}`;
  trumpBadgeEl.textContent = `主牌：${trump.symbol} ${trump.label}`;
  stockBadgeEl.textContent = `牌墩：${state.stock.length}`;
  if (turnBadgeEl) turnBadgeEl.textContent = currentTurnText();

  renderPlayers();
  renderTable();
  renderHand();
  renderLog();
  updateActions();
  updateVictory();
  updateDifficultySelection();
}

function renderPlayers() {
  playersEl.innerHTML = "";
  state.players.forEach((player) => {
    const item = document.createElement("article");
    item.className = `player-seat player-seat-${player.id}`;
    if (player.id === state.attackerId) item.classList.add("is-attacker");
    if (player.id === state.defenderId) item.classList.add("is-defender");
    if (player.id === 0) item.classList.add("is-human");
    item.innerHTML = `
      <span class="avatar" aria-label="${player.name} 剩余 ${player.hand.length} 张牌">${shortPlayerName(player)}/${player.hand.length}</span>
      <strong>${player.name}</strong>
    `;
    playersEl.append(item);
  });
}

function renderTable() {
  tableEl.innerHTML = "";
  tableEl.classList.toggle("is-empty", state.battle.length === 0);
  if (state.battle.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-table";
    empty.textContent = "桌面暂无牌";
    tableEl.append(empty);
    return;
  }

  state.battle.forEach((pair, index) => {
    const slot = document.createElement("button");
    slot.className = "battle-pair";
    slot.type = "button";
    slot.disabled = !(state.status === "defending" && state.defenderId === 0 && !pair.defense);
    slot.addEventListener("click", () => {
      state.selectedDefenseSlot = index;
      render();
    });
    if (state.selectedDefenseSlot === index) slot.classList.add("selected");
    slot.append(cardNode(pair.attack, tableCardCaption(pair, "attack")));
    if (pair.defense) {
      slot.append(cardNode(pair.defense, tableCardCaption(pair, "defense")));
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "defense-placeholder";
      placeholder.textContent = "等待防守";
      slot.append(placeholder);
    }
    tableEl.append(slot);
  });
}

function renderHand() {
  handEl.innerHTML = "";
  const player = state.players[0];
  const sorted = [...player.hand].sort((a, b) => {
    if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
    if (a.isJoker && b.isJoker) return a.rankValue - b.rankValue;
    const aIsTrump = a.suit === state.trumpSuit;
    const bIsTrump = b.suit === state.trumpSuit;
    if (aIsTrump !== bIsTrump) return aIsTrump ? 1 : -1;
    return a.rankValue - b.rankValue || a.suit.localeCompare(b.suit);
  });
  sorted.forEach((card) => {
    const button = cardNode(card);
    if (card.id === selectedCardId) button.classList.add("selected");
    button.disabled = !isHumanCardLegal(card);
    button.addEventListener("click", () => handleCardClick(card));
    handEl.append(button);
  });
}

function renderLog() {
  logEl.innerHTML = "";
  state.log.forEach((entry) => {
    const item = document.createElement("li");
    const normalized = typeof entry === "string" ? { type: "记录", main: entry, detail: "" } : entry;
    if (normalized.type === "分隔") {
      item.className = "log-divider";
      item.innerHTML = `<span>${normalized.main}</span><strong>${normalized.detail}</strong>`;
      logEl.append(item);
      return;
    }
    item.className = "log-entry";
    item.innerHTML = `
      <span class="log-type">${normalized.type}</span>
      <strong>${normalized.main}</strong>
      ${normalized.detail ? `<small>${normalized.detail}</small>` : ""}
    `;
    logEl.append(item);
  });
}

function updateActions() {
  const isChoosingDifficulty = !selectedDifficulty;
  const canConfirmDefense = state.status === "defense-choice" && state.defenderId === 0;
  const aiIsThinking = Boolean(aiTimer);
  const canTake = canTakeCards(state, 0);
  const card = selectedCard();
  const canPlaySelectedCard = Boolean(card && isHumanCardLegal(card));
  const shouldPromptPlayCard = shouldPromptForPlayableCard();
  passButton.textContent = canConfirmDefense ? "防守成功" : state.status === "collecting" ? "不给牌" : "放弃追加";
  takeButton.textContent = "收牌";
  playSelectedButton.textContent = selectedPlayLabel();
  passButton.disabled = aiIsThinking || (!canConfirmDefense && !canPassAttack(state, 0));
  takeButton.disabled = aiIsThinking || !canTake;
  takeButton.hidden = !canTake || isChoosingDifficulty || state.status === "finished";
  playSelectedButton.disabled = aiIsThinking || (!canPlaySelectedCard && !shouldPromptPlayCard);
  passButton.classList.toggle("is-ready", !passButton.disabled);
  passButton.classList.toggle("is-defense-confirm", canConfirmDefense && !passButton.disabled);
  takeButton.classList.toggle("is-ready", !takeButton.disabled);
  playSelectedButton.classList.toggle("is-ready", canPlaySelectedCard || shouldPromptPlayCard);
  restartButton.textContent = selectedDifficulty ? "重新开始" : "开始游戏";
  if (isChoosingDifficulty) {
    passButton.disabled = true;
    takeButton.disabled = true;
    playSelectedButton.disabled = true;
    passButton.classList.remove("is-ready");
    passButton.classList.remove("is-defense-confirm");
    takeButton.classList.remove("is-ready");
    playSelectedButton.classList.remove("is-ready");
  }
  hintEl.textContent = hintText();
}

function handleCardClick(card) {
  if (!selectedDifficulty) return;
  if (!isHumanCardLegal(card)) return;
  selectedCardId = selectedCardId === card.id ? null : card.id;
  render();
}

function playSelectedCard(card) {
  if ((state.status === "attacking" || state.status === "collecting") && canAttackWith(state, 0, card)) {
    playAttack(state, 0, card.id);
  } else if (state.status === "defending" && canDefendWith(state, 0, card)) {
    playDefense(state, 0, card.id);
  }
  selectedCardId = null;
  render();
  scheduleAiStep();
}

function scheduleAiStep() {
  clearAiTimer();
  advanceAttackTurnIfNoLegalCards(state);
  if (state.status === "finished" || needsHumanInput()) {
    render();
    return;
  }
  aiTimer = setTimeout(() => {
    aiTimer = null;
    const actorId = nextAiActor();
    let changed = false;
    if (actorId !== null) {
      changed = applyAiMove(state, actorId);
    }
    render();
    if (changed) scheduleAiStep();
  }, aiStepDelayMs);
}

function clearAiTimer() {
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function needsHumanInput() {
  if (!selectedDifficulty) return true;
  if (state.status === "defense-choice" && state.defenderId === 0) return true;
  if (state.status === "defending" && state.defenderId === 0) return true;
  return ["attacking", "collecting"].includes(state.status) && canHumanAttack() && hasLegalAttackCard(state, 0);
}

function nextAiActor() {
  if (state.status === "defending") return state.defenderId === 0 ? null : state.defenderId;
  if (state.status === "attacking" || state.status === "collecting") {
    return state.attackTurnId === 0 ? null : state.attackTurnId;
  }
  return null;
}

function isHumanCardLegal(card) {
  if (!selectedDifficulty) return false;
  if (state.status === "finished") return false;
  if (state.status === "defense-choice") return false;
  if (aiTimer) return false;
  if (state.status === "attacking" || state.status === "collecting") return canAttackWith(state, 0, card);
  return canDefendWith(state, 0, card);
}

function selectedCard() {
  return state.players[0].hand.find((card) => card.id === selectedCardId) ?? null;
}

function selectedPlayLabel() {
  if (shouldPromptForPlayableCard()) return "请出牌";
  return "出牌";
}

function shouldPromptForPlayableCard() {
  const canPromptAttack =
    selectedDifficulty &&
    !aiTimer &&
    state.status === "attacking" &&
    canHumanAttack() &&
    hasLegalAttackCard(state, 0) &&
    !selectedCard();
  const canPromptDefense =
    selectedDifficulty &&
    !aiTimer &&
    state.status === "defending" &&
    state.defenderId === 0 &&
    state.players[0].hand.some((card) => canDefendWith(state, 0, card)) &&
    !selectedCard();
  return canPromptAttack || canPromptDefense;
}

function canHumanAttack() {
  return canPlayerAttack(state, 0);
}

function cardNode(card, caption = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `card ${card.color}`;
  if (card.isJoker) button.classList.add("joker");
  if (card.suit === state.trumpSuit) button.classList.add("trump");
  button.innerHTML = `
    <span>${card.rank}</span>
    <strong>${card.suitSymbol}</strong>
    <small>${caption || (card.isJoker ? "防守" : card.suit === state.trumpSuit ? "主牌" : "&nbsp;")}</small>
  `;
  button.setAttribute("aria-label", `${caption} ${cardLabel(card)}`);
  return button;
}

function tableCardCaption(pair, role) {
  if (role === "defense") {
    const defender = state.players[pair.defenderId ?? state.defenderId];
    return `${shortPlayerName(defender)} 防守`;
  }
  const attacker = state.players[pair.attackerId];
  return `${shortPlayerName(attacker)} ${pair.attackType === "give" ? "给牌" : "进攻"}`;
}

function shortPlayerName(player) {
  return player?.name.split(" / ")[0] ?? "";
}

function updateVictory() {
  const winner = state.winnerId === null ? null : state.players[state.winnerId];
  const isFinished = state.status === "finished" && winner;
  victoryScreen.classList.toggle("hidden", !isFinished);
  if (!isFinished) return;
  const winnerName = shortPlayerName(winner);
  victoryTitle.textContent = `${winnerName} 玩家胜利`;
  victoryDetail.textContent = `${winner.name} 先出完手牌`;
}

function currentTurnText() {
  if (state.status === "finished") return `胜方：${state.winnerTeam === 0 ? "A/C" : "B/D"} 阵营`;
  if (!selectedDifficulty) return "点击 Start 开始";
  if (needsHumanInput()) return humanTurnText();
  if (state.status === "defense-choice") return "防守成功待确认";
  if (state.status === "collecting") return "收牌追加中";
  if (state.status === "defending") return "防守中";
  return "进攻中";
}

function humanTurnText() {
  if (state.status === "defense-choice") return "防守成功待确认";
  if (state.status === "defending") return "你方防守";
  if (state.status === "collecting") return "你方给牌";
  return "你方进攻";
}

function hintText() {
  if (!selectedDifficulty) return "点击 Start 直接开始困难难度。";
  if (state.status === "finished") return "点击重新开始再来一局。";
  if (state.status === "defense-choice" && state.defenderId === 0) {
    return "你已防守成功。点“防守成功”确认并进攻下家；点“收牌”则按防守失败处理。";
  }
  if (state.status === "collecting" && canHumanAttack()) {
    return "防守方准备收牌。先选同点数的合法牌，再点“出牌”给对方收走；也可以点“不给牌”。";
  }
  if (state.status === "defending" && state.defenderId === 0) {
    return "先选择可防守的牌，再点“出牌”。压不住时可收牌。";
  }
  if (state.status === "attacking" && canHumanAttack()) {
    return state.battle.length === 0
      ? "新一轮进攻必须先选一张牌，再点“出牌”。"
      : "先选可追加的牌，再点“出牌”；也可以放弃追加。";
  }
  return "电脑玩家正在行动。";
}

function updateDifficultySelection() {
  startGameButton.disabled = false;
  difficultySelect.value = pendingDifficulty;
}

render();
