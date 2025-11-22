import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Auction upgrade", function () {
  it("upgrades to V2 and exposes version", async function () {
    const [deployer] = await ethers.getSigners();

    const MockV3Agg = await ethers.getContractFactory("MockV3Aggregator");
    const ethUsd = await MockV3Agg.deploy(8, ethers.parseUnits("3000", 8));
    await ethUsd.waitForDeployment();

    const Auction = await ethers.getContractFactory("AuctionUpgradeable");
    const auction = await upgrades.deployProxy(Auction, [deployer.address, await ethUsd.getAddress()], { kind: "uups" });
    await auction.waitForDeployment();

    const AuctionV2 = await ethers.getContractFactory("AuctionUpgradeableV2");
    const upgraded = await upgrades.upgradeProxy(await auction.getAddress(), AuctionV2);

    const v = await (upgraded as any).version();
    expect(v).to.equal("v2");
  });
});