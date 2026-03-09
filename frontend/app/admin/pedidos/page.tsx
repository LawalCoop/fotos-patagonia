"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, ExternalLink, Edit, Trash } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useOrders } from "@/hooks/orders/useOrders"
import { Order, OrderStatus } from "@/lib/types"
import { OrderStatusSelector } from "@/components/molecules/OrderStatusSelector"
import { formatDateTime, parseUtcNaiveDate } from "@/lib/datetime"
import { FilterBar } from "@/components/molecules/filter-bar"
import { photoHourKey } from "@/lib/datetime"
import { useAuthStore } from "@/lib/store"
import { getUserRoleName, isAdmin } from "@/lib/types"
import { EditOrderModal } from "@/components/molecules/EditOrderModal"
import { DeleteConfirmationModal } from "@/components/molecules/delete-confirmation-modal"

export default function PedidosPage() {
  const { data: ordersData, loading, error, refetch, deleteOrder } = useOrders()
  const [orders, setOrders] = useState<Order[]>([])
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [paymentFilter, setPaymentFilter] = useState<string>("all")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean
    orderId: number | null
  }>({ isOpen: false, orderId: null })
  // Obtener información del rol
  const user = useAuthStore((state) => state.user)
  const roleName = getUserRoleName(user)?.toLowerCase()
  const userIsAdmin = isAdmin(user)

  const isPhotographer =
    roleName === "fotógrafo" || roleName === "vendedor"

  const isTodayInArgentina = (dateValue?: string | null) => {
    if (!dateValue) return false

    const date = parseUtcNaiveDate(dateValue)
    if (!date) return false

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })

    const orderDate = formatter.format(date)
    const today = formatter.format(new Date())

    return orderDate === today
  }

  const toMillis = (value?: string | null) =>
    parseUtcNaiveDate(value)?.getTime() ?? 0

  //pagination
  const PAGE_SIZE = 10
  const [currentPage, setCurrentPage] = useState(1)
  const [dateFilter, setDateFilter] = useState<string | undefined>()
  const [timeFilter, setTimeFilter] = useState<string | undefined>() // "00".."23"

  useEffect(() => {
    let filtered = [...orders]

    // 🔎 búsqueda por ID / email
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim()
    
      filtered = filtered.filter((order) => {
        const email =
          order.customer_email ||
          order.user?.email ||
          ""
    
        const match =
          order.id?.toString().includes(term) ||
          email.toLowerCase().includes(term)
    
        /* if (!match && email) {
          console.log("❌ no match:", {
            term,
            id: order.id,
            email,
          })
        } */
    
        return match
      })
    }
    
    

    // 📌 estado
    if (statusFilter !== "all") {
      filtered = filtered.filter(
        (order) => order.order_status === statusFilter
      )
    }

    // 💳 pago
    if (paymentFilter !== "all") {
      filtered = filtered.filter(
        (order) => order.payment_method === paymentFilter
      )
    }

    // 📅 FECHA (local Argentina)
    if (dateFilter) {
      filtered = filtered.filter((order) => {
        const rawDate = order.created_at ?? order.createdAt
        const date = parseUtcNaiveDate(rawDate)
        if (!date) return false

        const localDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Argentina/Buenos_Aires",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date)

        return localDate === dateFilter
      })
    }

    // ⏰ HORA (franja)
    if (timeFilter) {
      filtered = filtered.filter(
        (order) =>
          photoHourKey({
            timeSlot: undefined,
            takenAt: order.created_at ?? order.createdAt,
          } as any) === timeFilter
      )
    }

    // ⬇️ ordenar: última orden primero
    filtered.sort((a, b) => {
      const da = toMillis(a.created_at ?? a.createdAt)
      const db = toMillis(b.created_at ?? b.createdAt)
      return db - da
    })

    setFilteredOrders(filtered)
    setCurrentPage(1)
  }, [
    orders,
    searchTerm,
    statusFilter,
    paymentFilter,
    dateFilter,
    timeFilter,
  ])

  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE)

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  useEffect(() => {
    if (ordersData) {
/*       console.log("📦 ordersData raw:", ordersData)
 */
      // Ensure data is always an array
      const loadedOrders = Array.isArray(ordersData)
        ? ordersData
        : [ordersData]
      setOrders(loadedOrders)
    }
  }, [ordersData])

  const handleEdit = (order: Order) => {
    setSelectedOrder(order)
    setIsModalOpen(true)
  }

  const handleOpenDelete = (orderId: number | string) => {
    setDeleteConfirmation({ isOpen: true, orderId: parseInt(orderId.toString()) })
  }

  const handleDelete = async (orderId: number | string) => {
    await deleteOrder(orderId.toString())
    refetch()
    setDeleteConfirmation({ isOpen: false, orderId: null })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div>Cargando pedidos...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen text-red-500">
        <div>Error al cargar los pedidos: {error}</div>
      </div>
    )
  }

  // Mapeo de valores del enum a etiquetas legibles por humanos para el filtro
  const orderStatusLabels: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: "Pendiente",
    [OrderStatus.PAID]: "Pagado",
    [OrderStatus.COMPLETED]: "Completado",
    [OrderStatus.SHIPPED]: "Enviado",
    [OrderStatus.REJECTED]: "Rechazado",
  }

  const formatOrderDate = (order: Order) => {
    const dateValue = order.created_at ?? order.createdAt
    if (!dateValue) return "Sin fecha"

    const formatted = formatDateTime(dateValue, {
      month: "short",
      includeYear: false,
    })
    return formatted || "Fecha inválida"
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-heading">Gestión de Pedidos</h1>
        <p className="text-muted-foreground">
          Administra y actualiza el estado de los pedidos
        </p>
      </div>
      {(dateFilter || timeFilter) && (
        <div className="mb-2 flex gap-2">
          {dateFilter && <Badge>Fecha: {dateFilter}</Badge>}
          {timeFilter && <Badge>Hora: {timeFilter}:00</Badge>}
        </div>
      )}

      <Card className="mb-6 rounded-2xl border-gray-200">
        <FilterBar
          onFilterChange={({ date, time }) => {
            setDateFilter(date)
            setTimeFilter(time)
          }}
        />

        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-xl pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                          <SelectTrigger className="rounded-xl bg-[#f2f2e4]">
                                            <SelectValue placeholder="Estado" />
                                          </SelectTrigger>
                                          <SelectContent className="bg-white text-[#1c2e4d] border border-neutral-300 shadow-lg">
                                            <SelectItem value="all">Todos los estados</SelectItem>                {Object.values(OrderStatus).map((statusValue) => (
                  <SelectItem
                    key={statusValue}
                    value={statusValue}
                    className="capitalize"
                  >
                    {orderStatusLabels[statusValue]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
                                          <SelectTrigger className="rounded-xl bg-[#f2f2e4]">
                                            <SelectValue placeholder="Canal" />
                                          </SelectTrigger>
                                          <SelectContent className="bg-white text-[#1c2e4d] border border-neutral-300 shadow-lg">
                                            <SelectItem value="all">Todos los canales</SelectItem>                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                                          <SelectTrigger className="rounded-xl bg-[#f2f2e4]">
                                            <SelectValue placeholder="Pago" />
                                          </SelectTrigger>
                                          <SelectContent className="bg-white text-[#1c2e4d] border border-neutral-300 shadow-lg">
                                            <SelectItem value="all">Todos los métodos</SelectItem>                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="posnet">Tarjeta</SelectItem>
                <SelectItem value="mp">Mercado Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-200">
        <CardContent className="p-0">
          {filteredOrders.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No se encontraron pedidos
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Orden</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Forma de Pago</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => {
                    // const statusInfo = getStatusBadge(order.order_status);
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono font-medium">
                          {order.id}
                        </TableCell>
                        <TableCell>
                          <OrderStatusSelector
                            order={order}
                            onStatusUpdate={refetch}
                          />
                        </TableCell>
                        <TableCell>{order.customer_email || "N/A"}</TableCell>
                        <TableCell>
                          <span className="capitalize">
                            {order.payment_method}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold">
                          ${order.total}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatOrderDate(order)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(order)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDelete(order.id)}
                            >
                            <Trash className="h-4 w-4" />
                          </Button>
                          <Link href={`/admin/pedidos/${order.id}`}>
                            <Button variant="ghost" size="sm" className="gap-2">
                              <ExternalLink className="h-4 w-4" />
                              Ver
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Anterior
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
      <EditOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        order={selectedOrder}
        onOrderUpdate={refetch}
      />
      <DeleteConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        title="Eliminar pedido"
        entityName={`el pedido ${deleteConfirmation.orderId}`}
        onConfirm={() => deleteConfirmation.orderId && handleDelete(deleteConfirmation.orderId)}
        onCancel={() => setDeleteConfirmation({ isOpen: false, orderId: null })}
      />
    </div>
  )
}

