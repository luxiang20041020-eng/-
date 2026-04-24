"use client"

// 门店切换器（底部 Drawer）：切换后，大厅数据将按 storeId 重新筛选。
import { MapPin, ChevronDown } from "lucide-react"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { useApp } from "@/components/app-provider"
import { STORES } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { useState } from "react"

export function StoreSwitcher() {
  const { currentStore, storeId, setStoreId } = useApp()
  const [open, setOpen] = useState(false)

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button className="flex items-center gap-1.5 text-sm group">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-semibold tracking-tight">{currentStore.name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-active:translate-y-[1px] transition-transform" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="bg-card border-t border-border">
        <DrawerHeader className="text-left border-b border-border">
          <DrawerTitle className="text-sm tracking-widest font-mono text-muted-foreground">
            SELECT STORE · 选择门店
          </DrawerTitle>
        </DrawerHeader>
        <ul className="py-2">
          {STORES.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => {
                  setStoreId(s.id)
                  setOpen(false)
                }}
                className={cn(
                  "w-full px-4 py-4 flex items-start justify-between gap-3 border-b border-border/60 text-left",
                  storeId === s.id ? "bg-primary/5" : "active:bg-muted",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    {storeId === s.id && (
                      <span className="text-[9px] font-mono tracking-widest text-primary border border-primary px-1">
                        CURRENT
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {s.address}
                  </div>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground tracking-widest shrink-0">
                  {s.distance}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <div className="h-4" />
      </DrawerContent>
    </Drawer>
  )
}
