// ---------- WATCHLIST ----------
function getWatchlist(){ return JSON.parse(localStorage.getItem("watchlist")||"[]"); }
function storeWatchlist(names){ localStorage.setItem("watchlist", JSON.stringify(names)); }
function addToWatchlist(name){
  if(!name) return;
  let list = getWatchlist();
  if(!list.includes(name)){ list.push(name); storeWatchlist(list); }
}
function removeFromWatchlist(name){ let list=getWatchlist().filter(n=>n!==name); storeWatchlist(list); renderWatchlist(); }
function clearWatchlist(){ storeWatchlist([]); renderWatchlist(); }
function renderWatchlist(){
  const container=document.getElementById("watchlistPlayersContainer");
  if(!container) return;
  container.innerHTML="";
  getWatchlist().forEach(name=>{
    const div=document.createElement("div"); div.className="watchlist-player"; div.textContent=name;
    const btn=document.createElement("button"); btn.textContent="Remove"; btn.onclick=()=>{ removeFromWatchlist(name); };
    div.appendChild(btn); container.appendChild(div);
  });
}
function checkAllWatchlist(){ const names=getWatchlist(); if(names.length) checkBan(names.join(",")); }

// ---------- DARK MODE ----------
const darkToggle=document.getElementById("darkModeToggle");
if(darkToggle){
  darkToggle.addEventListener("change",()=>{
    document.body.classList.toggle("dark-mode",darkToggle.checked);
    localStorage.setItem("darkMode",darkToggle.checked);
  });
  const darkStored = localStorage.getItem("darkMode")==="true";
  document.body.classList.toggle("dark-mode", darkStored);
  darkToggle.checked = darkStored;
}

// ---------- SUGGESTIONS ----------
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
    const item=document.createElement("div"); item.className="suggestion-item"; item.textContent=match;
    item.onclick=()=>{ playerInput.value=match; suggestionList.style.display="none"; }; suggestionList.appendChild(item);
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
      else checkBan();
    } else if(e.key==="Escape"){ document.getElementById("suggestions").style.display="none"; }
  });
}
function updateActive(){ const items=document.getElementById("suggestions").getElementsByClassName("suggestion-item"); Array.from(items).forEach((el,i)=>el.classList.toggle("suggestion-active",i===suggestionIndex)); }
document.addEventListener("click", e=>{ if(!playerInput?.contains(e.target)) document.getElementById("suggestions")?.style.display="none"; });

// ---------- BAN CHECK ----------
function getStatusClass(status){ switch(status){ case "Not banned": return "not-banned"; case "Temporarily banned": return "temp-banned"; case "Permanently banned": return "perm-banned"; default: return "unknown"; } }

async function check
