"use client"

// 排课管理：日期网格 + 时间格子点选 + 批量应用到未来 N 周
import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Plus, Repeat, Check, CalendarPlus } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

const HOURS = ["07:00", "09:00", "10:00", "14:00", "16:00", "19:00", "20:30"]
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]

export function ScheduleManage() {
  const [slots, setSlots] = useState<Record<string, { type: 1 | 2; capacity: number }>>({
    "1-10:00": { type: 1, capacity: 15 },
    "1-19:00": { type: 1, capacity: 15 },
    "3-07:00": { type: 1, capacity: 12 },
    "5-20:30": { type: 2, capacity: 1 },
  })
  const [editOpen, setEditOpen] = useState(false)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [form, setForm] = useState({
    type: 1 as 1 | 2,
    title: "泰拳基础",
    capacity: 15,
    repeatWeeks: 4,
  })

  const openEdit = (key: string) => {
    setEditKey(key)
    const exist = slots[key]
    setForm({
      type: exist?.type || 1,
      title: "泰拳基础",
      capacity: exist?.capacity ?? 15,
      repeatWeeks: 4,
    })
    setEditOpen(true)
  }

  const handleSave = () => {
    if (!editKey) return
    setSlots((prev) => ({
      ...prev,
      [editKey]: { type: form.type, capacity: form.capacity },
    }))
    toast.success(`排课已保存 · 应用至未来 ${form.repeatWeeks} 周`, {
      description: "后端将生成 " + form.repeatWeeks + " 条 biz_class_schedule 记录",
    })
    setEditOpen(false)
  }

  const handleRemove = () => {
    if (!editKey) return
    setSlots((prev) => {
      const n = { ...prev }
      delete n[editKey]
      return n
    })
    toast.success("该时段排课已取消")
    setEditOpen(false)
  }

  return (
    <div>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="text-[10px] font-mono tracking-widest text-muted-foreground">
          本周模板 · WEEK TEMPLATE
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/workspace/publish"
            className="flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            单次发布
          </Link>
          <button
            onClick={() => toast.info("可在下方表格点击任一空白格子快速添加")}
            className="flex items-center gap-1 text-[11px] text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            新增
          </button>
        </div>
      </div>

      {/* 排课表格 */}
      <div className="px-3 py-3">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border border-border">
          <div className="border-b border-r border-border bg-card" />
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="border-b border-r last:border-r-0 border-border text-center py-1.5 text-[10px] font-mono tracking-widest bg-card"
            >
              周{w}
            </div>
          ))}
          {HOURS.map((h) => (
            <div key={h} className="contents">
              <div className="border-r border-b border-border bg-card text-[10px] font-mono tracking-widest text-muted-foreground text-center py-2">
                {h}
              </div>
              {WEEKDAYS.map((_, i) => {
                const day = i + 1
                const key = `${day}-${h}`
                const slot = slots[key]
                return (
                  <button
                    key={key}
                    onClick={() => openEdit(key)}
                    className={cn(
                      "border-r last:border-r-0 border-b border-border h-12 text-[10px] transition-colors relative",
                      slot
                        ? slot.type === 2
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/15 text-foreground"
                        : "bg-background hover:bg-muted",
                    )}
                  >
                    {slot ? (
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-mono tracking-wider">
                          {slot.type === 1 ? "团" : "私"}
                        </span>
                        <span className="font-mono num text-[9px] opacity-80">
                          {slot.capacity}P
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">＋</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div className="px-4 pb-4 flex items-center gap-4 text-[10px] font-mono tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 bg-primary/15" /> 团课
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 bg-primary" /> 私教
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 border border-border" /> 空闲
        </span>
      </div>

      {/* 编辑弹窗 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border border-border rounded-none max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest text-primary border border-primary px-1">
                EDIT SLOT
              </span>
              编辑排课 · {editKey}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="block text-[10px] font-mono tracking-widest text-muted-foreground mb-1">
                TYPE 类型
              </label>
              <div className="grid grid-cols-2 border border-border">
                {([1, 2] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() =>
                      setForm((f) => ({ ...f, type: t, capacity: t === 2 ? 1 : 15 }))
                    }
                    className={cn(
                      "py-2 text-xs border-r last:border-r-0 border-border",
                      form.type === t
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {t === 1 ? "团课" : "私教"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono tracking-widest text-muted-foreground mb-1">
                CAPACITY 容量
              </label>
              <input
                value={form.capacity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, capacity: Math.max(1, Number(e.target.value) || 1) }))
                }
                type="number"
                min={1}
                className="w-full bg-transparent border border-border px-3 py-2 text-sm font-display num outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                <Repeat className="h-3 w-3" /> REPEAT 应用至未来周数
              </label>
              <div className="grid grid-cols-4 border border-border">
                {[1, 2, 4, 8].map((w) => (
                  <button
                    key={w}
                    onClick={() => setForm((f) => ({ ...f, repeatWeeks: w }))}
                    className={cn(
                      "py-2 text-xs border-r last:border-r-0 border-border",
                      form.repeatWeeks === w
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {w}w
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-0 flex-row">
            <button
              onClick={handleRemove}
              className="flex-1 border border-border py-3 text-xs text-destructive active:bg-muted"
            >
              取消此时段
            </button>
            <button
              onClick={handleSave}
              className="flex-1 bg-primary text-primary-foreground py-3 text-xs font-semibold active:opacity-80 flex items-center justify-center gap-1"
            >
              <Check className="h-4 w-4" />
              保存排课
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
