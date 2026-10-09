// Shared defaults for every new run/player. Chance is per eligible loot drop.
(() => {
  const BZR = (window.BZR = window.BZR || {});
  BZR.lootConfig = {
    jammerSpawnChance: 0.05,
    jammerProtectionMs: 20_000,
    debugLootRolls: true
  };
})();
