"use client"

// 🥊 全局应用上下文：角色 (role) 与 当前门店 (storeId)
// Demo 目的：不做真实登录，提供角色切换器供评审体验三端视图。

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { Role } from "@/lib/mock-data"
import { STORES } from "@/lib/mock-data"

interface AppState {
  role: Role
  setRole: (r: Role) => void
  storeId: number
  setStoreId: (s: number) => void
  currentStore: (typeof STORES)[number]
  // 资产演示（跟人不跟店）
  assets: { groupClass: number; privateClass: number }
  setAssets: (a: { groupClass: number; privateClass: number }) => void
  userName: string
  userPhone: string
}

const AppCtx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>(1)
  const [storeId, setStoreIdState] = useState<number>(1)
  const [assets, setAssets] = useState({ groupClass: 12, privateClass: 5 })

  // 简单持久化到 localStorage，便于刷新保留
  useEffect(() => {
    try {
      const r = localStorage.getItem("mt_role")
      const s = localStorage.getItem("mt_store")
      if (r) setRoleState(Number(r) as Role)
      if (s) setStoreIdState(Number(s))
    } catch {}
  }, [])

  const setRole = (r: Role) => {
    setRoleState(r)
    try {
      localStorage.setItem("mt_role", String(r))
    } catch {}
  }
  const setStoreId = (s: number) => {
    setStoreIdState(s)
    try {
      localStorage.setItem("mt_store", String(s))
    } catch {}
  }

  const value = useMemo<AppState>(
    () => ({
      role,
      setRole,
      storeId,
      setStoreId,
      currentStore: STORES.find((x) => x.id === storeId) || STORES[0],
      assets,
      setAssets,
      userName: "王 · 小明",
      userPhone: "138****1234",
    }),
    [role, storeId, assets],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp() {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
