import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const ETH_USD_FEED = process.env.ETH_USD_FEED;
  if (!ETH_USD_FEED) throw new Error("ETH_USD_FEED required");

  const Factory = await ethers.getContractFactory("AuctionFactoryUpgradeable");
  const factory = await upgrades.deployProxy(Factory, [deployer.address, ETH_USD_FEED], { kind: "uups" });
  await factory.waitForDeployment();
  console.log("Factory:", await factory.getAddress());

  const ERC20_TOKEN = process.env.ERC20_TOKEN;
  const ERC20_USD_FEED = process.env.ERC20_USD_FEED;
  if (ERC20_TOKEN && ERC20_USD_FEED) {
    await (await factory.setTokenUsdFeed(ERC20_TOKEN, ERC20_USD_FEED)).wait();
    console.log("Configured token feed:", ERC20_TOKEN, "->", ERC20_USD_FEED);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });