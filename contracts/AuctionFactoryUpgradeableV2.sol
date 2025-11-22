// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./AuctionFactoryUpgradeable.sol";

contract AuctionFactoryUpgradeableV2 is AuctionFactoryUpgradeable {
    function version() external pure returns (string memory) {
        return "v2";
    }
}
