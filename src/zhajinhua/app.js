import {
  ANTE,
  applyAiMove,
  bestThree,
  betChoices,
  betUnit,
  canCall,
  canCompare,
  canFold,
  canLook,
  cardLabel,
  compareTargets,
  createGame,
  evaluateHand,
  fold,
  handLabel,
  lookCards,
  minPayAmount,
  normalizePayAmount,
  placeBet,
  requestCompare,
  selectCardsForCompare
} from "./game.js";

let state = null;
let started = false;
let aiTimer = null;
let selectedCardIds = [];
let pickingCompare = false;
let fxPlaying = false;
let selectedPayAmount = 0;

const DELAY = {
  think: 1400,
  look: 1100,
  fold: 1300,
  bet: 1600,
  compare: 3200,
  afterCompareContinue: 900
};

const setupScreen = document.querySelector("#setupScreen");
const victoryScreen = document.querySelector("#victoryScreen");
const rulesScreen = document.querySelector("#rulesScreen");
const compareScreen = document.querySelector("#compareScreen");
const compareSideA = document.querySelector("#compareSideA");
const compareSideB = document.querySelector("#compareSideB");
const compareResultText = document.querySelector("#compareResultText");
const compareEyebrow = document.querySelector("#compareEyebrow");
const fxLayer = document.querySelector("#fxLayer");
const playerCountSelect = document.querySelector("#playerCountSelect");
const cardsSelect = document.querySelector("#cardsSelect");
const startButton = document.querySelector("#startButton");
const seatsEl = document.querySelector("#seats");
const chipsEl = document.querySelector("#chips");
const potAmountEl = document.querySelector("#potAmount");
const potBadgeEl = document.querySelector("#potBadge");
const roundBadgeEl = document.querySelector("#roundBadge");
const stakeBadgeEl = document.querySelector("#stakeBadge");
const turnHintEl = document.querySelector("#turnHint");
const myCardsEl = document.querySelector("#myCards");
const hintEl = document.querySelector("#hint");
const logEl = document.querySelector("#log");
const compareTargetsEl = document.querySelector("#compareTargets");

const lookButton = document.querySelector("#lookButton");
const callButton = document.querySelector("#callButton");
const compareButton = document.querySelector("#compareButton");
const foldButton = document.querySelector("#foldButton");
const confirmSelectButton = document.querySelector("#confirmSelectButton");
const nextRoundButton = document.querySelector("#nextRoundButton");
const backSetupButton = document.querySelector("#backSetupButton");
const rulesButton = document.querySelector("#rulesButton");
const rulesCloseButton = document.querySelector("#rulesCloseButton");
const victoryTitle = document.querySelector("#victoryTitle");
const victoryDetail = document.querySelector("#victoryDetail");
const betSizer = document.querySelector("#betSizer");
const betSizerLabel = document.querySelector("#betSizerLabel");
const betAmountInput = document.querySelector("#betAmountInput");
const betInputHint = document.querySelector("#betInputHint");
const betChips = document.querySelector("#betChips");
const betMinusButton = document.querySelector("#betMinusButton");
const betPlusButton = document.querySelector("#betPlusButton");

const AVATAR_GLYPHS = ["我", "强", "美", "周", "杰", "雨"];

startButton.addEventListener("click", () => {
  startGame();
});

nextRoundButton.addEventListener("click", () => {
  startGame({ keepChips: true });
});

backSetupButton.addEventListener("click", () => {
  clearAiTimer();
  started = false;
  state = null;
  fxPlaying = false;
  hideCompareOverlay();
  victoryScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
});

rulesButton.addEventListener("click", () => rulesScreen.classList.remove("hidden"));
rulesCloseButton.addEventListener("click", () => rulesScreen.classList.add("hidden"));
rulesScreen.addEventListener("click", (e) => {
  if (e.target === rulesScreen) rulesScreen.classList.add("hidden");
});

lookButton.addEventListener("click", () => {
  if (!canActNow() || !canLook(state, 0)) return;
  lookCards(state, 0);
  afterHumanAction();
});

callButton.addEventListener("click", () => {
  if (!canActNow() || !canCall(state, 0)) return;
  // 若输入框里刚改完还未失焦，先提交输入
  const typed = Number(betAmountInput.value);
  const raw = Number.isFinite(typed) ? typed : selectedPayAmount || minPayAmount(state, 0);
  const pay = normalizePayAmount(state, 0, raw);
  selectedPayAmount = pay;
  if (!placeBet(state, 0, pay)) return;
  afterHumanAction();
});

betMinusButton.addEventListener("click", () => {
  if (!canActNow() || !state) return;
  adjustPayAmount(-betUnit(state, 0));
});

betPlusButton.addEventListener("click", () => {
  if (!canActNow() || !state) return;
  adjustPayAmount(betUnit(state, 0));
});

betChips.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-pay]");
  if (!btn || !canActNow() || !state) return;
  selectedPayAmount = normalizePayAmount(state, 0, Number(btn.dataset.pay));
  renderBetSizer();
  renderActions();
});

betAmountInput.addEventListener("change", () => {
  commitBetInput();
});

betAmountInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitBetInput();
    betAmountInput.blur();
  }
});

betAmountInput.addEventListener("blur", () => {
  commitBetInput();
});

function commitBetInput() {
  if (!state || !started) return;
  const raw = Number(betAmountInput.value);
  if (!Number.isFinite(raw)) {
    selectedPayAmount = minPayAmount(state, 0);
  } else {
    selectedPayAmount = normalizePayAmount(state, 0, raw);
  }
  renderBetSizer();
  renderActions();
}

foldButton.addEventListener("click", () => {
  if (!canActNow() || !canFold(state, 0)) return;
  fold(state, 0);
  pickingCompare = false;
  afterHumanAction();
});

compareButton.addEventListener("click", () => {
  if (!canActNow()) return;
  const targets = compareTargets(state, 0);
  if (!targets.length) return;
  pickingCompare = !pickingCompare;
  render();
});

confirmSelectButton.addEventListener("click", () => {
  if (!canActNow() || state.status !== "selecting") return;
  if (selectedCardIds.length !== 3) return;
  const pending = state.selectPending;
  if (!pending) return;
  const actorPhase = pending.phase === "actor" && pending.actorId === 0;
  const targetPhase = pending.phase === "target" && pending.targetId === 0;
  if (!actorPhase && !targetPhase) return;
  selectCardsForCompare(state, 0, selectedCardIds);
  selectedCardIds = [];
  afterHumanAction();
});

compareTargetsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-target-id]");
  if (!btn || !canActNow()) return;
  const targetId = Number(btn.dataset.targetId);
  if (!canCompare(state, 0, targetId)) return;
  pickingCompare = false;
  selectedCardIds = [];
  requestCompare(state, 0, targetId);
  afterHumanAction();
});

function canActNow() {
  return state && started && !fxPlaying && !aiTimer;
}

function startGame({ keepChips = false } = {}) {
  clearAiTimer();
  hideCompareOverlay();
  fxPlaying = false;
  const playerCount = Number(playerCountSelect.value);
  const cardsPerPlayer = Number(cardsSelect.value);
  state = createGame({
    playerCount,
    cardsPerPlayer,
    prevPlayers: keepChips && state ? state.players : null,
    dealerId: keepChips && state ? (state.dealerId + 1) % playerCount : undefined
  });
  started = true;
  selectedCardIds = [];
  pickingCompare = false;
  selectedPayAmount = minPayAmount(state, 0);
  setupScreen.classList.add("hidden");
  victoryScreen.classList.add("hidden");
  render();
  scheduleAi();
}

function adjustPayAmount(delta) {
  const next = normalizePayAmount(state, 0, (selectedPayAmount || minPayAmount(state, 0)) + delta);
  selectedPayAmount = next;
  renderBetSizer();
  renderActions();
}

function syncSelectedPayAmount() {
  if (!state || state.status !== "betting" || state.currentPlayerId !== 0) return;
  const choices = betChoices(state, 0);
  const minPay = minPayAmount(state, 0);
  if (!choices.length) {
    selectedPayAmount = minPay;
    return;
  }
  selectedPayAmount = normalizePayAmount(state, 0, selectedPayAmount || minPay);
  if (!choices.includes(selectedPayAmount)) {
    selectedPayAmount = choices.includes(minPay) ? minPay : choices[0];
  }
}

async function afterHumanAction() {
  pickingCompare = false;
  render();
  await playLastActionFx();
  scheduleAi();
}

function scheduleAi() {
  clearAiTimer();
  if (!state || state.status === "finished") {
    render();
    return;
  }
  if (fxPlaying) return;
  if (needsHuman()) {
    render();
    return;
  }

  aiTimer = setTimeout(async () => {
    aiTimer = null;
    if (!state || state.status === "finished" || fxPlaying) {
      render();
      return;
    }

    if (state.status === "selecting" && state.selectPending) {
      const pending = state.selectPending;
      const actorId = pending.phase === "actor" ? pending.actorId : pending.targetId;
      if (actorId !== 0) {
        applyAiMove(state, actorId);
        render();
        await playLastActionFx();
        scheduleAi();
        return;
      }
      render();
      return;
    }

    const actorId = state.currentPlayerId;
    if (actorId != null && actorId !== 0) {
      applyAiMove(state, actorId);
      render();
      await playLastActionFx();
    }
    scheduleAi();
  }, DELAY.think);
}

function clearAiTimer() {
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function needsHuman() {
  if (!state || !started) return true;
  if (state.status === "finished") return true;
  if (state.status === "selecting" && state.selectPending) {
    const pending = state.selectPending;
    if (pending.phase === "actor") return pending.actorId === 0;
    return pending.targetId === 0;
  }
  return state.status === "betting" && state.currentPlayerId === 0;
}

async function playLastActionFx() {
  if (!state?.lastAction) return;
  const action = state.lastAction;
  state.lastAction = null;
  fxPlaying = true;
  renderActions();

  try {
    if (action.type === "call" || action.type === "raise") {
      await Promise.all([
        animateChipThrow(action.playerId, action.amount ?? ANTE),
        showSeatBubble(action.playerId, actionLabel(action), DELAY.bet)
      ]);
      await wait(200);
    } else if (action.type === "compare") {
      await animateChipThrow(action.playerId, action.amount ?? ANTE);
      await showCompareOverlay(action);
      if (action.continues && state.status !== "finished") {
        turnHintEl.textContent = `${state.players[action.winnerId].name} 胜出，继续与其余玩家对局`;
        await wait(DELAY.afterCompareContinue);
      }
    } else if (action.type === "look") {
      await showSeatBubble(action.playerId, "看牌", DELAY.look);
    } else if (action.type === "fold") {
      await showSeatBubble(action.playerId, "弃牌", DELAY.fold);
    } else if (action.type === "select") {
      await wait(700);
    }
  } finally {
    hideCompareOverlay();
    fxPlaying = false;
    render();
  }
}

function actionLabel(action) {
  const name = action.label ?? (action.type === "raise" ? "加注" : "跟注");
  return `${name} ${formatChips(action.amount ?? 0)}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seatEl(playerId) {
  return seatsEl.querySelector(`[data-player-id="${playerId}"]`);
}

function potCenterPoint() {
  const potBox = potAmountEl.getBoundingClientRect();
  return {
    x: potBox.left + potBox.width / 2,
    y: potBox.top + potBox.height / 2
  };
}

function seatPoint(playerId) {
  const el = seatEl(playerId);
  if (!el) return potCenterPoint();
  const box = el.getBoundingClientRect();
  return {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2
  };
}

async function animateChipThrow(playerId, amount) {
  const from = seatPoint(playerId);
  const to = potCenterPoint();
  const chips = Math.min(4, Math.max(1, Math.round(amount / ANTE)));

  const flights = [];
  for (let i = 0; i < chips; i += 1) {
    flights.push(
      new Promise((resolve) => {
        const chip = document.createElement("span");
        const tier = i % 3;
        chip.className = `zjh-fly-chip ${tier === 0 ? "gold" : tier === 1 ? "silver" : "bronze"}`;
        chip.textContent = amount >= 5000 ? "5K" : amount >= 2000 ? "2K" : "1K";
        const jitterX = (i - chips / 2) * 10;
        chip.style.left = `${from.x + jitterX}px`;
        chip.style.top = `${from.y}px`;
        fxLayer.append(chip);
        requestAnimationFrame(() => {
          chip.style.transform = `translate(${to.x - from.x - jitterX}px, ${to.y - from.y - 8}px) scale(0.85)`;
          chip.style.opacity = "0.15";
        });
        setTimeout(() => {
          chip.remove();
          resolve();
        }, 750 + i * 80);
      })
    );
  }

  flashSeat(playerId, "is-betting");
  potAmountEl.classList.add("is-pulse");
  await Promise.all(flights);
  potAmountEl.classList.remove("is-pulse");
}

async function showSeatBubble(playerId, text, duration) {
  const seat = seatEl(playerId);
  if (!seat) {
    await wait(duration);
    return;
  }
  flashSeat(playerId, "is-acting");
  const bubble = document.createElement("div");
  bubble.className = "zjh-seat-bubble";
  bubble.textContent = text;
  seat.append(bubble);
  await wait(duration);
  bubble.remove();
}

function flashSeat(playerId, className) {
  const seat = seatEl(playerId);
  if (!seat) return;
  seat.classList.add(className);
  setTimeout(() => seat.classList.remove(className), 900);
}

async function showCompareOverlay(action) {
  const actor = state.players[action.playerId];
  const target = state.players[action.targetId];
  const winner = state.players[action.winnerId];

  compareEyebrow.textContent = "比牌中";
  compareSideA.innerHTML = compareSideHtml(actor, action.actorCards, action.actorType, action.winnerId === actor.id);
  compareSideB.innerHTML = compareSideHtml(target, action.targetCards, action.targetType, action.winnerId === target.id);

  if (action.continues) {
    compareResultText.textContent = `${winner.name} 赢了这一轮比牌，继续与其他玩家对局`;
  } else {
    compareResultText.textContent = `${winner.name} 赢得本局！`;
  }

  compareScreen.classList.remove("hidden");
  // 座位上也高亮双方
  flashSeat(action.playerId, "is-compare");
  flashSeat(action.targetId, "is-compare");
  await wait(DELAY.compare);
}

function hideCompareOverlay() {
  compareScreen?.classList.add("hidden");
}

function compareSideHtml(player, cards, typeLabel, isWinner) {
  const cardsHtml = (cards ?? [])
    .map(
      (card) =>
        `<span class="zjh-compare-card ${card.color}"><strong>${card.rank}</strong><em>${card.suitSymbol}</em></span>`
    )
    .join("");
  return `
    <div class="zjh-compare-name ${isWinner ? "is-winner" : "is-loser"}">${player.name}${isWinner ? " · 胜" : ""}</div>
    <div class="zjh-compare-cards">${cardsHtml}</div>
    <div class="zjh-compare-type">${typeLabel ?? ""}</div>
  `;
}

function render() {
  if (!state) return;
  potBadgeEl.textContent = `池：${formatChips(state.pot)}`;
  roundBadgeEl.textContent = `第 ${state.roundCount} 轮`;
  stakeBadgeEl.textContent = `闷注：${formatChips(state.callLevel)}`;
  potAmountEl.textContent = formatChips(state.pot);
  turnHintEl.textContent = turnText();
  renderSeats();
  renderChips();
  renderMyCards();
  renderActions();
  renderLog();
  renderVictory();
  hintEl.textContent = hintText();
}

function seatSlots(playerCount) {
  const maps = {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 2, 3, 4],
    5: [0, 1, 2, 4, 5],
    6: [0, 1, 2, 3, 4, 5]
  };
  return maps[playerCount] ?? maps[4];
}

function renderSeats() {
  seatsEl.innerHTML = "";
  const slots = seatSlots(state.playerCount);
  const me = state.players[0];
  // 自己弃牌后旁观：可看其他玩家的牌；终局也全员亮牌
  const spectatorReveal = Boolean(me?.folded) || state.status === "finished";

  state.players.forEach((player, index) => {
    const slot = slots[index];
    const seat = document.createElement("article");
    seat.className = "zjh-seat";
    seat.dataset.slot = String(slot);
    seat.dataset.playerId = String(player.id);
    if (player.id === 0) seat.classList.add("is-human");
    if (player.folded || player.out) seat.classList.add("is-folded");
    if (state.currentPlayerId === player.id && state.status !== "finished" && !fxPlaying) {
      seat.classList.add("is-turn");
    }

    const showFace =
      player.id === 0
        ? !player.isBlind || player.folded || state.status === "finished"
        : spectatorReveal;

    const cardsHtml = player.hand
      .map((card) => {
        if (showFace) {
          return `<span class="zjh-card-face ${card.color}"><span>${card.rank}</span><span>${card.suitSymbol}</span></span>`;
        }
        return `<span class="zjh-card-back"></span>`;
      })
      .join("");

    let banner = "";
    if (player.folded) banner = `<span class="zjh-hand-banner is-fold">弃牌</span>`;
    else if (!player.isBlind && !spectatorReveal) banner = `<span class="zjh-hand-banner is-look">看牌</span>`;

    seat.innerHTML = `
      <span class="zjh-name">${player.name}</span>
      <div class="zjh-avatar" aria-hidden="true">${AVATAR_GLYPHS[player.id] ?? "牌"}</div>
      <span class="zjh-chips-bal">${formatChips(player.chips)}</span>
      <div class="zjh-mini-hand">${cardsHtml}${banner}</div>
    `;
    seatsEl.append(seat);
  });
}

function renderChips() {
  chipsEl.innerHTML = "";
  if (!state.pot) return;
  // 按真实底池拆成 5K / 2K / 1K，开局只有底注时只会看到 1K
  const stack = splitPotChips(state.pot).slice(0, 10);
  stack.forEach((denom, i) => {
    const chip = document.createElement("span");
    chip.className = `zjh-chip ${denom === 5000 ? "gold" : denom === 2000 ? "silver" : "bronze"}`;
    chip.textContent = denom === 5000 ? "5K" : denom === 2000 ? "2K" : "1K";
    chip.style.left = `${18 + (i % 4) * 16 + (i > 3 ? 8 : 0)}%`;
    chip.style.top = `${10 + Math.floor(i / 4) * 18 + (i % 3) * 4}px`;
    chipsEl.append(chip);
  });
}

/** 把底池金额拆成筹码面额；筹码少时全用 1K（与底注一致），多了再合并成 2K/5K */
function splitPotChips(pot) {
  let units = Math.floor(pot / 1000);
  if (units <= 0) return [];
  if (units <= 8) {
    return Array.from({ length: units }, () => 1000);
  }
  const chips = [];
  while (units >= 5) {
    chips.push(5000);
    units -= 5;
  }
  while (units >= 2) {
    chips.push(2000);
    units -= 2;
  }
  while (units >= 1) {
    chips.push(1000);
    units -= 1;
  }
  return chips;
}

function renderMyCards() {
  myCardsEl.innerHTML = "";
  if (!state) return;
  const me = state.players[0];
  const selecting =
    state.status === "selecting" &&
    state.selectPending &&
    ((state.selectPending.phase === "actor" && state.selectPending.actorId === 0) ||
      (state.selectPending.phase === "target" && state.selectPending.targetId === 0));

  me.hand.forEach((card) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const canSee = !me.isBlind || me.folded || state.status === "finished" || selecting;
    if (canSee) {
      btn.className = `zjh-my-card face ${card.color}`;
      btn.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${card.suitSymbol}</span>`;
      btn.setAttribute("aria-label", cardLabel(card));
    } else {
      btn.className = "zjh-my-card back";
      btn.setAttribute("aria-label", "牌背");
    }

    if (selecting && !fxPlaying) {
      if (selectedCardIds.includes(card.id)) btn.classList.add("selected");
      btn.addEventListener("click", () => toggleSelect(card.id));
    } else {
      btn.disabled = true;
    }
    myCardsEl.append(btn);
  });
}

function toggleSelect(cardId) {
  if (selectedCardIds.includes(cardId)) {
    selectedCardIds = selectedCardIds.filter((id) => id !== cardId);
  } else if (selectedCardIds.length < 3) {
    selectedCardIds = [...selectedCardIds, cardId];
  }
  render();
}

function renderBetSizer() {
  if (!state || !started) {
    betSizer.classList.add("hidden");
    return;
  }
  const humanTurn = state.status === "betting" && state.currentPlayerId === 0 && !fxPlaying && !aiTimer;
  const selecting = state.status === "selecting";
  betSizer.classList.toggle("hidden", !humanTurn || selecting);
  if (!humanTurn || selecting) return;

  syncSelectedPayAmount();
  const me = state.players[0];
  const minPay = minPayAmount(state, 0);
  const pay = selectedPayAmount || minPay;
  const unit = betUnit(state, 0);
  betSizerLabel.textContent = me.isBlind ? "闷牌出筹" : "看牌出筹";
  if (document.activeElement !== betAmountInput) {
    betAmountInput.value = String(pay);
  }
  betAmountInput.min = String(minPay || unit);
  betAmountInput.step = String(unit);
  betAmountInput.max = String(me.chips);
  betInputHint.textContent = me.isBlind
    ? `可输入金额，不少于 ${formatChips(minPay)}，按 ${formatChips(unit)} 对齐`
    : `看牌出筹可输入，不少于 ${formatChips(minPay)}，按 ${formatChips(unit)} 对齐`;

  const choices = betChoices(state, 0);
  betChips.innerHTML = "";
  choices.forEach((amount) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.pay = String(amount);
    btn.className = "zjh-chip-pick";
    if (amount === pay) btn.classList.add("is-selected");
    btn.textContent = formatChips(amount);
    if (amount === minPay) btn.title = me.isBlind ? "闷跟" : "跟注";
    else btn.title = me.isBlind ? "闷加" : "加注";
    betChips.append(btn);
  });

  betMinusButton.disabled = pay <= minPay;
  betPlusButton.disabled = pay + unit > me.chips;
}

function renderActions() {
  const busy = Boolean(aiTimer) || fxPlaying || !started || !state;
  const selecting =
    state?.status === "selecting" &&
    state.selectPending &&
    ((state.selectPending.phase === "actor" && state.selectPending.actorId === 0) ||
      (state.selectPending.phase === "target" && state.selectPending.targetId === 0));

  confirmSelectButton.classList.toggle("hidden", !selecting);
  confirmSelectButton.disabled = busy || selectedCardIds.length !== 3;
  confirmSelectButton.classList.toggle("is-ready", selectedCardIds.length === 3);

  const humanTurn = state?.status === "betting" && state.currentPlayerId === 0 && !busy;
  const me = state?.players[0];

  lookButton.disabled = !humanTurn || !canLook(state, 0);
  foldButton.disabled = !((humanTurn || selecting) && !fxPlaying) || !canFold(state, 0);
  callButton.disabled = !humanTurn || !canCall(state, 0);
  const targets = state ? compareTargets(state, 0) : [];
  compareButton.disabled = !humanTurn || !targets.length;

  lookButton.classList.toggle("is-ready", !lookButton.disabled);
  callButton.classList.toggle("is-ready", !callButton.disabled);
  compareButton.classList.toggle("is-ready", !compareButton.disabled);
  foldButton.classList.toggle("is-ready", !foldButton.disabled);

  if (state && me && humanTurn) {
    syncSelectedPayAmount();
    const minPay = minPayAmount(state, 0);
    const pay = selectedPayAmount || minPay;
    const kind = pay <= minPay ? (me.isBlind ? "闷跟" : "跟注") : me.isBlind ? "闷加" : "加注";
    callButton.textContent = `出筹码 · ${kind} ${formatChips(pay)}`;
  } else {
    callButton.textContent = "出筹码";
  }

  renderBetSizer();

  compareTargetsEl.classList.toggle("hidden", !pickingCompare || !targets.length || busy);
  compareTargetsEl.innerHTML = "";
  if (pickingCompare && !busy) {
    targets.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.targetId = String(id);
      btn.textContent = `与 ${state.players[id].name} 比牌`;
      compareTargetsEl.append(btn);
    });
  }

  [lookButton, compareButton].forEach((btn) => {
    btn.classList.toggle("hidden", Boolean(selecting));
  });
  // 出筹码按钮在金额面板内，选牌时随面板隐藏
}

function renderLog() {
  logEl.innerHTML = "";
  if (!state) return;
  state.log.slice(-40).forEach((entry) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${entry.type}</strong> ${entry.main}${entry.detail ? ` · ${entry.detail}` : ""}`;
    logEl.append(li);
  });
}

function renderVictory() {
  const finished = state?.status === "finished" && !fxPlaying;
  victoryScreen.classList.toggle("hidden", !finished);
  if (!finished) return;
  const winner = state.players[state.winnerId];
  victoryTitle.textContent = winner.id === 0 ? "你赢了！" : `${winner.name} 获胜`;
  const hand = winner.hand.length >= 3 ? evaluateHand(bestThree(winner.hand)) : null;
  victoryDetail.textContent = hand
    ? `${winner.name} 以「${handLabel(hand)}」取胜，当前筹码 ${formatChips(winner.chips)}`
    : `当前筹码 ${formatChips(winner.chips)}`;
}

function turnText() {
  if (!state) return "准备开始";
  if (fxPlaying) return "动作播放中…";
  if (state.status === "finished") return "本局结束";
  if (state.players[0]?.folded && state.status !== "finished") return "旁观中（已弃牌）";
  if (state.status === "selecting") return "比牌选牌中";
  const p = state.players[state.currentPlayerId];
  return p ? `轮到 ${p.name}` : "";
}

function hintText() {
  if (!state || !started) return "设置人数与张数后开始。";
  if (fxPlaying) return "请看桌上的下注 / 比牌动画。";
  if (state.status === "finished") return "可以再来一局，筹码会保留。";
  if (state.players[0]?.folded && state.status !== "finished") {
    return "你已弃牌，可旁观其余玩家的手牌。";
  }
  if (state.status === "selecting") {
    return `请点选 3 张牌用于比牌（已选 ${selectedCardIds.length}/3）`;
  }
  if (state.currentPlayerId !== 0) return "等待其他玩家行动…";
  if (state.roundCount <= 1) return "第一轮不能比牌。先选筹码大小再出筹，也可看牌或弃牌。";
  if (pickingCompare) return "选择要比牌的对手。看牌玩家不能主动比闷牌玩家。";
  const me = state.players[0];
  if (me.isBlind) return "输入或选择金额后，点下方金色「出筹码」按钮。";
  return "看牌出筹可输入金额，点下方金色「出筹码」确认；也可比牌或弃牌。";
}

function formatChips(n) {
  if (n >= 10000) {
    const wan = n / 10000;
    return Number.isInteger(wan) ? `${wan}万` : `${wan.toFixed(1)}万`;
  }
  return String(n);
}

state = createGame({ playerCount: 4, cardsPerPlayer: 3 });
started = false;
render();
setupScreen.classList.remove("hidden");
