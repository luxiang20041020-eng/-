"use client"

// 💰 课时派发表单 · 核心防飞单页
// 对应 API: POST /api/coach/asset/distribute
// 必填：target_user_id, package_id, offline_amount, pay_method

import { useMemo, useState } from "react"
import { PACKAGES } from "@/lib/mock-data"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScanLine, Search, ShieldAlert, Check } from "lucide-react"
import { useRouter } from "next/navigation"

// 模拟通过扫码/手机号解析出的学员
const MOCK_CLIENT = {
  id: 1001,
  name: "王 · 小明",
  phone: "138****1234",
  privateClass: 2,
  groupClass: 5,
}

const PAY_METHODS = [
  { value: "Wechat_Transfer", label: "微信转账" },
  { value: "Alipay", label: "支付宝" },
  { value: "POS", label: "前台 POS" },
  { value: "Cash", label: "现金" },
  { value: "Gift", label: "赠课 · 0 元" },
]

export function DistributeForm() {
  const router = useRouter()
  const [phone, setPhone] = useState("138****1234")
  const [client, setClient] = useState<typeof MOCK_CLIENT | null>(MOCK_CLIENT)
  const [packageId, setPackageId] = useState<number>(PACKAGES[3].id)
  const [amount, setAmount] = useState<string>("6000.00")
  const [payMethod, setPayMethod] = useState<string>("Wechat_Transfer")
  const [remark, setRemark] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const selectedPkg = useMemo(() => PACKAGES.find((p) => p.id === packageId), [packageId])

  const handleSearch = () => {
    if (!phone.trim()) {
      toast.error("请先输入手机号或扫码")
      return
    }
    setClient(MOCK_CLIENT)
    toast.success("已检索到学员：王 · 小明")
  }

  const handleScan = () => {
    toast.info("调用 wx.scanCode → 解析 qr_token → 自动回填学员信息", {
      description: "Demo 环境已自动填入 王 · 小明",
    })
    setClient(MOCK_CLIENT)
  }

  const validate = () => {
    if (!client) return "请先选择目标学员"
    if (!selectedPkg) return "请选择充值套餐"
    if (amount.trim() === "" || Number(amount) < 0) return "实收金额必须 ≥ 0"
    if (!payMethod) return "请选择收款方式"
    return null
  }

  const handleSubmit = () => {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    setConfirmOpen(true)
  }

  const handleConfirm = async () => {
    setLoading(true)
    // 模拟分布式锁 & 事务写库
    await new Promise((r) => setTimeout(r, 650))
    setLoading(false)
    setConfirmOpen(false)
    toast.success(`已为 ${client?.name} 派发 ${selectedPkg?.name}`, {
      description: "已写入 user_asset 与审计流水 user_asset_log",
    })
    setTimeout(() => router.push("/workspace"), 800)
  }

  return (
    <div className="pb-6">
      {/* 学员信息 */}
      <section className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono tracking-[0.25em] text-primary">
            STEP 01 · 目标学员
          </span>
          <span className="text-[9px] font-mono tracking-widest text-muted-foreground">
            REQUIRED
          </span>
        </div>
        <div className="flex items-stretch border border-border">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="输入手机号或扫码"
            className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
            inputMode="tel"
          />
          <button
            onClick={handleScan}
            className="px-3 border-l border-border active:bg-muted"
            aria-label="扫码"
          >
            <ScanLine className="h-4 w-4" />
          </button>
          <button
            onClick={handleSearch}
            className="px-3 bg-primary text-primary-foreground active:opacity-80"
            aria-label="搜索"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
        {client && (
          <div className="mt-3 border border-border p-3 bg-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary flex items-center justify-center">
                <span className="font-display text-base text-primary-foreground">王</span>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{client.name}</div>
                <div className="text-[11px] text-muted-foreground">{client.phone}</div>
              </div>
              <span className="text-[9px] font-mono tracking-widest text-primary border border-primary px-1 py-0.5">
                MATCHED
              </span>
            </div>
            <div className="grid grid-cols-2 mt-3 border border-border">
              <div className="p-2 text-center border-r border-border">
                <div className="text-[9px] font-mono text-muted-foreground tracking-widest">
                  私教
                </div>
                <div className="font-display num text-lg leading-none mt-1">
                  {client.privateClass}
                </div>
              </div>
              <div className="p-2 text-center">
                <div className="text-[9px] font-mono text-muted-foreground tracking-widest">
                  团课
                </div>
                <div className="font-display num text-lg leading-none mt-1">
                  {client.groupClass}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 选择套餐 */}
      <section className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono tracking-[0.25em] text-primary">
            STEP 02 · 选择套餐
          </span>
          <span className="text-[9px] font-mono tracking-widest text-muted-foreground">
            REQUIRED
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {PACKAGES.map((p) => {
            const active = p.id === packageId
            return (
              <button
                key={p.id}
                onClick={() => setPackageId(p.id)}
                className={
                  "flex items-center justify-between p-3 border text-left transition-colors " +
                  (active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card active:bg-muted")
                }
              >
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
                    <span className="text-[9px] font-mono text-muted-foreground">
                      +{p.courseCount} 节
                    </span>
                  </div>
                  <div className="text-sm font-medium">{p.name}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-display num text-base leading-none">
                      <span className="text-[10px] text-muted-foreground">¥</span>
                      {p.displayPrice.toLocaleString()}
                    </div>
                  </div>
                  <div
                    className={
                      "h-4 w-4 border flex items-center justify-center " +
                      (active ? "border-primary bg-primary" : "border-border")
                    }
                  >
                    {active && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* 线下收款信息 */}
      <section className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono tracking-[0.25em] text-primary">
            STEP 03 · 线下收款
          </span>
          <span className="text-[9px] font-mono tracking-widest text-muted-foreground">
            FOR AUDIT
          </span>
        </div>

        <label className="block text-[11px] text-muted-foreground mb-1">
          实收金额（元） *
        </label>
        <div className="flex items-center border border-border focus-within:border-primary mb-3">
          <span className="px-3 text-sm text-muted-foreground border-r border-border">¥</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            className="flex-1 bg-transparent px-3 py-3 text-sm font-display num outline-none"
            placeholder="0.00"
          />
        </div>

        <label className="block text-[11px] text-muted-foreground mb-1">收款方式 *</label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {PAY_METHODS.map((m) => {
            const active = m.value === payMethod
            return (
              <button
                key={m.value}
                onClick={() => setPayMethod(m.value)}
                className={
                  "py-2 text-[11px] border transition-colors " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground")
                }
              >
                {m.label}
              </button>
            )
          })}
        </div>

        <label className="block text-[11px] text-muted-foreground mb-1">派发备注</label>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          rows={3}
          placeholder="如：活动赠送、已交财务、已开收据..."
          className="w-full bg-transparent border border-border px-3 py-2 text-sm outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
        />
      </section>

      {/* 审计提示 */}
      <div className="mx-4 mt-4 border border-primary/40 bg-primary/10 p-3 flex gap-2">
        <ShieldAlert className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-[11px] font-semibold text-foreground">
            审计留痕 · 防飞单提醒
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
            操作将记录至 user_asset_log（时间 · 操作人 · 客户 · 数量 · 金额 · 收款方式），
            管理员可随时在「数据看板 · 审计流水」中查阅与对账。
          </div>
        </div>
      </div>

      {/* 提交 */}
      <div className="px-4 pt-4">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-primary text-primary-foreground py-4 text-sm font-semibold tracking-wider active:opacity-80 disabled:opacity-50"
        >
          {loading ? "正在提交..." : "确认派发 · 给该学员加课"}
        </button>
      </div>

      {/* 最终确认弹窗 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-card border border-border rounded-none max-w-[320px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <span className="text-[10px] font-mono tracking-widest text-primary border border-primary px-1">
                CONFIRM
              </span>
              请再次确认款项
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
              即将为 <span className="text-foreground font-medium">{client?.name}</span> 派发
              <br />
              <span className="text-foreground font-medium">{selectedPkg?.name}</span>
              <br />
              实收 ¥ {Number(amount || 0).toLocaleString()} ·{" "}
              {PAY_METHODS.find((m) => m.value === payMethod)?.label}
              <br />
              请确认款项已收妥，提交后不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-0 flex-row">
            <AlertDialogCancel className="rounded-none flex-1 border-border">
              再检查一下
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="rounded-none flex-1 bg-primary hover:bg-primary/90"
            >
              已收妥 · 派发
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
