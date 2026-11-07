import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const variants = cva('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      primary: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
      secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      ghost: 'text-slate-600 hover:bg-red-50 hover:text-red-700',
      danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
    },
    size: { default: '', sm: 'px-3 py-1.5 text-xs', icon: 'h-9 w-9 p-0' },
  }, defaultVariants: { variant: 'secondary', size: 'default' },
})
type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>
export function Button({className,variant,size,...props}:Props){return <button className={cn(variants({variant,size}),className)} {...props}/>}
