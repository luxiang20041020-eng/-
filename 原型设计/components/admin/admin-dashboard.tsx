"use client"

// 📊 管理员数据看板：日期区间 + 统计卡 + 审计流水 + 导出
import { useMemo, useState } from "react"
import { AUDIT_LOGS, STORES } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { Download, ChevronDown, Filter } from "lucide-react"
import { toast } from "sonner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function AdminDashboard() {
  const [storeFilter, setStoreFilter] = useState<number | "ALL">("ALL")
  const [coachFilter, setCoachFilter] = useState<string>("ALL")

  const coaches = useMemo(
    () => ["ALL", ...Array.from(new Set(AUDIT_LOGS.map((l) => l.coachName)))],
    [],
  )

  const logs = AUDIT_LOGS.filter(
    (l) => coachFilter === "ALL" || l.coachName === coachFilter,
  )

  const summary = useMemo(() => {
    const totalAmount = logs.reduce((s, l) => s + l.offlineAmount, 0)
    const totalGroup = logs
      .filter((l) => l.packageName.includes("团课"))
      .reduce((s, l) => s + l.courseCount, 0)
    const totalPrivate = logs
      .filter((l) => !l.packageName.includes("团课"))
      .reduce((s, l) => s + l.courseCount, 0)
    return { totalAmount, totalGroup, totalPrivate }
  }, [logs])

  return (
    <div>
      {/* 日期 + 门店筛选 */}
      <section className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex-1 border border-border px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-mono tracking-widest">DATE</span>
            <span className="font-display num">2025-10-25</span>
            <span className="text-muted-foreground">至</span>
            <span className="font-display num">2025-10-25</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button className="border border-border px-3 py-2 flex items-center gap-1.5 text-xs">
                <Filter className="h-3.5 w-3.5" />
                <span>门店</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[180px] p-0 rounded-none border-border bg-card">
              {["ALL", ...STORES.map((s) => s.id)].map((v) => {
                const label = v === "ALL" ? "全部门店" : STORES.find((s) => s.id === v)?.name
                const active = storeFilter === v
                return (
                  <button
                    key={String(v)}
                    onClick={() => setStoreFilter(v as number | "ALL")}
                    className={cn(
                      "w-full text-left px-3 py-2 text-xs border-b last:border-b-0 border-border hover:bg-muted",
                      active && "text-primary",
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </PopoverContent>
          </Popover>
        </div>
      </section>

      {/* 概览卡片 */}
      <section className="px-4 py-4 border-b border-border">
        <div className="text-[10px] font-mono tracking-[0.25em] text-primary mb-2">
          OVERVIEW · 今日概览
        </div>
        <div className="grid grid-cols-2 gap-0 border border-border">
          <BigStat
            label="线下收款总额"
            value={`¥ ${summary.totalAmount.toLocaleString()}`}
            code="OFFLINE AMOUNT"
            highlight
          />
          <BigStat label="今日核销" value="105" unit="节" code="CHECK-IN" border />
          <BigStat
            label="新增团课课时"
            value={String(summary.totalGroup)}
            unit="节"
            code="GROUP"
            borderTop
          />
          <BigStat
            label="新增私教课时"
            value={String(summary.totalPrivate)}
            unit="节"
            code="PRIVATE"
            border
            borderTop
          />
        </div>
      </section>

      {/* 审计流水 */}
      <section className="px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-mono tracking-[0.25em] text-primary">
            AUDIT LOG · 课时派发审计
          </div>
          <button
            onClick={() => toast.success("Excel 导出任务已提交，请前往 PC 端下载")}
            className="flex items-center gap-1 text-[11px] text-muted-foreground border border-border px-2 py-1"
          >
            <Download className="h-3 w-3" />
            导出
          </button>
        </div>

        {/* 教练筛选 Chip */}
        <div className="overflow-x-auto no-scrollbar pb-2">
          <div className="flex gap-2">
            {coaches.map((c) => (
              <button
                key={c}
                onClick={() => setCoachFilter(c)}
                className={cn(
                  "shrink-0 border px-3 py-1 text-[11px] font-mono tracking-widest transition-colors",
                  coachFilter === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {c === "ALL" ? "全部教练" : c}
              </button>
            ))}
          </div>
        </div>

        <ul className="border border-border divide-y divide-border">
          {logs.map((l) => (
            <li key={l.id} className="p-3">
              <div className="flex items-center justify-between text-[10px] font-mono tracking-widest mb-1.5">
                <span className="text-muted-foreground">
                  {l.createdAt.slice(5)} · LOG#{String(l.id).padStart(4, "0")}
                </span>
                <span className="text-primary">{l.payMethod}</span>
              </div>
              <div className="text-xs leading-relaxed">
                操作人{" "}
                <span className="font-semibold text-foreground">{l.coachName}</span>{" "}
                为学员{" "}
                <span className="font-semibold text-foreground">{l.clientName}</span>{" "}
                派发 <span className="font-semibold text-primary">{l.packageName}</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                <div className="text-[11px] text-muted-foreground">备注：{l.remark}</div>
                <div className="font-display num text-base">
                  <span className="text-[10px] text-muted-foreground mr-0.5">¥</span>
                  {l.offlineAmount.toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* 汇总条 */}
        <div className="mt-3 border border-primary/40 bg-primary/10 p-3 flex items-center justify-between">
          <div className="text-[11px] text-foreground">
            筛选结果汇总 · {logs.length} 条流水
          </div>
          <div className="font-display num text-lg text-primary">
            <span className="text-[10px] mr-0.5">¥</span>
            {summary.totalAmount.toLocaleString()}
          </div>
        </div>
      </section>

      {/* 公告发布入口（简略） */}
      <section className="px-4 pb-6">
        <div className="text-[10px] font-mono tracking-[0.25em] text-primary mb-2">
          TOOLS · 运营工具
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ToolCard title="发布系统公告" desc="文本 / 图片 · 跑马灯" />
          <ToolCard title="人员权限管理" desc="提升 / 解除教练" />
          <ToolCard title="套餐上下架" desc="首页价目表配置" />
          <ToolCard title="门店管理" desc="地址 / 经纬度" />
        </div>
      </section>
    </div>
  )
}

function BigStat({
  label,
  value,
  unit,
  code,
  border,
  borderTop,
  highlight,
}: {
  label: string
  value: string
  unit?: string
  code: string
  border?: boolean
  borderTop?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        "p-4 relative",
        border && "border-l border-border",
        borderTop && "border-t border-border",
        highlight && "bg-primary/10",
      )}
    >
      <div className="text-[9px] font-mono tracking-widest text-muted-foreground">{code}</div>
      <div className="flex items-baseline gap-1 mt-2">
        <span className={cn("font-display num text-2xl leading-none", highlight && "text-primary")}>
          {value}
        </span>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
      <div className="text-[11px] text-foreground mt-1.5">{label}</div>
      {highlight && <div className="absolute top-0 left-0 h-full w-[3px] bg-primary" />}
    </div>
  )
}

function ToolCard({ title, desc }: { title: string; desc: string }) {
  return (
    <button className="border border-border bg-card p-3 text-left active:bg-muted">
      <div className="text-sm font-semibold leading-tight">{title}</div>
      <div className="text-[10px] text-muted-foreground mt-1">{desc}</div>
    </button>
  )
}
