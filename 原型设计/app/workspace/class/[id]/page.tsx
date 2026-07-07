import { MobileShell } from "@/components/mobile-shell"
import { PageHeader } from "@/components/section-header"
import { RoleGuard } from "@/components/role-guard"
import { ClassCheckin } from "@/components/workspace/class-checkin"
import BackButton from "@/components/back-button"

export default async function ClassCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <MobileShell>
      <RoleGuard min={2}>
        <PageHeader title="到场核销" subtitle="CHECK-IN · 扫码 / 手动点名" back={<BackButton />} />
        <ClassCheckin scheduleId={Number(id)} />
      </RoleGuard>
    </MobileShell>
  )
}
