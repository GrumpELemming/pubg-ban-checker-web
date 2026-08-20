/* Optional, on-demand permanent-ban card renderer. */
(() => {
  "use strict";

  const CARD_WIDTH = 1200;
  const CARD_HEIGHT = 675;
  const TIER_CONFIG = {
    bronze: { title: "BRONZE BOMBER", tagline: "Banned before escaping Bronze", color: "#c88752", accent: "#f0b47d", badge: "img/ban-cards/bronze.png" },
    silver: { title: "SWEATY SILVER", tagline: "The ban wave caught up", color: "#aeb9c5", accent: "#e4edf5", badge: "img/ban-cards/silver.png" },
    gold: { title: "BRAINDEAD BOT", tagline: "A paranoid machine shooting itself in the foot", color: "#b88335", accent: "#f4cf79", badge: "img/ban-cards/pyrite-plated-bot.png" },
    platinum: { title: "BASEMENT DWELLER", tagline: "Collecting loot beneath the glow of two screens", color: "#557b68", accent: "#9cf2a7", badge: "img/ban-cards/basement-loot-goblin.png" },
    diamond: { title: "SALTY WHALE", tagline: "A heavyweight permanent ending", color: "#e3b83f", accent: "#fff0a6", badge: "img/ban-cards/diamond.png" }
  };

  const ERROR_MESSAGES = {
    not_permanently_banned: "This account is no longer confirmed as permanently banned.",
    player_not_found: "The player could not be found on this platform.",
    mastery_unavailable: "Account level data is currently unavailable.",
    stats_unavailable: "Lifetime statistics are currently unavailable.",
    rate_limited: "PUBG is rate limiting requests. Please wait a moment and try again.",
    upstream_error: "PUBG data could not be reached. Please try again later."
  };

  let modal;
  let dialog;
  let statusEl;
  let canvas;
  let downloadBtn;
  let lastTrigger = null;
  let activeRequest = 0;
  let filename = "PUBGBanChecker_BanCard.png";

  function normalizeTier(value) {
    return String(value || "unknown").trim().toLowerCase();
  }

  function titleCase(value) {
    const text = String(value || "Unknown").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "Unknown";
  }

  function getTierConfig(tier) {
    const key = normalizeTier(tier);
    return TIER_CONFIG[key] || {
      title: titleCase(tier).toUpperCase(),
      tagline: "Permanently banned",
      color: "#8792a8",
      accent: "#d6deeb",
      badge: ""
    };
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function sanitizeFilenamePart(value, fallback) {
    const clean = String(value || "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
    return clean || fallback;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function fitText(ctx, text, maxWidth, initialSize, minSize, weight = 700) {
    let size = initialSize;
    do {
      ctx.font = `${weight} ${size}px Arial, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) return size;
      size -= 2;
    } while (size >= minSize);
    return minSize;
  }

  function ellipsize(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let output = text;
    while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
      output = output.slice(0, -1);
    }
    return `${output}…`;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      if (!src) return reject(new Error("No badge asset"));
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function drawFallbackBadge(ctx, config) {
    ctx.save();
    ctx.translate(230, 345);
    ctx.fillStyle = config.color;
    ctx.strokeStyle = config.accent;
    ctx.lineWidth = 10;
    ctx.beginPath();
    for (let point = 0; point < 12; point += 1) {
      const radius = point % 2 ? 118 : 145;
      const angle = -Math.PI / 2 + point * Math.PI / 6;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#07101d";
    ctx.font = "900 88px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(config.title.charAt(0) || "!", 0, 4);
    ctx.restore();
  }

  async function drawCard(data) {
    const ctx = canvas.getContext("2d");
    const tier = data.mastery?.tier || "Unknown";
    const config = getTierConfig(tier);
    const stats = data.lifetime || {};
    const hasTimeSurvived = stats.timeSurvived !== undefined && stats.timeSurvived !== null;
    const timePlayedHours = hasTimeSurvived ? safeNumber(stats.timeSurvived) / 3600 : null;
    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    gradient.addColorStop(0, "#050b15");
    gradient.addColorStop(0.62, "#0a1b31");
    gradient.addColorStop(1, "#160a10");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    ctx.strokeStyle = config.color;
    ctx.lineWidth = 7;
    roundedRect(ctx, 18, 18, CARD_WIDTH - 36, CARD_HEIGHT - 36, 24);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 65, 78, 0.12)";
    roundedRect(ctx, 440, 125, 700, 470, 24);
    ctx.fill();

    ctx.fillStyle = "#f4f8ff";
    ctx.font = "800 30px Arial, sans-serif";
    ctx.fillText("PUBG BANCHECKER", 62, 72);
    ctx.fillStyle = "#ff5964";
    ctx.font = "900 42px Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("PERMANENTLY BANNED", 1138, 76);
    ctx.textAlign = "left";

    try {
      const badge = await loadImage(config.badge);
      const size = 310;
      ctx.drawImage(badge, 75, 190, size, size);
    } catch {
      drawFallbackBadge(ctx, config);
    }

    const player = String(data.player || "Unknown player");
    fitText(ctx, player, 640, 58, 30, 900);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(ellipsize(ctx, player, 640), 485, 190);

    ctx.fillStyle = config.accent;
    fitText(ctx, config.title, 640, 43, 28, 900);
    ctx.fillText(ellipsize(ctx, config.title, 640), 485, 250);
    ctx.fillStyle = "#becbe0";
    ctx.font = "500 23px Arial, sans-serif";
    ctx.fillText(config.tagline, 487, 287);

    const tierNumber = safeNumber(data.mastery?.tierNumber);
    const level = safeNumber(data.mastery?.level);
    const clan = data.clan || "No clan";
    const highestRank = data.ranked?.highest?.label;

    const detailRows = [
      ["SURVIVAL", `Tier ${tierNumber || "?"} · Level ${level}/500`],
      ["CLAN", clan],
      ["ACCOUNT ID", data.accountId || "Unavailable"]
    ];
    if (highestRank) detailRows.push(["HIGHEST RANK", highestRank]);
    detailRows.forEach(([label, value], index) => {
      const y = 325 + index * 38;
      ctx.fillStyle = "#8797b0";
      ctx.font = "700 17px Arial, sans-serif";
      ctx.fillText(label, 490, y);
      ctx.fillStyle = "#f5f8fd";
      ctx.font = index === 2 ? "700 15px Arial, sans-serif" : "800 19px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(ellipsize(ctx, String(value), 420), 1090, y);
      ctx.textAlign = "left";
    });

    const statItems = [
      ["MATCHES", safeNumber(stats.matches).toLocaleString("en-GB")],
      ["KILLS", safeNumber(stats.kills).toLocaleString("en-GB")],
      ["WINS", safeNumber(stats.wins).toLocaleString("en-GB")],
      ["K/D", safeNumber(stats.losses) === 0 ? "—" : safeNumber(stats.kd).toFixed(2)],
      ["PLAYTIME", timePlayedHours === null ? "—" : `${timePlayedHours.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`]
    ];
    statItems.forEach(([label, value], index) => {
      const x = 490 + index * 125;
      ctx.fillStyle = "#8797b0";
      ctx.font = "700 14px Arial, sans-serif";
      ctx.fillText(label, x, 530);
      ctx.fillStyle = config.accent;
      ctx.font = "900 25px Arial, sans-serif";
      ctx.fillText(String(value), x, 561);
    });

    const checkedDate = new Date(data.checkedAt);
    const formattedDate = Number.isNaN(checkedDate.getTime())
      ? "Date unavailable"
      : `Checked ${checkedDate.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}`;
    ctx.fillStyle = "#7f8ca0";
    ctx.font = "500 18px Arial, sans-serif";
    ctx.fillText(formattedDate, 62, 620);

    const sitePrefix = "pubgbanchecker.com by";
    const channelLabel = "@Grump-E-Lemming";
    const youtubeIconWidth = 28;
    const attributionGap = 9;
    fitText(ctx, `${sitePrefix} ${channelLabel}`, 620, 20, 14, 900);
    const prefixWidth = ctx.measureText(sitePrefix).width;
    const channelWidth = ctx.measureText(channelLabel).width;
    const contentWidth = prefixWidth + attributionGap + youtubeIconWidth + attributionGap + channelWidth;
    const siteWidth = contentWidth + 36;
    const siteX = (CARD_WIDTH - siteWidth) / 2;
    ctx.fillStyle = "rgba(5, 11, 21, 0.9)";
    ctx.strokeStyle = config.accent;
    ctx.lineWidth = 2;
    roundedRect(ctx, siteX, 604, siteWidth, 46, 12);
    ctx.fill();
    ctx.stroke();

    const contentX = (CARD_WIDTH - contentWidth) / 2;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(sitePrefix, contentX, 634);

    const iconX = contentX + prefixWidth + attributionGap;
    ctx.fillStyle = "#ff0033";
    roundedRect(ctx, iconX, 615, youtubeIconWidth, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(iconX + 11, 620);
    ctx.lineTo(iconX + 11, 630);
    ctx.lineTo(iconX + 19, 625);
    ctx.closePath();
    ctx.fill();

    ctx.fillText(channelLabel, iconX + youtubeIconWidth + attributionGap, 634);
    ctx.textAlign = "left";

    filename = `PUBGBanChecker_${sanitizeFilenamePart(player, "Player")}_${sanitizeFilenamePart(config.title.replace(/\s+/g, ""), "BanCard")}.png`;
  }

  function validateData(data) {
    if (!data || typeof data !== "object") throw new Error("The backend returned an invalid response.");
    if (String(data.banStatus).toLowerCase() !== "permanently_banned") {
      const error = new Error(ERROR_MESSAGES.not_permanently_banned);
      error.code = "not_permanently_banned";
      throw error;
    }
    if (!data.mastery || !data.lifetime) throw new Error("The card response is missing required player data.");
    return data;
  }

  async function resolveAccountId(platform, player) {
    const url = `/api/resolve?platform=${encodeURIComponent(platform)}&name=${encodeURIComponent(player)}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok || !body.accountId) {
      const error = new Error(ERROR_MESSAGES.player_not_found);
      error.code = "player_not_found";
      throw error;
    }
    return body.accountId;
  }

  async function fetchCardData({ platform, accountId, player }) {
    const resolvedId = accountId && accountId !== "..."
      ? accountId
      : await resolveAccountId(platform, player);
    const url = `/api/ban-card-data?platform=${encodeURIComponent(platform)}&accountId=${encodeURIComponent(resolvedId)}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const code = body.error?.code || body.code || (response.status === 429 ? "rate_limited" : "upstream_error");
      const error = new Error(ERROR_MESSAGES[code] || body.error?.message || body.message || "The card could not be generated.");
      error.code = code;
      throw error;
    }
    return validateData(body);
  }

  function showError(error) {
    statusEl.hidden = false;
    statusEl.classList.add("error");
    statusEl.textContent = error.message || "The card could not be generated.";
    canvas.hidden = true;
    downloadBtn.disabled = true;
  }

  async function open(options) {
    lastTrigger = options.trigger || document.activeElement;
    modal.hidden = false;
    document.body.classList.add("ban-card-open");
    statusEl.hidden = false;
    statusEl.classList.remove("error");
    statusEl.textContent = "Loading card data…";
    canvas.hidden = true;
    downloadBtn.disabled = true;
    dialog.focus();
    const requestId = ++activeRequest;
    try {
      const data = await fetchCardData(options);
      if (requestId !== activeRequest || modal.hidden) return;
      statusEl.textContent = "Rendering card…";
      await drawCard(data);
      if (requestId !== activeRequest || modal.hidden) return;
      statusEl.hidden = true;
      canvas.hidden = false;
      downloadBtn.disabled = false;
    } catch (error) {
      if (requestId === activeRequest && !modal.hidden) showError(error);
    }
  }

  function close() {
    activeRequest += 1;
    modal.hidden = true;
    document.body.classList.remove("ban-card-open");
    const trigger = lastTrigger;
    lastTrigger = null;
    if (trigger?.isConnected) trigger.focus();
  }

  function download() {
    if (downloadBtn.disabled) return;
    canvas.toBlob(blob => {
      if (!blob) return showError(new Error("Your browser could not create the PNG."));
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  function keepFocusInside(event) {
    if (event.key === "Escape") return close();
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    modal = document.getElementById("banCardModal");
    dialog = modal?.querySelector(".ban-card-dialog");
    statusEl = document.getElementById("banCardStatus");
    canvas = document.getElementById("banCardCanvas");
    downloadBtn = document.getElementById("downloadBanCardBtn");
    if (!modal || !dialog || !statusEl || !canvas || !downloadBtn) return;
    modal.querySelectorAll("[data-ban-card-close]").forEach(element => element.addEventListener("click", close));
    downloadBtn.addEventListener("click", download);
    modal.addEventListener("keydown", keepFocusInside);
  });

  window.BanCard = { open };
})();
