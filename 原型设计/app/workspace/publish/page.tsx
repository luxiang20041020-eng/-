import { MobileShell } from "@/components/mobile-shell"
import { RoleGuard } from "@/components/role-guard"
import { BackButton } from "@/components/back-button"
import { PublishClassForm } from "@/components/workspace/publish-class-form"

export default function PublishPage() {
  return (
    <MobileShell
      title="发布训练"
      subtitle="PUBLISH CLASS"
      left={<BackButton />}
      hideTabBar
    >
      <RoleGuard allow={[2, 3]}>
        <PublishClassForm />
      </RoleGuard>
    </MobileShell>
  )
}
