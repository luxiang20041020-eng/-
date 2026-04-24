// 教练工作台首页
import { MobileShell } from "@/components/mobile-shell"
import { PageHeader } from "@/components/section-header"
import { WorkspaceHome } from "@/components/workspace/workspace-home"
import { RoleGuard } from "@/components/role-guard"

export default function WorkspacePage() {
  return (
    <MobileShell>
      <RoleGuard min={2}>
        <PageHeader title="教练工作台" subtitle="WORKSPACE · 发课 · 核销 · 排课" />
        <WorkspaceHome />
      </RoleGuard>
    </MobileShell>
  )
}
