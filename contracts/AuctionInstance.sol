// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

interface IAuctionFactoryFeeds {
    function ethUsdFeed() external view returns (AggregatorV3Interface);
    function tokenUsdFeed(address token) external view returns (AggregatorV3Interface);
}

contract AuctionInstance is ReentrancyGuard {
    address public immutable factory;
    address public immutable seller;
    address public immutable nft;
    uint256 public immutable tokenId;
    uint256 public immutable endTime;

    address public highestBidder;
    address public highestCurrency;
    uint256 public highestAmount;
    uint256 public highestUsd;
    bool public settled;

    event BidPlaced(address indexed bidder, address indexed currency, uint256 amount, uint256 usdAmount);
    event AuctionEnded(address indexed winner, uint256 usdAmount);

    constructor(address factory_, address seller_, address nft_, uint256 tokenId_, uint256 endTime_) {
        factory = factory_;
        seller = seller_;
        nft = nft_;
        tokenId = tokenId_;
        endTime = endTime_;
    }

    function bidWithETH() external payable nonReentrant {
        require(block.timestamp < endTime, "ended");
        uint256 usdAmount = _ethToUsd(msg.value);
        require(usdAmount > highestUsd, "low");
        _refundPreviousBid();
        highestBidder = msg.sender;
        highestCurrency = address(0);
        highestAmount = msg.value;
        highestUsd = usdAmount;
        emit BidPlaced(msg.sender, address(0), msg.value, usdAmount);
    }

    function bidWithERC20(address token, uint256 amount) external nonReentrant {
        require(block.timestamp < endTime, "ended");
        require(address(IAuctionFactoryFeeds(factory).tokenUsdFeed(token)) != address(0), "no feed");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        uint256 usdAmount = _erc20ToUsd(token, amount);
        require(usdAmount > highestUsd, "low");
        _refundPreviousBid();
        highestBidder = msg.sender;
        highestCurrency = token;
        highestAmount = amount;
        highestUsd = usdAmount;
        emit BidPlaced(msg.sender, token, amount, usdAmount);
    }

    function endAuction() external nonReentrant {
        require(!settled, "settled");
        require(block.timestamp >= endTime, "not end");
        settled = true;

        if (highestBidder == address(0)) {
            IERC721(nft).transferFrom(address(this), seller, tokenId);
            emit AuctionEnded(address(0), 0);
            return;
        }

        IERC721(nft).transferFrom(address(this), highestBidder, tokenId);
        if (highestCurrency == address(0)) {
            (bool ok, ) = payable(seller).call{value: highestAmount}("");
            require(ok, "payout");
        } else {
            IERC20(highestCurrency).transfer(seller, highestAmount);
        }
        emit AuctionEnded(highestBidder, highestUsd);
    }

    function _refundPreviousBid() internal {
        if (highestBidder == address(0)) return;
        if (highestCurrency == address(0)) {
            (bool ok, ) = payable(highestBidder).call{value: highestAmount}("");
            require(ok, "refund");
        } else {
            IERC20(highestCurrency).transfer(highestBidder, highestAmount);
        }
    }

    function _ethToUsd(uint256 amountWei) internal view returns (uint256) {
        (, int256 price,,,) = IAuctionFactoryFeeds(factory).ethUsdFeed().latestRoundData();
        require(price > 0, "price");
        return uint256(price) * amountWei / 1e18;
    }

    function _erc20ToUsd(address token, uint256 amount) internal view returns (uint256) {
        (, int256 price,,,) = IAuctionFactoryFeeds(factory).tokenUsdFeed(token).latestRoundData();
        require(price > 0, "price");
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        return uint256(price) * amount / (10 ** tokenDecimals);
    }

    receive() external payable {}
}