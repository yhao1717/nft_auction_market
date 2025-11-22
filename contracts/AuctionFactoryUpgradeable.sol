// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./AuctionInstance.sol";

contract AuctionFactoryUpgradeable is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    AggregatorV3Interface public ethUsdFeed;
    mapping(address => AggregatorV3Interface) public tokenUsdFeed;

    address[] public allAuctions;
    mapping(bytes32 => address) public auctionOf;

    event AuctionCreated(address indexed auction, address indexed seller, address indexed nft, uint256 tokenId, uint256 endTime);

    function initialize(address initialOwner, address ethUsdAggregator) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        ethUsdFeed = AggregatorV3Interface(ethUsdAggregator);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setEthUsdFeed(address aggregator) external onlyOwner {
        ethUsdFeed = AggregatorV3Interface(aggregator);
    }

    function setTokenUsdFeed(address token, address aggregator) external onlyOwner {
        tokenUsdFeed[token] = AggregatorV3Interface(aggregator);
    }

    function createAuction(address nft, uint256 tokenId, uint256 durationSeconds) external returns (address auction) {
        require(durationSeconds >= 60, "duration");
        uint256 endTime = block.timestamp + durationSeconds;
        auction = address(new AuctionInstance(address(this), msg.sender, nft, tokenId, endTime));
        IERC721(nft).transferFrom(msg.sender, auction, tokenId);
        allAuctions.push(auction);
        auctionOf[_key(nft, tokenId)] = auction;
        emit AuctionCreated(auction, msg.sender, nft, tokenId, endTime);
    }

    function allAuctionsLength() external view returns (uint256) {
        return allAuctions.length;
    }

    function _key(address nft, uint256 tokenId) internal pure returns (bytes32) {
        return keccak256(abi.encode(nft, tokenId));
    }
}