import {
  ANTE,
  applyAiMove,
  bestThree,
  betUnit,
  canCall,
  canCompare,
  canFold,
  canLook,
  cardLabel,
  compareTargets,
  compareUnavailableReason,
  createGame,
  describeHand,
  fold,
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
/** 临时查看自己的牌面（不常驻） */
let peekingCards = false;
/** 第一次看牌后亮牌，直到出筹再收起 */
let peekUntilBet = false;
let peekHideTimer = null;

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
const jokerSelect = document.querySelector("#jokerSelect");
const startButton = document.querySelector("#startButton");
const seatsEl = document.querySelector("#seats");
const potAmountEl = document.querySelector("#potAmount");
const tableBetsEl = document.querySelector("#tableBets");
const potBadgeEl = document.querySelector("#potBadge");
const roundBadgeEl = document.querySelector("#roundBadge");
const stakeBadgeEl = document.querySelector("#stakeBadge");
const turnHintEl = document.querySelector("#turnHint");
const myMetaEl = document.querySelector("#myMeta");
const myCardsEl = document.querySelector("#myCards");
const hintEl = document.querySelector("#hint");
const compareTargetsEl = document.querySelector("#compareTargets");

const lookButton = document.querySelector("#lookButton");
const callButton = document.querySelector("#callButton");
const compareButton = document.querySelector("#compareButton");
const foldButton = document.querySelector("#foldButton");
const confirmSelectButton = document.querySelector("#confirmSelectButton");
const nextRoundButton = document.querySelector("#nextRoundButton");
const backSetupButton = document.querySelector("#backSetupButton");
const restartButtons = document.querySelectorAll(".js-restart");
const rulesButtons = document.querySelectorAll(".js-rules");
const rulesCloseButton = document.querySelector("#rulesCloseButton");
const victoryTitle = document.querySelector("#victoryTitle");
const victoryDetail = document.querySelector("#victoryDetail");
const betSizer = document.querySelector("#betSizer");
const betSizerLabel = document.querySelector("#betSizerLabel");
const betAmountInput = document.querySelector("#betAmountInput");
const betInputHint = document.querySelector("#betInputHint");
const betMinusButton = document.querySelector("#betMinusButton");
const betPlusButton = document.querySelector("#betPlusButton");

const AVATAR_GLYPHS = ["我", "强", "美", "周", "杰", "雨"];

function restartGame() {
  clearAiTimer();
  hideCompareOverlay();
  fxPlaying = false;
  if (started) {
    startGame({ keepChips: false });
  } else {
    setupScreen.classList.add("hidden");
    startGame({ keepChips: false });
  }
}

startButton.addEventListener("click", () => {
  startGame();
});

restartButtons.forEach((button) => {
  button.addEventListener("click", restartGame);
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

rulesButtons.forEach((button) => {
  button.addEventListener("click", () => rulesScreen.classList.remove("hidden"));
});
rulesCloseButton.addEventListener("click", () => rulesScreen.classList.add("hidden"));
rulesScreen.addEventListener("click", (e) => {
  if (e.target === rulesScreen) rulesScreen.classList.add("hidden");
});

lookButton.addEventListener("click", () => {
  if (!state || !started || fxPlaying) return;
  const me = state.players[0];
  if (!me?.hand?.length) return;

  // 尚未看牌：执行看牌规则，亮牌直到本次出筹
  if (canLook(state, 0) && canActNow()) {
    lookCards(state, 0);
    showPeekCards({ untilBet: true });
    afterHumanAction({ keepPeek: true });
    return;
  }

  // 已看过牌：每次点击临时查看 / 收起
  if (!me.isBlind) {
    if (peekingCards) {
      hidePeekCards();
    } else {
      showPeekCards({ untilBet: false });
    }
    render();
  }
});

function showPeekCards({ untilBet = false } = {}) {
  peekingCards = true;
  peekUntilBet = untilBet;
  clearPeekHideTimer();
  if (!untilBet) {
    peekHideTimer = setTimeout(() => {
      peekHideTimer = null;
      peekingCards = false;
      renderMyCards();
      renderActions();
    }, 2800);
  }
}

function hidePeekCards() {
  peekingCards = false;
  peekUntilBet = false;
  clearPeekHideTimer();
}

function clearPeekHideTimer() {
  if (peekHideTimer) {
    clearTimeout(peekHideTimer);
    peekHideTimer = null;
  }
}

callButton.addEventListener("click", () => {
  if (!canActNow() || !canCall(state, 0)) return;
  // 若输入框里刚改完还未失焦，先提交输入
  const typed = Number(betAmountInput.value);
  const raw = Number.isFinite(typed) ? typed : selectedPayAmount || minPayAmount(state, 0);
  const pay = normalizePayAmount(state, 0, raw);
  selectedPayAmount = pay;
  if (!placeBet(state, 0, pay)) return;
  // 出筹后收起第一次看牌亮出的牌面
  hidePeekCards();
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
  if (!targets.length) {
    hintEl.textContent = compareUnavailableReason(state, 0) || "当前不能比牌";
    return;
  }
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
  if (btn.dataset.cancel === "1") {
    pickingCompare = false;
    render();
    return;
  }
  if (!canCompare(state, 0, targetId)) return;
  pickingCompare = false;
  selectedCardIds = [];
  requestCompare(state, 0, targetId);
  afterHumanAction();
});

seatsEl.addEventListener("click", (event) => {
  if (!pickingCompare || !canActNow()) return;
  const seat = event.target.closest("[data-player-id]");
  if (!seat) return;
  const targetId = Number(seat.dataset.playerId);
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
  hidePeekCards();
  hideCompareOverlay();
  fxPlaying = false;
  const playerCount = Number(playerCountSelect.value);
  const cardsPerPlayer = Number(cardsSelect.value);
  state = createGame({
    playerCount,
    cardsPerPlayer,
    useJokers: jokerSelect.value === "on",
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
  const minPay = minPayAmount(state, 0);
  selectedPayAmount = normalizePayAmount(state, 0, selectedPayAmount || minPay);
  if (selectedPayAmount < minPay) selectedPayAmount = minPay;
}

async function afterHumanAction({ keepPeek = false } = {}) {
  pickingCompare = false;
  if (!keepPeek) hidePeekCards();
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
  const me = state.players[0];
  const humanInCompare = action.playerId === 0 || action.targetId === 0;
  const humanWasBlind =
    (action.playerId === 0 && action.actorWasBlind) ||
    (action.targetId === 0 && action.targetWasBlind);
  // 仍在局且未参与 → 不看牌；自己闷着比牌 → 也不看牌；看牌后比牌 / 已弃牌旁观 → 可看
  const canSeeCards =
    me.folded ||
    state.status === "finished" ||
    (humanInCompare && !humanWasBlind);

  compareEyebrow.textContent = humanWasBlind
    ? "闷牌比牌"
    : canSeeCards
      ? "比牌中"
      : "他人比牌";
  compareSideA.innerHTML = compareSideHtml(
    actor,
    action.actorCards,
    action.actorType,
    action.winnerId === actor.id,
    canSeeCards
  );
  compareSideB.innerHTML = compareSideHtml(
    target,
    action.targetCards,
    action.targetType,
    action.winnerId === target.id,
    canSeeCards
  );

  const loser = state.players[action.loserId];
  if (humanWasBlind) {
    compareResultText.textContent = action.continues
      ? `${winner.name} 胜，${loser.name} 淘汰（闷比不亮牌）`
      : `${winner.name} 赢得本局！${loser.name} 淘汰（闷比不亮牌）`;
  } else if (!canSeeCards) {
    compareResultText.textContent = action.continues
      ? `${winner.name} 胜，${loser.name} 淘汰（牌面保密）；你仍在局中`
      : `${winner.name} 赢得本局！${loser.name} 淘汰`;
  } else if (action.continues) {
    compareResultText.textContent = `${winner.name} 胜，${loser.name} 淘汰；继续与其他玩家对局`;
  } else {
    compareResultText.textContent = `${winner.name} 赢得本局！${loser.name} 淘汰`;
  }

  compareScreen.classList.remove("hidden");
  flashSeat(action.playerId, "is-compare");
  flashSeat(action.targetId, "is-compare");
  await wait(DELAY.compare);
}

function hideCompareOverlay() {
  compareScreen?.classList.add("hidden");
}

function compareSideHtml(player, cards, typeLabel, isWinner, revealCards = true) {
  const cardsHtml = revealCards
    ? (cards ?? [])
        .map((card) =>
          card.isJoker
            ? `<span class="zjh-compare-card joker ${card.color}"><strong>${card.rank}</strong><em>癞</em></span>`
            : `<span class="zjh-compare-card ${card.color}"><strong>${card.rank}</strong><em>${card.suitSymbol}</em></span>`
        )
        .join("")
    : `<span class="zjh-compare-card back"></span><span class="zjh-compare-card back"></span><span class="zjh-compare-card back"></span>`;

  return `
    <div class="zjh-compare-name ${isWinner ? "is-winner" : "is-loser"}">${player.name}${isWinner ? " · 胜" : " · 淘汰"}</div>
    <div class="zjh-compare-cards">${cardsHtml}</div>
    <div class="zjh-compare-type">${revealCards ? typeLabel ?? "" : "牌面保密"}</div>
  `;
}

function cardFaceHtml(card, sizeClass = "zjh-card-face") {
  if (card.isJoker) {
    return `<span class="${sizeClass} joker ${card.color}"><span>${card.rank}</span><span>癞</span></span>`;
  }
  return `<span class="${sizeClass} ${card.color}"><span>${card.rank}</span><span>${card.suitSymbol}</span></span>`;
}

function render() {
  if (!state) return;
  potBadgeEl.textContent = `总筹码：${formatChips(state.pot)}`;
  roundBadgeEl.textContent = `第 ${state.roundCount} 轮`;
  stakeBadgeEl.textContent = `闷注：${formatChips(state.blindCallLevel ?? state.callLevel)} / 看注：${formatChips(state.seenCallLevel ?? state.callLevel * 2)}`;
  potAmountEl.textContent = formatChips(state.pot);
  turnHintEl.textContent = turnText();
  renderSeats();
  renderTableBets();
  renderMyMeta();
  renderMyCards();
  renderActions();
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
    if (pickingCompare && canCompare(state, 0, player.id)) {
      seat.classList.add("is-compare-target");
    }

    // 自己与他人一样在座位上叠放牌背；看牌后牌面在底部显示
    let handBlock = "";
    if (player.id === 0) {
      const cardsHtml = player.hand
        .map((_, i) => `<span class="zjh-card-back" style="--i:${i}"></span>`)
        .join("");
      let status = "";
      if (player.folded) {
        status = player.eliminated
          ? `<span class="zjh-status-tag is-out">淘汰</span>`
          : `<span class="zjh-status-tag is-fold">弃牌</span>`;
      } else if (!player.isBlind) status = `<span class="zjh-status-tag is-look">已看牌</span>`;
      else status = `<span class="zjh-status-tag is-blind">闷牌中</span>`;
      handBlock = `<div class="zjh-mini-hand">${cardsHtml}</div><div class="zjh-seat-status">${status}</div>`;
    } else {
      const showFace = spectatorReveal;
      // 重叠摆放，张数一目了然（3/5 张都全显示）
      const cardsHtml = player.hand
        .map((card, i) => {
          const style = `style="--i:${i}"`;
          if (showFace) {
            if (card.isJoker) {
              return `<span class="zjh-card-face joker ${card.color}" ${style}><span>${card.rank}</span><span>癞</span></span>`;
            }
            return `<span class="zjh-card-face ${card.color}" ${style}><span>${card.rank}</span><span>${card.suitSymbol}</span></span>`;
          }
          return `<span class="zjh-card-back" ${style}></span>`;
        })
        .join("");
      let banner = "";
      if (player.folded) {
        banner = player.eliminated
          ? `<span class="zjh-hand-banner is-out">淘汰</span>`
          : `<span class="zjh-hand-banner is-fold">弃牌</span>`;
      } else if (!player.isBlind && !spectatorReveal) {
        banner = `<span class="zjh-hand-banner is-look">看牌</span>`;
      }
      handBlock = `<div class="zjh-mini-hand">${cardsHtml}${banner}</div>`;
    }

    seat.innerHTML = `
      <span class="zjh-name">${player.name}</span>
      <div class="zjh-avatar" aria-hidden="true">${AVATAR_GLYPHS[player.id] ?? "牌"}</div>
      <span class="zjh-chips-bal">${formatChips(player.chips)}</span>
      ${handBlock}
    `;
    seatsEl.append(seat);
  });
}

/** 座位上展示「最近一轮」该玩家出的筹：本轮进行中用 betThisRound，否则用上一轮记录 */
function seatRoundBetAmount(player) {
  const anyCurrentBet = state.players.some((p) => (p.betThisRound || 0) > 0);
  if (anyCurrentBet) return player.betThisRound || 0;
  return player.lastRoundBet || 0;
}

/** 在牌桌绿毡上，于各座位内侧摆放最近一轮出筹筹码 */
function renderTableBets() {
  if (!tableBetsEl) return;
  tableBetsEl.innerHTML = "";
  if (!state) return;
  const slots = seatSlots(state.playerCount);

  state.players.forEach((player, index) => {
    const amount = seatRoundBetAmount(player);
    if (amount <= 0) return;
    const slot = slots[index];
    const pile = document.createElement("div");
    pile.className = "zjh-table-bet";
    pile.dataset.slot = String(slot);
    pile.dataset.playerId = String(player.id);

    const stack = splitBetChips(amount).slice(0, 4);
    const chipsHtml = stack
      .map((denom, i) => {
        const tier = denom >= 5000 ? "gold" : denom >= 2000 ? "silver" : "bronze";
        const label = denom >= 5000 ? "5K" : denom >= 2000 ? "2K" : "1K";
        return `<span class="zjh-table-chip ${tier}" style="--i:${i}">${label}</span>`;
      })
      .join("");

    pile.innerHTML = `
      <div class="zjh-table-chip-stack" aria-hidden="true">${chipsHtml}</div>
      <span class="zjh-table-bet-amount">${formatChips(amount)}</span>
    `;
    tableBetsEl.append(pile);
  });
}

function splitBetChips(amount) {
  let units = Math.floor(amount / 1000);
  if (units <= 0) return [];
  if (units <= 4) return Array.from({ length: units }, () => 1000);
  const chips = [];
  while (units >= 5 && chips.length < 4) {
    chips.push(5000);
    units -= 5;
  }
  while (units >= 2 && chips.length < 4) {
    chips.push(2000);
    units -= 2;
  }
  while (units >= 1 && chips.length < 4) {
    chips.push(1000);
    units -= 1;
  }
  return chips;
}

function renderMyMeta() {
  if (!myMetaEl) return;
  myMetaEl.innerHTML = "";
  if (!state || !started) return;
  const me = state.players[0];
  // 剩余筹码已在座位显示，这里只补状态
  const tag = document.createElement("span");
  if (me.folded) {
    tag.className = `zjh-status-tag ${me.eliminated ? "is-out" : "is-fold"}`;
    tag.textContent = me.eliminated ? "淘汰" : "弃牌";
  } else if (!me.isBlind) {
    tag.className = "zjh-status-tag is-look";
    tag.textContent = "已看牌";
  } else {
    tag.className = "zjh-status-tag is-blind";
    tag.textContent = "闷牌中";
  }
  myMetaEl.append(tag);
}

function renderMyCards() {
  myCardsEl.innerHTML = "";
  if (!state || !started) {
    myCardsEl.classList.add("hidden");
    return;
  }
  const me = state.players[0];
  const selecting =
    state.status === "selecting" &&
    state.selectPending &&
    ((state.selectPending.phase === "actor" && state.selectPending.actorId === 0) ||
      (state.selectPending.phase === "target" && state.selectPending.targetId === 0));

  // 仅临时查看或选牌时显示；看牌后不常驻
  const showHand = selecting || peekingCards;
  myCardsEl.classList.toggle("hidden", !showHand);
  if (!showHand) return;

  me.hand.forEach((card) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `zjh-my-card face ${card.color}${card.isJoker ? " joker" : ""}`;
    btn.innerHTML = card.isJoker
      ? `<span class="rank">${card.rank}</span><span class="suit">癞</span>`
      : `<span class="rank">${card.rank}</span><span class="suit">${card.suitSymbol}</span>`;
    btn.setAttribute("aria-label", cardLabel(card));

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
  const canPeek = Boolean(me && !me.isBlind && me.hand?.length && state.status !== "finished");
  const canDoLook = humanTurn && canLook(state, 0);

  lookButton.disabled = busy || selecting || !(canDoLook || canPeek);
  lookButton.textContent = peekingCards && canPeek && !peekUntilBet ? "收起牌" : "看牌";
  foldButton.disabled = !((humanTurn || selecting) && !fxPlaying) || !canFold(state, 0);
  callButton.disabled = !humanTurn || !canCall(state, 0);
  const targets = state ? compareTargets(state, 0) : [];
  const compareReason =
    state && started && state.status === "betting" && state.currentPlayerId === 0 && !targets.length
      ? compareUnavailableReason(state, 0)
      : "";
  compareButton.disabled = !humanTurn || !targets.length;
  compareButton.title = compareButton.disabled
    ? compareReason || (!humanTurn ? "还没轮到你" : "当前不能比牌")
    : "选择一名对手比牌";
  if (!humanTurn) {
    compareButton.textContent = "比牌";
  } else if (!targets.length) {
    compareButton.textContent = shortCompareReason(compareReason);
  } else {
    compareButton.textContent = pickingCompare ? "选择对手中…" : "比牌";
  }

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
  if (pickingCompare && !busy && targets.length) {
    const title = document.createElement("p");
    title.className = "zjh-compare-pick-title";
    title.textContent = me?.isBlind
      ? "点选牌桌上的对手，或点下方按钮比牌"
      : "只能比已看牌对手：点选牌桌座位或下方按钮";
    compareTargetsEl.append(title);
    targets.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.targetId = String(id);
      btn.textContent = rival.name;
      compareTargetsEl.append(btn);
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.cancel = "1";
    cancel.className = "zjh-compare-cancel";
    cancel.textContent = "取消";
    compareTargetsEl.append(cancel);
  }

  [lookButton, compareButton].forEach((btn) => {
    btn.classList.toggle("hidden", Boolean(selecting));
  });
  // 出筹码按钮在金额面板内，选牌时随面板隐藏
}

function renderVictory() {
  const finished = state?.status === "finished" && !fxPlaying;
  victoryScreen.classList.toggle("hidden", !finished);
  if (!finished) return;
  const winner = state.players[state.winnerId];
  victoryTitle.textContent = winner.id === 0 ? "你赢了！" : `${winner.name} 获胜`;
  const handCards = winner.hand.length >= 3 ? bestThree(winner.hand) : null;
  victoryDetail.textContent = handCards
    ? `${winner.name} 以「${describeHand(handCards)}」取胜，当前筹码 ${formatChips(winner.chips)}`
    : `当前筹码 ${formatChips(winner.chips)}`;
}

function turnText() {
  if (!state) return "准备开始";
  if (fxPlaying) return "动作播放中…";
  if (state.status === "finished") return "本局结束";
  if (state.players[0]?.folded && state.status !== "finished") {
    return state.players[0].eliminated ? "旁观中（已淘汰）" : "旁观中（已弃牌）";
  }
  if (state.status === "selecting") return "比牌选牌中";
  const p = state.players[state.currentPlayerId];
  return p ? `轮到 ${p.name}` : "";
}

function hintText() {
  if (!state || !started) return "设置人数与张数后开始。";
  if (fxPlaying) return "请看桌上的下注 / 比牌动画。";
  if (state.status === "finished") return "可以再来一局，筹码会保留。";
  if (state.players[0]?.folded && state.status !== "finished") {
    return state.players[0].eliminated
      ? "你比牌失败被淘汰，可旁观其余玩家的手牌。"
      : "你已弃牌，可旁观其余玩家的手牌。";
  }
  if (state.status === "selecting") {
    return `请点选 3 张牌用于比牌（已选 ${selectedCardIds.length}/3）`;
  }
  if (state.currentPlayerId !== 0) return "等待其他玩家行动…";
  if (pickingCompare) {
    return state.players[0].isBlind
      ? "闷牌可与任意玩家比牌：请点牌桌座位或下方按钮。"
      : "看牌只能比已看牌玩家：请点带「看牌」标记的座位。";
  }
  const me = state.players[0];
  const targets = compareTargets(state, 0);
  if (!targets.length) {
    const reason = compareUnavailableReason(state, 0);
    if (reason) return reason;
  }
  if (me.isBlind) return "输入金额或用 −/+ 调整，再点「出筹码」。也可比牌或弃牌。";
  return "看牌可与已看牌玩家比牌。出筹、比牌或弃牌。";
}

function shortCompareReason(reason) {
  if (!reason) return "比牌";
  if (reason.includes("第一轮") || reason.includes("出过一次")) return "比牌·等全员出筹";
  if (reason.includes("都还在闷牌")) return "比牌·等对手看牌";
  if (reason.includes("筹码不足")) return "比牌·筹码不足";
  if (reason.includes("还没轮到")) return "比牌";
  return "比牌·暂不可用";
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
