// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract AuctionUpgradeable is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    /// @dev USD amounts are stored using 8 decimals (Chainlink standard)
    uint256 private constant USD_DECIMALS = 8;

    struct Auction {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 endTime;
        address highestBidder;
        address highestCurrency; // address(0) for ETH, ERC20 address otherwise
        uint256 highestAmount; // wei or token units
        uint256 highestUsd; // 8 decimals
        bool settled;
    }

    /// @dev incremental auction id
    uint256 public nextAuctionId;
    mapping(uint256 => Auction) public auctions;

    /// @dev token => Chainlink price feed (USD)
    mapping(address => AggregatorV3Interface) public tokenUsdFeed;
    AggregatorV3Interface public ethUsdFeed;

    event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed nft, uint256 tokenId, uint256 endTime);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, address indexed currency, uint256 amount, uint256 usdAmount);
    event AuctionEnded(uint256 indexed auctionId, address indexed winner, uint256 usdAmount);

    function initialize(address initialOwner, address ethUsdAggregator) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        ethUsdFeed = AggregatorV3Interface(ethUsdAggregator);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setEthUsdFeed(address aggregator) external onlyOwner {
        ethUsdFeed = AggregatorV3Interface(aggregator);
    }

    function setTokenUsdFeed(address token, address aggregator) external onlyOwner {
        tokenUsdFeed[token] = AggregatorV3Interface(aggregator);
    }

    function createAuction(address nft, uint256 tokenId, uint256 durationSeconds) external nonReentrant returns (uint256 auctionId) {
        require(durationSeconds >= 60, "duration too short");

        IERC721(nft).transferFrom(msg.sender, address(this), tokenId);

        auctionId = ++nextAuctionId;
        auctions[auctionId] = Auction({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            endTime: block.timestamp + durationSeconds,
            highestBidder: address(0),
            highestCurrency: address(0),
            highestAmount: 0,
            highestUsd: 0,
            settled: false
        });
        emit AuctionCreated(auctionId, msg.sender, nft, tokenId, auctions[auctionId].endTime);
    }

    function bidWithETH(uint256 auctionId) external payable nonReentrant {
        Auction storage a = auctions[auctionId];
        require(a.seller != address(0), "auction not found");
        require(block.timestamp < a.endTime, "auction ended");
        uint256 usdAmount = _ethToUsd(msg.value);
        require(usdAmount > a.highestUsd, "bid too low");

        _refundPreviousBid(a);

        a.highestBidder = msg.sender;
        a.highestCurrency = address(0);
        a.highestAmount = msg.value;
        a.highestUsd = usdAmount;
        emit BidPlaced(auctionId, msg.sender, address(0), msg.value, usdAmount);
    }

    function bidWithERC20(uint256 auctionId, address token, uint256 amount) external nonReentrant {
        Auction storage a = auctions[auctionId];
        require(a.seller != address(0), "auction not found");
        require(block.timestamp < a.endTime, "auction ended");
        require(address(tokenUsdFeed[token]) != address(0), "no price feed");

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        uint256 usdAmount = _erc20ToUsd(token, amount);
        require(usdAmount > a.highestUsd, "bid too low");

        _refundPreviousBid(a);

        a.highestBidder = msg.sender;
        a.highestCurrency = token;
        a.highestAmount = amount;
        a.highestUsd = usdAmount;
        emit BidPlaced(auctionId, msg.sender, token, amount, usdAmount);
    }

    function endAuction(uint256 auctionId) external nonReentrant {
        Auction storage a = auctions[auctionId];
        require(a.seller != address(0), "auction not found");
        require(!a.settled, "already settled");
        require(block.timestamp >= a.endTime, "not ended");

        a.settled = true;

        if (a.highestBidder == address(0)) {
            // no bids: return NFT to seller
            IERC721(a.nft).transferFrom(address(this), a.seller, a.tokenId);
            emit AuctionEnded(auctionId, address(0), 0);
            return;
        }

        // transfer NFT to winner
        IERC721(a.nft).transferFrom(address(this), a.highestBidder, a.tokenId);

        // payout to seller in the winning currency
        if (a.highestCurrency == address(0)) {
            (bool ok, ) = payable(a.seller).call{value: a.highestAmount}("");
            require(ok, "eth payout failed");
        } else {
            IERC20(a.highestCurrency).transfer(a.seller, a.highestAmount);
        }

        emit AuctionEnded(auctionId, a.highestBidder, a.highestUsd);
    }

    function _refundPreviousBid(Auction storage a) internal {
        if (a.highestBidder == address(0)) return;
        if (a.highestCurrency == address(0)) {
            (bool ok, ) = payable(a.highestBidder).call{value: a.highestAmount}("");
            require(ok, "eth refund failed");
        } else {
            IERC20(a.highestCurrency).transfer(a.highestBidder, a.highestAmount);
        }
    }

    function _ethToUsd(uint256 amountWei) internal view returns (uint256) {
        (, int256 price,,,) = ethUsdFeed.latestRoundData();
        require(price > 0, "bad price");
        // price has 8 decimals typically; USD amount has 8 decimals
        return uint256(price) * amountWei / 1e18;
    }

    function _erc20ToUsd(address token, uint256 amount) internal view returns (uint256) {
        AggregatorV3Interface feed = tokenUsdFeed[token];
        (, int256 price,,,) = feed.latestRoundData();
        require(price > 0, "bad price");
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        // USD 8 decimals assumed
        return uint256(price) * amount / (10 ** tokenDecimals);
    }

    receive() external payable {}
}