(() => {
  "use strict";

  const decode = values => String.fromCharCode(...values);
  const localPart = decode([116, 104, 101, 103, 114, 117, 109, 112, 121, 108, 101, 109, 109, 105, 110, 103]);
  const host = decode([103, 109, 97, 105, 108, 46, 99, 111, 109]);

  function address() {
    return `${localPart}${String.fromCharCode(64)}${host}`;
  }

  function reveal(trigger, subject = "") {
    if (!trigger || trigger.dataset.emailRevealed === "true") return null;
    const email = address();
    const link = document.createElement("a");
    link.className = "email-revealed-link";
    link.href = `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
    link.textContent = email;
    link.setAttribute("aria-label", `Email ${email}`);
    trigger.dataset.emailRevealed = "true";
    trigger.replaceWith(link);
    return link;
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-reveal-email]").forEach(trigger => {
      trigger.addEventListener("click", () => reveal(trigger, trigger.dataset.emailSubject || ""));
    });
  });

  window.PBCEmailReveal = Object.freeze({ reveal });
})();
