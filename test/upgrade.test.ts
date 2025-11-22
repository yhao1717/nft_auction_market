import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Factory upgrade", function () {
  it("upgrades factory to V2 and exposes version", async function () {
    const [deployer] = await ethers.getSigners();

    const MockV3Agg = await ethers.getContractFactory("MockV3Aggregator");
    const ethUsd = await MockV3Agg.deploy(8, ethers.parseUnits("3000", 8));
    await ethUsd.waitForDeployment();

    const Factory = await ethers.getContractFactory("AuctionFactoryUpgradeable");
    const factory = await upgrades.deployProxy(Factory, [deployer.address, await ethUsd.getAddress()], { kind: "uups" });
    await factory.waitForDeployment();

    const FactoryV2 = await ethers.getContractFactory("AuctionFactoryUpgradeableV2");
    const upgraded = await upgrades.upgradeProxy(await factory.getAddress(), FactoryV2);

    const v = await (upgraded as any).version();
    expect(v).to.equal("v2");
  });
});
