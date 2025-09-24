const backendURL = "https://pubg-ban-checker-backend.onrender.com";
const input = document.getElementById("playerName");
const resultsDiv = document.getElementById("results");
const searchBtn = document.getElementById("searchBtn");

async function searchPlayer() {
    const player = input.value.trim();
    if (!player) {
        resultsDiv.textContent = "Please enter a player name.";
        return;
    }

    resultsDiv.textContent = "Checking...";

    try {
        const response = await fetch(`${backendURL}/check-ban?player=${encodeURIComponent(player)}&platform=steam`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        resultsDiv.textContent = `Player: ${player}\nBan Status: ${data.banStatus || data.error || "Unknown"}`;
    } catch (err) {
        resultsDiv.textContent = `Failed to fetch data. Try again in a few seconds.\nError: ${err}`;
    }
}

// Button click
searchBtn.addEventListener("click", searchPlayer);

// Enter key
input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchPlayer();
});