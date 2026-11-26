import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FormCheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  wrapperClassName?: string;
}

/**
 * Native HTML form-compatible checkbox with sleek 16x16px visual box
 * centered inside a 24x24px WCAG 2.5.8 compliant interactive target.
 */
const FormCheckbox = React.forwardRef<HTMLInputElement, FormCheckboxProps>(
  ({ className, wrapperClassName, ...props }, ref) => {
    return (
      <span
        className={cn(
          'relative inline-flex h-6 w-6 shrink-0 items-center justify-center',
          wrapperClassName
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          className={cn(
            'peer absolute inset-0 m-0 h-6 w-6 cursor-pointer appearance-none rounded-md opacity-0 focus-visible:outline-none disabled:cursor-not-allowed',
            className
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none flex h-4 w-4 items-center justify-center rounded-[4px] border border-input bg-background text-transparent shadow-2xs transition-colors',
            'peer-hover:border-primary/60',
            'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50'
          )}
        >
          <Check className="h-3 w-3 stroke-[3]" />
        </span>
      </span>
    );
  }
);
FormCheckbox.displayName = 'FormCheckbox';

export { FormCheckbox };
