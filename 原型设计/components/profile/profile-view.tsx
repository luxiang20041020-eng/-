"use client"

// 我的 · 资产卡片 · 身份核销码 · 预约记录 · 上课统计
import { useApp } from "@/components/app-provider"
import { MY_BOOKINGS } from "@/lib/mock-data"
import { QrCodeCard } from "@/components/profile/qr-code-card"
import { ChevronRight, CalendarCheck, TrendingUp, Megaphone, CircleHelp, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProfileView() {
  const { role, userName, userPhone, assets, currentStore } = useApp()

  const roleLabel = role === 3 ? "ADMIN · 管理员" : role === 2 ? "COACH · 教练" : "CLIENT · 会员"

  return (
    <div className="flex flex-col">
      {/* 用户信息 */}
      <section className="px-4 py-5 border-b border-border flex items-center gap-4">
        <div className="h-14 w-14 bg-primary flex items-center justify-center">
          <span className="font-display text-xl text-primary-foreground">王</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{userName}</h2>
            <span className="text-[9px] font-mono tracking-widest border border-primary text-primary px-1 py-0.5">
              {roleLabel}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            📞 {userPhone} · 归属 {currentStore.name}
          </div>
        </div>
      </section>

      {/* 课时资产卡片 */}
      <section id="assets" className="px-4 py-4">
        <div className="text-[10px] font-mono tracking-[0.25em] text-primary mb-2">
          MY ASSETS · 我的课时资产
        </div>
        <div className="grid grid-cols-2 border border-border">
          <AssetCell label="私教" code="PRIVATE" value={assets.privateClass} highlight />
          <AssetCell label="团课" code="GROUP" value={assets.groupClass} />
        </div>
        <div className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
          课时有效期 365 天 · 跨门店通用 · 缺席照扣 · 开课前 2 小时内不可取消
        </div>
      </section>

      {/* 身份核销码 */}
      <section id="qr" className="px-4 pb-4">
        <QrCodeCard />
      </section>

      {/* 我的预约 */}
      <section id="bookings" className="px-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-mono tracking-[0.25em] text-primary">
            MY BOOKINGS · 我的预约
          </div>
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
            近 30 天
          </span>
        </div>
        <ul className="border border-border divide-y divide-border">
          {MY_BOOKINGS.map((b) => {
            const statusMap: Record<number, { label: string; cls: string }> = {
              1: { label: "待上课", cls: "text-primary border-primary" },
              2: { label: "已完成", cls: "text-muted-foreground border-border" },
              3: { label: "已取消", cls: "text-muted-foreground border-border" },
              4: { label: "教练取消", cls: "text-muted-foreground border-border" },
              5: { label: "缺席", cls: "text-destructive border-destructive" },
            }
            const st = statusMap[b.status]
            return (
              <li key={b.id} className="p-3 flex items-start gap-3">
                <div className="flex flex-col items-center min-w-[52px] border-r border-border pr-3">
                  <span className="font-display text-lg num leading-none">
                    {b.date.slice(-2)}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground tracking-widest mt-1">
                    {b.date.slice(5, 7)}月
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{b.title}</span>
                    <span className={cn("text-[9px] font-mono tracking-widest border px-1 py-0.5", st.cls)}>
                      {st.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {b.startTime} - {b.endTime} · {b.coachName} · {b.room}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {/* 统计 */}
      <section className="px-4 pb-4">
        <div className="text-[10px] font-mono tracking-[0.25em] text-primary mb-2">
          STATS · 训练统计
        </div>
        <div className="grid grid-cols-3 border border-border">
          <StatCell label="本月课数" value="12" unit="节" />
          <StatCell label="坚持天数" value="37" unit="天" border />
          <StatCell label="累计课时" value="128" unit="节" border />
        </div>
      </section>

      {/* 菜单 */}
      <section className="px-4 pb-6">
        <ul className="border border-border divide-y divide-border">
          <MenuItem icon={CalendarCheck} label="预约与核销规则" />
          <MenuItem icon={TrendingUp} label="我的训练趋势" />
          <MenuItem icon={Megaphone} label="消息与公告" />
          <MenuItem icon={CircleHelp} label="帮助与客服" />
          <MenuItem icon={LogOut} label="切换账号" danger />
        </ul>
      </section>
    </div>
  )
}

function AssetCell({
  label,
  code,
  value,
  highlight,
}: {
  label: string
  code: string
  value: number
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        "p-5 flex flex-col items-start gap-1 relative",
        highlight ? "bg-primary/10 border-r border-border" : "border-r border-border last:border-r-0",
      )}
    >
      <span className="text-[9px] font-mono tracking-widest text-muted-foreground">
        {code}
      </span>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="font-display text-4xl num leading-none">{value}</span>
        <span className="text-xs text-muted-foreground">节</span>
      </div>
      <span className="text-xs text-foreground mt-1">{label}余额</span>
      {highlight && <div className="absolute top-0 left-0 w-[3px] h-full bg-primary" />}
    </div>
  )
}

function StatCell({
  label,
  value,
  unit,
  border,
}: {
  label: string
  value: string
  unit: string
  border?: boolean
}) {
  return (
    <div className={cn("p-3 text-center", border && "border-l border-border")}>
      <div className="flex items-baseline justify-center gap-0.5">
        <span className="font-display text-2xl num leading-none">{value}</span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5 tracking-wider">{label}</div>
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  danger?: boolean
}) {
  return (
    <li>
      <button
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 py-3 active:bg-muted",
          danger && "text-destructive",
        )}
      >
        <span className="flex items-center gap-3">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
          <span className="text-sm">{label}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </li>
  )
}
