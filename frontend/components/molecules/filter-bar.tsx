"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Calendar, Clock, X } from "lucide-react"
import { buildHourRanges } from "@/lib/time-slots"

interface FilterBarProps {
  onFilterChange?: (filters: {
    date?: string
    place?: string
    time?: string // "06".."22"
  }) => void
  hideDateFilter?: boolean
}

const HOURS = buildHourRanges(6, 22)

export function FilterBar({ onFilterChange, hideDateFilter = false }: FilterBarProps) {
  const [date, setDate] = useState("")
  const [time, setTime] = useState("") // "06".."22"

  const emit = (next: { date?: string; time?: string }) => {
    onFilterChange?.({
      date: hideDateFilter ? undefined : (next.date || undefined),
      time: next.time || undefined,
    })
  }

  const handleClear = () => {
    setDate("")
    setTime("")
    onFilterChange?.({})
  }

  

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-md md:flex-row md:items-end">
      {/* Fecha */}
      {!hideDateFilter && (
        <div className="flex-1">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Fecha
          </label>
          <Input
            type="date"
            value={date}
            className="rounded-xl"
            onChange={(e) => {
              setDate(e.target.value)
              emit({ date: e.target.value, time })
            }}
          />
        </div>
      )}

      {/* Hora (dropdown por bloque horario) */}
      <div className="flex-1">
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="h-4 w-4" />
          Hora
        </label>

        <select
          value={time}
          onChange={(e) => {
            setTime(e.target.value)
            emit({ date, time: e.target.value })
          }}
          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="">Cualquier horario</option>
          {HOURS.map((h) => (
            <option key={h.key} value={h.key}>
              {h.label}
            </option>
          ))}
        </select>
      </div>

      {/* Acciones */}
      <div className="flex gap-2">
        <Button
          onClick={() => emit({ date, time })}
          className="rounded-xl bg-primary px-6 font-semibold"
        >
          <Search className="mr-2 h-4 w-4" />
          Buscar
        </Button>
        <Button
          onClick={handleClear}
          variant="outline"
          className="rounded-xl px-6"
        >
          <X className="mr-2 h-4 w-4" />
          Limpiar
        </Button>
      </div>
    </div>
  )
}
