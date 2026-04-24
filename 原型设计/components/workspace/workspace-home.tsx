"use client"

// 教练工作台首页
// 快捷操作 (扫码发课/核销 · 搜学员 · 排课 · 历史带课) + 今日我的课程
import Link from "next/link"
import { useApp } from "@/components/app-provider"
import { SCHEDULES } from "@/lib/mock-data"
import { ScanLine, Search, CalendarPlus, CalendarCheck, History, ChevronRight, Clock, Users } from "lucide-react"
import { toast } from "sonner"

export function WorkspaceHome() {
  const { storeId } = useApp()
  const today = new Date().toISOString().slice(0, 10)
  const todayClasses = SCHEDULES.filter((s) => s.storeId === storeId && s.date === today)

  return (
    <div>
      {/* 教练身份 + 今日概览 */}
      <section className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 bg-primary flex items-center justify-center">
            <span className="font-display text-xl text-primary-foreground">李</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">李 · ARTHIT 的工作台</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              今日 {todayClasses.length} 节课 · 认证教练 · Role 2
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 border border-border mt-4">
          <Stat value="18" label="今日预约" />
          <Stat value="12" label="已核销" border />
          <Stat value="3" label="待进行" border />
        </div>
      </section>

      {/* 快捷操作 */}
      <section className="px-4 py-4">
        <div className="text-[10px] font-mono tracking-[0.25em] text-primary mb-2">
          QUICK ACTIONS · 快捷操作
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ActionTile
            onClick={() =>
              toast.info("已调用 wx.scanCode → 跳转「课时派发」/「核销」页", {
                description: "真实小程序由 qr_token 前缀判断跳转目标",
              })
            }
            icon={ScanLine}
            code="SCAN"
            title="扫码发课 / 核销"
            desc="扫描学员身份码"
            primary
          />
          <ActionTile
            href="/workspace/publish"
            icon={CalendarPlus}
            code="NEW"
            title="发布课程"
            desc="发布一节具体日期的课"
          />
          <ActionTile
            href="/workspace/schedule"
            icon={CalendarCheck}
            code="PLAN"
            title="周模板排课"
            desc="按星期固定 · 批量生效"
          />
          <ActionTile
            href="/workspace/distribute"
            icon={Search}
            code="ENTRY"
            title="手机号检索学员"
            desc="课时派发前置入口"
          />
          <ActionTile
            href="/workspace#history"
            icon={History}
            code="LOG"
            title="历史带课"
            desc="本月带课与绩效"
            span
          />
        </div>
      </section>

      {/* 今日我的课程 */}
      <section className="px-4 pb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-mono tracking-[0.25em] text-primary">
            TODAY · 今日我的课程
          </div>
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
            {todayClasses.length} CLASSES
          </span>
        </div>
        <ul className="border border-border divide-y divide-border">
          {todayClasses.map((s) => (
            <li key={s.id}>
              <Link
                href={`/workspace/class/${s.id}`}
                className="flex items-stretch active:bg-muted"
              >
                <div className="px-3 py-3 border-r border-border flex flex-col items-center justify-center min-w-[68px] bg-primary/10">
                  <span className="font-display text-lg num leading-none">{s.startTime}</span>
                  <span className="text-[9px] font-mono text-muted-foreground tracking-widest mt-1">
                    {s.endTime}
                  </span>
                </div>
                <div className="flex-1 py-3 px-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono tracking-widest text-primary">
                      {s.classType === 1 ? "GROUP" : "PRIVATE"}
                    </span>
                    <span className="text-sm font-medium truncate">{s.title}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {s.endTime}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {s.bookedCount}/{s.maxCapacity}
                    </span>
                    <span>{s.room}</span>
                  </div>
                </div>
                <div className="flex items-center px-3 text-muted-foreground">
                  <ChevronRight className="h-4 w-4" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Stat({ value, label, border }: { value: string; label: string; border?: boolean }) {
  return (
    <div className={"py-3 text-center" + (border ? " border-l border-border" : "")}>
      <div className="font-display text-2xl num leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1 tracking-widest">{label}</div>
    </div>
  )
}

function ActionTile({
  icon: Icon,
  code,
  title,
  desc,
  href,
  onClick,
  primary,
  span,
}: {
  icon: React.ComponentType<{ className?: string }>
  code: string
  title: string
  desc: string
  href?: string
  onClick?: () => void
  primary?: boolean
  span?: boolean
}) {
  const wrapCls = span ? "block col-span-2" : "block"
  const content = (
    <div
      className={
        "border border-border p-4 flex flex-col gap-2 active:opacity-80 transition-colors " +
        (primary ? "bg-primary text-primary-foreground border-primary" : "bg-card")
      }
    >
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
        <span className="text-[9px] font-mono tracking-widest opacity-70">{code}</span>
      </div>
      <div>
        <div className="text-sm font-semibold leading-tight">{title}</div>
        <div
          className={
            "text-[10px] mt-1 " +
            (primary ? "text-primary-foreground/70" : "text-muted-foreground")
          }
        >
          {desc}
        </div>
      </div>
    </div>
  )
  if (href)
    return (
      <Link href={href} className={wrapCls}>
        {content}
      </Link>
    )
  return (
    <button onClick={onClick} className={"text-left w-full " + wrapCls}>
      {content}
    </button>
  )
}
