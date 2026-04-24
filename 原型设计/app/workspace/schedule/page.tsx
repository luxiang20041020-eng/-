import { MobileShell } from "@/components/mobile-shell"
import { PageHeader } from "@/components/section-header"
import { RoleGuard } from "@/components/role-guard"
import { ScheduleManage } from "@/components/workspace/schedule-manage"
import BackButton from "@/components/back-button"

export default function SchedulePage() {
  return (
    <MobileShell>
      <RoleGuard min={2}>
        <PageHeader title="排课管理" subtitle="SCHEDULE · 单次 / 模板" back={<BackButton />} />
        <ScheduleManage />
      </RoleGuard>
    </MobileShell>
  )
}
