"use client"

import Link from "next/link"
import { Book, Users, Tag, Ticket, ArrowRight, Images } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/lib/store"
import { getUserRoleName, isAdmin } from "@/lib/types"

const contentItems = [
  {
    id: "albums",
    title: "Álbumes",
    description: "Agregar, editar o eliminar álbumes del catálogo",
    icon: Book,
    href: "/admin/abm/albumes",
  },
  {
    id: "photographers",
    title: "Fotógrafos",
    description: "Gestionar perfiles y comisiones de fotógrafos",
    icon: Users,
    href: "/admin/abm/fotografos",
  },
  {
    id: "tags",
    title: "Tags",
    description: "Crear y organizar etiquetas para fotos",
    icon: Tag,
    href: "/admin/abm/tags",
  },
  {
    id: "discounts",
    title: "Códigos de Descuento",
    description: "Crear y administrar códigos de promoción",
    icon: Ticket,
    href: "/admin/abm/descuentos",
  },
  {
    id: "combos",
    title: "Combos de fotos",
    description: "Crear y administrar combos de fotos",
    icon: Images,
    href: "/admin/abm/combos",
  },
]

export default function ContentManagementPage() {
  const user = useAuthStore((state) => state.user)
  const roleName = getUserRoleName(user)?.toLowerCase()

  const userIsAdmin = isAdmin(user)

  // Filtrar contentItems según el rol del usuario
  const visibleItems = contentItems.filter((item) => {
    // Si es admin, puede ver todo
    if (userIsAdmin) {
      return true
    }
    // Si es vendedor/fotógrafo, solo puede ver tags
    if (roleName === "vendedor" || roleName === "fotógrafo") {
      return ["albums", "tags"].includes(item.id)
    }
    return false
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h2 className="mb-2 text-4xl font-bold">Gestión de Contenidos (ABM)</h2>
        <p className="text-muted-foreground">Administra álbumes, fotógrafos, tags y códigos de descuento</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {visibleItems.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.id} className="rounded-2xl border-gray-200">
              <CardHeader>
                <div className="mb-2 flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-3">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={item.href}>
                  <Button className="w-full rounded-xl bg-primary font-semibold text-foreground hover:bg-primary-hover">
                    Ver / Editar
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
