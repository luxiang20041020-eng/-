"use client"

// 预约二次确认弹窗（防误用权益）
import type { Schedule } from "@/lib/mock-data"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useApp } from "@/components/app-provider"

interface Props {
  schedule: Schedule | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function BookingConfirmDialog({ schedule, onOpenChange, onConfirm }: Props) {
  const { assets } = useApp()
  const type = schedule?.classType === 1 ? "groupClass" : "privateClass"
  const balance = schedule ? assets[type as keyof typeof assets] : 0

  return (
    <AlertDialog open={!!schedule} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border border-border rounded-none max-w-[320px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base tracking-tight flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-primary border border-primary px-1">
              CONFIRM
            </span>
            确认预约
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground text-xs leading-relaxed">
            将使用 1 次{schedule?.classType === 1 ? "团体" : "专属"}权益。
            <br />
            <span className="text-foreground">{schedule?.title}</span>
            <br />
            {schedule?.date} · {schedule?.startTime} - {schedule?.endTime}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* 资产摘要 */}
        <div className="grid grid-cols-2 gap-0 border border-border my-2">
          <div className="p-3 border-r border-border">
            <div className="text-[9px] font-mono tracking-widest text-muted-foreground">
              BEFORE
            </div>
            <div className="font-display text-xl num mt-1">{balance}</div>
          </div>
          <div className="p-3 bg-primary/10">
            <div className="text-[9px] font-mono tracking-widest text-primary">AFTER</div>
            <div className="font-display text-xl num mt-1 text-primary">
              {Math.max(0, balance - 1)}
            </div>
          </div>
        </div>

        <AlertDialogFooter className="gap-0 flex-row">
          <AlertDialogCancel className="rounded-none flex-1 border-border">
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="rounded-none flex-1 bg-primary hover:bg-primary/90"
          >
            确认预约
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
