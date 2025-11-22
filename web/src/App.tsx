import { useEffect, useState } from 'react'
import { ethers } from 'ethers'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const factoryAddress = import.meta.env.VITE_FACTORY_ADDRESS || ''
const instanceAbi = [
  'function bidWithETH() payable',
  'function bidWithERC20(address token,uint256 amount)',
  'function endAuction()',
]
const erc20Abi = [
  'function decimals() view returns (uint8)',
  'function approve(address spender,uint256 amount) returns (bool)'
]

export default function App() {
  const [account, setAccount] = useState<string>('')
  const [nft, setNft] = useState('')
  const [tokenId, setTokenId] = useState('')
  const [duration, setDuration] = useState('3600')
  const [auctions, setAuctions] = useState<any[]>([])
  const [status, setStatus] = useState('')
  const [ethUsd, setEthUsd] = useState('')
  const [ethBidByAddr, setEthBidByAddr] = useState<Record<string,string>>({})
  const [erc20AddrByAuction, setErc20AddrByAuction] = useState<Record<string,string>>({})
  const [erc20AmtByAuction, setErc20AmtByAuction] = useState<Record<string,string>>({})
  const [chainStates, setChainStates] = useState<Record<string, any>>({})

  useEffect(() => { loadAuctions() }, [])

  async function connect() {
    const ethereum = (window as any).ethereum
    if (!ethereum) { alert('请安装 MetaMask'); return }
    const [acc] = await ethereum.request({ method: 'eth_requestAccounts' })
    setAccount(acc)
  }

  async function loadAuctions() {
    const res = await fetch(`${apiUrl}/api/auctions`)
    const list = await res.json()
    setAuctions(list)
    try {
      const states = await Promise.all(list.map((a: any) => fetch(`${apiUrl}/api/auctions/${a.auction_address}`).then(r=>r.json()).catch(()=>null)))
      const map: Record<string, any> = {}
      list.forEach((a: any, i: number) => { map[a.auction_address] = states[i] })
      setChainStates(map)
    } catch {}
  }

  async function createAuction() {
    if (!factoryAddress) { alert('未配置工厂地址'); return }
    const ethereum = (window as any).ethereum
    if (!ethereum) { alert('请安装 MetaMask'); return }
    const provider = new ethers.BrowserProvider(ethereum)
    const signer = await provider.getSigner()
    const abi = (await (await fetch(`${apiUrl}/abi/factory`)).json()).abi
    const factory = new ethers.Contract(factoryAddress, abi, signer)
    try {
      const tx = await factory.createAuction(nft, tokenId, duration)
      setStatus(`交易发送: ${tx.hash}`)
      const receipt = await tx.wait()
      const evt = (receipt as any).logs.find((l: any) => l.fragment?.name === 'AuctionCreated')
      const auctionAddress = evt.args[0]
      await fetch(`${apiUrl}/api/auctions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auctionAddress, nftAddress: nft, tokenId: Number(tokenId), seller: account, endTime: Math.floor(Date.now()/1000) + Number(duration) }) })
      await loadAuctions()
    } catch (e: any) {
      alert(e?.message || String(e))
    }
  }

  async function bidWithETH(auctionAddress: string) {
    const amt = ethBidByAddr[auctionAddress]
    if (!amt || Number(amt) <= 0) { alert('请输入 ETH 数量'); return }
    const ethereum = (window as any).ethereum
    if (!ethereum) { alert('请安装 MetaMask'); return }
    const provider = new ethers.BrowserProvider(ethereum)
    const signer = await provider.getSigner()
    const inst = new ethers.Contract(auctionAddress, instanceAbi, signer)
    try {
      const tx = await inst.bidWithETH({ value: ethers.parseEther(amt) })
      setStatus(`ETH 出价发送: ${tx.hash}`)
      await tx.wait()
      setStatus('ETH 出价成功')
    } catch (e: any) {
      alert(e?.message || String(e))
    }
  }

  async function bidWithERC20(auctionAddress: string) {
    const token = erc20AddrByAuction[auctionAddress]
    const amt = erc20AmtByAuction[auctionAddress]
    if (!token) { alert('请输入 ERC20 代币地址'); return }
    if (!amt || Number(amt) <= 0) { alert('请输入 ERC20 数量'); return }
    const ethereum = (window as any).ethereum
    if (!ethereum) { alert('请安装 MetaMask'); return }
    const provider = new ethers.BrowserProvider(ethereum)
    const signer = await provider.getSigner()
    const inst = new ethers.Contract(auctionAddress, instanceAbi, signer)
    const erc20 = new ethers.Contract(token, erc20Abi, signer)
    try {
      const decimals: number = await erc20.decimals()
      const amount = ethers.parseUnits(amt, decimals)
      const tx1 = await erc20.approve(auctionAddress, amount)
      setStatus(`Approve 发送: ${tx1.hash}`)
      await tx1.wait()
      const tx2 = await inst.bidWithERC20(token, amount)
      setStatus(`ERC20 出价发送: ${tx2.hash}`)
      await tx2.wait()
      setStatus('ERC20 出价成功')
    } catch (e: any) {
      alert(e?.message || String(e))
    }
  }

  async function endAuction(auctionAddress: string) {
    const ethereum = (window as any).ethereum
    if (!ethereum) { alert('请安装 MetaMask'); return }
    const provider = new ethers.BrowserProvider(ethereum)
    const signer = await provider.getSigner()
    const inst = new ethers.Contract(auctionAddress, instanceAbi, signer)
    try {
      const tx = await inst.endAuction()
      setStatus(`结束交易发送: ${tx.hash}`)
      await tx.wait()
      setStatus('拍卖已结束并结算')
    } catch (e: any) {
      alert(e?.message || String(e))
    }
  }

  async function refreshAuctionState(addr: string) {
    try {
      const st = await (await fetch(`${apiUrl}/api/auctions/${addr}`)).json()
      setChainStates(prev => ({ ...prev, [addr]: st }))
    } catch {}
  }

  async function fetchPrice() {
    const res = await fetch(`${apiUrl}/api/prices`)
    const data = await res.json()
    setEthUsd(data.ethUsd)
  }

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h1>NFT 拍卖市场</h1>
        <div>
          <button onClick={connect}>连接钱包</button>
          <span style={{ marginLeft: 8, color:'#666' }}>{account}</span>
        </div>
      </header>

      <section style={{ border:'1px solid #ddd', padding:16, borderRadius:8, marginTop:12 }}>
        <h2>创建拍卖</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label>NFT 地址</label>
            <input value={nft} onChange={e=>setNft(e.target.value)} placeholder="0x..." />
          </div>
          <div>
            <label>TokenId</label>
            <input value={tokenId} onChange={e=>setTokenId(e.target.value)} placeholder="1" />
          </div>
          <div>
            <label>时长（秒）</label>
            <input value={duration} onChange={e=>setDuration(e.target.value)} placeholder="3600" />
          </div>
        </div>
        <button onClick={createAuction}>在工厂创建拍卖</button>
        <div style={{ color:'#666' }}>{status}</div>
      </section>

      <section style={{ border:'1px solid #ddd', padding:16, borderRadius:8, marginTop:12 }}>
        <h2>拍卖列表</h2>
        {auctions.map(a => (
          <div key={a.auction_address} style={{ border:'1px solid #eee', padding:8, borderRadius:6, marginBottom:8 }}>
            拍卖地址: {a.auction_address}<br/>
            NFT: {a.nft_address} #{a.token_id}<br/>
            结束: {new Date(a.end_time*1000).toLocaleString()}
            <div style={{ marginTop:6, color:'#333' }}>
              <div>最高美元: {chainStates[a.auction_address]?.highestUsd ?? '-'}</div>
              <div>最高出价人: {chainStates[a.auction_address]?.highestBidder ?? '-'}</div>
              <div>币种: {chainStates[a.auction_address]?.highestCurrency === ethers.ZeroAddress ? 'ETH' : (chainStates[a.auction_address]?.highestCurrency || '-')}</div>
              <div>已结算: {chainStates[a.auction_address]?.settled ? '是' : '否'}</div>
              <button onClick={()=>refreshAuctionState(a.auction_address)} style={{ marginTop:6 }}>刷新状态</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8 }}>
              <div>
                <label>ETH 出价</label>
                <input
                  value={ethBidByAddr[a.auction_address] || ''}
                  onChange={e=>setEthBidByAddr(prev=>({ ...prev, [a.auction_address]: e.target.value }))}
                  placeholder="0.1"
                />
                <button onClick={()=>bidWithETH(a.auction_address)}>用ETH出价</button>
              </div>
              <div>
                <label>ERC20 出价</label>
                <input
                  value={erc20AddrByAuction[a.auction_address] || ''}
                  onChange={e=>setErc20AddrByAuction(prev=>({ ...prev, [a.auction_address]: e.target.value }))}
                  placeholder="代币地址 0x..."
                />
                <input
                  value={erc20AmtByAuction[a.auction_address] || ''}
                  onChange={e=>setErc20AmtByAuction(prev=>({ ...prev, [a.auction_address]: e.target.value }))}
                  placeholder="数量，如 800"
                />
                <button onClick={()=>bidWithERC20(a.auction_address)}>用ERC20出价</button>
              </div>
            </div>
            <div style={{ marginTop:8 }}>
              <button onClick={()=>endAuction(a.auction_address)}>结束并结算</button>
            </div>
          </div>
        ))}
      </section>

      <section style={{ border:'1px solid #ddd', padding:16, borderRadius:8, marginTop:12 }}>
        <h2>价格（缓存）</h2>
        <button onClick={fetchPrice}>获取 ETH/USD</button>
        <div style={{ color:'#666' }}>ETH/USD: {ethUsd}</div>
      </section>
    </div>
  )
}
