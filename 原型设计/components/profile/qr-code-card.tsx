"use client"

// 🔐 动态身份码：每 60 秒刷新，生成 qr_token 供场馆人员扫码核销 / 加权益
import { useEffect, useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { useApp } from "@/components/app-provider"
import { RefreshCw, ShieldCheck } from "lucide-react"

const REFRESH_SECS = 60

export function QrCodeCard() {
  const { userName } = useApp()
  const [tick, setTick] = useState(0)
  const [remaining, setRemaining] = useState(REFRESH_SECS)

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setTick((t) => t + 1)
          return REFRESH_SECS
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const token = useMemo(() => {
    const ts = Math.floor(Date.now() / 1000)
    const salt = Math.random().toString(36).slice(2, 10).toUpperCase()
    return `qr_usr_1001_${ts}_${salt}`
  }, [tick])

  const progress = (remaining / REFRESH_SECS) * 100

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-mono tracking-widest text-primary">
            IDENTITY QR
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
            {String(remaining).padStart(2, "0")}s
          </span>
          <button
            onClick={() => {
              setTick((t) => t + 1)
              setRemaining(REFRESH_SECS)
            }}
            className="text-muted-foreground active:text-foreground"
            aria-label="刷新核销码"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 刷新进度条 */}
      <div className="h-[2px] bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="p-5 flex flex-col items-center gap-3 bg-background">
        <div className="relative p-3 bg-white">
          <QRCodeSVG
            value={token}
            size={180}
            level="H"
            marginSize={0}
            fgColor="#0a0a0a"
            bgColor="#ffffff"
          />
          {/* 四角装饰 */}
          <span className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-primary" />
          <span className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-primary" />
          <span className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-primary" />
          <span className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-primary" />
        </div>
        <div className="text-center">
          <div className="text-xs text-foreground">向场馆人员出示此码 · 核销或充值</div>
          <div className="text-[10px] text-muted-foreground mt-1 font-mono tracking-widest break-all max-w-[240px]">
            {token}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-border flex items-center justify-between text-[10px] font-mono tracking-widest">
        <span className="text-muted-foreground">{userName}</span>
        <span className="text-muted-foreground">AUTO-REFRESH 60s</span>
      </div>
    </div>
  )
}
