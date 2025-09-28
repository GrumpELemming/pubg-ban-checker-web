// ---------- WATCHLIST ----------
function getWatchlist(){ return JSON.parse(localStorage.getItem("watchlist")||"[]"); }
function storeWatchlist(names){ localStorage.setItem("watchlist", JSON.stringify(names)); }
function renderWatchlist(containerId="watchlistPlayersContainer"){
  const container=document.getElementById(containerId);
  container.innerHTML="";
  getWatchlist().forEach(name=>{
    const div=document.createElement("div"); div.className="watchlist-player"; div.textContent=name;
    const btn=document.createElement("button"); btn.textContent="Remove"; btn.onclick=()=>{ removeFromWatchlist(name, containerId); };
    div.appendChild(btn); container.appendChild(div);
  });
}
function addToWatchlist(name, containerId="watchlistPlayersContainer"){ 
  if(!name) return; 
  let names=[name,...getWatchlist()]; 
  names=[...new Set(names)].slice(0,50); 
  storeWatchlist(names); 
  renderWatchlist(containerId); 
}
function removeFromWatchlist(name, containerId="watchlistPlayersContainer"){ 
  let names=getWatchlist().filter(n=>n!==name); 
  storeWatchlist(names); 
  renderWatchlist(containerId); 
}
function clearWatchlist(containerId="watchlistPlayersContainer"){ 
  storeWatchlist([]); 
  renderWatchlist(containerId); 
}
function checkAllWatchlist(){ 
  const names=getWatchlist(); 
  if(names.length) checkBan(names.join(",")); 
}

// ---------- DARK MODE ----------
const darkToggle=document.getElementById("darkModeToggle");
if(darkToggle){
  darkToggle.addEventListener("change",()=>{
    document.body.classList.toggle("dark-mode",darkToggle.checked);
    localStorage.setItem("darkMode",darkToggle.checked);
  });
}

// ---------- BAN CHECK ----------
function getStatusClass(status){ 
  switch(status){ 
    case "Not banned": return "not-banned"; 
    case "Temporarily banned": return "temp-banned"; 
    case "Permanently banned": return "perm-banned"; 
    default: return "unknown"; 
  } 
}

async function checkBan(namesInput){
  const input=namesInput || (document.getElementById("playerInput") ? document.getElementById("playerInput").value.trim() : "");
  const platformSelect = document.getElementById("platformSelect");
  const platform = platformSelect ? platformSelect.value : "steam";
  const resultsDiv = document.getElementById("results");
  if(!input){ alert("Enter at least one player name."); return; }
  if(input.split(",").length>10){ alert("Maximum 10 names at a time."); return; }
  if(!resultsDiv) return;
  resultsDiv.innerHTML="<p class='loading'>Checking… please wait</p>";
  try{
    const response=await fetch(`https://pubg-ban-checker-backend.onrender.com/check-ban?player=${encodeURIComponent(input)}&platform=${platform}`);
    const data=await response.json(); 
    resultsDiv.innerHTML="";
    if(data.error){ resultsDiv.innerHTML=`<p class='unknown'>Error: ${data.error}</p>`; return; }
    if(data.results && data.results.length){
      const groupDiv=document.createElement("div"); groupDiv.className="group-result";
      data.results.forEach((item,i)=>{
        const row=document.createElement("div"); row.className="player-row "+getStatusClass(item.banStatus);
        row.innerHTML=`<strong>${item.player}:</strong> <span class="status">${item.banStatus}</span>`;
        const addBtn=document.createElement("button"); addBtn.textContent="Add to Watchlist"; addBtn.onclick=()=>addToWatchlist(item.player);
        row.appendChild(addBtn);
        if(getWatchlist().includes(item.player)) row.classList.add("highlight");
        groupDiv.appendChild(row);
      });
      resultsDiv.appendChild(groupDiv);
    } else resultsDiv.innerHTML="No results found.";
  } catch(err){ resultsDiv.innerHTML=`<p class='unknown'>Error fetching results: ${err}</p>`; }
}

// ---------- CLEAR ----------
function clearResults(){ 
  const inputEl=document.getElementById("playerInput");
  if(inputEl) inputEl.value="";
  const resultsDiv=document.getElementById("results");
  if(resultsDiv) resultsDiv.innerHTML="";
}

// ---------- INIT ----------
window.addEventListener("DOMContentLoaded", ()=>{
  // Render Watchlist if container exists
  if(document.getElementById("watchlistPlayersContainer")) renderWatchlist();
  // Auto-check
  const autoCheck=localStorage.getItem("autoCheckWatchlist")==="true";
  const autoCheckToggle=document.getElementById("autoCheckToggle");
  if(autoCheckToggle) autoCheckToggle.checked=autoCheck;
  if(autoCheck && getWatchlist().length) checkAllWatchlist();
  // Dark mode
  const darkStored=localStorage.getItem("darkMode")==="true";
  if(darkToggle) darkToggle.checked=darkStored;
  document.body.classList.toggle("dark-mode",darkStored);
});
