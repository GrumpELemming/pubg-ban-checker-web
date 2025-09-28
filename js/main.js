// ---------- COMMON FUNCTIONS ----------
function getWatchlist(){ return JSON.parse(localStorage.getItem("watchlist")||"[]"); }
function storeWatchlist(names){ localStorage.setItem("watchlist", JSON.stringify(names)); }
function renderWatchlist(){
  const container = document.getElementById("watchlistPlayersContainer");
  if(!container) return;
  container.innerHTML = "";
  getWatchlist().forEach(name=>{
    const div = document.createElement("div"); 
    div.className = "watchlist-player"; 
    div.textContent = name;
    const btn = document.createElement("button"); 
    btn.textContent = "Remove"; 
    btn.onclick = ()=>{ removeFromWatchlist(name); };
    div.appendChild(btn); 
    container.appendChild(div);
  });
}
function addToWatchlist(name){ 
  if(!name) return; 
  let names = [name,...getWatchlist()]; 
  names = [...new Set(names)].slice(0,50); 
  storeWatchlist(names); 
  renderWatchlist(); 
}
function removeFromWatchlist(name){ 
  let names = getWatchlist().filter(n=>n!==name); 
  storeWatchlist(names); 
  renderWatchlist(); 
}
function clearWatchlist(){ storeWatchlist([]); renderWatchlist(); }
function checkAllWatchlist(){ 
  const names = getWatchlist(); 
  if(names.length && typeof checkBan === "function") checkBan(names.join(",")); 
}

// ---------- DARK MODE ----------
const darkToggle = document.getElementById("darkModeToggle");
if(darkToggle){
  darkToggle.checked = localStorage.getItem("darkMode")==="true";
  darkToggle.addEventListener("change", ()=>{
    document.body.classList.toggle("dark-mode", darkToggle.checked);
    localStorage.setItem("darkMode", darkToggle.checked);
  });
  document.body.classList.toggle("dark-mode", darkToggle.checked);
}

// ---------- BAN CHECKER ----------
function getStatusClass(status){
  switch(status){
    case "Not banned": return "not-banned";
    case "Temporarily banned": return "temp-banned";
    case "Permanently banned": return "perm-banned";
    default: return "unknown";
  }
}

async function checkBan(namesInput){
  const inputEl = document.getElementById("playerInput");
  const input = namesInput || (inputEl ? inputEl.value.trim() : "");
  const platformEl = document.getElementById("platformSelect");
  const platform = platformEl ? platformEl.value : "steam";
  const resultsDiv = document.getElementById("results");
  if(!resultsDiv) return;
  if(!input){ alert("Enter at least one player name."); return; }
  if(input.split(",").length>10){ alert("Maximum 10 names at a time."); return; }
  resultsDiv.innerHTML="<p class='loading'>Checking… please wait</p>";
  try{
    const response = await fetch(`https://pubg-ban-checker-backend.onrender.com/check-ban?player=${encodeURIComponent(input)}&platform=${platform}`);
    const data = await response.json(); resultsDiv.innerHTML="";
    if(data.error){ resultsDiv.innerHTML=`<p class='unknown'>Error: ${data.error}</p>`; return; }
    if(data.results && data.results.length){
      const groupDiv=document.createElement("div"); groupDiv.className="group-result";
      data.results.forEach((item,i)=>{
        const row=document.createElement("div"); 
        row.className="player-row "+getStatusClass(item.banStatus);
        row.style.animationDelay=`${i*0.1}s`; 
        row.innerHTML=`<strong>${item.player}:</strong> <span class="status">${item.banStatus}</span>`;
        if(getWatchlist().includes(item.player)) row.classList.add("highlight");

        // Add "Add to Watchlist" button if on index page
        const inputIndex = document.getElementById("playerInput");
        if(inputIndex){
          const btn = document.createElement("button");
          btn.textContent = "Add to Watchlist";
          btn.onclick = ()=> addToWatchlist(item.player);
          row.appendChild(btn);
        }

        groupDiv.appendChild(row);
      });
      resultsDiv.appendChild(groupDiv);
    } else resultsDiv.innerHTML="No results found.";
  } catch(err){ resultsDiv.innerHTML=`<p class='unknown'>Error fetching results: ${err}</p>`; }
}

// ---------- CLEAR ----------
function clearResults(){
  const resultsDiv = document.getElementById("results");
  if(resultsDiv) resultsDiv.innerHTML="";
  const inputEl = document.getElementById("playerInput");
  if(inputEl) inputEl.value="";
}

// ---------- SUGGESTIONS ----------
const playerInputEl = document.getElementById("playerInput");
if(playerInputEl){
  let suggestionIndex=-1; 
  let currentSuggestions=[];
  const MAX_SUGGESTIONS=50;
  function getStoredNames(){ return JSON.parse(localStorage.getItem("searchedPlayers")||"[]"); }
  function storeName(name){ if(!name) return; let names=getStoredNames(); names.unshift(name); names=[...new Set(names)].slice(0,MAX_SUGGESTIONS); localStorage.setItem("searchedPlayers", JSON.stringify(names)); }

  const suggestionList = document.getElementById("suggestions");
  function showSuggestions(input){
    suggestionList.innerHTML=""; suggestionIndex=-1;
    if(!input){ suggestionList.style.display="none"; return; }
    const matches=getStoredNames().filter(n=>n.toLowerCase().startsWith(input.toLowerCase())); currentSuggestions=matches;
    if(!matches.length){ suggestionList.style.display="none"; return; }
    matches.forEach(match=>{
      const item=document.createElement("div"); 
      item.className="suggestion-item"; 
      item.textContent=match;
      item.onclick=()=>{ playerInputEl.value=match; suggestionList.style.display="none"; };
      suggestionList.appendChild(item);
    });
    const rect=playerInputEl.getBoundingClientRect();
    suggestionList.style.top=rect.bottom+window.scrollY+"px";
    suggestionList.style.left=rect.left+window.scrollX+"px";
    suggestionList.style.width=rect.width+"px"; 
    suggestionList.style.display="block";
  }

  playerInputEl.addEventListener("input", e=>{ 
    const value=e.target.value; showSuggestions(value);
    if(value.endsWith(",")) value.split(",").map(p=>p.trim()).filter(p=>p).forEach(storeName);
  });

  playerInputEl.addEventListener("keydown", e=>{
    const items = suggestionList.getElementsByClassName("suggestion-item");
    if(!items.length) return;
    if(e.key==="ArrowDown"){ e.preventDefault(); suggestionIndex=(suggestionIndex+1)%items.length; updateActive(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); suggestionIndex=(suggestionIndex-1+items.length)%items.length; updateActive(); }
    else if(e.key==="Enter"){ 
      if(suggestionIndex>=0){ playerInputEl.value=items[suggestionIndex].textContent; suggestionList.style.display="none"; suggestionIndex=-1; }
      else checkBan();
    } else if(e.key==="Escape"){ suggestionList.style.display="none"; }
  });

  function updateActive(){ Array.from(suggestionList.getElementsByClassName("suggestion-item")).forEach((el,i)=>el.classList.toggle("suggestion-active",i===suggestionIndex)); }
  document.addEventListener("click", e=>{ if(!playerInputEl.contains(e.target)) suggestionList.style.display="none"; });
}
