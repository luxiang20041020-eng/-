// 🏠 首页（客户/教练/管理员共用）
// 布局：状态栏 → 门店切换 + 消息 → Banner → 金刚区 → 馆内实景 → 价目表

import { MobileShell } from "@/components/mobile-shell"
import { StoreSwitcher } from "@/components/store-switcher"
import { SectionHeader } from "@/components/section-header"
import { HomeBanner } from "@/components/home/home-banner"
import { HomeActions } from "@/components/home/home-actions"
import { HomeGallery } from "@/components/home/home-gallery"
import { PriceList } from "@/components/home/price-list"
import { Bell } from "lucide-react"

export default function HomePage() {
  return (
    <MobileShell>
      {/* 顶部：门店切换 + 消息提醒 */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <StoreSwitcher />
        <button className="relative p-1" aria-label="消息通知">
          <Bell className="h-5 w-5 text-foreground" strokeWidth={1.75} />
          <span className="absolute top-0 right-0 h-1.5 w-1.5 bg-primary" aria-hidden />
          <span className="sr-only">2 条未读</span>
        </button>
      </header>

      {/* 品牌 Hero */}
      <section className="px-4 pt-6 pb-4 border-b border-border">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-primary mb-1">
              EST. 2018 · CHENGDU
            </div>
            <h1 className="text-3xl font-display font-bold tracking-tight leading-none">
              IRONFIST
            </h1>
            <div className="text-sm text-muted-foreground tracking-widest mt-1">
              铁拳 · 泰拳搏击馆
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl num leading-none">07</div>
            <div className="text-[10px] text-muted-foreground tracking-widest mt-0.5">
              COACHES
            </div>
          </div>
        </div>
      </section>

      {/* Banner */}
      <HomeBanner />

      {/* 金刚区 */}
      <HomeActions />

      {/* 馆内实景 */}
      <SectionHeader
        index="01"
        eyebrow="FACILITY"
        title="馆内实景"
        action={<span className="font-mono tracking-widest">VIEW ALL →</span>}
      />
      <HomeGallery />

      {/* 课程价目表 */}
      <SectionHeader
        index="02"
        eyebrow="PRICING"
        title="课程价目表"
        action={<span className="font-mono tracking-widest">线下购课</span>}
      />
      <PriceList />

      {/* 页脚 */}
      <footer className="px-4 py-6 border-t border-border mt-6">
        <div className="text-[10px] font-mono tracking-widest text-muted-foreground">
          © 2025 IRONFIST MUAY THAI · 版本 v1.0.0 · 线下交易，安全对账
        </div>
      </footer>
    </MobileShell>
  )
}
