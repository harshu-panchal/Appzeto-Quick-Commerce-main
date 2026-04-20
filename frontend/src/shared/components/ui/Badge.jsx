import React from 'react';
import { Badge as ShadcnBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const Badge = ({ children, variant = 'gray', className, ...props }) => {
    const variantStyles = {
        primary: 'bg-primary-50 text-primary-700 border-primary-100 hover:bg-primary-100',
        success: 'bg-brand-50 text-primary border-brand-100 hover:bg-brand-100',
        warning: 'bg-yellow-50 text-yellow-700 border-yellow-100 hover:bg-yellow-100',
        error: 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100',
        info: 'bg-brand-50 text-brand-700 border-brand-100 hover:bg-brand-100',
        gray: 'bg-gray-50 text-gray-700 border-gray-100 hover:bg-gray-100',
    };

    return (
        <ShadcnBadge
            variant="outline"
            className={cn(
                'text-[10px] font-medium transition-colors px-2 py-0.5',
                variantStyles[variant] || variantStyles.gray,
                className
            )}
            {...props}
        >
            {children}
        </ShadcnBadge>
    );
};

export default Badge;

