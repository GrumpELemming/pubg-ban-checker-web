const BASE_URL = "https://pubg-ban-checker-backend.onrender.com";
let SECRET_KEY = "";

const el = id => document.getElementById(id);
const show = (node, yes) => node.classList[yes ? "remove" : "add"]("hidden");
const setText = (node, text) => { node.textContent = text; };

function showTool() {
  show(el("login"), false);
  show(el("tool"), true);
}

function unlock() {
  const inputKey = el("keyInput").value.trim();
  const msg = el("loginMsg");
  if (!inputKey) { setText(msg, "Please enter a key."); return; }
  SECRET_KEY = inputKey;
  sessionStorage.setItem("resolverKey", SECRET_KEY);
  showTool();
}

(function init() {
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get("key");
  if (urlKey) {
    SECRET_KEY = urlKey;
    sessionStorage.setItem("resolverKey", SECRET_KEY);
    showTool();
    return;
  }
  const storedKey = sessionStorage.getItem("resolverKey");
  if (storedKey) {
    SECRET_KEY = storedKey;
    showTool();
  }
})();

function copyToClipboard(text, copiedId) {
  navigator.clipboard.writeText(text).then(() => {
    const msg = el(copiedId);
    if (msg) {
      msg.style.display = "inline";
      setTimeout(() => { msg.style.display = "none"; }, 2000);
    }
  });
}

function formatResult(containerId, data) {
  const container = el(containerId);
  container.replaceChildren();

  if (data.error) {
    const p = document.createElement("p");
    p.className = "error-text";
    p.textContent = `Error: ${data.error}`;
    container.appendChild(p);
    return;
  }

  if (data.currentName && data.accountId) {
    const p1 = document.createElement("p");
    const strong1 = document.createElement("strong");
    strong1.textContent = "Player:";
    p1.append(strong1, document.createTextNode(" " + data.currentName));

    const p2 = document.createElement("p");
    const strong2 = document.createElement("strong");
    strong2.textContent = "Account ID:";
    const spanId = document.createElement("span");
    spanId.textContent = " " + data.accountId + " ";
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy";
    copyBtn.className = "copy-btn";
    const copyId = containerId + "-copied";
    copyBtn.addEventListener("click", () => copyToClipboard(data.accountId, copyId));
    const copiedMsg = document.createElement("span");
    copiedMsg.id = copyId;
    copiedMsg.className = "copied";
    copiedMsg.textContent = "✔ Copied!";

    p2.append(strong2, spanId, copyBtn, copiedMsg);
    container.append(p1, p2);
    return;
  }

  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(data, null, 2);
  container.appendChild(pre);
}

async function resolveByName() {
  const name = el("nameInput").value.trim();
  if (!name) return alert("Please enter a name");
  const out = el("nameResult");
  setText(out, "Loading...");
  try {
    const res = await fetch(`${BASE_URL}/api/resolve-by-name?key=${encodeURIComponent(SECRET_KEY)}&name=${encodeURIComponent(name)}`);
    const data = await res.json();
    formatResult("nameResult", data);
  } catch (err) {
    out.classList.add("error-text");
    setText(out, `Error: ${err}`);
  }
}

async function resolveById() {
  const id = el("idInput").value.trim();
  if (!id) return alert("Please enter an account ID");
  const out = el("idResult");
  setText(out, "Loading...");
  try {
    const res = await fetch(`${BASE_URL}/api/resolve-by-id?key=${encodeURIComponent(SECRET_KEY)}&id=${encodeURIComponent(id)}`);
    const data = await res.json();
    formatResult("idResult", data);
  } catch (err) {
    out.classList.add("error-text");
    setText(out, `Error: ${err}`);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  el("unlockBtn")?.addEventListener("click", unlock);
  el("resolveNameBtn")?.addEventListener("click", resolveByName);
  el("resolveIdBtn")?.addEventListener("click", resolveById);
});
