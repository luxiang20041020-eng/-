"use client"

// 🚧 路由权限守卫：对应文档中「路由守卫 · 预约页面、教练核销页面必须判断 role 权限」
import { useApp } from "@/components/app-provider"
import { ShieldAlert } from "lucide-react"

export function RoleGuard({
  min,
  children,
}: {
  min: 2 | 3
  children: React.ReactNode
}) {
  const { role, setRole } = useApp()
  if (role >= min) return <>{children}</>
  const required = min === 3 ? "管理员" : "教练"

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <ShieldAlert className="h-10 w-10 text-primary mb-4" />
      <div className="text-[10px] font-mono tracking-widest text-primary mb-2">
        403 · UNAUTHORIZED
      </div>
      <h2 className="text-lg font-semibold tracking-tight">权限不足</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-[240px]">
        本页面仅 {required}（Role ≥ {min}）可访问，请联系管理员或使用右上角角色切换器模拟查看。
      </p>
      <div className="mt-5 flex gap-2">
        <button
          onClick={() => setRole(min)}
          className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold active:opacity-80"
        >
          模拟切换为 {required}
        </button>
      </div>
    </div>
  )
}
