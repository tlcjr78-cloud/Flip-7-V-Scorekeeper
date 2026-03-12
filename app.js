const STORAGE_KEYS = {
  players: "flipv_players",
  games: "flipv_games",
};

// Flip 7: With a Vengeance scoring model
// - Number cards: 0, 1–13 (face value)
// - Modifier cards: ÷2, -2, -4, -6, -8, -10
// - Flip 7 bonus: +15
const FLIP7_NUMBER_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const FLIP7_NEGATIVE_MODIFIERS = [2, 4, 6, 8, 10];

function loadFromStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const state = {
  players: [],
  games: [],
  currentGame: null,
  cardPicker: {
    roundId: null,
    playerId: null,
    selectedNumbers: new Set(),
    divideByTwo: false,
    negativeModifiers: new Set(),
    flip7Bonus: false,
  },
};

const els = {};

function cacheElements() {
  Object.assign(els, {
    newGameButton: document.getElementById("newGameButton"),
    resetAllButton: document.getElementById("resetAllButton"),
    currentGameStatus: document.getElementById("currentGameStatus"),
    availablePlayers: document.getElementById("availablePlayers"),
    addRoundButton: document.getElementById("addRoundButton"),
    endGameButton: document.getElementById("endGameButton"),
    roundsContainer: document.getElementById("roundsContainer"),
    totalsSection: document.getElementById("totalsSection"),
    totalsContainer: document.getElementById("totalsContainer"),
    gameControls: document.getElementById("gameControls"),
    addPlayerForm: document.getElementById("addPlayerForm"),
    playerNameInput: document.getElementById("playerNameInput"),
    playersList: document.getElementById("playersList"),
    gamesHistoryPanel: document.getElementById("gamesHistory"),
    leaderboardPanel: document.getElementById("leaderboard"),
    tabs: document.querySelectorAll(".tab"),
    overlay: document.getElementById("cardPickerOverlay"),
    overlayTitle: document.getElementById("cardPickerTitle"),
    closeCardPicker: document.getElementById("closeCardPicker"),
    cardGrid: document.getElementById("cardGrid"),
    selectedCardsList: document.getElementById("selectedCardsList"),
    selectedCardsTotal: document.getElementById("selectedCardsTotal"),
    clearCardSelection: document.getElementById("clearCardSelection"),
    applyCardSelection: document.getElementById("applyCardSelection"),
    toastContainer: document.getElementById("toastContainer"),
    gameSetup: document.getElementById("gameSetup"),
  });
}

function showToast(message, duration = 1600) {
  const template = document.getElementById("toastTemplate");
  if (!template) return;
  const nodes = template.content.cloneNode(true);
  const toastEl = nodes.querySelector(".toast");
  const msgEl = nodes.querySelector(".toast-message");
  if (!toastEl || !msgEl) return;
  msgEl.textContent = message;
  els.toastContainer.appendChild(toastEl);
  setTimeout(() => {
    toastEl.classList.add("fade-out");
    toastEl.addEventListener("transitionend", () => toastEl.remove(), {
      once: true,
    });
  }, duration);
}

function loadInitialState() {
  state.players = loadFromStorage(STORAGE_KEYS.players, []);
  state.games = loadFromStorage(STORAGE_KEYS.games, []);
}

function persistPlayers() {
  saveToStorage(STORAGE_KEYS.players, state.players);
}

function persistGames() {
  saveToStorage(STORAGE_KEYS.games, state.games);
}

function sortPlayersByName(players) {
  return [...players].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function getPlayerById(id) {
  return state.players.find((p) => p.id === id) || null;
}

function computeRoundTotals(currentGame) {
  const totals = {};
  for (const pid of currentGame.playerIds) {
    totals[pid] = 0;
  }
  for (const round of currentGame.rounds) {
    for (const pid of currentGame.playerIds) {
      const entry = round.scores[pid];
      if (!entry) continue;
      const numeric = Number(entry.value);
      if (!Number.isFinite(numeric)) continue;
      totals[pid] += numeric;
    }
  }
  return totals;
}

function findWinners(totals) {
  const entries = Object.entries(totals);
  if (!entries.length) return [];
  let max = -Infinity;
  for (const [, value] of entries) {
    if (value > max) max = value;
  }
  return entries.filter(([, value]) => value === max).map(([pid]) => pid);
}

function renderPlayersList() {
  const { playersList } = els;
  playersList.innerHTML = "";
  if (!state.players.length) {
    const p = document.createElement("p");
    p.className = "hint small";
    p.textContent = "No players yet. Add your regulars so you can reuse them.";
    playersList.appendChild(p);
    return;
  }

  const sorted = sortPlayersByName(state.players);
  for (const player of sorted) {
    const row = document.createElement("div");
    row.className = "player-row";

    const main = document.createElement("div");
    main.className = "player-main";

    const avatar = document.createElement("div");
    avatar.className = "player-avatar";
    avatar.textContent = player.name.charAt(0).toUpperCase();

    const textBox = document.createElement("div");
    const nameSpan = document.createElement("div");
    nameSpan.className = "player-name";
    nameSpan.textContent = player.name;

    const meta = document.createElement("div");
    meta.className = "player-meta";
    const wins = player.totalWins || 0;
    const games = player.totalGames || 0;
    meta.textContent =
      games > 0 ? `${wins} win${wins === 1 ? "" : "s"} • ${games} game${games === 1 ? "" : "s"}` : "No games yet";

    textBox.appendChild(nameSpan);
    textBox.appendChild(meta);

    main.appendChild(avatar);
    main.appendChild(textBox);

    const actions = document.createElement("div");
    actions.className = "player-actions";

    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.className = "btn small subtle";
    useBtn.textContent = "Use";
    useBtn.addEventListener("click", () => {
      ensureGameExists();
      togglePlayerInCurrentGame(player.id);
      render();
      showToast(`Added ${player.name} to this game`);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-button danger";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Remove player";
    deleteBtn.addEventListener("click", () => {
      if (
        window.confirm(
          `Remove "${player.name}"? This will not delete past games they took part in.`
        )
      ) {
        deletePlayer(player.id);
      }
    });

    actions.appendChild(useBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(main);
    row.appendChild(actions);

    playersList.appendChild(row);
  }
}

function deletePlayer(id) {
  state.players = state.players.filter((p) => p.id !== id);
  persistPlayers();
  if (state.currentGame) {
    state.currentGame.playerIds = state.currentGame.playerIds.filter(
      (pid) => pid !== id
    );
    for (const round of state.currentGame.rounds) {
      delete round.scores[id];
    }
  }
  render();
  showToast("Player removed");
}

function renderAvailablePlayers() {
  const { availablePlayers } = els;
  availablePlayers.innerHTML = "";
  if (!state.players.length) {
    const p = document.createElement("p");
    p.className = "hint small";
    p.textContent = "Add players on the right to start building your table.";
    availablePlayers.appendChild(p);
    return;
  }

  const game = state.currentGame;
  const selectedSet = new Set(game ? game.playerIds : []);

  for (const player of sortPlayersByName(state.players)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-pill";
    if (selectedSet.has(player.id)) chip.classList.add("selected");
    chip.dataset.playerId = player.id;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = player.name;

    const badge = document.createElement("span");
    badge.className = "badge";
    const wins = player.totalWins || 0;
    const games = player.totalGames || 0;
    badge.textContent =
      games > 0 ? `${wins} W • ${games} G` : "No games yet";

    chip.appendChild(nameSpan);
    chip.appendChild(badge);

    chip.addEventListener("click", () => {
      ensureGameExists();
      togglePlayerInCurrentGame(player.id);
      render();
    });

    availablePlayers.appendChild(chip);
  }
}

function ensureGameExists() {
  if (!state.currentGame) {
    state.currentGame = {
      id: uid(),
      startedAt: new Date().toISOString(),
      playerIds: [],
      rounds: [],
    };
  }
}

function togglePlayerInCurrentGame(playerId) {
  ensureGameExists();
  const playerIds = state.currentGame.playerIds;
  const idx = playerIds.indexOf(playerId);
  if (idx === -1) {
    playerIds.push(playerId);
  } else {
    playerIds.splice(idx, 1);
  }
}

function createRound() {
  const game = state.currentGame;
  if (!game || !game.playerIds.length) return;
  const roundNumber = game.rounds.length + 1;
  const round = {
    id: uid(),
    number: roundNumber,
    scores: {},
  };
  game.rounds.push(round);
}

function deleteRound(roundId) {
  if (!state.currentGame) return;
  state.currentGame.rounds = state.currentGame.rounds.filter(
    (r) => r.id !== roundId
  );
  state.currentGame.rounds.forEach((r, i) => {
    r.number = i + 1;
  });
}

function setScore(roundId, playerId, mode, value, cards) {
  const game = state.currentGame;
  if (!game) return;
  const round = game.rounds.find((r) => r.id === roundId);
  if (!round) return;
  if (!round.scores[playerId]) {
    round.scores[playerId] = { mode, value, cards: cards || [] };
  } else {
    round.scores[playerId].mode = mode;
    round.scores[playerId].value = value;
    round.scores[playerId].cards = cards || [];
  }
}

function renderRounds() {
  const { roundsContainer, gameControls, totalsSection } = els;
  const game = state.currentGame;

  if (!game || !game.playerIds.length) {
    gameControls.classList.add("hidden");
    totalsSection.classList.add("hidden");
    roundsContainer.innerHTML = "";
    return;
  }

  gameControls.classList.remove("hidden");

  if (!game.rounds.length) {
    roundsContainer.innerHTML = `<div class="panel-section"><p class="hint small">Add your first round to start tracking scores.</p></div>`;
    totalsSection.classList.add("hidden");
    return;
  }

  const table = document.createElement("table");
  table.className = "rounds-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const thRound = document.createElement("th");
  thRound.textContent = "Round";
  headerRow.appendChild(thRound);

  for (const pid of game.playerIds) {
    const th = document.createElement("th");
    const player = getPlayerById(pid);
    th.textContent = player ? player.name : "Unknown";
    headerRow.appendChild(th);
  }

  const thDelete = document.createElement("th");
  thDelete.textContent = "";
  headerRow.appendChild(thDelete);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const round of game.rounds) {
    const tr = document.createElement("tr");
    const tdRound = document.createElement("td");
    tdRound.className = "round-label";
    tdRound.textContent = `#${round.number}`;
    tr.appendChild(tdRound);

    for (const pid of game.playerIds) {
      const td = document.createElement("td");
      const scoreCell = document.createElement("div");
      scoreCell.className = "score-cell";

      const entry = round.scores[pid] || { mode: "manual", value: "" };
      const mode = entry.mode || "manual";

      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.className = "score-input";
      input.value =
        entry.value !== undefined && entry.value !== null ? entry.value : "";
      input.placeholder = mode === "manual" ? "Score" : "Total";
      input.addEventListener("input", () => {
        const value = input.value === "" ? "" : Number(input.value);
        setScore(round.id, pid, mode, value, entry.cards || []);
        renderTotals();
      });

      const toggle = document.createElement("div");
      toggle.className = "score-mode-toggle";

      const manualBtn = document.createElement("button");
      manualBtn.type = "button";
      manualBtn.className = "score-mode-option manual";
      manualBtn.textContent = "Manual";

      const cardsBtn = document.createElement("button");
      cardsBtn.type = "button";
      cardsBtn.className = "score-mode-option cards";
      cardsBtn.textContent = "Cards";

      if (mode === "manual") {
        manualBtn.classList.add("active");
      } else {
        cardsBtn.classList.add("active");
      }

      manualBtn.addEventListener("click", () => {
        setScore(round.id, pid, "manual", entry.value || "", []);
        render();
      });

      cardsBtn.addEventListener("click", () => {
        setScore(round.id, pid, "cards", entry.value || "", entry.cards || []);
        openCardPicker(round.id, pid);
      });

      toggle.appendChild(manualBtn);
      toggle.appendChild(cardsBtn);

      const cardBtn = document.createElement("button");
      cardBtn.type = "button";
      cardBtn.className = "open-card-picker";
      cardBtn.innerHTML = `<span>🃏</span><span>Pick</span>`;
      cardBtn.addEventListener("click", () =>
        openCardPicker(round.id, pid)
      );

      const cardIndicator = document.createElement("span");
      cardIndicator.className = "card-mode-indicator";
      cardIndicator.title = "Card-based score";
      if (mode !== "cards") {
        cardIndicator.style.opacity = "0.2";
      }

      scoreCell.appendChild(input);
      scoreCell.appendChild(toggle);
      scoreCell.appendChild(cardBtn);
      scoreCell.appendChild(cardIndicator);

      td.appendChild(scoreCell);
      tr.appendChild(td);
    }

    const tdDelete = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-button";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Remove round";
    deleteBtn.addEventListener("click", () => {
      deleteRound(round.id);
      render();
    });
    tdDelete.appendChild(deleteBtn);
    tr.appendChild(tdDelete);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  roundsContainer.innerHTML = "";
  roundsContainer.appendChild(table);

  renderTotals();
}

function renderTotals() {
  const { totalsSection, totalsContainer } = els;
  const game = state.currentGame;
  if (!game || !game.playerIds.length || !game.rounds.length) {
    totalsSection.classList.add("hidden");
    return;
  }

  const totals = computeRoundTotals(game);
  const winners = findWinners(totals);

  totalsContainer.innerHTML = "";
  for (const pid of game.playerIds) {
    const player = getPlayerById(pid);
    const card = document.createElement("div");
    card.className = "total-card";
    if (winners.includes(pid)) {
      card.classList.add("winner");
    }

    const name = document.createElement("div");
    name.className = "total-name";
    name.textContent = player ? player.name : "Unknown";

    const score = document.createElement("div");
    score.className = "total-score";
    score.textContent = totals[pid] ?? 0;

    const label = document.createElement("div");
    label.className = "total-label";
    label.textContent = winners.includes(pid)
      ? "Leading"
      : "Total points";

    card.appendChild(name);
    card.appendChild(score);
    card.appendChild(label);
    totalsContainer.appendChild(card);
  }

  totalsSection.classList.remove("hidden");
}

function renderGamesHistory() {
  const { gamesHistoryPanel } = els;
  gamesHistoryPanel.innerHTML = "";

  if (!state.games.length) {
    const p = document.createElement("p");
    p.className = "hint small";
    p.textContent =
      "Finished games will appear here with winners and final scores.";
    gamesHistoryPanel.appendChild(p);
    return;
  }

  const list = document.createElement("div");
  list.className = "games-list";

  const sorted = [...state.games].sort(
    (a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)
  );

  for (const game of sorted) {
    const card = document.createElement("div");
    card.className = "game-card";

    const header = document.createElement("div");
    header.className = "game-card-header";

    const date = document.createElement("span");
    date.textContent = new Date(game.finishedAt).toLocaleString();

    const rounds = document.createElement("span");
    rounds.textContent = `${game.rounds.length} round${
      game.rounds.length === 1 ? "" : "s"
    }`;

    header.appendChild(date);
    header.appendChild(rounds);

    const winnersLine = document.createElement("div");
    winnersLine.className = "game-card-winners";
    const winnerNames = game.winnerIds
      .map((id) => getPlayerById(id)?.name || "Unknown")
      .join(", ");
    winnersLine.textContent = `Winner${
      game.winnerIds.length > 1 ? "s" : ""
    }: ${winnerNames}`;

    const totalsLine = document.createElement("div");
    totalsLine.className = "hint small";
    const totalsParts = [];
    for (const [pid, score] of Object.entries(game.totals)) {
      const name = getPlayerById(pid)?.name || "Unknown";
      totalsParts.push(`${name} ${score}`);
    }
    totalsLine.textContent = totalsParts.join(" • ");

    card.appendChild(header);
    card.appendChild(winnersLine);
    card.appendChild(totalsLine);

    list.appendChild(card);
  }

  gamesHistoryPanel.appendChild(list);
}

function renderLeaderboard() {
  const { leaderboardPanel } = els;
  leaderboardPanel.innerHTML = "";

  if (!state.players.length) {
    const p = document.createElement("p");
    p.className = "hint small";
    p.textContent = "No players yet. Add players to see a leaderboard.";
    leaderboardPanel.appendChild(p);
    return;
  }

  const list = document.createElement("div");
  list.className = "leaderboard-list";

  const ordered = [...state.players].sort((a, b) => {
    const aw = a.totalWins || 0;
    const bw = b.totalWins || 0;
    if (bw !== aw) return bw - aw;
    const ag = a.totalGames || 0;
    const bg = b.totalGames || 0;
    if (bg !== ag) return bg - ag;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  ordered.forEach((player, idx) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `#${idx + 1}`;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = player.name;

    left.appendChild(rank);
    left.appendChild(name);

    const stats = document.createElement("span");
    stats.className = "stats";
    const wins = player.totalWins || 0;
    const games = player.totalGames || 0;
    stats.textContent = `${wins} win${wins === 1 ? "" : "s"} • ${
      games
    } game${games === 1 ? "" : "s"}`;

    row.appendChild(left);
    row.appendChild(stats);
    list.appendChild(row);
  });

  leaderboardPanel.appendChild(list);
}

function openCardPicker(roundId, playerId) {
  const game = state.currentGame;
  if (!game) return;
  const round = game.rounds.find((r) => r.id === roundId);
  if (!round) return;
  const entry = round.scores[playerId] || { mode: "cards", value: 0, cards: [] };
  state.cardPicker.roundId = roundId;
  state.cardPicker.playerId = playerId;

  // Restore previous selection based on stored numeric summary if available
  state.cardPicker.selectedNumbers = new Set(entry.selectedNumbers || []);
  state.cardPicker.divideByTwo = !!entry.divideByTwo;
  state.cardPicker.negativeModifiers = new Set(entry.negativeModifiers || []);
  state.cardPicker.flip7Bonus = !!entry.flip7Bonus;

  const player = getPlayerById(playerId);
  els.overlayTitle.textContent = player
    ? `Cards for ${player.name} – Round ${round.number}`
    : `Pick cards – Round ${round.number}`;

  renderCardGrid();
  renderCardPickerSummary();

  els.overlay.classList.remove("hidden");
  els.overlay.setAttribute("aria-hidden", "false");
}

function closeCardPicker() {
  els.overlay.classList.add("hidden");
  els.overlay.setAttribute("aria-hidden", "true");
  state.cardPicker.roundId = null;
  state.cardPicker.playerId = null;
  state.cardPicker.selectedNumbers = new Set();
  state.cardPicker.divideByTwo = false;
  state.cardPicker.negativeModifiers = new Set();
  state.cardPicker.flip7Bonus = false;
}

function toggleNumberSelection(value) {
  const set = state.cardPicker.selectedNumbers;
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
  renderCardGrid();
  renderCardPickerSummary();
}

function toggleDivideByTwo() {
  state.cardPicker.divideByTwo = !state.cardPicker.divideByTwo;
  renderCardGrid();
  renderCardPickerSummary();
}

function toggleNegativeModifier(value) {
  const set = state.cardPicker.negativeModifiers;
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
  renderCardGrid();
  renderCardPickerSummary();
}

function toggleFlip7Bonus() {
  state.cardPicker.flip7Bonus = !state.cardPicker.flip7Bonus;
  renderCardGrid();
  renderCardPickerSummary();
}

// Official Flip 7: With a Vengeance end-of-round scoring:
// 1. Sum number cards (0 sets subtotal to 0 regardless of others)
// 2. Apply ÷2 (round down) if present
// 3. Subtract -2/-4/-6/-8/-10 modifiers (not below 0)
// 4. If Flip 7 achieved, add +15 bonus
function computeFlip7ScoreFromPicker() {
  const numbers = Array.from(state.cardPicker.selectedNumbers);
  const hasZero = numbers.includes(0);

  let subtotal = 0;
  if (hasZero) {
    // Zero wipes out number score; only Flip 7 bonus can add points later
    subtotal = 0;
  } else {
    for (const n of numbers) {
      subtotal += n;
    }
  }

  if (state.cardPicker.divideByTwo) {
    subtotal = Math.floor(subtotal / 2);
  }

  let score = subtotal;
  for (const m of state.cardPicker.negativeModifiers) {
    score -= m;
  }

  if (score < 0) score = 0;

  if (state.cardPicker.flip7Bonus) {
    score += 15;
  }

  return score;
}

function renderCardGrid() {
  const { cardGrid } = els;
  cardGrid.innerHTML = "";
  const selectedNumbers = state.cardPicker.selectedNumbers;
  const divideByTwo = state.cardPicker.divideByTwo;
  const negativeModifiers = state.cardPicker.negativeModifiers;
  const flip7Bonus = state.cardPicker.flip7Bonus;

  // Number cards grid
  FLIP7_NUMBER_VALUES.forEach((value) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-button";
    if (selectedNumbers.has(value)) {
      btn.classList.add("selected");
    }

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = String(value);

    btn.appendChild(label);

    btn.addEventListener("click", () => toggleNumberSelection(value));

    cardGrid.appendChild(btn);
  });

  // Divider row label (implicit via spacing, no extra element needed)
  // Modifier and bonus buttons
  const modifiers = [
    {
      key: "divide2",
      active: divideByTwo,
      label: "÷2",
      sub: "Half first",
      onClick: toggleDivideByTwo,
    },
    ...FLIP7_NEGATIVE_MODIFIERS.map((m) => ({
      key: `-${m}`,
      active: negativeModifiers.has(m),
      label: `-${m}`,
      sub: "Penalty",
      onClick: () => toggleNegativeModifier(m),
    })),
    {
      key: "flip7",
      active: flip7Bonus,
      label: "+15",
      sub: "Flip 7 bonus",
      onClick: toggleFlip7Bonus,
    },
  ];

  modifiers.forEach((mod) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-button";
    if (mod.active) {
      btn.classList.add("selected");
    }
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = mod.label;
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = mod.sub;

    btn.appendChild(label);
    btn.appendChild(sub);

    btn.addEventListener("click", mod.onClick);

    cardGrid.appendChild(btn);
  });
}

function renderCardPickerSummary() {
  const { selectedCardsList, selectedCardsTotal } = els;
  selectedCardsList.innerHTML = "";
  const numbers = Array.from(state.cardPicker.selectedNumbers).sort(
    (a, b) => a - b
  );

  if (!numbers.length && !state.cardPicker.divideByTwo && !state.cardPicker.negativeModifiers.size && !state.cardPicker.flip7Bonus) {
    const p = document.createElement("p");
    p.className = "hint small";
    p.textContent = "No cards/modifiers selected yet.";
    selectedCardsList.appendChild(p);
  } else {
    if (numbers.length) {
      const pill = document.createElement("span");
      pill.className = "selected-card-pill";
      pill.textContent = `Numbers: ${numbers.join(", ")}`;
      selectedCardsList.appendChild(pill);
    }
    if (state.cardPicker.divideByTwo) {
      const pill = document.createElement("span");
      pill.className = "selected-card-pill";
      pill.textContent = "÷2 applied first";
      selectedCardsList.appendChild(pill);
    }
    for (const m of Array.from(state.cardPicker.negativeModifiers).sort(
      (a, b) => a - b
    )) {
      const pill = document.createElement("span");
      pill.className = "selected-card-pill";
      pill.textContent = `-${m}`;
      selectedCardsList.appendChild(pill);
    }
    if (state.cardPicker.flip7Bonus) {
      const pill = document.createElement("span");
      pill.className = "selected-card-pill";
      pill.textContent = "Flip 7 bonus (+15)";
      selectedCardsList.appendChild(pill);
    }
  }

  const total = computeFlip7ScoreFromPicker();
  selectedCardsTotal.textContent = total;
}

function applyCardSelectionToScore() {
  const { roundId, playerId } = state.cardPicker;
  if (!roundId || !playerId) return;
  const total = computeFlip7ScoreFromPicker();
  // Persist selection details so dialog can be reopened and edited
  const detail = {
    mode: "cards",
    value: total,
    selectedNumbers: Array.from(state.cardPicker.selectedNumbers),
    divideByTwo: state.cardPicker.divideByTwo,
    negativeModifiers: Array.from(state.cardPicker.negativeModifiers),
    flip7Bonus: state.cardPicker.flip7Bonus,
  };
  setScore(roundId, playerId, "cards", total, detail);
  render();
  showToast("Card score applied");
}

function attachEvents() {
  els.addPlayerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameRaw = els.playerNameInput.value.trim();
    if (!nameRaw) return;
    const existing = state.players.find(
      (p) => p.name.toLowerCase() === nameRaw.toLowerCase()
    );
    if (existing) {
      showToast("That player already exists");
      return;
    }
    const player = {
      id: uid(),
      name: nameRaw,
      totalWins: 0,
      totalGames: 0,
      createdAt: new Date().toISOString(),
    };
    state.players.push(player);
    persistPlayers();
    els.playerNameInput.value = "";
    render();
    showToast(`Added player ${player.name}`);
  });

  els.newGameButton.addEventListener("click", () => {
    if (
      state.currentGame &&
      state.currentGame.rounds.length &&
      !window.confirm(
        "Start a new game? Current in-progress game will be discarded."
      )
    ) {
      return;
    }
    state.currentGame = {
      id: uid(),
      startedAt: new Date().toISOString(),
      playerIds: [],
      rounds: [],
    };
    render();
  });

  els.resetAllButton.addEventListener("click", () => {
    if (
      window.confirm(
        "Reset EVERYTHING? This clears all players, games, and card values."
      )
    ) {
      window.localStorage.removeItem(STORAGE_KEYS.players);
      window.localStorage.removeItem(STORAGE_KEYS.games);
      window.localStorage.removeItem(STORAGE_KEYS.scoreConfig);
      state.players = [];
      state.games = [];
      state.currentGame = null;
      state.scoreConfig = defaultScoreConfig();
      render();
      showToast("All data cleared");
    }
  });

  els.addRoundButton.addEventListener("click", () => {
    if (!state.currentGame || !state.currentGame.playerIds.length) {
      showToast("Select at least one player first");
      return;
    }
    createRound();
    render();
  });

  els.endGameButton.addEventListener("click", () => {
    if (!state.currentGame || !state.currentGame.playerIds.length) {
      showToast("No game in progress");
      return;
    }
    if (!state.currentGame.rounds.length) {
      showToast("Add at least one round first");
      return;
    }
    if (
      !window.confirm(
        "End this game and record results? You won't be able to edit it afterwards."
      )
    ) {
      return;
    }
    finishCurrentGame();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.tabTarget;
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.remove("active"));
      document.getElementById(targetId).classList.add("active");
    });
  });

  els.closeCardPicker.addEventListener("click", () => {
    closeCardPicker();
  });

  els.clearCardSelection.addEventListener("click", () => {
    state.cardPicker.selectedNumbers = new Set();
    state.cardPicker.divideByTwo = false;
    state.cardPicker.negativeModifiers = new Set();
    state.cardPicker.flip7Bonus = false;
    renderCardGrid();
    renderCardPickerSummary();
  });

  els.applyCardSelection.addEventListener("click", () => {
    applyCardSelectionToScore();
    closeCardPicker();
  });

  els.overlay.addEventListener("click", (e) => {
    if (e.target === els.overlay || e.target === els.overlay.querySelector(".overlay-backdrop")) {
      closeCardPicker();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.overlay.classList.contains("hidden")) {
      closeCardPicker();
    }
  });
}

function finishCurrentGame() {
  const game = state.currentGame;
  if (!game) return;
  const totals = computeRoundTotals(game);
  const winnerIds = findWinners(totals);

  for (const pid of game.playerIds) {
    const player = getPlayerById(pid);
    if (!player) continue;
    player.totalGames = (player.totalGames || 0) + 1;
    if (winnerIds.includes(pid)) {
      player.totalWins = (player.totalWins || 0) + 1;
    }
  }

  const storedGame = {
    id: game.id,
    startedAt: game.startedAt,
    finishedAt: new Date().toISOString(),
    playerIds: [...game.playerIds],
    rounds: [...game.rounds],
    totals,
    winnerIds,
  };

  state.games.push(storedGame);
  state.currentGame = null;

  persistPlayers();
  persistGames();

  render();
  showToast("Game saved to history");
}

function renderCurrentGameStatus() {
  const { currentGameStatus } = els;
  const game = state.currentGame;
  if (!game) {
    currentGameStatus.textContent = "No game in progress";
    currentGameStatus.classList.add("muted");
    return;
  }
  const playersCount = game.playerIds.length;
  const roundsCount = game.rounds.length;
  const parts = [];
  parts.push(
    `${playersCount || "No"} player${playersCount === 1 ? "" : "s"} selected`
  );
  if (roundsCount) {
    parts.push(`${roundsCount} round${roundsCount === 1 ? "" : "s"}`);
  }
  currentGameStatus.textContent = parts.join(" • ");
  currentGameStatus.classList.remove("muted");
}

function render() {
  renderPlayersList();
  renderAvailablePlayers();
  renderRounds();
  renderGamesHistory();
  renderLeaderboard();
  renderCurrentGameStatus();
}

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  loadInitialState();
  attachEvents();
  render();
});

