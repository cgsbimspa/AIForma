import type { Metadata } from "next";
import "./globals.css";
import "./workspace-context.css";
import "./project-home.css";
import { WorkspaceShell } from "@/components/workspace-shell";

export const metadata: Metadata = {
  title: "Proyectos | BIM + IA",
  description: "Modelos, documentación, auditorías y cubicaciones en el contexto de tu proyecto Autodesk.",
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
