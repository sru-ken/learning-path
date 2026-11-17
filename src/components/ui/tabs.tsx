import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils.ts';

export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }
>(({ className, value, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        'h-full w-full flex-1 bg-[#2563EB] transition-transform duration-300',
        indicatorClassName,
      )}
      style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value || 0))}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = 'Progress';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1 rounded-lg bg-[#EFF4FF] p-1 text-slate-600 border border-slate-200/80',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] data-[state=active]:bg-white data-[state=active]:text-[#0F172A] data-[state=active]:shadow-xs hover:text-[#0F172A]',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-4 focus-visible:outline-none', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';
