package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"math/big"
	"os"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/gin-gonic/gin"
	_ "github.com/joho/godotenv/autoload"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Server struct {
	db    *gorm.DB
	rdb   *redis.Client
	chain *Chain
}

func main() {
	port := getenv("PORT", "3000")
	dsn := getenv("MYSQL_DSN", "root:@tcp(127.0.0.1:3306)/nft_auction?parseTime=true&charset=utf8mb4")
	rpc := os.Getenv("RPC_URL")
	factory := os.Getenv("FACTORY_ADDRESS")
	if rpc == "" || factory == "" {
		log.Println("warn: RPC_URL/FACTORY_ADDRESS not set; /api/prices may fail")
	}

	db, err := openMySQL(dsn)
	if err != nil {
		log.Fatal(err)
	}
	rdb := redis.NewClient(&redis.Options{Addr: getenv("REDIS_ADDR", "127.0.0.1:6379")})
	var chain *Chain
	if rpc != "" && factory != "" {
		chain, _ = NewChain(rpc, factory)
	}
	srv := &Server{db: db, rdb: rdb, chain: chain}
	srv.runEventSubscriptions()

	r := gin.Default()
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.Status(204)
			c.Abort()
			return
		}
		c.Next()
	})

	r.GET("/api/auctions", srv.listAuctions)
	r.POST("/api/auctions", srv.createAuction)
	r.GET("/api/auctions/:address", srv.getAuction)
	r.GET("/api/prices", srv.getPrices)
	r.Static("/", "public")
	r.GET("/abi/factory", srv.getFactoryAbi)
	r.GET("/abi/auction", srv.getAuctionAbi)
	r.GET("/abi/erc20", srv.getErc20Abi)

	log.Printf("Go server listening on http://localhost:%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func (s *Server) listAuctions(c *gin.Context) {
	var rows []Auction
	if err := s.db.Order("id DESC").Find(&rows).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, rows)
}

func (s *Server) createAuction(c *gin.Context) {
	var req struct {
		AuctionAddress, NFTAddress, Seller string
		TokenId, EndTime                   int64
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	a := Auction{AuctionAddress: req.AuctionAddress, NFTAddress: req.NFTAddress, TokenID: req.TokenId, Seller: req.Seller, EndTime: req.EndTime}
	if err := s.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "auction_address"}}, UpdateAll: true}).Create(&a).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

func (s *Server) getAuction(c *gin.Context) {
	addr := c.Param("address")
	if s.chain == nil {
		c.JSON(500, gin.H{"error": errors.New("chain not configured").Error()})
		return
	}
	st, err := s.chain.ReadAuction(context.Background(), addr)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, st)
}

func (s *Server) getPrices(c *gin.Context) {
	if s.chain == nil {
		c.JSON(500, gin.H{"error": errors.New("chain not configured").Error()})
		return
	}
	ctx := context.Background()
	val, err := s.rdb.Get(ctx, "prices:ethusd").Result()
	if err == redis.Nil {
		price, err := s.chain.EthUsdPrice(ctx)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		val = price.String()
		_ = s.rdb.SetEx(ctx, "prices:ethusd", val, 30*time.Second).Err()
	} else if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ethUsd": val})
}

func (s *Server) getFactoryAbi(c *gin.Context) {
	b, err := os.ReadFile("abi/factory.json")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Type", "application/json")
	c.JSON(200, gin.H{"abi": json.RawMessage(b)})
}

func (s *Server) getAuctionAbi(c *gin.Context) {
	b, err := os.ReadFile("abi/auction.json")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Type", "application/json")
	c.JSON(200, gin.H{"abi": json.RawMessage(b)})
}

func (s *Server) getErc20Abi(c *gin.Context) {
	b, err := os.ReadFile("abi/erc20.json")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Type", "application/json")
	c.JSON(200, gin.H{"abi": json.RawMessage(b)})
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func (s *Server) runEventSubscriptions() {
	if s.chain == nil {
		return
	}
	go s.subscribeFactory()
	go s.subscribeKnownInstances()
}

func (s *Server) subscribeFactory() {
	ctx := context.Background()
	ev := s.chain.factoryABI.Events["AuctionCreated"].ID
	q := ethereum.FilterQuery{Addresses: []common.Address{s.chain.factory}, Topics: [][]common.Hash{{ev}}}
	ch := make(chan types.Log, 128)
	sub, err := s.chain.cli.SubscribeFilterLogs(ctx, q, ch)
	if err != nil {
		s.pollFactory(ctx, ev)
		return
	}
	for {
		select {
		case l := <-ch:
			log.Printf("AuctionCreated addr=%s tx=%s", l.Address.Hex(), l.TxHash.Hex())
		case err := <-sub.Err():
			log.Printf("factory sub error: %v", err)
			return
		}
	}
}

func (s *Server) subscribeKnownInstances() {
	var rows []Auction
	if err := s.db.Find(&rows).Error; err != nil {
		return
	}
	for _, a := range rows {
		addr := common.HexToAddress(a.AuctionAddress)
		go s.subscribeInstance(addr)
	}
}

func (s *Server) subscribeInstance(addr common.Address) {
	ctx := context.Background()
	bid := s.chain.auctionABI.Events["BidPlaced"].ID
	end := s.chain.auctionABI.Events["AuctionEnded"].ID
	q := ethereum.FilterQuery{Addresses: []common.Address{addr}, Topics: [][]common.Hash{{bid, end}}}
	ch := make(chan types.Log, 128)
	sub, err := s.chain.cli.SubscribeFilterLogs(ctx, q, ch)
	if err != nil {
		return
	}
	for {
		select {
		case l := <-ch:
			if len(l.Topics) > 0 && l.Topics[0] == bid {
				log.Printf("BidPlaced auction=%s tx=%s", addr.Hex(), l.TxHash.Hex())
			} else if len(l.Topics) > 0 && l.Topics[0] == end {
				log.Printf("AuctionEnded auction=%s tx=%s", addr.Hex(), l.TxHash.Hex())
			}
		case err := <-sub.Err():
			log.Printf("instance sub error: %v", err)
			return
		}
	}
}

func (s *Server) pollFactory(ctx context.Context, ev common.Hash) {
	var last uint64
	for {
		head, err := s.chain.cli.BlockNumber(ctx)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}
		if head > last {
			q := ethereum.FilterQuery{FromBlock: big.NewInt(int64(last + 1)), ToBlock: big.NewInt(int64(head)), Addresses: []common.Address{s.chain.factory}, Topics: [][]common.Hash{{ev}}}
			logs, err := s.chain.cli.FilterLogs(ctx, q)
			if err == nil {
				for _, l := range logs {
					log.Printf("AuctionCreated addr=%s tx=%s", l.Address.Hex(), l.TxHash.Hex())
				}
			}
			last = head
		}
		time.Sleep(10 * time.Second)
	}
}
