// =======================================
// Watchlist helpers
// =======================================
function getWatchlist(){ return JSON.parse(localStorage.getItem("watchlist")||"[]"); }
function storeWatchlist(names){ localStorage.setItem("watchlist", JSON.stringify(names)); }

function renderWatchlist(){
  const container=document.getElementById("watchlistPlayersContainer");
  if(!container) return;
  container.innerHTML="";
  getWatchlist().forEach(entry=>{
    const name = (typeof entry==="string") ? entry : entry.name;
    const clan = (typeof entry==="object" && entry.clan) ? entry.clan : null;

    const div=document.createElement("div");
    div.className="watchlist-player";
    div.innerHTML = `<strong>${name}</strong>${clan ? ` <span class="clan">[${clan}]</span>` : ""}`;

    const btn=document.createElement("button");
    btn.textContent="Remove";
    btn.onclick=()=>{ removeFromWatchlist(name); };
    div.appendChild(btn);

    container.appendChild(div);
  });
}

function addToWatchlist(name, clan=null){
  if(!name) return;
  const newEntry = clan ? { name, clan } : name;
  const existing = getWatchlist();
  const byName = n => (typeof n==="string" ? n : n.name);
  const merged = [newEntry, ...existing]
    .reduce((acc, item) => acc.some(x => byName(x)===byName(item)) ? acc : [...acc, item], []);
  storeWatchlist(merged.slice(0,50));
  renderWatchlist();
}

function removeFromWatchlist(name){
  const byName = n => (typeof n==="string" ? n : n.name);
  const names=getWatchlist().filter(n=> byName(n)!==name);
  storeWatchlist(names);
  renderWatchlist();
}
function clearWatchlist(){ storeWatchlist([]); renderWatchlist(); }

function checkAllWatchlist(){
  const entries = getWatchlist();
  const resultsDiv=document.getElementById("results");
  if(!entries.length){
    if(resultsDiv) resultsDiv.innerHTML="<p>No players in watchlist.</p>";
    return;
  }
  const names = entries.map(e => typeof e==="string" ? e : e.name);
  checkBan(names.join(","), true);
}

// =======================================
// Dark Mode
// =======================================
const darkToggle=document.getElementById("darkModeToggle");
if(darkToggle){
  darkToggle.addEventListener("change",()=>{ 
    document.body.classList.toggle("dark-mode",darkToggle.checked); 
    localStorage.setItem("darkMode",darkToggle.checked); 
  });
}
window.addEventListener("DOMContentLoaded",()=>{
  const darkStored=localStorage.getItem("darkMode")==="true";
  document.body.classList.toggle("dark-mode",darkStored); 
  if(darkToggle) darkToggle.checked=darkStored;
});

// =======================================
// Suggestions
// =======================================
const playerInput=document.getElementById("playerInput");
let suggestionIndex=-1; let currentSuggestions=[]; const MAX_SUGGESTIONS=50;
function getStoredNames(){ return JSON.parse(localStorage.getItem("searchedPlayers")||"[]"); }
function storeName(name){ if(!name) return; let names=getStoredNames(); names.unshift(name); names=[...new Set(names)].slice(0,MAX_SUGGESTIONS); localStorage.setItem("searchedPlayers", JSON.stringify(names)); }
function showSuggestions(input){
  const suggestionList=document.getElementById("suggestions"); if(!suggestionList) return;
  suggestionList.innerHTML=""; suggestionIndex=-1;
  if(!input){ suggestionList.style.display="none"; return; }
  const matches=getStoredNames().filter(n=>n.toLowerCase().startsWith(input.toLowerCase())); currentSuggestions=matches;
  if(!matches.length){ suggestionList.style.display="none"; return; }
  matches.forEach(match=>{
    const item=document.createElement("div");
    item.className="suggestion-item"; item.textContent=match;
    item.onclick=()=>{ playerInput.value=match; suggestionList.style.display="none"; };
    suggestionList.appendChild(item);
  });
  const rect=playerInput.getBoundingClientRect();
  suggestionList.style.top=rect.bottom+window.scrollY+"px";
  suggestionList.style.left=rect.left+window.scrollX+"px";
  suggestionList.style.width=rect.width+"px"; suggestionList.style.display="block";
}
if(playerInput){
  playerInput.addEventListener("input", e=>{ 
    const value=e.target.value; showSuggestions(value);
    if(value.endsWith(",")) value.split(",").map(p=>p.trim()).filter(p=>p).forEach(storeName);
  });
  playerInput.addEventListener("keydown", e=>{
    const items=document.getElementById("suggestions").getElementsByClassName("suggestion-item");
    if(!items.length) return;
    if(e.key==="ArrowDown"){ e.preventDefault(); suggestionIndex=(suggestionIndex+1)%items.length; updateActive(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); suggestionIndex=(suggestionIndex-1+items.length)%items.length; updateActive(); }
    else if(e.key==="Enter"){ 
      if(suggestionIndex>=0){ playerInput.value=items[suggestionIndex].textContent; document.getElementById("suggestions").style.display="none"; suggestionIndex=-1; }
    } else if(e.key==="Escape"){ document.getElementById("suggestions").style.display="none"; }
  });
}
function updateActive(){ const items=document.getElementById("suggestions").getElementsByClassName("suggestion-item"); Array.from(items).forEach((el,i)=>el.classList.toggle("suggestion-active",i===suggestionIndex)); }

// =======================================
// Helpers
// =======================================
function getStatusClass(status){
  switch(status){
    case "Not banned": return "not-banned";
    case "Temporarily banned": return "temp-banned";
    case "Permanently banned": return "perm-banned";
    default: return "unknown";
  }
}
const ROW_IN = "rowIn 280ms cubic-bezier(.2,.8,.2,1) both";

// =======================================
// Ban Checker (Main, ban-only)
// =======================================
async function checkBan(namesInput, fromWatchlist=false){
  let raw = namesInput || (playerInput ? playerInput.value : "");
  const players = raw
    .split(/[\n,;|\t]+/)       // <-- split on newlines, commas, semicolons, pipes, tabs
    .map(p => p.trim())
    .filter(Boolean);

  const platform=document.getElementById("platformSelect")?.value || "steam";
  const resultsDiv=document.getElementById("results");

  if(players.length === 0){ alert("Enter at least one player name."); return; }
  if(players.length > 10){ alert("Maximum 10 names at a time."); return; }
  if(!resultsDiv) return;

  resultsDiv.innerHTML="<p class='loading'>Checking… please wait</p>";
  try{
    const response=await fetch(`https://pubg-ban-checker-backend.onrender.com/check-ban?player=${encodeURIComponent(players.join(","))}&platform=${platform}`);
    const data=await response.json(); resultsDiv.innerHTML="";
    if(data.error){ resultsDiv.innerHTML=`<p class='unknown'>Error: ${data.error}</p>`; return; }
    if(data.results && data.results.length){
      const groupDiv=document.createElement("div"); groupDiv.className="group-result";
      data.results.forEach((item,i)=>{
        const row=document.createElement("div");
        row.className = "player-row " + getStatusClass(item.banStatus) + " result-appear";

        if (row.classList.contains("temp-banned")) {
          row.style.animation = `${ROW_IN}, pulse 2s infinite`;
          row.style.animationDelay = `${i*0.06}s, 0s`;
        } else if (row.classList.contains("perm-banned")) {
          row.style.animation = `${ROW_IN}, pulse 1.5s infinite`;
          row.style.animationDelay = `${i*0.06}s, 0s`;
        } else {
          row.style.animation = ROW_IN;
          row.style.animationDelay = `${i*0.06}s`;
        }

        row.innerHTML = `<strong>${item.player}</strong> <span class="status">${item.banStatus}</span>`;

        const inWatchlist = getWatchlist().some(w => (typeof w==="string" ? w : w.name) === item.player);
        if(!fromWatchlist && !inWatchlist){
          const btn = document.createElement("button");
          btn.textContent = "Add to Watchlist";
          btn.onclick = () => {
            addToWatchlist(item.player);
            btn.disabled = true;
            btn.textContent = "Added";
          };
          row.appendChild(btn);
        }
        groupDiv.appendChild(row);
      });
      resultsDiv.appendChild(groupDiv);
    } else {
      resultsDiv.innerHTML="No results found.";
    }
  } catch(err){
    resultsDiv.innerHTML=`<p class='unknown'>Error fetching results: ${err}</p>`;
  }
}

function clearResults(){
  const r=document.getElementById("results"); 
  if(r) r.innerHTML="";
  if(playerInput) playerInput.value="";
}

// =======================================
// Temporary Clan Checker (Ban + Clan)
// =======================================
async function checkClan(){
  const inputRaw = document.getElementById("clanInput")?.value || "";
  const names = inputRaw
    .split(/[\n,;|\t]+/)
    .map(n=>n.trim())
    .filter(Boolean);

  if(names.length === 0) return alert("Enter at least one player name.");
  if(names.length > 2)  return alert("Clan checker is limited to 2 names.");

  const resultsDiv = document.getElementById("clanResults");
  if(!resultsDiv) return;
  resultsDiv.innerHTML = "<p class='loading'>Checking… please wait</p>";

  try {
    const response = await fetch(
      `https://pubg-ban-checker-backend.onrender.com/check-ban-clan?player=${encodeURIComponent(names.join(","))}&platform=steam`
    );
    const data = await response.json();
    resultsDiv.innerHTML = "";

    if(data.results){
      data.results.forEach((item,i)=>{
        const row = document.createElement("div");
        row.className = "player-row " + getStatusClass(item.banStatus) + " result-appear";

        if (row.classList.contains("temp-banned")) {
          row.style.animation = `${ROW_IN}, pulse 2s infinite`;
          row.style.animationDelay = `${i*0.06}s, 0s`;
        } else if (row.classList.contains("perm-banned")) {
          row.style.animation = `${ROW_IN}, pulse 1.5s infinite`;
          row.style.animationDelay = `${i*0.06}s, 0s`;
        } else {
          row.style.animation = ROW_IN;
          row.style.animationDelay = `${i*0.06}s`;
        }

        row.innerHTML = `
          <strong>${item.player}</strong>
          ${item.clan ? ` <span class="clan">[${item.clan}]</span>` : ""}
          <span class="status">${item.banStatus}</span>
          <span class="clan-badge shimmer">Clan Mode</span>
        `;
        resultsDiv.appendChild(row);
      });
    } else {
      resultsDiv.innerHTML = "No results found.";
    }
  } catch(err){
    resultsDiv.innerHTML = `<p class='unknown'>Error fetching results: ${err}</p>`;
  }
}

function clearClanResults(){
  const el = document.getElementById("clanResults");
  if (el) el.innerHTML = "";
  const input = document.getElementById("clanInput");
  if (input) input.value = "";
}

// =======================================
// Init
// =======================================
window.addEventListener("DOMContentLoaded", ()=>{ renderWatchlist(); });
