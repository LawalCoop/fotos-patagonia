"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, ArrowLeft, Edit, Trash2, Loader2, Lock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import PhotographerModal from "@/components/molecules/photographer-modal"
import { DeleteConfirmationModal } from "@/components/molecules/delete-confirmation-modal"
import { ChangePasswordModal } from "@/components/molecules/change-password-modal"
import { usePhotographers } from "@/hooks/photographers/usePhotographers"
import { useUsers } from "@/hooks/users/useUser"
import type { Photographer } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"

export default function PhotographersManagementPage() {
  const { photographers, loading, error, createPhotographer, updatePhotographer, deletePhotographer } = usePhotographers()
  const { adminChangePassword } = useUsers()
  const { toast } = useToast()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedPhotographer, setSelectedPhotographer] = useState<Photographer | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; photographerId: number | null }>({
    isOpen: false,
    photographerId: null,
  })
  const [passwordModal, setPasswordModal] = useState<{ isOpen: boolean; photographer: Photographer | null }>({
    isOpen: false,
    photographer: null,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAddPhotographer = () => {
    setSelectedPhotographer(null)
    setIsModalOpen(true)
  }

  const handleEditPhotographer = (photographer: Photographer) => {
    setSelectedPhotographer(photographer)
    setIsModalOpen(true)
  }

  const handleOpenChangePassword = (photographer: Photographer) => {
    setPasswordModal({ isOpen: true, photographer })
  }

  const handleChangePasswordSave = async (password: string) => {
    if (!passwordModal.photographer || !passwordModal.photographer.user_id) {
        toast({
            title: "Error",
            description: "Este fotógrafo no tiene un usuario asociado",
            variant: "destructive",
        });
        return;
    }
    
    try {
      await adminChangePassword(passwordModal.photographer.user_id, password)
      toast({
        title: "Contraseña actualizada",
        description: `Se actualizó la contraseña para el fotógrafo ${passwordModal.photographer.name}`,
      })
      setPasswordModal({ isOpen: false, photographer: null })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Hubo un problema al cambiar la contraseña",
        variant: "destructive",
      })
      throw error 
    }
  }

  const handleSavePhotographer = async (data: Photographer) => {
    try {
      setIsSubmitting(true)
      
      if (selectedPhotographer?.id) {
        // Editar fotógrafo existente
        await updatePhotographer(selectedPhotographer.id, data)
        toast({
          title: "Éxito",
          description: "Fotógrafo actualizado correctamente",
        })
      } else {
        // Crear nuevo fotógrafo (el backend ignora el ID cuando es 0)
        await createPhotographer(data)
        toast({
          title: "Éxito",
          description: "Fotógrafo creado correctamente",
        })
      }
      
      setIsModalOpen(false)
      setSelectedPhotographer(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "No se pudo guardar el fotógrafo",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenDelete = (photographerId: number) => {
    setDeleteConfirmation({ isOpen: true, photographerId })
  }

  const handleDelete = async (id: number) => {
    try {
      setIsSubmitting(true)
      await deletePhotographer(id)
      
      toast({
        title: "Éxito",
        description: "Fotógrafo eliminado correctamente",
      })
      
      setDeleteConfirmation({ isOpen: false, photographerId: null })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "No se pudo eliminar el fotógrafo",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const photographerToDelete = photographers.find((p) => p.id === deleteConfirmation.photographerId)

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Cargando fotógrafos...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-red-800">Error al cargar los fotógrafos: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/admin/abm"
            className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          <h2 className="text-4xl font-bold">Gestión de Fotógrafos</h2>
          <p className="text-muted-foreground">Total: {photographers.length} fotógrafos</p>
        </div>
        <Button
          onClick={handleAddPhotographer}
          className="rounded-xl bg-primary font-semibold text-foreground hover:bg-primary-hover"
          disabled={isSubmitting}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Fotógrafo
        </Button>
      </div>

      {photographers.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-muted-foreground">No hay fotógrafos registrados</p>
          <Button
            onClick={handleAddPhotographer}
            className="mt-4 rounded-lg bg-primary font-semibold text-foreground hover:bg-primary-hover"
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar primer fotógrafo
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {photographers.map((photographer) => (
            <Card key={photographer.id} className="rounded-2xl border-gray-200">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{photographer.name}</CardTitle>
                    {photographer.contact_info && <CardDescription>{photographer.contact_info}</CardDescription>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg bg-transparent text-blue-500 border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                      onClick={() => handleOpenChangePassword(photographer)}
                      disabled={isSubmitting || !photographer.user_id}
                      title="Cambiar contraseña"
                    >
                      <Lock className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg bg-transparent"
                      onClick={() => handleEditPhotographer(photographer)}
                      disabled={isSubmitting}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-red-200 bg-transparent text-destructive hover:bg-red-50 hover:text-destructive"
                      onClick={() => handleOpenDelete(photographer.id)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Comisión</p>
                  <p className="font-semibold">{photographer.commission_percentage}%</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PhotographerModal
        isOpen={isModalOpen}
        onClose={() => {
          if (!isSubmitting) {
            setIsModalOpen(false)
            setSelectedPhotographer(null)
          }
        }}
        onSave={handleSavePhotographer}
        photographer={selectedPhotographer}
        isSubmitting={isSubmitting}
      /> 

      <DeleteConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        title="Eliminar fotógrafo"
        entityName={`al fotógrafo "${photographerToDelete?.name}"`}
        onConfirm={() => deleteConfirmation.photographerId && handleDelete(deleteConfirmation.photographerId)}
        onCancel={() => setDeleteConfirmation({ isOpen: false, photographerId: null })}
        isLoading={isSubmitting}
      />

      <ChangePasswordModal
        isOpen={passwordModal.isOpen}
        userEmail={photographers.find(p => p.id === passwordModal.photographer?.id)?.email || passwordModal.photographer?.name}
        onClose={() => setPasswordModal({ isOpen: false, photographer: null })}
        onSave={handleChangePasswordSave}
      />
    </div>
  )
}
