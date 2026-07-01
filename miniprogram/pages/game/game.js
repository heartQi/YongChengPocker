const {
  applyAiMove,
  canAttackWith,
  canDefendWith,
  canPassAttack,
  canPlayerAttack,
  canTakeCards,
  cardLabel,
  completeDefense,
  createGame,
  DIFFICULTIES,
  advanceAttackTurnIfNoLegalCards,
  getSuit,
  hasLegalAttackCard,
  passAttack,
  playAttack,
  playDefense,
  takeCards: takeTableCards
} = require("../../utils/game");

const DEFAULT_DIFFICULTY = "hard";
const AI_DELAY_MS = 900;

Page({
  data: {
    started: false,
    difficultyOptions: [
      { value: "easy", label: "简单" },
      { value: "normal", label: "较难" },
      { value: "hard", label: "困难" },
      { value: "expert", label: "超难" }
    ],
    difficultyIndex: 2,
    difficultyLabel: "困难",
    trumpText: "-",
    stockCount: 0,
    players: [],
    battle: [],
    hand: [],
    logs: [],
    statusText: "点击 Start 开始",
    hint: "点击 Start 直接开始困难难度。",
    passLabel: "放弃追加",
    playLabel: "出牌",
    showPass: false,
    showTake: false,
    showPlay: false,
    passReady: false,
    takeReady: false,
    playReady: false,
    passDisabled: true,
    takeDisabled: true,
    playDisabled: true,
    passSide: "left",
    logOpen: false,
    rulesOpen: false,
    victoryOpen: false,
    victoryTitle: "",
    victoryDetail: ""
  },

  onLoad() {
    this.selectedDifficulty = null;
    this.pendingDifficulty = DEFAULT_DIFFICULTY;
    this.state = createGame(Math.random, this.pendingDifficulty);
    this.selectedCardId = null;
    this.aiTimer = null;
    this.render();
  },

  onUnload() {
    this.clearAiTimer();
  },

  startGame() {
    this.startNewGame(this.pendingDifficulty);
  },

  restart() {
    this.clearAiTimer();
    this.selectedDifficulty = null;
    this.selectedCardId = null;
    this.setData({ started: false, victoryOpen: false });
    this.render();
  },

  nextRound() {
    this.clearAiTimer();
    this.state = createGame(Math.random, this.selectedDifficulty || this.pendingDifficulty);
    this.selectedDifficulty = this.state.difficulty;
    this.pendingDifficulty = this.state.difficulty;
    this.selectedCardId = null;
    this.setData({ started: true, victoryOpen: false });
    this.render();
    this.scheduleAiStep();
  },

  changeDifficulty(event) {
    const index = Number(event.detail.value);
    const option = this.data.difficultyOptions[index];
    this.pendingDifficulty = option.value;
    this.setData({ difficultyIndex: index, difficultyLabel: option.label });
    if (!this.selectedDifficulty) {
      this.state = createGame(Math.random, this.pendingDifficulty);
      this.render();
      return;
    }
    this.clearAiTimer();
    this.startNewGame(this.pendingDifficulty);
  },

  selectCard(event) {
    if (!this.selectedDifficulty) return;
    const cardId = event.currentTarget.dataset.id;
    const card = this.state.players[0].hand.find((item) => item.id === cardId);
    if (!card || !this.isHumanCardLegal(card)) return;
    this.selectedCardId = this.selectedCardId === cardId ? null : cardId;
    this.render();
  },

  playSelected() {
    const card = this.selectedCard();
    if (!card || !this.isHumanCardLegal(card)) return;
    if ((this.state.status === "attacking" || this.state.status === "collecting") && canAttackWith(this.state, 0, card)) {
      playAttack(this.state, 0, card.id);
    } else if (this.state.status === "defending" && canDefendWith(this.state, 0, card)) {
      playDefense(this.state, 0, card.id);
    }
    this.selectedCardId = null;
    this.render();
    this.scheduleAiStep();
  },

  passAction() {
    this.selectedCardId = null;
    if (this.state.status === "defense-choice" && this.state.defenderId === 0) {
      completeDefense(this.state);
      this.render();
      this.scheduleAiStep();
      return;
    }
    if (passAttack(this.state, 0)) {
      this.render();
      this.scheduleAiStep();
    }
  },

  takeCards() {
    this.selectedCardId = null;
    if (takeTableCards(this.state, 0)) {
      this.render();
      this.scheduleAiStep();
    }
  },

  toggleLog() {
    this.setData({ logOpen: !this.data.logOpen });
  },

  toggleRules() {
    this.setData({ rulesOpen: !this.data.rulesOpen });
  },

  noop() {},

  startNewGame(difficulty) {
    this.selectedDifficulty = difficulty;
    this.pendingDifficulty = difficulty;
    this.state = createGame(Math.random, difficulty);
    this.selectedCardId = null;
    const difficultyIndex = this.data.difficultyOptions.findIndex((option) => option.value === difficulty);
    this.setData({
      started: true,
      difficultyIndex,
      difficultyLabel: this.data.difficultyOptions[difficultyIndex].label,
      victoryOpen: false
    });
    this.render();
    this.scheduleAiStep();
  },

  render() {
    const trump = getSuit(this.state.trumpSuit);
    const canConfirmDefense = this.state.status === "defense-choice" && this.state.defenderId === 0;
    const canTake = canTakeCards(this.state, 0);
    const canPassOrConfirm = canConfirmDefense || canPassAttack(this.state, 0);
    const selected = this.selectedCard();
    const canPlaySelectedCard = Boolean(selected && this.isHumanCardLegal(selected));
    const shouldPromptPlayCard = this.shouldPromptForPlayableCard();
    const winner = this.state.winnerId === null ? null : this.state.players[this.state.winnerId];
    const isFinished = this.state.status === "finished" && winner;

    this.setData({
      trumpText: `${trump.symbol} ${trump.label}`,
      stockCount: this.state.stock.length,
      players: this.playerView(),
      battle: this.battleView(),
      hand: this.handView(),
      logs: this.state.log,
      statusText: this.currentTurnText(),
      hint: this.hintText(),
      passLabel: canConfirmDefense ? "防守成功" : this.state.status === "collecting" ? "不给牌" : "放弃追加",
      playLabel: shouldPromptPlayCard ? "请出牌" : "出牌",
      showPass: Boolean(canPassOrConfirm && this.selectedDifficulty && !isFinished),
      showTake: Boolean(canTake && this.selectedDifficulty && !isFinished),
      showPlay: Boolean(!canConfirmDefense && this.selectedDifficulty && !isFinished),
      passReady: Boolean(canPassOrConfirm),
      takeReady: Boolean(canTake),
      playReady: Boolean(canPlaySelectedCard || shouldPromptPlayCard),
      passDisabled: !canPassOrConfirm,
      takeDisabled: !canTake,
      playDisabled: !canPlaySelectedCard && !shouldPromptPlayCard,
      passSide: canConfirmDefense ? "right" : "left",
      victoryOpen: Boolean(isFinished),
      victoryTitle: isFinished ? `${this.shortPlayerName(winner)} 玩家胜利` : "",
      victoryDetail: isFinished ? `${winner.name} 先出完手牌` : ""
    });
  },

  playerView() {
    return this.state.players.map((player) => {
      const roleClass = [
        player.id === this.state.attackerId ? "attacker" : "",
        player.id === this.state.defenderId ? "defender" : "",
        player.id === 0 ? "human" : ""
      ]
        .filter(Boolean)
        .join(" ");
      return {
        id: player.id,
        name: player.name,
        shortName: this.shortPlayerName(player),
        handCount: player.hand.length,
        roleClass
      };
    });
  },

  battleView() {
    return this.state.battle.map((pair) => ({
      attack: this.cardView(pair.attack),
      defense: pair.defense ? this.cardView(pair.defense) : null,
      attackCaption: `${this.shortPlayerName(this.state.players[pair.attackerId])} ${pair.attackType === "give" ? "给牌" : "进攻"}`,
      defenseCaption: pair.defense ? `${this.shortPlayerName(this.state.players[pair.defenderId || this.state.defenderId])} 防守` : ""
    }));
  },

  handView() {
    return [...this.state.players[0].hand]
      .sort((a, b) => {
        const aIsTrump = a.suit === this.state.trumpSuit || a.isJoker;
        const bIsTrump = b.suit === this.state.trumpSuit || b.isJoker;
        if (aIsTrump !== bIsTrump) return aIsTrump ? 1 : -1;
        return a.rankValue - b.rankValue || a.suit.localeCompare(b.suit);
      })
      .map((card) => ({
        ...this.cardView(card),
        isSelected: card.id === this.selectedCardId,
        disabled: !this.isHumanCardLegal(card),
        caption: card.isJoker ? "防守" : card.suit === this.state.trumpSuit ? "主牌" : ""
      }));
  },

  cardView(card) {
    return {
      ...card,
      isTrump: card.suit === this.state.trumpSuit || card.isJoker,
      label: cardLabel(card)
    };
  },

  selectedCard() {
    return this.state.players[0].hand.find((card) => card.id === this.selectedCardId) || null;
  },

  isHumanCardLegal(card) {
    if (!this.selectedDifficulty) return false;
    if (this.state.winnerTeam !== null) return false;
    if (this.state.status === "defending") return canDefendWith(this.state, 0, card);
    if (this.state.status === "attacking" || this.state.status === "collecting") return canAttackWith(this.state, 0, card);
    return false;
  },

  shouldPromptForPlayableCard() {
    const canPromptAttack =
      this.selectedDifficulty &&
      (this.state.status === "attacking" || this.state.status === "collecting") &&
      canPlayerAttack(this.state, 0) &&
      hasLegalAttackCard(this.state, 0) &&
      !this.selectedCard();
    const canPromptDefense =
      this.selectedDifficulty &&
      this.state.status === "defending" &&
      this.state.defenderId === 0 &&
      this.state.players[0].hand.some((card) => canDefendWith(this.state, 0, card)) &&
      !this.selectedCard();
    return canPromptAttack || canPromptDefense;
  },

  scheduleAiStep() {
    this.clearAiTimer();
    advanceAttackTurnIfNoLegalCards(this.state);
    this.render();
    if (this.state.status === "finished" || this.needsHumanInput()) return;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      const actorId = this.nextAiActor();
      if (actorId !== null) {
        const changed = applyAiMove(this.state, actorId);
        this.render();
        if (changed) this.scheduleAiStep();
      }
    }, AI_DELAY_MS);
  },

  clearAiTimer() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = null;
  },

  needsHumanInput() {
    if (!this.selectedDifficulty) return true;
    if (this.state.status === "defense-choice" && this.state.defenderId === 0) return true;
    if (this.state.status === "defending" && this.state.defenderId === 0) return true;
    return ["attacking", "collecting"].includes(this.state.status) && canPlayerAttack(this.state, 0) && hasLegalAttackCard(this.state, 0);
  },

  nextAiActor() {
    if (this.state.status === "defending" && this.state.defenderId !== 0) return this.state.defenderId;
    if (["attacking", "collecting"].includes(this.state.status) && this.state.attackTurnId !== 0) return this.state.attackTurnId;
    return null;
  },

  currentTurnText() {
    if (this.state.status === "finished") return `胜方：${this.state.winnerTeam === 0 ? "东/西" : "南/北"} 阵营`;
    if (!this.selectedDifficulty) return "点击 Start 开始";
    if (this.state.status === "defense-choice") return "防守成功待确认";
    if (this.state.status === "collecting") return "收牌追加中";
    if (this.state.status === "defending") return "防守中";
    return "进攻中";
  },

  hintText() {
    if (!this.selectedDifficulty) return "点击 Start 直接开始困难难度。";
    if (this.state.status === "finished") return "点击重新开始再来一局。";
    if (this.state.status === "defense-choice" && this.state.defenderId === 0) {
      return "你已防守成功。点“防守成功”确认并进攻下家；点“收牌”则按防守失败处理。";
    }
    if (this.state.status === "collecting" && canPlayerAttack(this.state, 0)) {
      return "防守方准备收牌。可给同点数牌，也可以点“不给牌”。";
    }
    if (this.state.status === "defending" && this.state.defenderId === 0) return "先选择可防守的牌，再点“出牌”。压不住时可收牌。";
    if (this.state.status === "attacking" && canPlayerAttack(this.state, 0)) return "先选牌，再点“出牌”；也可以放弃追加。";
    return "电脑玩家正在行动。";
  },

  shortPlayerName(player) {
    return player && player.name ? player.name.split(" / ")[0] : "";
  }
});
