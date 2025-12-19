const { MerkleTree } = require("merkletreejs");
const crypto = require("crypto");
const logger = require("./logger");
const fs = require("fs");
const path = require("path");

/**
 * Decentralized Threat Intelligence with Blockchain-lite Architecture
 * Uses Merkle trees for cryptographic verification of threat data
 */
class BlockchainThreatIntel {
  constructor(client) {
    this.client = client;
    this.blocks = []; // Blockchain of threat reports
    this.pendingTransactions = []; // Pending threat reports
    this.difficulty = 2; // Mining difficulty (number of leading zeros)
    this.miningReward = 10; // Reputation points for mining a block
    this.blockchainPath = path.join(__dirname, "../data/blockchain.json");

    // Initialize blockchain
    this.initialize();
  }

  /**
   * Initialize blockchain (load or create genesis block)
   */
  initialize() {
    try {
      // Try to load existing blockchain
      if (fs.existsSync(this.blockchainPath)) {
        const data = fs.readFileSync(this.blockchainPath, "utf8");
        this.blocks = JSON.parse(data);
        logger.info(
          "BlockchainThreatIntel",
          `Loaded blockchain with ${this.blocks.length} blocks`
        );
      } else {
        // Create genesis block
        this.blocks = [this.createGenesisBlock()];
        this.saveBlockchain();
        logger.info("BlockchainThreatIntel", "Created genesis block");
      }

      // Start automatic mining
      this.startAutoMining();
    } catch (error) {
      logger.error(
        "BlockchainThreatIntel",
        `Failed to initialize: ${error.message}`
      );
      // Create genesis block as fallback
      this.blocks = [this.createGenesisBlock()];
    }
  }

  /**
   * Create genesis block (first block in chain)
   */
  createGenesisBlock() {
    return {
      index: 0,
      timestamp: Date.now(),
      transactions: [
        {
          type: "genesis",
          data: "Sentinel Threat Intelligence Network - Genesis Block",
        },
      ],
      previousHash: "0",
      hash: this.calculateHash(0, Date.now(), [], "0", 0),
      nonce: 0,
      merkleRoot: "0",
    };
  }

  /**
   * Calculate hash for a block
   */
  calculateHash(index, timestamp, transactions, previousHash, nonce) {
    return crypto
      .createHash("sha256")
      .update(
        index + timestamp + JSON.stringify(transactions) + previousHash + nonce
      )
      .digest("hex");
  }

  /**
   * Calculate Merkle root from transactions
   */
  calculateMerkleRoot(transactions) {
    if (transactions.length === 0) {
      return "0";
    }

    // Create leaf nodes (hashes of transactions)
    const leaves = transactions.map((tx) =>
      crypto.createHash("sha256").update(JSON.stringify(tx)).digest("hex")
    );

    // Build Merkle tree
    const tree = new MerkleTree(leaves, crypto.createHash("sha256"));
    return tree.getRoot().toString("hex");
  }

  /**
   * Get Merkle proof for a transaction
   */
  getMerkleProof(blockIndex, transactionIndex) {
    const block = this.blocks[blockIndex];
    if (!block || !block.transactions[transactionIndex]) {
      return null;
    }

    const leaves = block.transactions.map((tx) =>
      crypto.createHash("sha256").update(JSON.stringify(tx)).digest("hex")
    );

    const tree = new MerkleTree(leaves, crypto.createHash("sha256"));
    const leaf = leaves[transactionIndex];
    const proof = tree.getProof(leaf);

    return {
      proof: proof.map((p) => ({
        position: p.position,
        data: p.data.toString("hex"),
      })),
      root: tree.getRoot().toString("hex"),
      leaf,
    };
  }

  /**
   * Verify Merkle proof
   */
  verifyMerkleProof(leaf, proof, root) {
    const tree = new MerkleTree([], crypto.createHash("sha256"));
    return tree.verify(
      proof.map((p) => ({
        position: p.position,
        data: Buffer.from(p.data, "hex"),
      })),
      leaf,
      root
    );
  }

  /**
   * Add threat report to pending transactions
   */
  reportThreat(guildId, reporterId, threatData) {
    const transaction = {
      id: `threat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: "threat_report",
      timestamp: Date.now(),
      guildId,
      reporterId,
      threatType: threatData.type,
      threatSeverity: threatData.severity,
      userId: threatData.userId,
      userTag: threatData.userTag,
      details: threatData.details,
      evidence: threatData.evidence || [],
      signature: this.signTransaction(guildId, reporterId, threatData),
    };

    this.pendingTransactions.push(transaction);

    logger.info(
      "BlockchainThreatIntel",
      `Threat report added to pending pool: ${transaction.id}`
    );

    // Auto-mine if enough transactions
    if (this.pendingTransactions.length >= 5) {
      this.mineBlock(reporterId);
    }

    return transaction.id;
  }

  /**
   * Sign transaction (simplified - in production use actual cryptographic signing)
   */
  signTransaction(guildId, reporterId, threatData) {
    const dataToSign = `${guildId}${reporterId}${threatData.type}${threatData.severity}${Date.now()}`;
    return crypto.createHash("sha256").update(dataToSign).digest("hex");
  }

  /**
   * Mine a new block (Proof of Work)
   */
  async mineBlock(minerAddress) {
    if (this.pendingTransactions.length === 0) {
      logger.warn("BlockchainThreatIntel", "No transactions to mine");
      return null;
    }

    logger.info(
      "BlockchainThreatIntel",
      `Mining new block with ${this.pendingTransactions.length} transactions...`
    );

    const previousBlock = this.blocks[this.blocks.length - 1];
    const index = previousBlock.index + 1;
    const timestamp = Date.now();

    // Add mining reward transaction
    this.pendingTransactions.push({
      type: "mining_reward",
      timestamp,
      minerAddress,
      amount: this.miningReward,
    });

    const transactions = [...this.pendingTransactions];
    const merkleRoot = this.calculateMerkleRoot(transactions);

    // Proof of Work - find nonce that produces hash with required difficulty
    let nonce = 0;
    let hash;
    const startTime = Date.now();

    do {
      nonce++;
      hash = this.calculateHash(
        index,
        timestamp,
        transactions,
        previousBlock.hash,
        nonce
      );
    } while (!hash.startsWith("0".repeat(this.difficulty)));

    const miningTime = Date.now() - startTime;

    const newBlock = {
      index,
      timestamp,
      transactions,
      previousHash: previousBlock.hash,
      hash,
      nonce,
      merkleRoot,
      miner: minerAddress,
    };

    // Validate and add block
    if (this.isValidBlock(newBlock, previousBlock)) {
      this.blocks.push(newBlock);
      this.pendingTransactions = []; // Clear pending transactions
      this.saveBlockchain();

      logger.info(
        "BlockchainThreatIntel",
        `✅ Block #${index} mined in ${miningTime}ms (nonce: ${nonce}, hash: ${hash.substring(0, 16)}...)`
      );

      // Update miner's reputation
      if (this.client.threatNetwork) {
        this.client.threatNetwork.updateReputation(minerAddress, true);
      }

      return newBlock;
    } else {
      logger.error("BlockchainThreatIntel", "Mined block failed validation!");
      return null;
    }
  }

  /**
   * Validate a block
   */
  isValidBlock(newBlock, previousBlock) {
    // Check index
    if (newBlock.index !== previousBlock.index + 1) {
      logger.error("BlockchainThreatIntel", "Invalid block index");
      return false;
    }

    // Check previous hash
    if (newBlock.previousHash !== previousBlock.hash) {
      logger.error("BlockchainThreatIntel", "Invalid previous hash");
      return false;
    }

    // Check hash
    const calculatedHash = this.calculateHash(
      newBlock.index,
      newBlock.timestamp,
      newBlock.transactions,
      newBlock.previousHash,
      newBlock.nonce
    );

    if (newBlock.hash !== calculatedHash) {
      logger.error("BlockchainThreatIntel", "Invalid block hash");
      return false;
    }

    // Check proof of work
    if (!newBlock.hash.startsWith("0".repeat(this.difficulty))) {
      logger.error("BlockchainThreatIntel", "Invalid proof of work");
      return false;
    }

    // Check Merkle root
    const calculatedMerkleRoot = this.calculateMerkleRoot(
      newBlock.transactions
    );
    if (newBlock.merkleRoot !== calculatedMerkleRoot) {
      logger.error("BlockchainThreatIntel", "Invalid Merkle root");
      return false;
    }

    return true;
  }

  /**
   * Validate entire blockchain
   */
  isValidChain() {
    // Check genesis block
    const genesisBlock = this.blocks[0];
    if (
      JSON.stringify(genesisBlock) !== JSON.stringify(this.createGenesisBlock())
    ) {
      logger.error("BlockchainThreatIntel", "Invalid genesis block");
      return false;
    }

    // Check all blocks
    for (let i = 1; i < this.blocks.length; i++) {
      const currentBlock = this.blocks[i];
      const previousBlock = this.blocks[i - 1];

      if (!this.isValidBlock(currentBlock, previousBlock)) {
        logger.error("BlockchainThreatIntel", `Invalid block at index ${i}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Save blockchain to disk
   */
  saveBlockchain() {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(this.blockchainPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.blockchainPath,
        JSON.stringify(this.blocks, null, 2)
      );
      logger.debug("BlockchainThreatIntel", "Blockchain saved to disk");
    } catch (error) {
      logger.error(
        "BlockchainThreatIntel",
        `Failed to save blockchain: ${error.message}`
      );
    }
  }

  /**
   * Start automatic mining
   */
  startAutoMining() {
    // Mine blocks every 30 seconds if there are pending transactions
    setInterval(() => {
      if (this.pendingTransactions.length > 0) {
        logger.info(
          "BlockchainThreatIntel",
          "Auto-mining triggered (30s interval)"
        );
        this.mineBlock("system");
      }
    }, 30000);

    logger.info(
      "BlockchainThreatIntel",
      "Automatic mining started (30s interval)"
    );
  }

  /**
   * Get threat reports for a user
   */
  getUserThreatReports(userId) {
    const reports = [];

    for (const block of this.blocks) {
      for (const tx of block.transactions) {
        if (tx.type === "threat_report" && tx.userId === userId) {
          reports.push({
            blockIndex: block.index,
            blockHash: block.hash,
            timestamp: tx.timestamp,
            guildId: tx.guildId,
            reporterId: tx.reporterId,
            threatType: tx.threatType,
            severity: tx.threatSeverity,
            verified: true, // Verified by being in blockchain
          });
        }
      }
    }

    return reports;
  }

  /**
   * Get reputation score for a server based on blockchain
   */
  getServerReputation(guildId) {
    let score = 100; // Start at 100
    let totalReports = 0;
    let accurateReports = 0;
    let blocksMinedReward = 0;

    for (const block of this.blocks) {
      // Count blocks mined (reputation boost)
      if (block.miner === guildId) {
        blocksMinedReward += this.miningReward;
      }

      // Count threat reports
      for (const tx of block.transactions) {
        if (tx.type === "threat_report" && tx.reporterId === guildId) {
          totalReports++;
          // Assume high severity reports that made it into blockchain are accurate
          if (tx.threatSeverity >= 7) {
            accurateReports++;
          }
        }
      }
    }

    const accuracy = totalReports > 0 ? accurateReports / totalReports : 1;
    score = Math.round(score * accuracy + blocksMinedReward);

    return {
      score: Math.min(1000, score), // Cap at 1000
      totalReports,
      accurateReports,
      accuracy,
      blocksMinedReward,
    };
  }

  /**
   * Get blockchain statistics
   */
  getStats() {
    return {
      blockCount: this.blocks.length,
      pendingTransactions: this.pendingTransactions.length,
      isValid: this.isValidChain(),
      difficulty: this.difficulty,
      latestBlock: this.blocks[this.blocks.length - 1],
    };
  }

  /**
   * Export blockchain for verification
   */
  exportChain() {
    return {
      version: "1.0",
      generatedAt: Date.now(),
      blocks: this.blocks,
      isValid: this.isValidChain(),
    };
  }
}

module.exports = BlockchainThreatIntel;
