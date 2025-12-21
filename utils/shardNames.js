/**
 * Custom Shard & Cluster Names
 * Scalable naming system for 500+ shards and 50+ clusters
 */

// Base names for themed generation
const SHARD_PREFIXES = [
  "🛡️",
  "🗼",
  "🔭",
  "🚨",
  "⚔️",
  "🏰",
  "🎯",
  "🔒",
  "⚡",
  "🌟",
  "🔱",
  "🗡️",
  "🏹",
  "🔥",
  "💎",
  "🌊",
  "🌙",
  "☀️",
  "⭐",
  "🌌",
];

const SHARD_BASES = [
  "Nexus",
  "Watchtower",
  "Lookout",
  "Alarm",
  "Warden",
  "Citadel",
  "Ranger",
  "Keeper",
  "Striker",
  "Beacon",
  "Trident",
  "Blade",
  "Arrow",
  "Pyre",
  "Guardian",
  "Fortress",
  "Outpost",
  "Bastion",
  "Defender",
  "Vanguard",
  "Shield",
  "Vault",
  "Bulwark",
  "Aegis",
  "Rampart",
  "Sentry",
  "Patrol",
  "Watch",
  "Guard",
  "Protector",
  "Barrier",
  "Wall",
  "Gate",
  "Tower",
  "Post",
  "Scout",
  "Recon",
  "Spy",
  "Observer",
  "Monitor",
  "Hunter",
  "Tracker",
  "Seeker",
  "Finder",
  "Stalker",
  "Storm",
  "Thunder",
  "Lightning",
  "Tempest",
  "Gale",
  "Frost",
  "Blaze",
  "Inferno",
  "Glacier",
  "Volcano",
  "Nova",
  "Comet",
  "Meteor",
  "Pulsar",
  "Quasar",
];

const CLUSTER_PREFIXES = [
  "🐉",
  "🦅",
  "🦁",
  "🦄",
  "🐺",
  "🦂",
  "🦇",
  "🐍",
  "🦉",
  "🐲",
];

const CLUSTER_BASES = [
  "Dragon",
  "Phoenix",
  "Sphinx",
  "Unicorn",
  "Cerberus",
  "Hydra",
  "Basilisk",
  "Leviathan",
  "Griffin",
  "Wyvern",
  "Chimera",
  "Manticore",
  "Pegasus",
  "Kraken",
  "Minotaur",
  "Cyclops",
  "Titan",
  "Colossus",
  "Behemoth",
  "Goliath",
];

/**
 * Get name for a shard (supports 500+ shards)
 */
function getShardName(shardId) {
  // First shard is always Nexus
  if (shardId === 0) {
    return "🛡️ Nexus";
  }

  // Use base names for first 50 shards
  if (shardId <= 50) {
    const prefixIndex = (shardId - 1) % SHARD_PREFIXES.length;
    const baseIndex = (shardId - 1) % SHARD_BASES.length;
    return `${SHARD_PREFIXES[prefixIndex]} ${SHARD_BASES[baseIndex]}`;
  }

  // For shards 51-500, add suffixes (Alpha, Beta, Gamma, etc.)
  const suffixes = [
    "Alpha",
    "Beta",
    "Gamma",
    "Delta",
    "Epsilon",
    "Zeta",
    "Eta",
    "Theta",
    "Iota",
    "Kappa",
  ];
  const baseIndex = (shardId - 51) % SHARD_BASES.length;
  const suffixIndex =
    Math.floor((shardId - 51) / SHARD_BASES.length) % suffixes.length;
  const prefixIndex = (shardId - 51) % SHARD_PREFIXES.length;

  return `${SHARD_PREFIXES[prefixIndex]} ${SHARD_BASES[baseIndex]}-${suffixes[suffixIndex]}`;
}

/**
 * Get name for a cluster (supports 50+ clusters)
 */
function getClusterName(clusterId) {
  // Use base names for first 20 clusters
  if (clusterId < 20) {
    const prefixIndex = clusterId % CLUSTER_PREFIXES.length;
    const baseIndex = clusterId % CLUSTER_BASES.length;
    return `${CLUSTER_PREFIXES[prefixIndex]} ${CLUSTER_BASES[baseIndex]}`;
  }

  // For clusters 20-50, add Roman numerals
  const romanNumerals = [
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
  ];
  const baseIndex = (clusterId - 20) % CLUSTER_BASES.length;
  const numeralIndex =
    Math.floor((clusterId - 20) / CLUSTER_BASES.length) % romanNumerals.length;
  const prefixIndex = (clusterId - 20) % CLUSTER_PREFIXES.length;

  return `${CLUSTER_PREFIXES[prefixIndex]} ${CLUSTER_BASES[baseIndex]}-${romanNumerals[numeralIndex]}`;
}

/**
 * Get display name with ID
 */
function getShardDisplay(shardId) {
  return `${getShardName(shardId)} (#${shardId})`;
}

function getClusterDisplay(clusterId) {
  return `${getClusterName(clusterId)} (#${clusterId})`;
}

module.exports = {
  getShardName,
  getClusterName,
  getShardDisplay,
  getClusterDisplay,
  SHARD_BASES,
  CLUSTER_BASES,
};
