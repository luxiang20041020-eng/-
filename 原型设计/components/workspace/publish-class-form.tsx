"use client"

// 发布课程 (biz_class_schedule · 单条或批量)
// 核心字段：类型 / 主题 / 日期 / 时段 / 场地 / 容量 / 难度 / 重复策略 / 备注
// 提交后：单次 → POST /api/coach/schedules
//         重复 → 后端按 repeatWeeks 生成 N 条记录（每周同一时段）

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useApp } from "@/components/app-provider"
import { STORES } from "@/lib/mock-data"
import {
  CalendarRange,
  Clock,
  MapPin,
  Users,
  Repeat,
  FileText,
  ChevronRight,
  Check,
  Minus,
  Plus,
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

type ClassType = 1 | 2
type Level = "入门" | "进阶" | "实战"
type Repeat = 0 | 2 | 4 | 8 // 0 = 单次

const ROOMS_GROUP = ["A 馆", "B 馆", "C 馆"]
const ROOMS_PRIVATE = ["私教区 01", "私教区 02", "私教区 03"]
const TIME_PRESETS = ["07:00", "09:00", "10:00", "14:00", "16:00", "19:00", "20:30"]

function addMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number)
  const total = h * 60 + m + mins
  const nh = Math.floor((total + 24 * 60) % (24 * 60) / 60)
  const nm = (total + 24 * 60) % 60
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function PublishClassForm() {
  const router = useRouter()
  const { storeId } = useApp()
  const store = STORES.find((s) => s.id === storeId)

  const [classType, setClassType] = useState<ClassType>(1)
  const [title, setTitle] = useState("泰拳基础 · 发力小班")
  const [level, setLevel] = useState<Level>("入门")
  const [date, setDate] = useState(todayStr())
  const [startTime, setStartTime] = useState("19:00")
  const [duration, setDuration] = useState(90) // 分钟
  const [room, setRoom] = useState("A 馆")
  const [capacity, setCapacity] = useState(15)
  const [repeatWeeks, setRepeatWeeks] = useState<Repeat>(0)
  const [remark, setRemark] = useState("")

  const [confirmOpen, setConfirmOpen] = useState(false)

  const endTime = useMemo(() => addMinutes(startTime, duration), [startTime, duration])

  const onSwitchType = (t: ClassType) => {
    setClassType(t)
    if (t === 2) {
      setCapacity(1)
      setRoom("私教区 01")
      setTitle("一对一私教")
      setDuration(60)
    } else {
      setCapacity(15)
      setRoom("A 馆")
      setTitle("泰拳基础 · 发力小班")
      setDuration(90)
    }
  }

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error("请先填写课程主题")
      return
    }
    setConfirmOpen(true)
  }

  const handleConfirm = () => {
    const count = repeatWeeks === 0 ? 1 : repeatWeeks
    toast.success(`已发布 ${count} 节课`, {
      description:
        repeatWeeks === 0
          ? `${date} · ${startTime}-${endTime} · ${room}`
          : `自 ${date} 起，每周 ${startTime}-${endTime}，共 ${count} 周`,
    })
    setConfirmOpen(false)
    router.push("/workspace")
  }

  const handleDraft = () => {
    toast.message("已保存为草稿", {
      description: "草稿不进入客户端可约列表，可稍后编辑后再发布",
    })
  }

  const roomOptions = classType === 1 ? ROOMS_GROUP : ROOMS_PRIVATE

  return (
    <div className="pb-[88px]">
      {/* 头部铭牌 */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono tracking-[0.25em] text-primary">
              PUBLISH · 新建一节课
            </div>
            <h2 className="text-base font-semibold mt-1 text-balance">
              填写课程信息 · 提交后即对学员可见
            </h2>
          </div>
          <span className="text-[10px] font-mono tracking-widest border border-border px-2 py-0.5 text-muted-foreground">
            {store?.name ?? "—"}
          </span>
        </div>
      </div>

      {/* 01 · 课程类型 */}
      <Group index="01" code="TYPE" label="课程类型">
        <div className="grid grid-cols-2 border border-border">
          {([1, 2] as const).map((t) => (
            <button
              key={t}
              onClick={() => onSwitchType(t)}
              className={cn(
                "py-3 text-sm border-r last:border-r-0 border-border flex flex-col items-center gap-0.5",
                classType === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span className="font-semibold">{t === 1 ? "团课" : "私教"}</span>
              <span className="text-[10px] font-mono tracking-widest opacity-80">
                {t === 1 ? "GROUP" : "PRIVATE"}
              </span>
            </button>
          ))}
        </div>
      </Group>

      {/* 02 · 课程主题 / 难度 */}
      <Group index="02" code="TITLE" label="课程主题">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：泰拳基础 · 发力小班"
          className="w-full bg-transparent border border-border px-3 py-3 text-sm outline-none focus:border-primary"
        />
        {classType === 1 && (
          <div className="mt-3">
            <SubLabel>LEVEL · 难度</SubLabel>
            <div className="grid grid-cols-3 border border-border">
              {(["入门", "进阶", "实战"] as const).map((lv) => (
                <button
                  key={lv}
                  onClick={() => setLevel(lv)}
                  className={cn(
                    "py-2 text-xs border-r last:border-r-0 border-border",
                    level === lv
                      ? "bg-foreground text-background"
                      : "text-muted-foreground",
                  )}
                >
                  {lv}
                </button>
              ))}
            </div>
          </div>
        )}
      </Group>

      {/* 03 · 日期 */}
      <Group index="03" code="DATE" label="开课日期" icon={CalendarRange}>
        <input
          type="date"
          value={date}
          min={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-transparent border border-border px-3 py-3 text-sm num outline-none focus:border-primary"
        />
      </Group>

      {/* 04 · 时段 */}
      <Group index="04" code="TIME" label="时段" icon={Clock}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <SubLabel>START · 开始</SubLabel>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-transparent border border-border px-3 py-2.5 text-sm num outline-none focus:border-primary"
            />
          </div>
          <div>
            <SubLabel>END · 结束</SubLabel>
            <div className="w-full border border-border px-3 py-2.5 text-sm num text-muted-foreground">
              {endTime}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <SubLabel>DURATION · 时长（分钟）</SubLabel>
          <div className="grid grid-cols-4 border border-border">
            {[45, 60, 90, 120].map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn(
                  "py-2 text-xs border-r last:border-r-0 border-border num",
                  duration === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {d}min
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <SubLabel>PRESET · 常用开课时段</SubLabel>
          <div className="flex flex-wrap gap-1.5">
            {TIME_PRESETS.map((t) => (
              <button
                key={t}
                onClick={() => setStartTime(t)}
                className={cn(
                  "text-[11px] num border px-2 py-1 tracking-wider",
                  startTime === t
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </Group>

      {/* 05 · 场地 */}
      <Group index="05" code="ROOM" label="上课场地" icon={MapPin}>
        <div className="grid grid-cols-3 border border-border">
          {roomOptions.map((r) => (
            <button
              key={r}
              onClick={() => setRoom(r)}
              className={cn(
                "py-2.5 text-xs border-r last:border-r-0 border-border",
                room === r
                  ? "bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </Group>

      {/* 06 · 容量 */}
      <Group index="06" code="CAP" label="课程容量" icon={Users}>
        {classType === 2 ? (
          <div className="border border-border px-3 py-3 text-sm text-muted-foreground flex items-center justify-between">
            <span>私教课固定 1 人</span>
            <span className="font-display text-lg num text-foreground">1</span>
          </div>
        ) : (
          <div className="flex items-center border border-border">
            <button
              onClick={() => setCapacity((c) => Math.max(1, c - 1))}
              className="px-4 py-3 border-r border-border active:bg-muted"
              aria-label="减少容量"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center font-display text-2xl num">
              {capacity}
              <span className="text-xs text-muted-foreground ml-1">人</span>
            </div>
            <button
              onClick={() => setCapacity((c) => Math.min(30, c + 1))}
              className="px-4 py-3 border-l border-border active:bg-muted"
              aria-label="增加容量"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </Group>

      {/* 07 · 重复策略 */}
      <Group index="07" code="REPEAT" label="重复策略" icon={Repeat}>
        <div className="grid grid-cols-4 border border-border">
          {([0, 2, 4, 8] as const).map((w) => (
            <button
              key={w}
              onClick={() => setRepeatWeeks(w)}
              className={cn(
                "py-2.5 text-xs border-r last:border-r-0 border-border",
                repeatWeeks === w
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {w === 0 ? "单次" : `每周 · ${w}w`}
            </button>
          ))}
        </div>
        {repeatWeeks !== 0 && (
          <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
            将自 <span className="num text-foreground">{date}</span> 起，
            每周同一时段生成 <span className="num text-foreground">{repeatWeeks}</span> 条课程记录。
          </div>
        )}
      </Group>

      {/* 08 · 备注 */}
      <Group index="08" code="NOTE" label="备注（选填）" icon={FileText}>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          rows={3}
          maxLength={120}
          placeholder="例：自备护齿/绷带，迟到 10 分钟不可入场"
          className="w-full bg-transparent border border-border px-3 py-2 text-sm outline-none focus:border-primary resize-none"
        />
        <div className="text-right text-[10px] font-mono text-muted-foreground mt-1">
          {remark.length}/120
        </div>
      </Group>

      {/* 底部固定栏 */}
      <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-md border-t border-border bg-card">
        <div className="flex items-stretch">
          <button
            onClick={handleDraft}
            className="w-[112px] py-4 text-xs border-r border-border active:bg-muted text-muted-foreground"
          >
            存为草稿
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-4 bg-primary text-primary-foreground font-semibold text-sm active:opacity-80 flex items-center justify-center gap-1.5"
          >
            立即发布
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 发布确认弹窗 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-card border border-border rounded-none max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest text-primary border border-primary px-1">
                CONFIRM
              </span>
              确认发布课程
            </DialogTitle>
          </DialogHeader>
          <div className="border border-border divide-y divide-border">
            <Row k="类型" v={classType === 1 ? "团课" : "私教"} />
            <Row k="主题" v={title} />
            {classType === 1 && <Row k="难度" v={level} />}
            <Row k="日期" v={date} mono />
            <Row k="时段" v={`${startTime} - ${endTime}`} mono />
            <Row k="场地" v={room} />
            <Row k="容量" v={`${capacity} 人`} mono />
            <Row
              k="重复"
              v={repeatWeeks === 0 ? "单次" : `每周 · 共 ${repeatWeeks} 周`}
            />
          </div>
          <DialogFooter className="gap-0 flex-row">
            <button
              onClick={() => setConfirmOpen(false)}
              className="flex-1 border border-border py-3 text-xs text-muted-foreground active:bg-muted"
            >
              再检查一下
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 bg-primary text-primary-foreground py-3 text-xs font-semibold active:opacity-80 flex items-center justify-center gap-1"
            >
              <Check className="h-4 w-4" />
              确认发布
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Group({
  index,
  code,
  label,
  icon: Icon,
  children,
}: {
  index: string
  code: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section className="px-4 py-4 border-b border-border">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="font-display num text-primary text-sm leading-none">{index}</span>
        <span className="text-[10px] font-mono tracking-[0.25em] text-primary">{code}</span>
        <span className="text-xs text-muted-foreground">·</span>
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-xs text-foreground">{label}</span>
      </div>
      {children}
    </section>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono tracking-widest text-muted-foreground mb-1">
      {children}
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-[13px]">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("text-foreground text-right", mono && "num font-display")}>
        {v}
      </span>
    </div>
  )
}
