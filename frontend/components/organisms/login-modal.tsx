"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/auth/useAuth"
import { LogIn, Eye, EyeOff } from "lucide-react"

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError("")
    setIsLoading(true)

    try {
      await login(email, password)
      // Si el login es exitoso, cerramos el modal y redirigimos
      onOpenChange(false)
      setEmail("")
      setPassword("")
      router.push("/admin")
    } catch (err: any) {
      setLoginError(err.message || "Usuario o contraseña incorrectos")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#f2f2e4]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Iniciar Sesión</DialogTitle>
          <DialogDescription>Ingresa tus credenciales para acceder al sistema</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="usuario@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {loginError && <p className="text-sm text-destructive">{loginError}</p>}

          <Button type="submit" disabled={isLoading} className="w-full rounded-xl bg-[#f9a01b] hover:bg-[#e89010]">
            <LogIn className="mr-2 h-4 w-4" />
            {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Acceso a través del backend con autenticación JWT
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
