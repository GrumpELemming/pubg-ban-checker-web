const backendURL = "https://pubg-ban-checker-backend.onrender.com";

let watchlist = JSON.parse(localStorage.getItem("watchlist")) || [];

const playerInput = document.getElementById("player-input");
const platformSelect = document.getElementById("platform-select");
const searchBtn = document.getElementById("search-btn");
const addWatchlistBtn = document.getElementById("add-watchlist-btn");
const resultDiv = document.getElementById("result");
const watchlistUl = document.getElementById("watchlist");

// Render watchlist
function renderWatchlist() {
    watchlistUl.innerHTML = "";
    watchlist.forEach(player => {
        const li = document.createElement("li");
        li.textContent = player;
        li.className = "watchlist-item";
        li.onclick = () => checkBan(player);
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "Remove";
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeFromWatchlist(player);
        };
        li.appendChild(removeBtn);
        watchlistUl.appendChild(li);
    });
}

// Add to watchlist
function addToWatchlist(player) {
    if (!player || watchlist.includes(player)) return;
    watchlist.push(player);
    localStorage.setItem("watchlist", JSON.stringify(watchlist));
    renderWatchlist();
}

// Remove from watchlist
function removeFromWatchlist(player) {
    watchlist = watchlist.filter(p => p !== player);
    localStorage.setItem("watchlist", JSON.stringify(watchlist));
    renderWatchlist();
}

// Check ban status
async function checkBan(player) {
    const platform = platformSelect.value;
    resultDiv.textContent = "Checking...";
    try {
        const response = await fetch(`${backendURL}/check-ban?player=${encodeURIComponent(player)}&platform=${platform}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        resultDiv.textContent = `${player}: ${data.banStatus || data.error}`;
    } catch (err) {
        resultDiv.textContent = `Failed to fetch: ${err.message}`;
    }
}

// Event listeners
searchBtn.onclick = () => checkBan(playerInput.value.trim());
addWatchlistBtn.onclick = () => addToWatchlist(playerInput.value.trim());

// Allow Enter key to search
playerInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        checkBan(playerInput.value.trim());
    }
});

// Initial render
renderWatchlist();
