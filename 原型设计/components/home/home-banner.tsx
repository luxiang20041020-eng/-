"use client"

// 首页 Banner 轮播（Embla）
import useEmblaCarousel from "embla-carousel-react"
import { BANNERS } from "@/lib/mock-data"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export function HomeBanner() {
  const [emblaRef, embla] = useEmblaCarousel({ loop: true })
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!embla) return
    const onSelect = () => setIndex(embla.selectedScrollSnap())
    embla.on("select", onSelect)
    const timer = setInterval(() => embla.scrollNext(), 4500)
    return () => {
      embla.off("select", onSelect)
      clearInterval(timer)
    }
  }, [embla])

  return (
    <div className="px-4 pt-4">
      <div className="overflow-hidden border border-border" ref={emblaRef}>
        <div className="flex">
          {BANNERS.map((b) => (
            <div key={b.id} className="min-w-0 flex-[0_0_100%] relative">
              <div className="relative h-32 bg-card stripe overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-between px-5">
                  <div>
                    <div className="text-[10px] font-mono tracking-[0.25em] text-primary mb-1.5">
                      {b.tag}
                    </div>
                    <div className="font-display text-lg font-bold tracking-tight leading-tight max-w-[220px] text-balance">
                      {b.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">{b.subtitle}</div>
                  </div>
                  <div className="font-display text-5xl text-primary/40 num leading-none select-none">
                    {String(b.id).padStart(2, "0")}
                  </div>
                </div>
                <div className="absolute top-0 left-0 h-full w-[3px] bg-primary" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 指示点 */}
      <div className="flex items-center gap-1 mt-2 px-1">
        {BANNERS.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-[2px] transition-all",
              i === index ? "w-6 bg-primary" : "w-3 bg-border",
            )}
          />
        ))}
      </div>
    </div>
  )
}
