import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceShell } from "@/components/workspace-shell";

export const metadata: Metadata = {
  title: "Espacio de trabajo | BIM + IA",
  description: "Base de desarrollo de la plataforma Autodesk + IA. Accede a los módulos del roadmap.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased"><WorkspaceShell>{children}</WorkspaceShell></body>
    </html>
  );
}
