import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, onKeyDown, onWheel, ...props }: React.ComponentProps<'input'>) {
  const isNumber = type === 'number'

  // El spinner nativo incrementa de a 1 con flechas y rueda: inútil en campos
  // de precio y fácil de disparar sin querer. Se anula acá para todos los
  // number; el control visual se oculta por CSS en globals.css.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isNumber && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
    }
    onKeyDown?.(event)
  }

  const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    if (isNumber && event.currentTarget === document.activeElement) {
      event.currentTarget.blur()
    }
    onWheel?.(event)
  }

  return (
    <input
      type={type}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
