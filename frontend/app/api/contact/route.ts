import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      recaptchaToken,
      fullName,
      email,
      phone,
      message,
      contactType,
      location,
      date,
      eventType,
      eventDate,
      estimatedPeople,
    } = body

    // 1️⃣ Verificar captcha (solo si está configurado en el server)
    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY
    if (recaptchaSecret) {
      const captchaRes = await fetch(
        "https://www.google.com/recaptcha/api/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: recaptchaSecret,
            response: recaptchaToken || "",
          }),
        }
      )

      const captchaData = await captchaRes.json()

      if (!captchaData.success) {
        return NextResponse.json({ error: "Captcha inválido" }, { status: 403 })
      }
    }

    // 2️⃣ Enviar el mail vía el backend (Resend, el mismo que usan los pedidos)
    const apiBase = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL
    const emailRes = await fetch(`${apiBase}/contact/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        email,
        phone,
        message,
        contactType,
        location,
        date,
        eventType,
        eventDate,
        estimatedPeople,
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      console.error("❌ Backend contact error:", errText)
      return NextResponse.json({ error: "Error enviando email" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("🔴 error /api/contact", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
