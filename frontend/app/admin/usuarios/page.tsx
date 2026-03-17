"use client"

import { useState } from "react"
import { Plus, Pencil, Trash2, Shield, UserIcon, Loader2, CheckCircle, XCircle, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useUsers } from "@/hooks/users/useUser"
import { useRoles } from "@/hooks/roles/useRoles"
import { useToast } from "@/hooks/use-toast"
import { UserModal } from "@/components/molecules/user-modal"
import { DeleteConfirmationModal } from "@/components/molecules/delete-confirmation-modal"
import { ChangePasswordModal } from "@/components/molecules/change-password-modal"

export default function AdminUsuariosPage() {
  const { users, loading: usersLoading, error: usersError, refetch, createUser, updateUser, deleteUser, adminChangePassword } = useUsers()
  const { roles, loading: rolesLoading } = useRoles()
  const { toast } = useToast()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(undefined)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean
    userId: number | null
  }>({ isOpen: false, userId: null })
  const [passwordModal, setPasswordModal] = useState<{ isOpen: boolean; user: any | null }>({
    isOpen: false,
    user: null,
  })

  const handleOpenAdd = () => {
    setEditingUser(undefined)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (user: any) => {
    setEditingUser(user)
    setIsModalOpen(true)
  }

  const handleOpenDelete = (userId: number) => {
    setDeleteConfirmation({ isOpen: true, userId })
  }

  const handleOpenChangePassword = (user: any) => {
    setPasswordModal({ isOpen: true, user })
  }

  const handleChangePasswordSave = async (password: string) => {
    if (!passwordModal.user) return
    try {
      await adminChangePassword(passwordModal.user.id, password)
      toast({
        title: "Contraseña actualizada",
        description: `Se actualizó la contraseña para ${passwordModal.user.email}`,
      })
      setPasswordModal({ isOpen: false, user: null })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Hubo un problema al cambiar la contraseña",
        variant: "destructive",
      })
      throw error // Re-throw para que el modal maneje el estado de error
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id)
      toast({
        title: "Usuario eliminado",
        description: "El usuario ha sido eliminado exitosamente",
      })
      refetch()
      setDeleteConfirmation({ isOpen: false, userId: null })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el usuario",
        variant: "destructive",
      })
    }
  }

  const handleSave = async (userData: any) => {
    try {
      if (editingUser) {
        await updateUser(editingUser.id, userData)
        toast({
          title: "Usuario actualizado",
          description: "El usuario ha sido actualizado exitosamente",
        })
      } else {
        await createUser(userData)
        toast({
          title: "Usuario creado",
          description: "El usuario ha sido creado exitosamente",
        })
      }
      refetch()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `No se pudo ${editingUser ? "actualizar" : "crear"} el usuario`,
        variant: "destructive",
      })
    }
  }

  const getRoleBadge = (roleName: string) => {
    const variants: Record<string, string> = {
      Admin: "default",
      Vendedor: "secondary",
      Fotografo: "outline",
      Cliente: "outline",
    }
    return (
      <Badge variant={variants[roleName] as any || "outline"} className="gap-1">
        {roleName === "Admin" && <Shield className="h-3 w-3" />}
        {roleName === "Vendedor" && <UserIcon className="h-3 w-3" />}
        {roleName}
      </Badge>
    )
  }

  const userToDelete = users.find((u) => u.id === deleteConfirmation.userId)

  // Loading state
  if (usersLoading || rolesLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  // Error state
  if (usersError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-destructive mb-4">Error al cargar los usuarios</p>
            <Button onClick={refetch}>Reintentar</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-heading">Gestión de Usuarios</h1>
          <p className="text-muted-foreground">Administra usuarios, roles y permisos del sistema</p>
        </div>
        <Button
          onClick={handleOpenAdd}
          className="gap-2 rounded-xl bg-primary text-foreground hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          Nuevo Usuario
        </Button>
      </div>

      {users.length === 0 && !usersLoading ? (
        <Card className="rounded-2xl border-gray-200">
          <CardContent className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <UserIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-semibold text-muted-foreground">No hay usuarios</p>
              <p className="text-sm text-muted-foreground">Crea el primer usuario</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-gray-200 shadow-md">
          <CardHeader>
            <CardTitle>Usuarios del Sistema ({users.length})</CardTitle>
            <CardDescription>Lista de todos los usuarios registrados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Permisos</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{getRoleBadge(user.role.name)}</TableCell>
                      <TableCell>
                        {user.is_active ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-sm text-green-600">Activo</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-500">Inactivo</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.role.permissions && user.role.permissions.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.role.permissions.slice(0, 2).map((perm) => (
                              <Badge key={perm.id} variant="outline" className="text-xs">
                                {perm.name}
                              </Badge>
                            ))}
                            {user.role.permissions.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{user.role.permissions.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Sin permisos</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenChangePassword(user)}
                            className="gap-2 text-blue-500 hover:text-blue-600"
                            title="Cambiar contraseña"
                          >
                            <Lock className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleOpenEdit(user)} 
                            className="gap-2"
                            title="Editar usuario"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDelete(user.id)}
                            className="gap-2 text-destructive hover:text-destructive"
                            disabled={user.role.name === "Admin"}
                            title="Eliminar usuario"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <UserModal
        isOpen={isModalOpen}
        mode={editingUser ? "edit" : "add"}
        user={editingUser}
        roles={roles}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />

      <DeleteConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        title="Eliminar usuario"
        entityName={`el usuario "${userToDelete?.email}"`}
        onConfirm={() => deleteConfirmation.userId && handleDelete(deleteConfirmation.userId)}
        onCancel={() => setDeleteConfirmation({ isOpen: false, userId: null })}
      />

      <ChangePasswordModal
        isOpen={passwordModal.isOpen}
        userEmail={passwordModal.user?.email}
        onClose={() => setPasswordModal({ isOpen: false, user: null })}
        onSave={handleChangePasswordSave}
      />
    </div>
  )
}
