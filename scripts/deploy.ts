import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const ETH_USD_FEED = process.env.ETH_USD_FEED;
  if (!ETH_USD_FEED) {
    throw new Error("Please set ETH_USD_FEED env var to Chainlink ETH/USD aggregator address");
  }

  const NFT = await ethers.getContractFactory("NFT");
  const nft = await NFT.deploy("DemoNFT", "DNFT", "https://example.com/", deployer.address);
  await nft.waitForDeployment();
  console.log("NFT:", await nft.getAddress());

  const Auction = await ethers.getContractFactory("AuctionUpgradeable");
  const auction = await upgrades.deployProxy(Auction, [deployer.address, ETH_USD_FEED], { kind: "uups" });
  await auction.waitForDeployment();
  console.log("Auction (proxy):", await auction.getAddress());

  // Optional: set ERC20 price feed via env variables
  const ERC20_TOKEN = process.env.ERC20_TOKEN;
  const ERC20_USD_FEED = process.env.ERC20_USD_FEED;
  if (ERC20_TOKEN && ERC20_USD_FEED) {
    const tx = await auction.setTokenUsdFeed(ERC20_TOKEN, ERC20_USD_FEED);
    await tx.wait();
    console.log("Set ERC20 feed:", ERC20_TOKEN, "->", ERC20_USD_FEED);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});