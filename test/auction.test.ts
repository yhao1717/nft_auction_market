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

    // Deploy Factory (UUPS proxy)
    const Factory = await ethers.getContractFactory("AuctionFactoryUpgradeable");
    const factory = await upgrades.deployProxy(Factory, [deployer.address, await ethUsd.getAddress()], { kind: "uups" });
    await factory.waitForDeployment();

    // Set ERC20 price feed in factory
    await factory.connect(deployer).setTokenUsdFeed(await tkn.getAddress(), await tokenUsd.getAddress());

    // Seller approves factory to transfer NFT, then create auction instance
    await nft.connect(seller).approve(await factory.getAddress(), tokenId);
    const createTx = await factory.connect(seller).createAuction(await nft.getAddress(), tokenId, 3600);
    const receipt = await createTx.wait();
    const createdEvt = (receipt as any).logs.find((l: any) => l.fragment?.name === "AuctionCreated");
    const instanceAddr = createdEvt.args[0];

    const instAbi = [
      "event BidPlaced(address indexed bidder,address indexed currency,uint256 amount,uint256 usdAmount)",
      "event AuctionEnded(address indexed winner,uint256 usdAmount)",
      "function bidWithETH() payable",
      "function bidWithERC20(address token,uint256 amount)",
      "function endAuction()",
    ];
    const inst = new ethers.Contract(instanceAddr, instAbi, ethers.provider);

    // Bidder1 place 0.5 ETH bid -> USD = 1500 * 10^8
    const ethBid = ethers.parseEther("0.5");
    await expect(inst.connect(bidder1).bidWithETH({ value: ethBid }))
      .to.emit(inst, "BidPlaced");

    // Bidder2 place ERC20 bid: 800 TKN -> USD = 1600 * 10^8, should outbid
    await tkn.connect(bidder2).approve(instanceAddr, ethers.parseEther("800"));
    await expect(inst.connect(bidder2).bidWithERC20(await tkn.getAddress(), ethers.parseEther("800")))
      .to.emit(inst, "BidPlaced");

    // End auction after time passes
    await ethers.provider.send("evm_increaseTime", [4000]);
    await ethers.provider.send("evm_mine", []);

    await expect(inst.connect(deployer).endAuction()).to.emit(inst, "AuctionEnded");

    // NFT transferred to bidder2
    expect(await nft.ownerOf(tokenId)).to.equal(bidder2.address);

    // Seller received 800 TKN
    const sellerTkn = await tkn.balanceOf(seller.address);
    expect(sellerTkn).to.equal(ethers.parseEther("800"));
  });
});
