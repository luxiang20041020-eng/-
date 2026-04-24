import { MobileShell } from "@/components/mobile-shell"
import { PageHeader } from "@/components/section-header"
import { RoleGuard } from "@/components/role-guard"
import { DistributeForm } from "@/components/workspace/distribute-form"
import BackButton from "@/components/back-button"

export default function DistributePage() {
  return (
    <MobileShell>
      <RoleGuard min={2}>
        <PageHeader
          title="课时派发"
          subtitle="ASSET DISTRIBUTION · 核心防飞单页"
          back={<BackButton />}
        />
        <DistributeForm />
      </RoleGuard>
    </MobileShell>
  )
}
