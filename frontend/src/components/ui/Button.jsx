// Reusable Button component with Tailwind variants
import { forwardRef } from 'react';
import { cn } from '../../utils';

const Button = forwardRef(({ className, variant = 'primary', size = 'default', children, ...props }, ref) => {
  const base = 'inline-flex items-center justify-center whitespace-nowrap text-sm ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  const variants = {
    primary: 'btn-primary shadow-soft hover:shadow-glow',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  };
  const sizes = {
    default: '',
    sm: 'px-3 py-2 text-xs',
    lg: 'px-6 py-3 text-base',
    icon: 'h-10 w-10 p-0 rounded-full',
  };

  return (
    <button
      className={cn(base, variants[variant] || variants.primary, sizes[size] || sizes.default, className)}
      ref={ref}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';

export { Button };
