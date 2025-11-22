const fs = require('fs')
const path = require('path')

function copyAbi(artifactPath, outPath) {
  const fullArtifact = path.resolve(__dirname, '..', artifactPath)
  const fullOut = path.resolve(__dirname, '..', outPath)
  const abiDir = path.dirname(fullOut)
  try {
    const data = JSON.parse(fs.readFileSync(fullArtifact, 'utf-8'))
    const abi = data.abi || []
    fs.mkdirSync(abiDir, { recursive: true })
    fs.writeFileSync(fullOut, JSON.stringify(abi, null, 2))
    console.log(`[abi:sync] wrote ${outPath}`)
  } catch (e) {
    console.error(`[abi:sync] failed for ${artifactPath}:`, e.message)
    process.exitCode = 1
  }
}

// Factory & Auction Instance
copyAbi('artifacts/contracts/AuctionFactoryUpgradeable.sol/AuctionFactoryUpgradeable.json', 'go-server/abi/factory.json')
copyAbi('artifacts/contracts/AuctionInstance.sol/AuctionInstance.json', 'go-server/abi/auction.json')

