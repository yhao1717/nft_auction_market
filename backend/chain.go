package main

import (
    "context"
    "math/big"
    "os"
    "strings"

    ethereum "github.com/ethereum/go-ethereum"
    "github.com/ethereum/go-ethereum/accounts/abi"
    "github.com/ethereum/go-ethereum/common"
    "github.com/ethereum/go-ethereum/ethclient"
)

type Chain struct {
    cli           *ethclient.Client
    factory       common.Address
    aggregatorABI abi.ABI
    factoryABI    abi.ABI
    auctionABI    abi.ABI
}

func NewChain(rpcURL, factoryAddr string) (*Chain, error) {
    cli, err := ethclient.Dial(rpcURL)
    if err != nil { return nil, err }
    read := func(path string) (abi.ABI, error) {
        b, err := os.ReadFile(path)
        if err != nil { return abi.ABI{}, err }
        return abi.JSON(strings.NewReader(string(b)))
    }
    agABI, err := read("abi/aggregator.json")
    if err != nil { return nil, err }
    fABI, err := read("abi/factory.json")
    if err != nil { return nil, err }
    aABI, err := read("abi/auction.json")
    if err != nil { return nil, err }
    return &Chain{cli: cli, factory: common.HexToAddress(factoryAddr), aggregatorABI: agABI, factoryABI: fABI, auctionABI: aABI}, nil
}

func (c *Chain) EthUsdPrice(ctx context.Context) (*big.Int, error) {
    data, err := c.factoryABI.Pack("ethUsdFeed")
    if err != nil { return nil, err }
    out, err := c.cli.CallContract(ctx, ethereum.CallMsg{To: &c.factory, Data: data}, nil)
    if err != nil { return nil, err }
    var feedAddr common.Address
    if err := c.factoryABI.UnpackIntoInterface(&feedAddr, "ethUsdFeed", out); err != nil { return nil, err }
    data2, _ := c.aggregatorABI.Pack("latestRoundData")
    out2, err := c.cli.CallContract(ctx, ethereum.CallMsg{To: &feedAddr, Data: data2}, nil)
    if err != nil { return nil, err }
    var round struct { RoundId *big.Int; Answer *big.Int; StartedAt *big.Int; UpdatedAt *big.Int; AnsweredInRound *big.Int }
    if err := c.aggregatorABI.UnpackIntoInterface(&round, "latestRoundData", out2); err != nil { return nil, err }
    return round.Answer, nil
}

type AuctionState struct {
    Seller          string `json:"seller"`
    Nft             string `json:"nft"`
    TokenId         string `json:"tokenId"`
    EndTime         uint64 `json:"endTime"`
    HighestBidder   string `json:"highestBidder"`
    HighestCurrency string `json:"highestCurrency"`
    HighestAmount   string `json:"highestAmount"`
    HighestUsd      string `json:"highestUsd"`
    Settled         bool   `json:"settled"`
}

func (c *Chain) ReadAuction(ctx context.Context, addr string) (*AuctionState, error) {
    a := common.HexToAddress(addr)
    read := func(name string) ([]byte, error) {
        data, err := c.auctionABI.Pack(name)
        if err != nil { return nil, err }
        return c.cli.CallContract(ctx, ethereum.CallMsg{To: &a, Data: data}, nil)
    }
    var seller, nft, hb, hc common.Address
    var tokenId, endTime, ha, usd *big.Int
    var settled bool
    if out, err := read("seller"); err != nil { return nil, err } else if err := c.auctionABI.UnpackIntoInterface(&seller, "seller", out); err != nil { return nil, err }
    if out, err := read("nft"); err != nil { return nil, err } else if err := c.auctionABI.UnpackIntoInterface(&nft, "nft", out); err != nil { return nil, err }
    if out, err := read("tokenId"); err != nil { return nil, err } else if err := c.auctionABI.UnpackIntoInterface(&tokenId, "tokenId", out); err != nil { return nil, err }
    if out, err := read("endTime"); err != nil { return nil, err } else if err := c.auctionABI.UnpackIntoInterface(&endTime, "endTime", out); err != nil { return nil, err }
    if out, err := read("highestBidder"); err != nil { return nil, err } else if err := c.auctionABI.UnpackIntoInterface(&hb, "highestBidder", out); err != nil { return nil, err }
    if out, err := read("highestCurrency"); err != nil { return nil, err } else if err := c.auctionABI.UnpackIntoInterface(&hc, "highestCurrency", out); err != nil { return nil, err }
    if out, err := read("highestAmount"); err != nil { return nil, err } else if err := c.auctionABI.UnpackIntoInterface(&ha, "highestAmount", out); err != nil { return nil, err }
    if out, err := read("highestUsd"); err != nil { return nil, err } else if err := c.auctionABI.UnpackIntoInterface(&usd, "highestUsd", out); err != nil { return nil, err }
    if out, err := read("settled"); err != nil { return nil, err } else if err := c.auctionABI.UnpackIntoInterface(&settled, "settled", out); err != nil { return nil, err }
    return &AuctionState{ Seller: seller.Hex(), Nft: nft.Hex(), TokenId: tokenId.String(), EndTime: endTime.Uint64(), HighestBidder: hb.Hex(), HighestCurrency: hc.Hex(), HighestAmount: ha.String(), HighestUsd: usd.String(), Settled: settled }, nil
}
