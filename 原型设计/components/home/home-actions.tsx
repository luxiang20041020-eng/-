"use client"

// 首页金刚区：团课预约 · 私教预约 · 我的课表 · 身份码
import Link from "next/link"
import { CalendarDays, UserRound, ListChecks, QrCode } from "lucide-react"

const ITEMS = [
  { href: "/booking?type=1", icon: CalendarDays, label: "团课预约", code: "GROUP" },
  { href: "/booking?type=2", icon: UserRound, label: "私教预约", code: "PT" },
  { href: "/profile#bookings", icon: ListChecks, label: "我的课表", code: "MINE" },
  { href: "/profile#qr", icon: QrCode, label: "身份码", code: "QR" },
]

export function HomeActions() {
  return (
    <div className="px-4 pt-4">
      <div className="grid grid-cols-4 border border-border">
        {ITEMS.map((it, idx) => {
          const Icon = it.icon
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                "flex flex-col items-center justify-center gap-2 py-4 text-xs active:bg-primary/10 transition-colors" +
                (idx !== ITEMS.length - 1 ? " border-r border-border" : "")
              }
            >
              <Icon className="h-6 w-6" strokeWidth={1.75} />
              <div className="text-center">
                <div className="text-[10px] font-mono tracking-widest text-primary">
                  {it.code}
                </div>
                <div className="text-xs font-medium mt-0.5">{it.label}</div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
