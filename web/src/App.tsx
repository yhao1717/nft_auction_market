import { useEffect, useState } from 'react'
import { ethers } from 'ethers'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const factoryAddress = import.meta.env.VITE_FACTORY_ADDRESS || ''

export default function App() {
  const [account, setAccount] = useState<string>('')
  const [nft, setNft] = useState('')
  const [tokenId, setTokenId] = useState('')
  const [duration, setDuration] = useState('3600')
  const [auctions, setAuctions] = useState<any[]>([])
  const [status, setStatus] = useState('')
  const [ethUsd, setEthUsd] = useState('')

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