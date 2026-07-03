"use client";

import { useState, useMemo } from "react";
import { X, Minus, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useUploadQueueStore } from "@/hooks/upload/useUploadQueue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function UploadManager() {
  const { jobs, remove } = useUploadQueueStore();
  const [collapsed, setCollapsed] = useState(false);

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === "uploading" || j.status === "queued"),
    [jobs]
  );
  const visibleJobs = jobs.slice(-4); // limitar visualmente

  // Título/estado del encabezado según cómo terminó todo.
  const hasActive = activeJobs.length > 0;
  const hasError = jobs.some((j) => j.status === "error");
  const hasPartial = jobs.some((j) => j.status === "partial");
  const headerTitle = hasActive
    ? "Subidas en progreso"
    : hasError
    ? "Subidas finalizadas con errores"
    : hasPartial
    ? "Subidas finalizadas (parcial)"
    : "Subida terminada";

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 space-y-2">
      <Card className="shadow-lg border-gray-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {hasActive ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : hasError ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : hasPartial ? (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            <p className="text-sm font-semibold">{headerTitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCollapsed((c) => !c)} aria-label="Colapsar" className="h-8 w-8">
              <Minus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => visibleJobs.forEach((j) => remove(j.id))} aria-label="Cerrar" className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="space-y-3 px-4 pb-4">
            {visibleJobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-gray-100 p-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.filesCount} archivo{job.filesCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {job.status === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {job.status === "partial" && <AlertCircle className="h-4 w-4 text-amber-500" />}
                  {job.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                </div>
                <div className="mt-2">
                  <Progress value={job.progress} className="h-2" />
                </div>
                {job.error && <p className="mt-1 text-xs text-destructive">{job.error}</p>}
                {job.failedFiles && job.failedFiles.length > 0 && (
                  <div className="mt-2 space-y-1 rounded-md bg-amber-50 p-2">
                    <p className="text-xs font-semibold text-amber-700">
                      {job.failedFiles.every((f) => /duplicad/i.test(f.reason ?? ""))
                        ? "Ya estaban en el sistema (no se subieron de nuevo):"
                        : job.status === "partial"
                        ? "Subida parcial. Archivos pendientes:"
                        : "Archivos fallidos:"}
                    </p>
                    <ul className="space-y-1">
                      {job.failedFiles.slice(0, 3).map((file, idx) => (
                        <li key={`${file.name}-${idx}`} className="text-xs text-amber-800">
                          • {file.name}
                          {file.attempts ? ` (intentos: ${file.attempts})` : ""}
                          {file.reason ? ` - ${file.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                    {job.failedFiles.length > 3 && (
                      <p className="text-[11px] text-amber-700">
                        +{job.failedFiles.length - 3} más
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

