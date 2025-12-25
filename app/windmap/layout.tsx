// app/windmap/layout.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Weather WindMap",
  icons: {
    icon: "/logo/Icon.png",
  },
};

export default function WindmapLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}