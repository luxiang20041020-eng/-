import { MobileShell } from "@/components/mobile-shell"
import { PageHeader } from "@/components/section-header"
import { BookingHub } from "@/components/booking/booking-hub"
import { Filter } from "lucide-react"

export default function BookingPage() {
  return (
    <MobileShell>
      <PageHeader
        title="预约大厅"
        subtitle="BOOKING · 选课 · 扣减课时"
        right={
          <button className="p-1" aria-label="筛选">
            <Filter className="h-5 w-5" strokeWidth={1.75} />
          </button>
        }
      />
      <BookingHub />
    </MobileShell>
  )
}
