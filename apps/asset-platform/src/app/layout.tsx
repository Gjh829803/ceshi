import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Worldkit Atlas · 世界资产库", description: "模型、骨骼、动画与资产交付" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
