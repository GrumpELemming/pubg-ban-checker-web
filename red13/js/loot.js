(() => {
  const BZR = (window.BZR = window.BZR || {});
  BZR.loot = {
    rollJammer(location) {
      const chance = BZR.lootConfig.jammerSpawnChance;
      if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
        throw new RangeError("jammerSpawnChance must be a number between 0 and 1");
      }
      // Fresh browser/OS entropy per roll; no seed, player quota or pity counter.
      const value = window.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
      const success = value < chance;
      if (BZR.lootConfig.debugLootRolls) {
        console.debug("[Red13 loot] Jammer Pack roll", {
          ...location, chance, roll: value, result: success ? "success" : "failure"
        });
      }
      return success;
    }
  };
})();
