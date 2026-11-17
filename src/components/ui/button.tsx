import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.ts';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-xs',
        violet: 'bg-[#7C3AED] text-white hover:bg-[#6D28D9] shadow-xs',
        navy: 'bg-[#0F172A] text-white hover:bg-[#1E293B] shadow-xs',
        outline:
          'border border-slate-200 bg-white text-[#0F172A] hover:bg-slate-50 hover:border-slate-300',
        secondary: 'bg-[#EFF4FF] text-[#1E3A8A] hover:bg-[#E0EAFF]',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-[#0F172A]',
        destructive: 'bg-[#DC2626] text-white hover:bg-[#B91C1C]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-6 text-sm',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
