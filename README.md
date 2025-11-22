# NFT 拍卖市场（Hardhat + UUPS + Chainlink）

一个支持 NFT 拍卖（ETH/ERC20 出价）的合约项目，集成 Chainlink 价格预言机，将出价统一换算为美元进行比较；采用 UUPS 可升级模式；同时提供类似 Uniswap v2 的“拍卖工厂”合约，用于创建与管理独立的拍卖实例。

## 特性
- ERC721 NFT 合约，支持铸造与转移（`contracts/NFT.sol`）。
- 拍卖合约：支持创建拍卖、ETH/ERC20 出价、结束与结算（`contracts/AuctionUpgradeable.sol`）。
- Chainlink 预言机：获取 ETH/USD 与 ERC20/USD 价格，统一按美元比较出价。
- UUPS 升级：拍卖主合约与工厂合约可升级（`contracts/AuctionUpgradeableV2.sol`、`contracts/AuctionFactoryUpgradeable.sol`）。
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
- `contracts/AuctionUpgradeable.sol`：UUPS 拍卖主合约（单体版本）。
- `contracts/AuctionUpgradeableV2.sol`：拍卖升级版本示例（`version()`）。
- `contracts/AuctionFactoryUpgradeable.sol`：UUPS 拍卖工厂，创建并注册拍卖实例，维护价格源。
- `contracts/AuctionInstance.sol`：独立拍卖实例，读取工厂的价格源进行出价比较与结算。
- `contracts/mocks/MockImports.sol`：引入 Chainlink `MockV3Aggregator` 用于本地测试。
- `contracts/mocks/TestToken.sol`：测试用 ERC20 代币。
- `scripts/deploy.ts`：部署 NFT 与单体拍卖合约。
- `scripts/upgrade.ts`：UUPS 代理升级脚本。
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
- 部署单体拍卖：`npm run deploy:sepolia`
- 升级单体拍卖：`npm run upgrade:sepolia`
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

## 合约接口要点（工厂）
- 读取价格源：
  - `ethUsdFeed() -> address`
  - `tokenUsdFeed(token: address) -> address`
- 配置价格源：
  - `setEthUsdFeed(feed: address)`
  - `setTokenUsdFeed(token: address, feed: address)`
- 创建拍卖：
  - `createAuction(nft: address, tokenId: uint256, durationSeconds: uint256) -> address`
- 事件：
  - `AuctionCreated(auction, seller, nft, tokenId, endTime)`（前端解析该事件获取实例地址）

## 价格源配置示例（Sepolia）
- 前提：已部署工厂并拿到工厂代理地址；准备好 Chainlink Aggregator 地址。
- 设置 ETH/USD：调用 `setEthUsdFeed(ETH_USD_AGGREGATOR)`
- 设置某 ERC20/USD：调用 `setTokenUsdFeed(ERC20, ERC20_USD_AGGREGATOR)`
- 注意：地址请以 Chainlink 官方文档为准，避免旧地址；生产环境建议只允许已配置价格源的代币参与。

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

## 单体拍卖使用流程
- 初始化拍卖合约：部署 UUPS 代理，设置价格源（ETH 与需要的 ERC20）。
- 卖家授权：对拍卖合约 `approve` 后 `createAuction(nft, tokenId, duration)`。
- 出价/结束与结算：同工厂模式。

## 升级说明（UUPS）
- 所有 UUPS 合约通过 `_authorizeUpgrade` 限制为 `owner`。
- 升级脚本示例：`scripts/upgrade.ts`，执行 `npm run upgrade:sepolia` 进行代理升级（需设置 `PROXY_ADDRESS`）。
- 变更存储布局需谨慎，建议使用升级插件的校验保持兼容。

## 测试覆盖
- 拍卖出价与结算（ETH 与 ERC20，美元换算对比）：`test/auction.test.ts`
- 工厂创建拍卖、出价与结算：`test/factory.test.ts`
- UUPS 升级流程验证：`test/upgrade.test.ts`

## 注意事项
- Chainlink USD 价格通常按 8 位小数，出价换算结果也按 8 位小数管理。
- 合约已使用防重入保护，退款与结算分别支持 ETH 与 ERC20 路径。
- 生产部署务必设置正确的 Aggregator 地址，并酌情限制允许出价的代币。
- 建议仅白名单允许的 ERC20；无价格源的代币拒绝出价。

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

## 前端交互示例（创建拍卖）
```ts
import { ethers } from "ethers";

async function createAuction(factoryAddress: string, nft: string, tokenId: number, duration: number) {
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const abi = (await (await fetch("http://localhost:3000/abi/factory")).json()).abi;
  const factory = new ethers.Contract(factoryAddress, abi, signer);
  const tx = await factory.createAuction(nft, tokenId, duration);
  const receipt = await tx.wait();
  const iface = new ethers.Interface(abi);
  let auctionAddress = "";
  for (const l of (receipt as any).logs || []) {
    try {
      const parsed = iface.parseLog(l);
      if (parsed?.name === "AuctionCreated") { auctionAddress = parsed.args[0]; break; }
    } catch {}
  }
  return auctionAddress;
}
```

## 部署建议（生产）
- 前端构建：`cd web && npm run build` 生成 `web/dist`
- 后端服务：以系统服务方式运行 `go-server`，在环境中配置 `RPC_URL/FACTORY_ADDRESS` 与数据库、缓存地址
- 反向代理：使用 Nginx 或其他代理将前端与后端统一到同一域名
- 价格源与代币白名单：在工厂配置允许的代币与其 Chainlink Aggregator 地址，避免无预言机代币参与
- 升级流程管理：UUPS 升级仅限 `owner`，升级前进行影子部署与回归测试

## 常见问题
- `GET /api/prices` 返回错误：检查后端是否设置 `RPC_URL` 与 `FACTORY_ADDRESS`，以及工厂是否已配置 ETH/USD Aggregator
- 前端创建拍卖失败：确保钱包已连接、`VITE_FACTORY_ADDRESS` 正确、卖家已对工厂 `approve` 指定 `tokenId`
- 单位换算：价格按 8 位小数；ERC20 出价会根据 `decimals()` 做单位对齐

## 价格源配置脚本示例（Hardhat）
```ts
// scripts/configFeeds.ts
import { ethers } from "hardhat";

async function main() {
  const factoryAddress = process.env.FACTORY_ADDRESS!;
  const ETH_USD = process.env.ETH_USD_FEED!; // Chainlink ETH/USD
  const TOKEN = process.env.ERC20_TOKEN;     // 可选：某 ERC20
  const TOKEN_USD = process.env.ERC20_USD_FEED; // 可选：该 Token 的 USD Aggregator

  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractAt("AuctionFactoryUpgradeable", factoryAddress, deployer);

  console.log("setEthUsdFeed", ETH_USD);
  await (await factory.setEthUsdFeed(ETH_USD)).wait();

  if (TOKEN && TOKEN_USD) {
    console.log("setTokenUsdFeed", TOKEN, TOKEN_USD);
    await (await factory.setTokenUsdFeed(TOKEN, TOKEN_USD)).wait();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```
运行：`FACTORY_ADDRESS=0x... ETH_USD_FEED=0x... ERC20_TOKEN=0x... ERC20_USD_FEED=0x... npx hardhat run --network sepolia scripts/configFeeds.ts`

## 前端交互示例（出价与结束）
```ts
import { ethers } from "ethers";

async function bidWithETH(auction: string, ethAmount: string) {
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const abi = (await (await fetch("/artifacts/contracts/AuctionInstance.sol/AuctionInstance.json")).json()).abi;
  const inst = new ethers.Contract(auction, abi, signer);
  const value = ethers.parseEther(ethAmount);
  return await (await inst.bidWithETH({ value })).wait();
}

async function bidWithERC20(auction: string, token: string, amount: string) {
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const instAbi = (await (await fetch("/artifacts/contracts/AuctionInstance.sol/AuctionInstance.json")).json()).abi;
  const erc20Abi = ["function approve(address spender,uint256 amount)", "function decimals() view returns (uint8)"];
  const inst = new ethers.Contract(auction, instAbi, signer);
  const erc = new ethers.Contract(token, erc20Abi, signer);
  const decimals = await erc.decimals();
  const parsed = ethers.parseUnits(amount, decimals);
  await (await erc.approve(auction, parsed)).wait();
  return await (await inst.bidWithERC20(token, parsed)).wait();
}

async function endAuction(auction: string) {
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const abi = (await (await fetch("/artifacts/contracts/AuctionInstance.sol/AuctionInstance.json")).json()).abi;
  const inst = new ethers.Contract(auction, abi, signer);
  return await (await inst.endAuction()).wait();
}
```
说明：也可由后端提供 `GET /abi/auction` 端点，前端改为从后端读取实例 ABI。

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

## 全流程联调步骤
- 部署工厂：`npm run deployFactory:sepolia`，记录工厂代理地址。
- 配置价格源：运行 `scripts/configFeeds.ts` 设置 `ETH_USD_FEED`，可选设置某 ERC20 的 USD Aggregator。
- 启动后端：设置 `RPC_URL/FACTORY_ADDRESS`，启动 `go-server`。
- 配置前端：设置 `VITE_API_URL/VITE_FACTORY_ADDRESS`，启动 `web`。
- 前端创建拍卖：解析事件、向后端 `POST /api/auctions` 注册。
- 出价与结束：前端调用实例合约；后端 `GET /api/auctions/:address` 查看链上状态。

## 快速上手（Step-by-step）
- 准备 `.env`（根目录）：填写 `SEPOLIA_RPC_URL`、`PRIVATE_KEY`、`ETH_USD_FEED`
- 部署工厂：`npm run deployFactory:sepolia`，记录工厂代理地址
- 配置价格源：运行配置脚本或在工厂上直接调用 `setEthUsdFeed`、`setTokenUsdFeed`
- 启动后端：设置 `RPC_URL` 与 `FACTORY_ADDRESS`，执行 `cd go-server && go run .`
- 启动前端：设置 `VITE_API_URL` 与 `VITE_FACTORY_ADDRESS`，执行 `cd web && npm run dev`
- 创建拍卖：前端填写 `NFT 地址/TokenId/时长（秒）`，调用工厂创建；随后在后端注册拍卖元数据

## 测试指南
- 运行：`npm run test`
- 测试内容：拍卖出价与结算、工厂创建与实例交互、UUPS 升级流程
- 添加自定义测试：在 `test/` 下新增文件，复用现有工具与部署模式
- 常见测试变量：Chainlink Mock、ERC20 测试代币、时间推进（EVM 时间控制）

## Windows 环境注意事项
- PowerShell 运行命令：确保在对应目录执行，如 `cd web` 后再运行 `npm run dev`
- 环境变量：在 Windows 下可使用临时环境设定或 `.env` 文件；Hardhat 读取根目录 `.env`
- MySQL/Redis：建议用本地服务或 Docker；确保端口与 `MYSQL_DSN`、`REDIS_ADDR` 配置一致

## 事件解析与地址获取
- 工厂事件解析：前端使用 `ethers.Interface` 解析 `AuctionCreated(auction, seller, nft, tokenId, endTime)` 获取实例地址
- 参考实现：`web/src/App.tsx` 中事件解析逻辑（创建拍卖后读取日志）
- 后端注册：拿到实例地址后请求 `POST /api/auctions` 存储拍卖元数据

## 升级细节（UUPS）
- 单体拍卖与工厂可升级，实例合约为简单不可升级版本，降低复杂度
- 升级脚本：`scripts/upgrade.ts` 使用 `upgrades.upgradeProxy` 执行升级（`scripts/upgrade.ts:4-11`）
- 存储布局：升级需保持变量布局兼容；遵循 OpenZeppelin 的布局校验

## RPC 与 Gas 建议
- RPC 限速：公共 RPC 可能限速；生产建议使用稳定服务提供商并加入重试/退避策略
- Gas 设置：前端出价可显式设置 `gasLimit`；ERC20 出价需考虑 `approve` 与 `bidWithERC20` 两笔交易
- 小数单位：价格与出价单位换算严格按 Chainlink 与代币 `decimals()` 处理
## 部署脚本使用指南
- 部署单体拍卖与 NFT：
  - 前提：设置 `SEPOLIA_RPC_URL`、`PRIVATE_KEY`、`ETH_USD_FEED`
  - 命令：`npm run deploy:sepolia`
  - 输出：`NFT` 地址与 `AuctionUpgradeable` 代理地址
- 升级单体拍卖代理：
  - 前提：设置 `PROXY_ADDRESS`
  - 命令：`npm run upgrade:sepolia`
  - 输出：升级后的代理地址与 `version()`
- 部署工厂：
  - 前提：设置 `ETH_USD_FEED`（可选：`ERC20_TOKEN`、`ERC20_USD_FEED`）
  - 命令：`npm run deployFactory:sepolia`
  - 输出：工厂代理地址；若提供 ERC20 配置则自动写入价格源
  - 合约脚本位置：`scripts/deployFactory.ts`

## 版本要求与兼容性
- Hardhat `^2.27.0` 与 `ethers ^6`，插件版本已在 `package.json` 固定。
- OpenZeppelin 合约与升级插件使用 `^5` 系列，Solidity `0.8.22`。
- React 前端使用 Vite 5 与 React 18；Go 后端需 Go 1.20+。

## 合规与安全
- 生产环境禁用未授权代币参与：仅对白名单代币配置价格源并在合约中限制。
- 管理密钥与 RPC：私钥仅用于 Hardhat 部署，不在后端与前端中存储；后端只进行读取，不签名交易。
- 价格源可信性：所有美元换算基于 Chainlink Aggregator；在无价格源或读取失败时拒绝相关出价。
- UUPS 升级权限：仅 `owner` 可升级；升级前建议进行影子部署与回归测试。