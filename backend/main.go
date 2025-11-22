package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"
	"time"

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
