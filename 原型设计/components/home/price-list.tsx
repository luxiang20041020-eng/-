"use client"

// 价目表 · 仅展示，不参与线上交易
// 底部按钮：拨打客服电话 + 复制客服微信
import { PACKAGES } from "@/lib/mock-data"
import { Phone, Copy } from "lucide-react"
import { toast } from "sonner"

export function PriceList() {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText("ironfist_service")
      toast.success("客服微信已复制：ironfist_service")
    } catch {
      toast.error("复制失败，请手动记录：ironfist_service")
    }
  }

  return (
    <div className="px-4">
      <ul className="border border-border divide-y divide-border">
        {PACKAGES.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[9px] font-mono tracking-widest border px-1 py-0.5"
                  style={{
                    borderColor: p.assetType === 2 ? "var(--primary)" : "var(--border)",
                    color: p.assetType === 2 ? "var(--primary)" : "var(--muted-foreground)",
                  }}
                >
                  {p.assetType === 1 ? "GROUP" : "PRIVATE"}
                </span>
                {p.highlight && (
                  <span className="text-[9px] font-mono tracking-widest text-primary-foreground bg-primary px-1 py-0.5">
                    HOT
                  </span>
                )}
              </div>
              <div className="text-sm font-medium leading-tight">{p.name}</div>
              <div className="text-[10px] text-muted-foreground mt-1 font-mono tracking-widest">
                {p.courseCount} CLASSES · CODE-{String(p.id).padStart(3, "0")}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-xl num leading-none">
                <span className="text-[11px] text-muted-foreground mr-0.5">¥</span>
                {p.displayPrice.toLocaleString()}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5 tracking-widest">
                仅线下
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href="tel:4001234567"
          className="flex items-center justify-center gap-2 border border-border py-3 text-sm font-medium active:bg-muted"
        >
          <Phone className="h-4 w-4" />
          联系客服
        </a>
        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 text-sm font-semibold active:opacity-80"
        >
          <Copy className="h-4 w-4" />
          复制客服微信
        </button>
      </div>
    </div>
  )
}
