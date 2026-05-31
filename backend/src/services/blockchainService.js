import { ethers } from 'ethers'
import { createHash } from 'crypto'
import dotenv from 'dotenv'
import ViolationEvent from '../models/ViolationEvent.js'
import BlockchainRecord from '../models/BlockchainRecord.js'
import contractABI from '../contracts/ViolationRegistry.json' with { type: 'json' }

dotenv.config()

const MAX_RETRIES = 2

// ──────────────────────────────────────────────
// Provider & Contract singleton (lazy init)
// ──────────────────────────────────────────────
let _provider = null
let _wallet = null
let _contract = null

function getContract() {
  if (_contract) return _contract

  const rpcUrl = process.env.SEPOLIA_RPC_URL
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY
  const contractAddress = process.env.CONTRACT_ADDRESS

  if (!rpcUrl || !privateKey || !contractAddress) {
    throw new Error('Missing blockchain env vars: SEPOLIA_RPC_URL, SEPOLIA_PRIVATE_KEY, CONTRACT_ADDRESS')
  }

  _provider = new ethers.JsonRpcProvider(rpcUrl)
  _wallet = new ethers.Wallet(privateKey, _provider)
  _contract = new ethers.Contract(contractAddress, contractABI, _wallet)
  return _contract
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Build canonical payload từ violations (không chứa tên/MSSV).
 * Sort keys → JSON.stringify để đảm bảo deterministic.
 */
function buildPayload(sessionId, violations) {
  const payload = {
    sessionId,
    violations: violations.map(v => ({
      at: v.timestamp instanceof Date ? v.timestamp.getTime() : v.timestamp,
      type: v.type,
    })),
  }
  // Sort keys cho deterministic JSON
  return JSON.parse(JSON.stringify(payload, Object.keys(payload).sort()))
}

/**
 * SHA-256 hash → bytes32 hex string
 */
function hashPayload(payload) {
  const json = JSON.stringify(payload, Object.keys(payload).sort())
  const hash = createHash('sha256').update(json).digest('hex')
  return '0x' + hash
}

// ──────────────────────────────────────────────
// Main functions
// ──────────────────────────────────────────────

/**
 * Push violations lên blockchain.
 * 
 * Flow:
 * 1. Build payload (canonical, no PII)
 * 2. SHA-256 → bytes32 dataHash
 * 3. Tạo BlockchainRecord status: 'pending'
 * 4. Gọi contract.logViolation()
 * 5. Thành công → update confirmed
 * 6. Thất bại → retry tối đa MAX_RETRIES lần
 * 
 * @param {string} sessionId - UUID phiên giám sát
 * @param {Array} violations - Mảng ViolationEvent instances
 * @returns {{ tx_hash, block_number, data_hash, status }}
 */
export async function pushToBlockchain(sessionId, violations) {
  const contract = getContract()

  // 1. Build payload & hash
  const payload = buildPayload(sessionId, violations)
  const dataHash = hashPayload(payload)

  // 2. Build on-chain violation structs
  const onChainViolations = violations.map(v => ({
    violationType: v.type,
    timestamp: Math.floor(
      (v.timestamp instanceof Date ? v.timestamp.getTime() : v.timestamp) / 1000
    ),
  }))

  // 3. Tạo pending record
  const record = await BlockchainRecord.create({
    session_id: sessionId,
    data_hash: dataHash,
    status: 'pending',
  })

  // 4. Gọi contract với retry
  let lastError = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tx = await contract.logViolation(sessionId, dataHash, onChainViolations)
      const receipt = await tx.wait()

      // 5. Thành công → update record
      record.tx_hash = receipt.hash
      record.block_number = receipt.blockNumber
      record.status = 'confirmed'
      record.confirmed_at = new Date()
      await record.save()

      console.log(`[Blockchain] ✅ Pushed session ${sessionId} — tx: ${receipt.hash}`)

      return {
        tx_hash: receipt.hash,
        block_number: receipt.blockNumber,
        data_hash: dataHash,
        status: 'confirmed',
      }
    } catch (error) {
      lastError = error
      record.retry_count = attempt + 1
      await record.save()

      console.error(
        `[Blockchain] ❌ Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for session ${sessionId}:`,
        error.message
      )

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 2s, 4s
        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
      }
    }
  }

  // 6. Hết retry → failed
  record.status = 'failed'
  await record.save()

  console.error(`[Blockchain] 💀 All retries exhausted for session ${sessionId}:`, lastError?.message)

  return {
    tx_hash: null,
    block_number: null,
    data_hash: dataHash,
    status: 'failed',
  }
}

/**
 * Verify tính toàn vẹn dữ liệu vi phạm trên blockchain.
 * 
 * Flow:
 * 1. Lấy violations gốc từ DB → build lại payload → hash
 * 2. Query event ViolationLogged theo sessionId trên chain
 * 3. So sánh hash
 * 
 * @param {string} sessionId - UUID phiên giám sát
 * @returns {{ match, on_chain_hash, recomputed_hash }}
 */
export async function verifySession(sessionId) {
  const contract = getContract()

  // 1. Lấy violations từ DB và build lại hash
  const violations = await ViolationEvent.findAll({
    where: { session_id: sessionId, severity: 'high' },
    order: [['timestamp', 'ASC']],
  })

  if (violations.length === 0) {
    return { match: false, on_chain_hash: null, recomputed_hash: null, reason: 'No high-severity violations found in DB' }
  }

  const payload = buildPayload(sessionId, violations)
  const recomputedHash = hashPayload(payload)

  // 2. Query events on-chain
  try {
    const filter = contract.filters.ViolationLogged(sessionId)
    const events = await contract.queryFilter(filter)

    if (events.length === 0) {
      return { match: false, on_chain_hash: null, recomputed_hash: recomputedHash, reason: 'No events found on chain' }
    }

    // Lấy event mới nhất
    const latestEvent = events[events.length - 1]
    const onChainHash = latestEvent.args.dataHash

    // 3. So sánh
    const match = onChainHash.toLowerCase() === recomputedHash.toLowerCase()

    return {
      match,
      on_chain_hash: onChainHash,
      recomputed_hash: recomputedHash,
    }
  } catch (error) {
    console.error('[Blockchain] Verify error:', error.message)
    return {
      match: false,
      on_chain_hash: null,
      recomputed_hash: recomputedHash,
      reason: `Chain query failed: ${error.message}`,
    }
  }
}
