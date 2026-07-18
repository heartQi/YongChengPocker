# PGame 纸牌馆

浏览器离线纸牌合集：**永城扑克**、**炸金花**。打开主页后选择要玩的游戏。

## Quick demo

Hosted playable demo（点开即玩，进入游戏主页）：

[Open PGame 纸牌馆 from GitHub Pages](https://heartqi.github.io/PGame/)

也可直达某一玩法：

- [永城扑克](https://heartqi.github.io/PGame/yongcheng.html)
- [炸金花](https://heartqi.github.io/PGame/zhajinhua.html)

Repository:

[Open the GitHub repository](https://github.com/heartQi/PGame)

Deployment reference:

[Latest GitHub Pages deployment](https://github.com/heartQi/PGame/actions/workflows/pages.yml)

This project is also optimized for a fast offline demo. No server, package install, account, or network connection is required after the repository is downloaded.

Direct local demo:

1. Open `index.html` in a modern desktop browser（游戏主页）.
2. Choose **永城扑克** or **炸金花** from the home screen.
3. For 永城扑克: click Start and play as 东 against local AI (default difficulty 困难).
4. For 炸金花: pick player count / 3 or 5 cards, then start.

Optional local server:

```bash
npm run serve
```

Then open:

```text
http://localhost:4173
```

## Project overview

永城扑克 is a browser-based, offline implementation of **永城八张**, a four-player Henan card game also known locally as **打八张**. The project was built for the AI-Native Development Challenge and is intentionally static: no server, account, matchmaking, database, or network dependency is required.

The playable UI is fully Chinese. The source and documentation are kept small enough to inspect, run, test, and iterate during an AI-native development workflow.

## Game description

The game uses a 54-card deck including big and small jokers. Four players sit in order as 东, 南, 西, and 北. 东/西 are partners, and 南/北 are partners. The human player controls 东, with 西 as the AI partner against 南 and 北.

Before opening hands are dealt, one random suited card is selected as the trump marker and inserted into the first 32 cards. Whoever receives that card becomes the first defender, and that card's suit is trump. Each player starts with eight cards.

Core play:

- The attacking side plays one card at a time against the defender.
- The defender must beat each attack card with a higher card in the same suit, any trump card against a non-trump attack, or a joker.
- Jokers can defend but cannot attack or be added during collection.
- Follow-up attacks are limited to ranks already visible on the table.
- During partner attacks, the main attacker decides first; the partner may attack after the main attacker passes, or immediately if the main attacker has no legal follow-up card.
- Each new attack round requires the main attacker to play at least one card before passing.
- Players draw back up to eight only after the current attack round fully ends.

Defense outcomes:

- If the defender succeeds, that defender becomes the next attacker.
- If the defender collects the table, the attacking side may add legal matching-rank cards for the defender to collect too.
- If defense fails, the attacking team keeps initiative and the attacker's partner continues against the next opponent.

Available AI difficulty levels:

- 简单: conservative AI for learning the rules.
- 较难: balanced AI and the default test mode.
- 困难: more aggressive AI that preserves stronger defensive cards.
- 超难: the most aggressive AI profile, with more pressure during follow-up attacks and collection.

## Screenshots

![永城扑克 active game table](docs/screenshot-game.png)

## Setup instructions

No package installation is required.

Requirements:

- A modern desktop browser.
- Node.js only if you want to run tests or use the included local static server script.

Run tests:

```bash
npm test
```

## Run instructions

Direct run:

1. Open `index.html` and pick a game.
2. **永城扑克** (`yongcheng.html`): Start → select cards → use table actions (出牌 / 收牌 / 放弃追加 / 防守成功).
3. **炸金花** (`zhajinhua.html`): set seats & card count → 闷跟 / 看牌 / 加注 / 比牌 / 弃牌.

Optional local server:

```bash
npm run serve
```

Then open:

```text
http://localhost:4173
```

Controls:

- Mouse / trackpad: select cards and click table action buttons.
- 出牌速度: choose 慢速, 中速, or 快速 for AI action pacing.
- 游戏规则: open the in-game rule summary.
- 重新开始: return to difficulty selection.

## WeChat Mini Program

A native WeChat Mini Program version is included in `miniprogram/`.

To preview it:

1. Open WeChat Developer Tools.
2. Import the `miniprogram/` folder as the project root.
3. Use a real AppID for publishing, or the tourist AppID for local preview.
4. Run the `pages/game/game` page.

## Project structure

```text
.
├── index.html              # 纸牌馆首页
├── yongcheng.html          # 永城扑克
├── zhajinhua.html          # 炸金花
├── src/
│   ├── home.css
│   ├── app.js / game.js / styles.css
│   └── zhajinhua/
├── tests/
│   ├── game.test.js
│   └── zhajinhua.test.js
└── miniprogram/            # 永城扑克小程序镜像
```
