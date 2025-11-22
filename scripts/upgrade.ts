import { ethers, upgrades } from "hardhat";

async function main() {
  const proxy = process.env.PROXY_ADDRESS;
  if (!proxy) throw new Error("Please set PROXY_ADDRESS to the deployed proxy address");

  const AuctionV2 = await ethers.getContractFactory("AuctionUpgradeableV2");
  const upgraded = await upgrades.upgradeProxy(proxy, AuctionV2);
  console.log("Upgraded proxy:", await upgraded.getAddress());
  const v = await (upgraded as any).version();
  console.log("Version:", v);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});