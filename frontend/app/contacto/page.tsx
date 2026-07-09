"use client"

import type React from "react"

import { useRef, useState } from "react"
import { Header } from "@/components/organisms/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin, Users, Mail, Phone, MapPinIcon, ArrowLeft } from "lucide-react"
import Link from "next/link"
import "react-toastify/dist/ReactToastify.css"
import ReCAPTCHA from "react-google-recaptcha"
import { toast } from "react-toastify"




type ContactType = "local" | "event"

interface FormData {
  fullName: string
  email: string
  phone?: string
  message: string
  // Local turísticos fields
  location?: string
  date?: string
  // Events fields
  eventType?: string
  eventDate?: string
  estimatedPeople?: number
}



export default function ContactoPage() {
  const recaptchaRef = useRef<ReCAPTCHA>(null)

  const [contactType, setContactType] = useState<ContactType>("local")
  const [formData, setFormData] = useState<FormData>({
    fullName: "",
    email: "",
    phone: "",
    message: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: Number.parseInt(value) || undefined,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    //console.log("🟡 submit iniciado")

    if (!formData.fullName || !formData.email || !formData.message) {
      toast.error("Completá todos los campos obligatorios")
      return
    }
  
    try {
      setIsSubmitting(true)
      // reCAPTCHA solo si está configurado el site key (si no, el form igual funciona)
      let token: string | null | undefined = undefined
      if (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
        token = await recaptchaRef.current?.executeAsync()
        if (!token) {
          toast.error("Captcha inválido")
          return
        }
      }
      //console.log("🟡 enviando POST /api/contact")

      // Barra final: el backend expone /contact/ y, detrás del proxy, la falta
      // de barra provoca un 307 a http:// que el navegador bloquea (mixed content).
      const res = await fetch("/api/contact/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          contactType,
          recaptchaToken: token,
        }),
      })
      
      //console.log("🟢 response status:", res.status)

      if (!res.ok) {
        //console.log("🔴 error backend:", await res.json())
        throw new Error("Error enviando formulario")
      }
  
      toast.success("Consulta enviada correctamente 🙌")
  
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        message: "",
      })
    } catch (err) {
      //console.error("🔴 catch submit", err)
      toast.error("No se pudo enviar la consulta")
    } finally {
      setIsSubmitting(false)
      recaptchaRef.current?.reset()
      //console.log("🟡 submit finalizado")
    }
  }
  
  

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <h1 className="mb-4 text-5xl font-heading">Contáctanos</h1>
          <p className="text-lg text-muted-foreground">
            Consultá por sesiones en locales turísticos o contratá cobertura para tus eventos
          </p>  
          <div className="mx-auto mb-12 max-w-3xl text-justify">

          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Form Section */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-white p-8 shadow-md">
              {/* Contact Type Selector */}
              <div className="mb-8">
                <Label className="mb-4 block text-sm font-medium">Escribinos y armamos tu propuesta.</Label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setContactType("local")}
                    className={`rounded-xl border-2 p-4 transition-all ${
                      contactType === "local"
                        ? "border-[#f9a01b] bg-[#ffecce] text-foreground"
                        : "border-gray-200 bg-white text-muted-foreground hover:border-gray-300"
                    }`}
                  >
                    <MapPinIcon className="mx-auto mb-2 h-6 w-6" />
                    <div className="text-sm font-medium">Fotos en locales turísticos</div>
                  </button>

                  <button
                    onClick={() => setContactType("event")}
                    className={`rounded-xl border-2 p-4 transition-all ${
                      contactType === "event"
                        ? "border-[#f9a01b] bg-[#ffecce] text-foreground"
                        : "border-gray-200 bg-white text-muted-foreground hover:border-gray-300"
                    }`}
                  >
                    <Users className="mx-auto mb-2 h-6 w-6" />
                    <div className="text-sm font-medium">Cobertura de eventos</div>
                  </button>
                </div>
              </div>

              {/* Common Fields */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="fullName" className="mb-2 block text-sm font-medium">
                    Nombre completo *
                  </Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    placeholder="Tu nombre"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="rounded-xl border-gray-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email" className="mb-2 block text-sm font-medium">
                      Email *
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="rounded-xl border-gray-200"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone" className="mb-2 block text-sm font-medium">
                      Teléfono (opcional)
                    </Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+54 9 294 123-4567"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="rounded-xl border-gray-200"
                    />
                  </div>
                </div>

                {/* Conditional Fields - Local Turísticos */}
                {contactType === "local" && (
                  <>
                    <div>
                      <Label htmlFor="location" className="mb-2 block text-sm font-medium">
                        Local o zona turística *
                      </Label>
                      <Select
                        value={formData.location || ""}
                        onValueChange={(value) => handleSelectChange("location", value)}
                      >
                        <SelectTrigger className="rounded-xl border-gray-200">
                          <SelectValue placeholder="Selecciona un local" />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          <SelectItem value="hosteria-perito-moreno">Hostería Perito Moreno</SelectItem>
                          <SelectItem value="lodge-helsingfors">Lodge Helsingfors</SelectItem>
                          <SelectItem value="estancia-cristina">Estancia Cristina</SelectItem>
                          <SelectItem value="hotel-lago-argentino">Hotel Lago Argentino</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="date" className="mb-2 block text-sm font-medium">
                        Fecha aproximada *
                      </Label>
                      <Input
                        id="date"
                        name="date"
                        type="date"
                        value={formData.date}
                        onChange={handleInputChange}
                        className="rounded-xl border-gray-200"
                      />
                    </div>
                  </>
                )}

                {/* Conditional Fields - Events */}
                {contactType === "event" && (
                  <>
                    <div>
                      <Label htmlFor="eventType" className="mb-2 block text-sm font-medium">
                        Tipo de evento *
                      </Label>
                      <Select
                        value={formData.eventType || ""}
                        onValueChange={(value) => handleSelectChange("eventType", value)}
                      >
                        <SelectTrigger className="rounded-xl border-gray-200">
                          <SelectValue placeholder="Selecciona el tipo de evento" />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          <SelectItem value="boda">Boda</SelectItem>
                          <SelectItem value="cumpleaños">Cumpleaños</SelectItem>
                          <SelectItem value="empresa">Evento empresarial</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="eventDate" className="mb-2 block text-sm font-medium">
                          Fecha del evento *
                        </Label>
                        <Input
                          id="eventDate"
                          name="eventDate"
                          type="date"
                          value={formData.eventDate}
                          onChange={handleInputChange}
                          className="rounded-xl border-gray-200"
                        />
                      </div>

                      <div>
                        <Label htmlFor="estimatedPeople" className="mb-2 block text-sm font-medium">
                          Cantidad estimada de personas *
                        </Label>
                        <Input
                          id="estimatedPeople"
                          name="estimatedPeople"
                          type="number"
                          placeholder="50"
                          value={formData.estimatedPeople || ""}
                          onChange={handleNumberChange}
                          className="rounded-xl border-gray-200"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Message Field */}
                <div>
                  <Label htmlFor="message" className="mb-2 block text-sm font-medium">
                    Mensaje / Comentarios *
                  </Label>
                  <Textarea
                    id="message"
                    name="message"
                    placeholder="Cuéntanos más sobre lo que necesitas..."
                    value={formData.message}
                    onChange={handleInputChange}
                    className="min-h-[120px] rounded-xl border-gray-200"
                  />
                </div>
                {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && (
                  <ReCAPTCHA
                    ref={recaptchaRef}
                    sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                    size="invisible"
                  />
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-[#f9a01b] py-6 text-lg font-semibold text-black hover:bg-[#f8b84d] disabled:opacity-50"
                >
                  {isSubmitting ? "Enviando..." : "Enviar consulta"}
                </Button>
              </form>
            </div>
          </div>

          {/* Contact Information Section */}
          <div className="space-y-6">
            {/* Direct Contact Card */}
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h3 className="mb-4 font-heading text-lg">Contacto directo</h3>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <Mail className="h-5 w-5 flex-shrink-0 text-[#f9a01b]" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <a href="mailto:admin@fotospatagonia.com" className="text-sm text-[#f9a01b] hover:underline">
                    somos.fotos.patagonia@gmail.com
                    </a>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Phone className="h-5 w-5 flex-shrink-0 text-[#f9a01b]" />
                  <div>
                    <p className="text-sm font-medium">WhatsApp</p>
                    <a href="https://wa.me/5492941234567" className="text-sm text-[#f9a01b] hover:underline">
                      +54 9 351 787-3220
                    </a>
                  </div>
                </div>

                <div className="flex gap-3">
                  <MapPin className="h-5 w-5 flex-shrink-0 text-[#f9a01b]" />
                  <div>
                    <p className="text-sm font-medium">Ubicación</p>
                    <p className="text-sm text-muted-foreground">Villa La Angostura, Neuquén, Argentina</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hours Card */}
            <div className="rounded-2xl bg-[#ffecce] p-6">
              <h3 className="mb-4 font-heading text-lg">Horarios de atención</h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">Lunes - Viernes</span>
                  <span className="text-muted-foreground">9:00 - 18:00</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Sábados</span>
                  <span className="text-muted-foreground">10:00 - 16:00</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Domingos</span>
                  <span className="text-muted-foreground">Cerrado</span>
                </div>
              </div>
            </div>

            {/* Info Card */}
            <div className="rounded-2xl border-2 border-[#f9a01b] bg-white p-6">
              <h3 className="mb-3 font-heading text-lg">¿Sabías que...?</h3>
              <p className="text-sm text-muted-foreground">
                Nuestros fotógrafos capturan los mejores momentos de la Patagonia. Desde sesiones locales hasta eventos
                completos, garantizamos imágenes de alta calidad.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
