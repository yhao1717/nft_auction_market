import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Auction Factory", function () {
  it("creates auction and supports bids and settlement", async function () {
    const [deployer, seller, bidder1, bidder2] = await ethers.getSigners();

    const MockV3Agg = await ethers.getContractFactory("MockV3Aggregator");
    const ethUsd = await MockV3Agg.deploy(8, ethers.parseUnits("3000", 8));
    await ethUsd.waitForDeployment();
    const tokenUsd = await MockV3Agg.deploy(8, ethers.parseUnits("2", 8));
    await tokenUsd.waitForDeployment();

    const TestToken = await ethers.getContractFactory("TestToken");
    const tkn = await TestToken.deploy("Token", "TKN", deployer.address, ethers.parseEther("1000000"));
    await tkn.waitForDeployment();
    await tkn.connect(deployer).transfer(bidder1.address, ethers.parseEther("1000"));
    await tkn.connect(deployer).transfer(bidder2.address, ethers.parseEther("1000"));

    const NFT = await ethers.getContractFactory("NFT");
    const nft = await NFT.deploy("DemoNFT", "DNFT", "https://example.com/", seller.address);
    await nft.waitForDeployment();
    await nft.connect(seller).mint(seller.address);
    const tokenId = 1n;

    const Factory = await ethers.getContractFactory("AuctionFactoryUpgradeable");
    const factory = await upgrades.deployProxy(Factory, [deployer.address, await ethUsd.getAddress()], { kind: "uups" });
    await factory.waitForDeployment();
    await factory.connect(deployer).setTokenUsdFeed(await tkn.getAddress(), await tokenUsd.getAddress());

    await nft.connect(seller).approve(await factory.getAddress(), tokenId);
    const tx = await factory.connect(seller).createAuction(await nft.getAddress(), tokenId, 3600);
    const receipt = await tx.wait();
    const event = receipt!.logs.find(l => l.fragment?.name === "AuctionCreated");
    const auctionAddr = event!.args[0];

    const AuctionInstance = await ethers.getContractFactory("AuctionInstance");
    const auction = AuctionInstance.attach(auctionAddr);

    await auction.connect(bidder1).bidWithETH({ value: ethers.parseEther("0.5") });
    await tkn.connect(bidder2).approve(auctionAddr, ethers.parseEther("800"));
    await auction.connect(bidder2).bidWithERC20(await tkn.getAddress(), ethers.parseEther("800"));

    await ethers.provider.send("evm_increaseTime", [4000]);
    await ethers.provider.send("evm_mine", []);

    await auction.endAuction();
    expect(await nft.ownerOf(tokenId)).to.equal(bidder2.address);
    expect(await tkn.balanceOf(seller.address)).to.equal(ethers.parseEther("800"));
  });
});