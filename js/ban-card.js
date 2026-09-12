/* Optional, on-demand permanent-ban card renderer. */
(() => {
  "use strict";

  const CARD_WIDTH = 1200;
  const CARD_HEIGHT = 675;
  const CUSTOM_CARDS = {
    "account.58f05022e6244ad8823fdeab7066c86a": {
      image: "img/ban-cards/abu-abd-shady-knights-salty-whale.png?v=20260912b",
      filename: "PUBGBanChecker_ABU-ABD_BannedByShadyKnights.png",
      title: "BANNED BY SHADY KNIGHTS",
      accent: "#f2cb63"
    },
    "account.bb1ee7c376114fd6badf69eda4b016b0": {
      image: "img/ban-cards/grindisreaaal-naruto.webp?v=20260912a",
      filename: "PUBGBanChecker_sibarsaakiiya_BannedByGrindisReaaal.png",
      title: "BANNED BY GrindisReaaal",
      accent: "#77d9ff"
    },
    "account.07e7ed72079a4af493991f4cba46f3cd": {
      image: "img/ban-cards/grindisreaaal-naruto.webp?v=20260912a",
      filename: "PUBGBanChecker_godgimchi8024_BannedByGrindisReaaal.png",
      title: "BANNED BY GrindisReaaal",
      accent: "#77d9ff"
    },
    "account.474cb9d0291443b0b97213e5c6ffccf9": {
      image: "img/ban-cards/grindisreaaal-naruto.webp?v=20260912a",
      filename: "PUBGBanChecker_sha2wosimA_BannedByGrindisReaaal.png",
      title: "BANNED BY GrindisReaaal",
      accent: "#77d9ff"
    },
    "account.3da63b18cb7b4e369f9d7dc5136f93bd": {
      image: "img/ban-cards/xnemesisx-pubgtogether.png?v=20260910a",
      filename: "PUBGBanChecker_XNEMESISX_GRIIMlREAPERR_BannedByPUBGTogether.png",
      title: "banned by pubgtogether",
      accent: "#e3b83f"
    },
    "account.7fb85c5eae014598acff30755431e4fa": {
      image: "img/ban-cards/dmbqpdcr7vsxi7-nooob-radar.png?v=20260909a",
      filename: "PUBGBanChecker_DMBqPdCr7VsXI7_ExposedByNooobRadar.png",
      title: "Exposed by nooob radar",
      accent: "#f0b47d"
    },
    "account.6d96eb34e42046af9e9befba6e81df8b": {
      image: "img/ban-cards/abualixx-ban-hammer.png?v=20260906a",
      filename: "PUBGBanChecker_abualixx_BannedBySZVXY.png",
      title: "BANNED BY SZVXY",
      accent: "#ff4b43"
    },
    "account.308b52a145fc425a92eb9d4fd17af37a": {
      image: "img/ban-cards/bellebollo-account-banned.png?v=20260827b",
      filename: "PUBGBanChecker_bellebollo_AccountBanned.png"
    }
  };
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

  function drawCoverImage(ctx, image) {
    const scale = Math.max(CARD_WIDTH / image.naturalWidth, CARD_HEIGHT / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, (CARD_WIDTH - width) / 2, (CARD_HEIGHT - height) / 2, width, height);
  }

  function drawCustomCardStats(ctx, data, customCard) {
    const stats = data.lifetime || {};
    const timePlayedHours = stats.timeSurvived === undefined || stats.timeSurvived === null
      ? null
      : safeNumber(stats.timeSurvived) / 3600;
    const highestRank = data.ranked?.highest?.label || "Unranked";
    const tierNumber = safeNumber(data.mastery?.tierNumber);
    const level = safeNumber(data.mastery?.level);
    const player = String(data.player || "Unknown player");
    const tierConfig = getTierConfig(data.mastery?.tier);
    const checkedDate = new Date(data.checkedAt);
    const formattedDate = Number.isNaN(checkedDate.getTime())
      ? "Date unavailable"
      : `Checked ${checkedDate.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}`;

    const panel = ctx.createLinearGradient(0, 480, 0, CARD_HEIGHT);
    panel.addColorStop(0, "rgba(4, 7, 12, 0.80)");
    panel.addColorStop(1, "rgba(4, 7, 12, 0.97)");
    ctx.fillStyle = panel;
    ctx.fillRect(0, 478, CARD_WIDTH, CARD_HEIGHT - 478);
    ctx.fillStyle = customCard.accent || "#ff4b43";
    ctx.fillRect(0, 478, CARD_WIDTH, 5);

    fitText(ctx, player, 620, 34, 24, 900);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(ellipsize(ctx, player, 620), 42, 518);
    ctx.fillStyle = customCard.accent || "#ff4b43";
    ctx.font = "900 19px Arial, sans-serif";
    ctx.fillText(customCard.title || "PERMANENTLY BANNED", 42, 547);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    fitText(ctx, tierConfig.title, 480, 22, 16, 900);
    ctx.fillText(ellipsize(ctx, tierConfig.title, 480), 770, 547);
    ctx.textAlign = "left";
    ctx.fillStyle = "#aab4c3";
    ctx.font = "700 14px Arial, sans-serif";
    ctx.fillText(`SURVIVAL  Tier ${tierNumber || "?"} · Level ${level}/500`, 42, 575);
    ctx.fillText(`CLAN  ${data.clan || "No clan"}`, 355, 575);
    ctx.fillText(`HIGHEST RANK  ${highestRank}`, 620, 575);

    const statItems = [
      ["MATCHES", safeNumber(stats.matches).toLocaleString("en-GB")],
      ["KILLS", safeNumber(stats.kills).toLocaleString("en-GB")],
      ["WINS", safeNumber(stats.wins).toLocaleString("en-GB")],
      ["K/D", safeNumber(stats.losses) === 0 ? "—" : safeNumber(stats.kd).toFixed(2)],
      ["PLAYTIME", timePlayedHours === null ? "—" : `${timePlayedHours.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`]
    ];
    statItems.forEach(([label, value], index) => {
      const x = 42 + index * 155;
      ctx.fillStyle = "#8f9bab";
      ctx.font = "700 13px Arial, sans-serif";
      ctx.fillText(label, x, 610);
      ctx.fillStyle = index === 3 ? (customCard.accent || "#ff4b43") : "#ffffff";
      ctx.font = "900 25px Arial, sans-serif";
      ctx.fillText(String(value), x, 641);
    });

    ctx.textAlign = "right";
    ctx.fillStyle = "#c9d1dc";
    ctx.font = "600 14px Arial, sans-serif";
    ctx.fillText(String(data.accountId || ""), 1158, 610);
    ctx.fillStyle = "#8f9bab";
    ctx.fillText(formattedDate, 1158, 638);
    ctx.fillText("pubgbanchecker.com by @Grump-E-Lemming", 1158, 664);
    ctx.textAlign = "left";
  }

  function drawShadyKnightsArtwork(ctx) {
    const sky = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    sky.addColorStop(0, "#071119");
    sky.addColorStop(0.55, "#173b4b");
    sky.addColorStop(1, "#061018");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Moonlight, waves, and a deliberately theatrical salt storm.
    ctx.fillStyle = "rgba(255, 232, 158, 0.18)";
    ctx.beginPath();
    ctx.arc(890, 155, 142, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(126, 218, 237, 0.28)";
    ctx.lineWidth = 10;
    for (let y = 310; y < 490; y += 38) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(150, y - 26, 300, y + 28, 475, y);
      ctx.bezierCurveTo(670, y - 24, 860, y + 24, 1200, y - 6);
      ctx.stroke();
    }

    // Whale emerging from the sea on the right.
    ctx.save();
    ctx.translate(885, 343);
    ctx.rotate(-0.14);
    ctx.fillStyle = "#60778c";
    ctx.beginPath();
    ctx.ellipse(0, 0, 225, 104, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#42596d";
    ctx.beginPath();
    ctx.moveTo(180, -12); ctx.lineTo(290, -95); ctx.lineTo(254, 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#aac0c9";
    ctx.beginPath();
    ctx.ellipse(-12, 47, 146, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4fbef";
    ctx.beginPath();
    ctx.arc(-74, -22, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0c1720";
    ctx.beginPath();
    ctx.arc(-74, -22, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Armoured bear inspired by the supplied reference: helmet, brown fur, red eyes.
    ctx.save();
    ctx.translate(350, 278);
    ctx.fillStyle = "#452516";
    ctx.beginPath(); ctx.arc(-116, -94, 52, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(116, -94, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#6b3b22";
    ctx.beginPath(); ctx.ellipse(0, 12, 157, 190, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#9a6038";
    ctx.beginPath(); ctx.ellipse(0, 42, 79, 74, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#27140e";
    ctx.beginPath(); ctx.ellipse(0, 12, 33, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d52a22";
    [-54, 54].forEach(x => { ctx.beginPath(); ctx.arc(x, -24, 14, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = "#ffd258";
    [-54, 54].forEach(x => { ctx.beginPath(); ctx.arc(x, -24, 5, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = "#b08a43";
    ctx.beginPath(); ctx.ellipse(0, -140, 126, 66, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#493716";
    ctx.fillRect(-122, -143, 244, 24);
    ctx.fillStyle = "#d3ae5c";
    ctx.beginPath(); ctx.moveTo(0, -237); ctx.lineTo(34, -175); ctx.lineTo(-34, -175); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#85472b";
    ctx.beginPath(); ctx.moveTo(-160, 130); ctx.lineTo(-205, 270); ctx.lineTo(-94, 252); ctx.lineTo(-48, 143); ctx.closePath(); ctx.fill();
    ctx.restore();

    // The raised paw and a stream of salt falling over the whale.
    ctx.fillStyle = "#6b3b22";
    ctx.beginPath(); ctx.ellipse(550, 105, 60, 78, -0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e9d8b0";
    for (let i = 0; i < 115; i += 1) {
      const progress = i / 114;
      const x = 587 + progress * 225 + Math.sin(i * 2.9) * (18 + progress * 55);
      const y = 158 + progress * 210 + (i % 7) * 9;
      const size = 2 + (i % 4);
      ctx.fillRect(x, y, size, size);
    }
    ctx.fillStyle = "rgba(4, 11, 16, 0.76)";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    const vignette = ctx.createRadialGradient(600, 270, 90, 600, 270, 720);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.54)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
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
    const customCard = CUSTOM_CARDS[String(data.accountId || "").toLowerCase()];
    if (customCard) {
      ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
      if (customCard.renderer === "shady-knights") {
        drawShadyKnightsArtwork(ctx);
      } else {
        const image = await loadImage(customCard.image);
        drawCoverImage(ctx, image);
      }
      drawCustomCardStats(ctx, data, customCard);
      filename = customCard.filename;
      return;
    }
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
    ctx.textAlign = "left";
    ctx.fillText("PERMANENTLY BANNED", 485, 76);
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
    const contentX = 485;
    const siteX = contentX - 18;
    ctx.fillStyle = "rgba(5, 11, 21, 0.9)";
    ctx.strokeStyle = config.accent;
    ctx.lineWidth = 2;
    roundedRect(ctx, siteX, 604, siteWidth, 46, 12);
    ctx.fill();
    ctx.stroke();

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
