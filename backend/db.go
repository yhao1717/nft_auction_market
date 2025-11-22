package main

import (
    "database/sql"
    _ "github.com/go-sql-driver/mysql"
)

func openMySQL(dsn string) (*sql.DB, error) {
    db, err := sql.Open("mysql", dsn)
    if err != nil { return nil, err }
    if err := db.Ping(); err != nil { return nil, err }
    if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS auctions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      auction_address VARCHAR(64) UNIQUE,
      nft_address VARCHAR(64) NOT NULL,
      token_id BIGINT NOT NULL,
      seller VARCHAR(64) NOT NULL,
      end_time BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`); err != nil { return nil, err }
    return db, nil
}
