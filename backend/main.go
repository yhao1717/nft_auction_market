package main

import (
    "context"
    "database/sql"
    "encoding/json"
    "errors"
    "log"
    "net/http"
    "os"
    "time"

    "github.com/go-chi/chi/v5"
    _ "github.com/joho/godotenv/autoload"
    "github.com/redis/go-redis/v9"
)

type Server struct {
    db    *sql.DB
    rdb   *redis.Client
    chain *Chain
}

func main() {
    port := getenv("PORT", "3000")
    dsn := getenv("MYSQL_DSN", "root:@tcp(127.0.0.1:3306)/nft_auction?parseTime=true&charset=utf8mb4")
    rpc := os.Getenv("RPC_URL")
    factory := os.Getenv("FACTORY_ADDRESS")
    if rpc == "" || factory == "" { log.Println("warn: RPC_URL/FACTORY_ADDRESS not set; /api/prices may fail") }

    db, err := openMySQL(dsn)
    if err != nil { log.Fatal(err) }
    rdb := redis.NewClient(&redis.Options{Addr: getenv("REDIS_ADDR", "127.0.0.1:6379")})
    var chain *Chain
    if rpc != "" && factory != "" { chain, _ = NewChain(rpc, factory) }
    srv := &Server{db: db, rdb: rdb, chain: chain}

    r := chi.NewRouter()
    r.Use(corsMiddleware)
    r.Get("/api/auctions", srv.listAuctions)
    r.Post("/api/auctions", srv.createAuction)
    r.Get("/api/auctions/{address}", srv.getAuction)
    r.Get("/api/prices", srv.getPrices)
    r.Handle("/*", http.FileServer(http.Dir("public")))
    r.Get("/abi/factory", srv.getFactoryAbi)
    r.Get("/abi/auction", srv.getAuctionAbi)
    r.Get("/abi/erc20", srv.getErc20Abi)

    log.Printf("Go server listening on http://localhost:%s", port)
    if err := http.ListenAndServe(":"+port, r); err != nil { log.Fatal(err) }
}

func (s *Server) listAuctions(w http.ResponseWriter, r *http.Request) {
    rows, err := s.db.Query("SELECT auction_address,nft_address,token_id,seller,end_time,created_at FROM auctions ORDER BY id DESC")
    if err != nil { httpError(w, err, 500); return }
    defer rows.Close()
    type row struct { AuctionAddress string `json:"auction_address"`; NFTAddress string `json:"nft_address"`; TokenID int64 `json:"token_id"`; Seller string `json:"seller"`; EndTime int64 `json:"end_time"`; CreatedAt time.Time `json:"created_at"` }
    var out []row
    for rows.Next() { var r row; if err := rows.Scan(&r.AuctionAddress, &r.NFTAddress, &r.TokenID, &r.Seller, &r.EndTime, &r.CreatedAt); err != nil { httpError(w, err, 500); return }; out = append(out, r) }
    writeJSON(w, out)
}

func (s *Server) createAuction(w http.ResponseWriter, r *http.Request) {
    var req struct { AuctionAddress, NFTAddress, Seller string; TokenId, EndTime int64 }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil { httpError(w, err, 400); return }
    _, err := s.db.Exec("INSERT INTO auctions (auction_address,nft_address,token_id,seller,end_time) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE nft_address=VALUES(nft_address), token_id=VALUES(token_id), seller=VALUES(seller), end_time=VALUES(end_time)", req.AuctionAddress, req.NFTAddress, req.TokenId, req.Seller, req.EndTime)
    if err != nil { httpError(w, err, 500); return }
    writeJSON(w, map[string]any{"ok": true})
}

func (s *Server) getAuction(w http.ResponseWriter, r *http.Request) {
    addr := chi.URLParam(r, "address")
    if s.chain == nil { httpError(w, errors.New("chain not configured"), 500); return }
    st, err := s.chain.ReadAuction(r.Context(), addr)
    if err != nil { httpError(w, err, 500); return }
    writeJSON(w, st)
}

func (s *Server) getPrices(w http.ResponseWriter, r *http.Request) {
    if s.chain == nil { httpError(w, errors.New("chain not configured"), 500); return }
    ctx := context.Background()
    val, err := s.rdb.Get(ctx, "prices:ethusd").Result()
    if err == redis.Nil {
        price, err := s.chain.EthUsdPrice(ctx)
        if err != nil { httpError(w, err, 500); return }
        val = price.String()
        _ = s.rdb.SetEx(ctx, "prices:ethusd", val, 30*time.Second).Err()
    } else if err != nil {
        httpError(w, err, 500); return
    }
    writeJSON(w, map[string]string{"ethUsd": val})
}

func (s *Server) getFactoryAbi(w http.ResponseWriter, r *http.Request) {
    b, err := os.ReadFile("abi/factory.json")
    if err != nil { httpError(w, err, 500); return }
    w.Header().Set("Content-Type", "application/json")
    writeJSON(w, map[string]any{"abi": json.RawMessage(b)})
}

func (s *Server) getAuctionAbi(w http.ResponseWriter, r *http.Request) {
    b, err := os.ReadFile("abi/auction.json")
    if err != nil { httpError(w, err, 500); return }
    w.Header().Set("Content-Type", "application/json")
    writeJSON(w, map[string]any{"abi": json.RawMessage(b)})
}

func (s *Server) getErc20Abi(w http.ResponseWriter, r *http.Request) {
    b, err := os.ReadFile("abi/erc20.json")
    if err != nil { httpError(w, err, 500); return }
    w.Header().Set("Content-Type", "application/json")
    writeJSON(w, map[string]any{"abi": json.RawMessage(b)})
}

func corsMiddleware(next http.Handler) http.Handler { return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Header().Set("Access-Control-Allow-Origin", "*"); w.Header().Set("Access-Control-Allow-Headers", "Content-Type"); if r.Method == http.MethodOptions { w.WriteHeader(204); return }; next.ServeHTTP(w, r) }) }

func writeJSON(w http.ResponseWriter, v any) { w.Header().Set("Content-Type", "application/json"); _ = json.NewEncoder(w).Encode(v) }
func httpError(w http.ResponseWriter, err error, code int) { http.Error(w, err.Error(), code) }
func getenv(k, def string) string { if v := os.Getenv(k); v != "" { return v }; return def }
