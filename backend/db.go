package main

import (
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type Auction struct {
	ID             uint      `gorm:"primaryKey" json:"-"`
	AuctionAddress string    `gorm:"size:64;uniqueIndex" json:"auction_address"`
	NFTAddress     string    `gorm:"size:64;index" json:"nft_address"`
	TokenID        int64     `json:"token_id"`
	Seller         string    `gorm:"size:64;index" json:"seller"`
	EndTime        int64     `json:"end_time"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func openMySQL(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}
	if err := db.AutoMigrate(&Auction{}); err != nil {
		return nil, err
	}
	return db, nil
}
