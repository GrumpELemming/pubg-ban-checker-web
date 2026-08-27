const toggleBtn = document.getElementById("toggleHistory");
const toggleText = toggleBtn?.querySelector("span");
const historyDiv = document.getElementById("history");

if (toggleBtn && toggleText && historyDiv) {
  historyDiv.classList.remove("visible", "collapsing");
  historyDiv.style.maxHeight = "0";
  historyDiv.style.opacity = "0";
  historyDiv.setAttribute("aria-hidden", "true");

  toggleBtn.addEventListener("click", () => {
    if (historyDiv.classList.contains("visible")) {
      historyDiv.classList.remove("visible");
      historyDiv.classList.add("collapsing");
      toggleBtn.setAttribute("aria-expanded", "false");
      historyDiv.setAttribute("aria-hidden", "true");
      toggleText.classList.add("fade-out");
      setTimeout(() => {
        toggleText.textContent = "Show Version History";
        toggleText.classList.remove("fade-out");
        toggleText.classList.add("fade-in");
        setTimeout(() => toggleText.classList.remove("fade-in"), 300);
      }, 300);
      setTimeout(() => {
        historyDiv.classList.remove("collapsing");
        historyDiv.style.maxHeight = "0";
        historyDiv.style.opacity = "0";
      }, 800);
    } else {
      historyDiv.style.maxHeight = `${historyDiv.scrollHeight}px`;
      historyDiv.style.opacity = "1";
      historyDiv.classList.add("visible");
      toggleBtn.setAttribute("aria-expanded", "true");
      historyDiv.setAttribute("aria-hidden", "false");
      toggleText.classList.add("fade-out");
      setTimeout(() => {
        toggleText.textContent = "Hide Version History";
        toggleText.classList.remove("fade-out");
        toggleText.classList.add("fade-in");
        setTimeout(() => toggleText.classList.remove("fade-in"), 300);
      }, 300);
    }
  });
}
