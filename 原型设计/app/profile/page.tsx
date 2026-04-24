import { MobileShell } from "@/components/mobile-shell"
import { PageHeader } from "@/components/section-header"
import { ProfileView } from "@/components/profile/profile-view"
import { Settings } from "lucide-react"

export default function ProfilePage() {
  return (
    <MobileShell>
      <PageHeader
        title="我的"
        subtitle="PROFILE · 资产 · 身份码"
        right={
          <button className="p-1" aria-label="设置">
            <Settings className="h-5 w-5" strokeWidth={1.75} />
          </button>
        }
      />
      <ProfileView />
    </MobileShell>
  )
}
