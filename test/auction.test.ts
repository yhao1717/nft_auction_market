import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("NFT Auction Market", function () {
  it("supports ETH and ERC20 bids with USD comparison", async function () {
    const [deployer, seller, bidder1, bidder2] = await ethers.getSigners();

    // Deploy price feeds (MockV3Aggregator)
    const MockV3Agg = await ethers.getContractFactory("MockV3Aggregator");
    const ethUsd = await MockV3Agg.deploy(8, ethers.parseUnits("3000", 8)); // 1 ETH = $3000
    await ethUsd.waitForDeployment();

    const tokenUsd = await MockV3Agg.deploy(8, ethers.parseUnits("2", 8)); // 1 TKN = $2
    await tokenUsd.waitForDeployment();

    // Deploy ERC20 mock token
    const TestToken = await ethers.getContractFactory("TestToken");
    const tkn = await TestToken.deploy("Token", "TKN", deployer.address, ethers.parseEther("1000000"));
    await tkn.waitForDeployment();

    // Distribute tokens to bidders
    await tkn.connect(deployer).transfer(bidder1.address, ethers.parseEther("1000"));
    await tkn.connect(deployer).transfer(bidder2.address, ethers.parseEther("1000"));

    // Deploy NFT
    const NFT = await ethers.getContractFactory("NFT");
    const nft = await NFT.deploy("DemoNFT", "DNFT", "https://example.com/", seller.address);
    await nft.waitForDeployment();

    // Mint NFT to seller
    const tokenIdTx = await nft.connect(seller).mint(seller.address);
    await tokenIdTx.wait();
    const tokenId = 1n;

    // Deploy Auction (UUPS proxy)
    const Auction = await ethers.getContractFactory("AuctionUpgradeable");
    const auction = await upgrades.deployProxy(Auction, [deployer.address, await ethUsd.getAddress()], { kind: "uups" });
    await auction.waitForDeployment();

    // Set ERC20 price feed
    await auction.connect(deployer).setTokenUsdFeed(await tkn.getAddress(), await tokenUsd.getAddress());

    // Approve NFT to auction and create auction
    await nft.connect(seller).approve(await auction.getAddress(), tokenId);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const createTx = await auction.connect(seller).createAuction(await nft.getAddress(), tokenId, 3600);
    const receipt = await createTx.wait();
    const auctionId = 1n;

    // Bidder1 place 0.5 ETH bid -> USD = 1500 * 10^8
    const ethBid = ethers.parseEther("0.5");
    await expect(auction.connect(bidder1).bidWithETH(auctionId, { value: ethBid }))
      .to.emit(auction, "BidPlaced");

    // Bidder2 place ERC20 bid: 800 TKN -> USD = 1600 * 10^8, should outbid
    await tkn.connect(bidder2).approve(await auction.getAddress(), ethers.parseEther("800"));
    await expect(auction.connect(bidder2).bidWithERC20(auctionId, await tkn.getAddress(), ethers.parseEther("800")))
      .to.emit(auction, "BidPlaced");

    // End auction after time passes
    await ethers.provider.send("evm_increaseTime", [4000]);
    await ethers.provider.send("evm_mine", []);

    const sellerEthBefore = await ethers.provider.getBalance(seller.address);
    await expect(auction.endAuction(auctionId)).to.emit(auction, "AuctionEnded");

    // NFT transferred to bidder2
    expect(await nft.ownerOf(tokenId)).to.equal(bidder2.address);

    // Seller received 800 TKN
    const sellerTkn = await tkn.balanceOf(seller.address);
    expect(sellerTkn).to.equal(ethers.parseEther("800"));
  });
});