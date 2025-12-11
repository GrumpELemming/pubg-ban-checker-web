// Simple i18n helper for static pages (excludes clan tracker)
// Languages: English (default), Korean, Chinese, German, Finnish

const LANGS = {
  en: "English",
  ko: "한국어",
  zh: "中文",
  de: "Deutsch",
  fi: "Suomi",
};

const TRANSLATIONS = {
  en: {
    "nav.ban": "Ban Checker",
    "nav.watchlist": "Watchlist",
    "nav.sniper": "Sniper Watch",
    "nav.links": "Links",
    "nav.about": "About",
    "nav.games": "Games",
    "nav.crate": "Crate Simulator",
    "nav.request": "Request language",
    "nav.lang": "Language",
  },
  ko: {
    "nav.ban": "밴 확인기",
    "nav.watchlist": "관심 목록",
    "nav.sniper": "스나이퍼 감시",
    "nav.links": "링크",
    "nav.about": "소개",
    "nav.games": "게임",
    "nav.crate": "상자 시뮬레이터",
    "nav.request": "언어 요청",
    "nav.lang": "언어",
  },
  zh: {
    "nav.ban": "封禁查询",
    "nav.watchlist": "关注列表",
    "nav.sniper": "狙击监控",
    "nav.links": "链接",
    "nav.about": "关于",
    "nav.games": "游戏",
    "nav.crate": "箱子模拟器",
    "nav.request": "请求语言",
    "nav.lang": "语言",
  },
  de: {
    "nav.ban": "Ban-Prüfer",
    "nav.watchlist": "Watchlist",
    "nav.sniper": "Sniper Watch",
    "nav.links": "Links",
    "nav.about": "Info",
    "nav.games": "Spiele",
    "nav.crate": "Kisten-Simulator",
    "nav.request": "Sprache anfragen",
    "nav.lang": "Sprache",
  },
  fi: {
    "nav.ban": "Ban-tarkistin",
    "nav.watchlist": "Seurantalista",
    "nav.sniper": "Sniper Watch",
    "nav.links": "Linkit",
    "nav.about": "Tietoja",
    "nav.games": "Pelit",
    "nav.crate": "Laatikkomallinnin",
    "nav.request": "Pyydä kieltä",
    "nav.lang": "Kieli",
  },
};

function getCurrentLang() {
  const saved = localStorage.getItem("siteLang");
  if (saved && LANGS[saved]) return saved;
  return "en";
}

function setCurrentLang(lang) {
  if (!LANGS[lang]) return;
  localStorage.setItem("siteLang", lang);
}

function applyTranslations(lang) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const txt = dict[key] || TRANSLATIONS.en[key] || el.textContent;
    el.textContent = txt;
  });
}

function buildLangSelector() {
  const container = document.querySelector(".lang-switch");
  if (!container) return;
  const label = container.querySelector("[data-i18n='nav.lang']");
  const select = container.querySelector("select");
  const requestBtn = container.querySelector("#requestLangBtn");
  const current = getCurrentLang();

  if (select) {
    select.innerHTML = "";
    Object.entries(LANGS).forEach(([code, name]) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      if (code === current) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      const lang = select.value;
      setCurrentLang(lang);
      applyTranslations(lang);
    });
  }

  if (requestBtn) {
    requestBtn.addEventListener("click", () => {
      window.location.href = "mailto:thegrumpylemming@gmail.com?subject=Language%20request";
    });
  }

  applyTranslations(current);
}

document.addEventListener("DOMContentLoaded", buildLangSelector);
