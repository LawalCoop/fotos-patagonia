"use client";

import type React from "react";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Photographer } from "@/lib/types";

interface PhotographerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Photographer) => Promise<void>;
  photographer: Photographer | null;
  isSubmitting?: boolean; 
}

const basePhotographer: Photographer = {
  id: 0,
  name: "",
  contact_info: "",
  commission_percentage: 0,
  email: "",
  password: "",
};

export default function PhotographerModal({
  isOpen,
  onClose,
  onSave,
  photographer,
}: PhotographerModalProps) {
  const [formData, setFormData] = useState<Photographer>(() => ({
    ...basePhotographer,
  }));
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (photographer) {
      setFormData({ ...photographer });
      setSuccessMessage("");
      setErrorMessage("");
    } else {
      setFormData({ ...basePhotographer });
      setSuccessMessage("");
      setErrorMessage("");
    }
  }, [photographer, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "commission_percentage"
          ? Number.parseFloat(value) || 0
          : value,
    }));
  };

  const handleSave = () => {
    const creating = !photographer || formData.id === 0;

    if (
      !formData.name ||
      !formData.contact_info ||
      !formData.email ||
      (creating && !formData.password)
    ) {
      setErrorMessage("Por favor completa todos los campos requeridos");
      setSuccessMessage("");
      return;
    }

    const dataToSave: any = {
      ...formData,
      id: formData.id || Date.now(),
      email: formData.email,
    };

    // Only include password if provided (so edits don't overwrite it with empty)
    if (formData.password && formData.password.length > 0) {
      dataToSave.password = formData.password;
    }

    // Call onSave and handle success/error messages
    Promise.resolve(onSave(dataToSave))
      .then(() => {
        setErrorMessage("");
        setSuccessMessage("Fotógrafo guardado correctamente.");
        // allow user to see the message briefly before closing
        setTimeout(() => {
          setSuccessMessage("");
          onClose();
        }, 900);
      })
      .catch((err) => {
        const text = String(err && (err.message || err || ""));
        const status =
          err &&
          (err.status ||
            err.statusCode ||
            (err.response && err.response.status));

        if (
          status === 422 ||
          /Field required/i.test(text) ||
          /required/i.test(text)
        ) {
          setErrorMessage("Faltan campos requeridos (email y/o contraseña).");
        } else {
          setErrorMessage("No se pudo guardar el fotógrafo.");
        }
        setSuccessMessage("");
      });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="rounded-2xl border-gray-200 bg-[#f2f2e4] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {photographer ? "Editar Fotógrafo" : "Nuevo Fotógrafo"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-semibold">
              Nombre Completo
            </Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Juan Pérez"
              className="rounded-lg border-gray-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_info" className="text-sm font-semibold">
              Información de contacto
            </Label>
            <Input
              id="contact_info"
              name="contact_info"
              value={formData.contact_info}
              onChange={handleChange}
              placeholder="somos.fotos.patagonia@gmail.com / +54 9 ..."
              className="rounded-lg border-gray-200"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={(formData as any).email || ""}
              onChange={handleChange}
              placeholder="fotografo@example.com"
              className="rounded-lg border-gray-200"
            />
          </div>

          {/* Password (only on create) */}
          {!photographer && (
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">
                Contraseña (requerida)
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={(formData as any).password || ""}
                onChange={handleChange}
                className="rounded-lg border-gray-200"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label
              htmlFor="commission_percentage"
              className="text-sm font-semibold"
            >
              Comisión
            </Label>
            <div className="relative">
              <Input
                id="commission_percentage"
                name="commission_percentage"
                type="number"
                value={formData.commission_percentage}
                onChange={handleChange}
                placeholder="20"
                min="0"
                max="100"
                className="rounded-lg border-gray-200 pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                %
              </span>
            </div>
          </div>
        </div>

        {/* Mensajes de estado */}
        {successMessage ? (
          <div className="mt-4 rounded-md bg-green-50 p-2">
            <p className="text-sm font-medium text-green-700">
              {successMessage}
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-md bg-red-50 p-2">
            <p className="text-sm font-medium text-destructive">
              {errorMessage}
            </p>
          </div>
        ) : null}

        <DialogFooter className="mt-6 gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-lg border-gray-200 bg-transparent"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            className="rounded-lg bg-[#f9a01b] font-semibold text-gray-900 hover:bg-[#f8b84d]"
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
