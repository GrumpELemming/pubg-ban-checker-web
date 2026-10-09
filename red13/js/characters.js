(() => {
  const key = "red13_character";
  let selected = "red13";
  try { if (localStorage.getItem(key) === "rapture") selected = "rapture"; } catch {}
  window.selectedCharacter = selected;
  document.querySelectorAll('input[name="character"]').forEach(input => {
    input.checked = input.value === selected;
    input.addEventListener("change", () => {
      if (!input.checked) return;
      window.selectedCharacter = input.value;
      try { localStorage.setItem(key, input.value); } catch {}
    });
  });
})();
