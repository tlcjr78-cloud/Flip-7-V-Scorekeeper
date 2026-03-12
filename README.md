# Flip & with a Vengeance – Scorekeeper

A lightweight web app to track scores for **Flip & with a Vengeance**, including:

- Multiple players per game
- Manual score entry **or** card-based scoring for each round
- Persistent player list with wins and games played
- Game history and a simple leaderboard
- Customisable card values to match your house rules

## Running the app

This app is plain HTML/CSS/JS and can be opened directly in a browser:

1. Open the project folder:  
   `c:\Users\tj\OneDrive\Documents\Flip 7 V Score App`
2. Double‑click `index.html` and open it in your browser (Edge/Chrome/etc.).

No build step is required.

If you prefer a tiny local web server (optional), you can use the `package.json` script:

```bash
cd "c:\Users\tj\OneDrive\Documents\Flip 7 V Score App"
npm install serve --save-dev
npm run start
```

Then open the URL it prints (usually `http://localhost:3000` or similar).

## How scoring works

- For each **round**, every player can either:
  - **Enter a manual score**, or
  - **Use card-based scoring**:
    - Click **Cards** on that player’s cell, then **Pick**.
    - Choose cards in the picker; the app totals them using your configured values.
- By default:
  - Aces are worth 15
  - Kings 13, Queens 12, Jacks 11
  - 2–10 are worth their face value
- You can change card values anytime in the **Card Scoring** panel on the right; changes are stored locally in your browser.

> Note: The app assumes **higher total is better** to determine the winner. Adjust your card values or manual scores accordingly if your house rules differ.

## Data persistence

All data is stored locally in your browser (`localStorage`):

- Saved players
- Finished games and their winners
- Card value configuration

You can clear everything with the **Reset All** button in the top‑right.

