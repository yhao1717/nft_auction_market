# NFT 拍卖市场（工厂模式 + UUPS 工厂 + Chainlink）

一个支持 NFT 拍卖（ETH/ERC20 出价）的合约项目，集成 Chainlink 价格预言机，将出价统一换算为美元进行比较；采用 UUPS 可升级模式；同时提供类似 Uniswap v2 的“拍卖工厂”合约，用于创建与管理独立的拍卖实例。

## 特性
- ERC721 NFT 合约，支持铸造与转移（`contracts/NFT.sol`）。
- 拍卖实例：支持 ETH/ERC20 出价、结束与结算（`contracts/AuctionInstance.sol`）。
- Chainlink 预言机：获取 ETH/USD 与 ERC20/USD 价格，统一按美元比较出价。
- UUPS 升级：工厂合约可升级（`contracts/AuctionFactoryUpgradeable.sol`）。
- 拍卖工厂：类似 Uniswap v2 的工厂/实例模式（`contracts/AuctionFactoryUpgradeable.sol`、`contracts/AuctionInstance.sol`）。

## 技术栈
- `hardhat@^2.27.0`、`ethers@^6`、`@nomicfoundation/hardhat-ethers`、`@nomicfoundation/hardhat-chai-matchers`
- `@openzeppelin/contracts@^5`、`@openzeppelin/contracts-upgradeable@^5`、`@openzeppelin/hardhat-upgrades`
- `@chainlink/contracts`（接口与本地测试 Mock）
- `hardhat-deploy`、`dotenv`

## 安装
- 合约与脚本（根目录）：
  - `npm install`
  - 编译：`npm run build`
  - 测试：`npm run test`
- 前端（React 在 `web/`）：
  - `cd web && npm install`
  - 开发：`npm run dev`（默认 `http://localhost:5173/`）
- 后端（Go 在 `go-server/`）：
  - `cd go-server && go run .`（默认 `http://localhost:3000/`）

## 前置依赖
- Node.js 18+、npm
- Go 1.20+
- MySQL 8+（默认端口 3306）
- Redis 6+（默认端口 6379）
- 浏览器钱包（MetaMask）
- 可用的以太坊 RPC（本地开发建议 Sepolia）

## 目录结构
- `contracts/NFT.sol`：ERC721 NFT 合约。
- `contracts/AuctionFactoryUpgradeable.sol`：UUPS 拍卖工厂，创建并注册拍卖实例，维护价格源。
- `contracts/AuctionInstance.sol`：独立拍卖实例，读取工厂的价格源进行出价比较与结算。
- `contracts/mocks/MockImports.sol`：引入 Chainlink `MockV3Aggregator` 用于本地测试。
- `contracts/mocks/TestToken.sol`：测试用 ERC20 代币。
- `scripts/deployFactory.ts`：部署拍卖工厂并配置价格源。
- `test/*.ts`：单元与集成测试（拍卖、工厂、升级）。
- `go-server/`：Go 后端（Chi 路由，MySQL + Redis，链上读取，静态/ABI 服务）。
- `web/`：React 前端（Vite，TS，ethers）。

## 环境变量
根目录 `.env`（Hardhat 部署用）：
- `SEPOLIA_RPC_URL`、`PRIVATE_KEY`、`ETH_USD_FEED`、`ERC20_TOKEN`（可选）、`ERC20_USD_FEED`（可选）、`PROXY_ADDRESS`（升级用）

Go 后端（在进程环境或 `.env` 中配置）：
- `PORT`（默认 `3000`）
- `MYSQL_DSN`（默认 `root:@tcp(127.0.0.1:3306)/nft_auction?parseTime=true&charset=utf8mb4`）
- `REDIS_ADDR`（默认 `127.0.0.1:6379`）
- `RPC_URL`（必填）
- `FACTORY_ADDRESS`（必填）

React 前端（`web/.env.development`）：
- `VITE_API_URL`（默认 `http://localhost:3000`）
- `VITE_FACTORY_ADDRESS`（工厂代理地址）

示例（开发环境）：
```
# web/.env.development
VITE_API_URL=http://localhost:3000
VITE_FACTORY_ADDRESS=0xYourFactoryProxyHere

# go-server/.env 或进程环境
PORT=3000
MYSQL_DSN=root:@tcp(127.0.0.1:3306)/nft_auction?parseTime=true&charset=utf8mb4
REDIS_ADDR=127.0.0.1:6379
RPC_URL=https://sepolia.infura.io/v3/<your-key>
FACTORY_ADDRESS=0xYourFactoryProxyHere
```

## 命令
- 编译合约：`npm run build`
- 测试合约：`npm run test`
- 部署工厂：`npm run deployFactory:sepolia`
- 启动 Go 后端：`cd go-server && go run .`
- 启动 React 前端：`cd web && npm run dev`

## Hardhat 网络配置
- 配置文件：`hardhat.config.ts`
- 关键项：
  - `sepolia.url=SEPOLIA_RPC_URL`
  - `sepolia.accounts=[PRIVATE_KEY]`

## API 说明
- `GET /api/auctions`
  - 响应：拍卖元数据列表
  - 示例：
    ```json
    [
      {
        "auction_address": "0x...",
        "nft_address": "0x...",
        "token_id": 1,
        "seller": "0x...",
        "end_time": 1730000000,
        "created_at": "2025-11-22T05:55:00Z"
      }
    ]
    ```
- `POST /api/auctions`
  - 请求体：
    ```json
    {
      "auctionAddress": "0x...",
      "nftAddress": "0x...",
      "tokenId": 1,
      "seller": "0x...",
      "endTime": 1730000000
    }
    ```
  - 响应：`{ "ok": true }`
- `GET /api/auctions/:address`
  - 响应：链上拍卖状态（最高出价、结算状态等）
- `GET /api/prices`
  - 响应：`{ "ethUsd": "300000000000" }`（按 8 位小数的整数表示）
- `GET /abi/factory`
  - 响应：工厂合约 ABI（供前端调用工厂创建拍卖）

## 交互与工厂流程
1. 部署工厂：`npm run deployFactory:sepolia`（需设置 `ETH_USD_FEED`，可选配置某 ERC20 的 `ERC20_USD_FEED`）。
2. 卖家授权：在 NFT 合约对工厂地址进行 `approve`，允许工厂转移该 `tokenId`。
3. 创建拍卖：在工厂调用 `createAuction(nft, tokenId, durationSeconds)`，返回拍卖实例地址并记录到 `allAuctions` 与 `auctionOf`。
4. 出价与比较：在拍卖实例调用 `bidWithETH()` 或 `bidWithERC20(token, amount)`，由工厂的价格源统一换算美元比较。
5. 结束与结算：到期后调用实例的 `endAuction()`，NFT 转给获胜者，资金转给卖家；无人出价则返还 NFT。

前端创建拍卖：
- 连接钱包 → 输入 `NFT 地址`、`TokenId`、`时长（秒）` → 调用工厂 `createAuction`
- 前端解析 `AuctionCreated` 事件获取拍卖地址 → 调用后端 `POST /api/auctions` 注册元数据
- 列表与价格通过后端刷新显示
- 出价

## 测试覆盖
- 工厂创建拍卖、出价与结算：`test/factory.test.ts`

## 后端 API
- `GET /api/auctions`：列出拍卖元数据（MySQL）
- `POST /api/auctions`：注册拍卖（拍卖地址、NFT、TokenId、卖家、结束时间）
- `GET /api/auctions/:address`：链上读取拍卖实例状态
- `GET /api/prices`：从工厂读取 ETH/USD 价格，Redis 缓存 30s
- `GET /abi/factory`：返回工厂合约 ABI（供前端使用）

## 本地开发步骤
- 设置后端环境变量：`RPC_URL` 与 `FACTORY_ADDRESS`
- 启动 Go 后端：`cd go-server && go run .`
- 设置前端 `web/.env.development`：填写 `VITE_API_URL` 与 `VITE_FACTORY_ADDRESS`
- 启动 React 前端：`cd web && npm run dev`
- 通过前端连接钱包、在工厂创建拍卖，前端会将拍卖信息写入后端；列表与价格可实时查看。

## 数据库初始化（MySQL）
```sql
CREATE DATABASE IF NOT EXISTS nft_auction CHARACTER SET utf8mb4;
USE nft_auction;
CREATE TABLE IF NOT EXISTS auctions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  auction_address VARCHAR(64) UNIQUE,
  nft_address VARCHAR(64) NOT NULL,
  token_id BIGINT NOT NULL,
  seller VARCHAR(64) NOT NULL,
  end_time BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 测试指南
- 运行：`npm run test`
- 测试内容：拍卖出价与结算、工厂创建与实例交互、UUPS 升级流程
- 添加自定义测试：在 `test/` 下新增文件，复用现有工具与部署模式
- 常见测试变量：Chainlink Mock、ERC20 测试代币、时间推进（EVM 时间控制）
