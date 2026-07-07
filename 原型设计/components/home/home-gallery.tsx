// 馆内实景 · 横向滑动图册
import Image from "next/image"

const IMAGES = [
  { src: "/images/gym-interior-1.jpg", label: "A 馆 · 器械区", code: "01 / 03" },
  { src: "/images/gym-interior-2.jpg", label: "擂台 · 实战", code: "02 / 03" },
  { src: "/images/gym-interior-3.jpg", label: "专属区域 · 体能区", code: "03 / 03" },
]

export function HomeGallery() {
  return (
    <div className="overflow-x-auto no-scrollbar px-4">
      <div className="flex gap-3 pb-1">
        {IMAGES.map((img) => (
          <figure key={img.src} className="shrink-0 w-[68%] border border-border">
            <div className="relative aspect-[4/5] bg-muted">
              <Image
                src={img.src}
                alt={img.label}
                fill
                sizes="(max-width: 768px) 70vw, 300px"
                className="object-cover grayscale-[15%]"
              />
              <div className="absolute top-0 left-0 bg-background/80 backdrop-blur px-2 py-1">
                <span className="text-[9px] font-mono tracking-widest text-primary">
                  {img.code}
                </span>
              </div>
            </div>
            <figcaption className="px-3 py-2 flex items-center justify-between bg-card">
              <span className="text-xs font-medium">{img.label}</span>
              <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
                VIEW →
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
