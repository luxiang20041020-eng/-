import { MobileShell } from "@/components/mobile-shell"
import { PageHeader } from "@/components/section-header"
import { RoleGuard } from "@/components/role-guard"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import { Calendar } from "lucide-react"

export default function AdminPage() {
  return (
    <MobileShell>
      <RoleGuard min={3}>
        <PageHeader
          title="数据看板"
          subtitle="AUDIT · 对账 · 全馆统计"
          right={
            <button className="p-1" aria-label="日期筛选">
              <Calendar className="h-5 w-5" strokeWidth={1.75} />
            </button>
          }
        />
        <AdminDashboard />
      </RoleGuard>
    </MobileShell>
  )
}
