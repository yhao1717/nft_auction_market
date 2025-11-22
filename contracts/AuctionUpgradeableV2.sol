// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AuctionUpgradeable} from "./AuctionUpgradeable.sol";

contract AuctionUpgradeableV2 is AuctionUpgradeable {
    function version() external pure returns (string memory) {
        return "v2";
    }
}