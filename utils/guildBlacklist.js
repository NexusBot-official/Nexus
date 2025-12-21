// Simple guild blacklist utility
// Sources:
// - Environment variable GUILD_BLACKLIST (comma-separated list of guild IDs)
// - Built-in DEFAULT_BLACKLIST array (useful for defaults or examples)

const DEFAULT_BLACKLIST = [
  "1448208605076652042",
  "787732019253477388",
  "1416618288582234135",
  "758173714944229417", // Blacklisted owner
  "1416616277044363378", // Blacklisted owner
];

const envList = (process.env.GUILD_BLACKLIST || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const BLACKLIST = Array.from(new Set([...envList, ...DEFAULT_BLACKLIST])).map(
  (s) => String(s)
);

function isBlacklisted(id) {
  if (!id) return false;
  return BLACKLIST.includes(String(id));
}

function isOwnerBlacklisted(ownerId) {
  if (!ownerId) return false;
  return BLACKLIST.includes(String(ownerId));
}

/**
 * Check whether a guild is blacklisted by guild ID or owner ID.
 * Optionally fetches the owner if GUILD_BLACKLIST_FETCH_OWNERS=1 and owner id is not readily available.
 */
async function isGuildBlacklisted(guild) {
  if (!guild) return false;
  // Check guild id first
  if (isBlacklisted(guild.id)) return true;

  // Check cached owner id (discord.js v14 provides guild.ownerId)
  const ownerId = guild.ownerId || (guild.owner && guild.owner.id);
  if (ownerId && isOwnerBlacklisted(ownerId)) return true;

  // Optionally fetch owner if env var enabled
  if (process.env.GUILD_BLACKLIST_FETCH_OWNERS === "1") {
    try {
      const fetchedOwner = await guild.fetchOwner();
      const fetchedOwnerId = fetchedOwner?.user?.id;
      if (fetchedOwnerId && isOwnerBlacklisted(fetchedOwnerId)) return true;
    } catch (err) {
      // ignore fetch errors
    }
  }

  return false;
}

module.exports = {
  BLACKLIST,
  isBlacklisted,
  isOwnerBlacklisted,
  isGuildBlacklisted,
};
