// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract NFT is ERC721, Ownable {
    using Strings for uint256;

    uint256 private _tokenIdTracker;
    string private _baseTokenURI;

    constructor(string memory name_, string memory symbol_, string memory baseURI_, address initialOwner)
        ERC721(name_, symbol_)
        Ownable(initialOwner)
    {
        _baseTokenURI = baseURI_;
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = ++_tokenIdTracker;
        _mint(to, tokenId);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}