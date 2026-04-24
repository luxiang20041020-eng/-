"use client"

// 🎭 Demo 角色切换器
// 真实项目中由登录接口返回的 role 决定底部 TabBar 显示，这里提供一个切换入口
// 方便评审者一键切换三端视图。

import { useApp } from "@/components/app-provider"
import type { Role } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

const ROLES: { key: Role; label: string; code: string }[] = [
  { key: 1, label: "客户", code: "CLIENT" },
  { key: 2, label: "教练", code: "COACH" },
  { key: 3, label: "管理员", code: "ADMIN" },
]

export function RoleSwitcher() {
  const { role, setRole } = useApp()
  const router = useRouter()
  const pathname = usePathname()

  const handleSwitch = (r: Role) => {
    setRole(r)
    // 若当前路径对目标角色不可见，回到首页
    if (pathname.startsWith("/workspace") && r !== 2) router.push("/")
    if (pathname.startsWith("/admin") && r !== 3) router.push("/")
  }

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-card">
      <Link href="/" className="flex items-center gap-2">
        <div className="h-5 w-5 bg-primary flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary-foreground leading-none">IF</span>
        </div>
        <span className="text-[11px] font-semibold tracking-[0.2em] text-foreground">
          IRONFIST
        </span>
        <span className="text-[10px] text-muted-foreground tracking-widest">/ DEMO</span>
      </Link>
      <div className="flex items-center gap-0 border border-border">
        {ROLES.map((r) => (
          <button
            key={r.key}
            onClick={() => handleSwitch(r.key)}
            className={cn(
              "px-2.5 py-1 text-[10px] font-mono tracking-wider transition-colors",
              role === r.key
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={role === r.key}
          >
            {r.code}
          </button>
        ))}
      </div>
    </div>
  )
}
