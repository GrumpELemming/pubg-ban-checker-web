(() => {
  const BZR = (window.BZR = window.BZR || {});
  BZR.loot = {
    rollJammer(location) {
      return this.rollSpecialLoot(location, "rapture") === "J";
    },
    rollSpecialLoot(location, character, jammerEligible = true) {
      const chance = jammerEligible ? BZR.lootConfig.jammerSpawnChance : 0;
      if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
        throw new RangeError("jammerSpawnChance must be a number between 0 and 1");
      }
      const blueChipChance = character === "red13" ? BZR.lootConfig.blueChipSpawnChance : 0;
      if (!Number.isFinite(blueChipChance) || blueChipChance < 0 || chance + blueChipChance > 1) {
        throw new RangeError("Special loot chances must be nonnegative and total at most 1");
      }
      // Fresh browser/OS entropy per roll; no seed, player quota or pity counter.
      const value = window.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
      const success = value < chance;
      // Disjoint ranges keep both per-drop probabilities exact and spawn one item.
      const blueChip = !success && value < chance + blueChipChance;
      if (BZR.lootConfig.debugLootRolls) {
        console.debug("[Red13 loot] Jammer Pack roll", {
          ...location, chance, roll: value, result: success ? "success" : "failure"
        });
        if (character === "red13") console.debug("[Red13 loot] Blue Chip Detector roll", {
          ...location, chance: blueChipChance, roll: value, result: blueChip ? "success" : "failure"
        });
      }
      return success ? "J" : blueChip ? "BCD" : null;
    }
  };
})();
