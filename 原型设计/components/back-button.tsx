"use client"
import { ChevronLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function BackButton() {
  const router = useRouter()
  return (
    <button onClick={() => router.back()} className="p-1 -ml-1" aria-label="返回">
      <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
    </button>
  )
}
