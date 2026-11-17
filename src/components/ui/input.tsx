import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('block text-xs font-semibold text-[#1E293B] mb-1.5', className)}
    {...props}
  />
));
Label.displayName = 'Label';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[88px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const SelectNative = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
SelectNative.displayName = 'SelectNative';
