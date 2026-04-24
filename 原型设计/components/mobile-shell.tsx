"use client"

// 📱 移动端容器：在桌面浏览器上以 iPhone 线框形式预览；
// 在真实移动端则铺满屏幕，完全还原小程序尺寸。

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Calendar, User, Briefcase, BarChart3, Signal, Wifi, BatteryFull } from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/components/app-provider"
import { RoleSwitcher } from "@/components/role-switcher"

interface TabItem {
  key: string
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles: number[] // 哪些角色能看到该 Tab
}

const TABS: TabItem[] = [
  { key: "home", label: "首页", href: "/", icon: Home, roles: [1, 2, 3] },
  { key: "booking", label: "预约", href: "/booking", icon: Calendar, roles: [1, 2, 3] },
  { key: "workspace", label: "工作台", href: "/workspace", icon: Briefcase, roles: [2] },
  { key: "admin", label: "看板", href: "/admin", icon: BarChart3, roles: [3] },
  { key: "profile", label: "我的", href: "/profile", icon: User, roles: [1, 2, 3] },
]

export function MobileShell({ children }: { children: React.ReactNode }) {
  const { role } = useApp()
  const pathname = usePathname()
  const visibleTabs = TABS.filter((t) => t.roles.includes(role))

  return (
    <div className="min-h-dvh w-full bg-background flex flex-col items-center">
      {/* 桌面端演示框 · 移动端自适应全屏 */}
      <div className="w-full md:max-w-[420px] md:my-6 md:border md:border-border md:rounded-[4px] md:overflow-hidden bg-background relative flex flex-col md:min-h-[860px] md:shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        {/* 状态栏（仅桌面端模拟） */}
        <div className="hidden md:flex items-center justify-between px-5 py-2 text-[11px] text-muted-foreground border-b border-border bg-background">
          <span className="font-mono tabular-nums">9:41</span>
          <div className="flex items-center gap-1.5">
            <Signal className="h-3 w-3" />
            <Wifi className="h-3 w-3" />
            <BatteryFull className="h-3.5 w-3.5" />
          </div>
        </div>

        {/* 角色切换（Demo 评审器） */}
        <RoleSwitcher />

        {/* 主内容区 */}
        <main className="flex-1 pb-24 overflow-y-auto">{children}</main>

        {/* 底部 TabBar */}
        <nav
          className="sticky bottom-0 left-0 right-0 grid bg-card border-t border-border"
          style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
          aria-label="底部导航"
        >
          {visibleTabs.map((t) => {
            const active =
              t.href === "/"
                ? pathname === "/"
                : pathname === t.href || pathname.startsWith(t.href + "/")
            const Icon = t.icon
            return (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 text-[11px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                <span className={cn(active && "font-semibold")}>{t.label}</span>
                {active && <span className="absolute top-0 h-[2px] w-8 bg-primary" />}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
