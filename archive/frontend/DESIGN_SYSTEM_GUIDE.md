# Admin Panel Design System Guide

## Overview
This guide ensures consistent layouts, typography, and styling across all admin panel pages.

## Core Principles
1. **Consistent Typography** - Use design system classes for all text
2. **Standardized Spacing** - Use ds-section-spacing, ds-content-spacing
3. **Reusable Components** - PageHeader, StatCard, DataTable
4. **Uniform Card Layouts** - ds-card, ds-card-compact, ds-card-standard

## Page Structure Template

```jsx
import React from 'react';
import PageHeader from '@shared/components/ui/PageHeader';
import StatCard from '@shared/components/ui/StatCard';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { Icon1, Icon2 } from 'lucide-react';

const YourPage = () => {
    return (
        <div className="ds-section-spacing">
            {/* 1. Page Header */}
            <PageHeader
                title="Page Title"
                description="Page description"
                actions={
                    <>
                        <button className="ds-btn ds-btn-md bg-white ring-1 ring-gray-200">
                            Secondary Action
                        </button>
                        <button className="ds-btn ds-btn-md bg-primary text-white">
                            Primary Action
                        </button>
                    </>
                }
            />

            {/* 2. Stats Grid (if applicable) */}
            <div className="ds-grid-stats">
                <StatCard
                    label="Metric 1"
                    value="1,234"
                    icon={Icon1}
                    trend="+12%"
                    description="Description"
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
                {/* More stat cards... */}
            </div>

            {/* 3. Filters/Search */}
            <Card className="ds-card-compact">
                <div className="flex gap-3">
                    <input
                        type="text"
                        placeholder="Search..."
                        className="ds-input flex-1"
                    />
                    <button className="ds-btn ds-btn-md">Filter</button>
                </div>
            </Card>

            {/* 4. Main Content */}
            <Card>
                <table className="ds-table">
                    <thead className="ds-table-header">
                        <tr>
                            <th className="ds-table-header-cell">Column 1</th>
                            <th className="ds-table-header-cell">Column 2</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="ds-table-row">
                            <td className="ds-table-cell">Data</td>
                            <td className="ds-table-cell">Data</td>
                        </tr>
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default YourPage;
```

## Typography Classes

### Headings
- `ds-h1` - Page titles (text-xl, 20px)
- `ds-h2` - Section titles (text-lg, 18px)
- `ds-h3` - Card titles (text-base, 16px)
- `ds-h4` - Subsection titles (text-sm, 14px)

### Body Text
- `ds-body` - Standard text (text-xs, 12px)
- `ds-body-sm` - Small text (text-[11px])
- `ds-caption` - Labels/captions (text-[10px], uppercase)
- `ds-label` - Form labels (text-xs, font-medium)
- `ds-description` - Helper text (text-xs, text-gray-500)

### Stats
- `ds-stat-large` - Large numbers (text-3xl)
- `ds-stat-medium` - Medium numbers (text-2xl)
- `ds-stat-small` - Small numbers (text-xl)

## Layout Classes

### Spacing
- `ds-section-spacing` - Between major sections (space-y-6)
- `ds-content-spacing` - Between content blocks (space-y-4)
- `ds-tight-spacing` - Tight spacing (space-y-3)

### Grids
- `ds-grid-stats` - 4-column stats grid
- `ds-grid-cards` - 2-column card grid
- `ds-grid-cards-3` - 3-column card grid

### Cards
- `ds-card` - Base card styling
- `ds-card-compact` - Compact padding (p-4)
- `ds-card-standard` - Standard padding (p-5)
- `ds-card-spacious` - Spacious padding (p-6)

## Component Usage

### PageHeader
```jsx
<PageHeader
    title="Page Title"
    description="Optional description"
    badge={<Badge>Optional badge</Badge>}
    actions={<>Action buttons</>}
/>
```

### StatCard
```jsx
<StatCard
    label="Total Users"
    value="1,234"
    icon={Users}
    trend="+12%"
    trendDirection="up" // or "down"
    description="Active this month"
    color="text-blue-600"
    bg="bg-blue-50"
    onClick={() => {}} // Optional
/>
```

### DataTable
```jsx
<table className="ds-table">
    <thead className="ds-table-header">
        <tr>
            <th className="ds-table-header-cell">Header</th>
        </tr>
    </thead>
    <tbody>
        <tr className="ds-table-row">
            <td className="ds-table-cell">Data</td>
        </tr>
    </tbody>
</table>
```

## Form Elements

### Input
```jsx
<input type="text" className="ds-input" />
```

### Textarea
```jsx
<textarea className="ds-textarea"></textarea>
```

### Select
```jsx
<select className="ds-select">
    <option>Option</option>
</select>
```

## Buttons

### Sizes
- `ds-btn-sm` - Small (h-7, px-2.5)
- `ds-btn-md` - Medium (h-8, px-3)
- `ds-btn-lg` - Large (h-9, px-4)

### Variants
```jsx
// Primary
<button className="ds-btn ds-btn-md bg-primary text-white">Primary</button>

// Secondary
<button className="ds-btn ds-btn-md bg-white ring-1 ring-gray-200">Secondary</button>

// Danger
<button className="ds-btn ds-btn-md bg-red-600 text-white">Delete</button>
```

## Badges

```jsx
<Badge variant="success" className="ds-badge">Active</Badge>
<Badge variant="warning" className="ds-badge">Pending</Badge>
<Badge variant="error" className="ds-badge">Inactive</Badge>
<Badge variant="info" className="ds-badge">Info</Badge>
<Badge variant="gray" className="ds-badge">Default</Badge>
```

## Icons

### Sizes
- `ds-icon-sm` - Small (h-3.5 w-3.5)
- `ds-icon-md` - Medium (h-4 w-4)
- `ds-icon-lg` - Large (h-5 w-5)
- `ds-icon-xl` - Extra large (h-6 w-6)

## Charts

```jsx
<div className="ds-chart-container">
    <ResponsiveContainer width="100%" height="100%">
        {/* Chart component */}
    </ResponsiveContainer>
</div>
```

### Sizes
- `ds-chart-container-sm` - 250px height
- `ds-chart-container` - 300px height
- `ds-chart-container-lg` - 350px height

## Migration Checklist

When updating an existing page:

- [ ] Replace page wrapper with `ds-section-spacing`
- [ ] Use `PageHeader` component for page title
- [ ] Replace stat cards with `StatCard` component
- [ ] Update all headings to use `ds-h1`, `ds-h2`, etc.
- [ ] Update body text to use `ds-body`, `ds-caption`, etc.
- [ ] Replace custom grids with `ds-grid-*` classes
- [ ] Update card padding to `ds-card-compact/standard/spacious`
- [ ] Replace table classes with `ds-table-*` classes
- [ ] Update form inputs to use `ds-input`, `ds-textarea`, etc.
- [ ] Replace button classes with `ds-btn` + size classes
- [ ] Update badge styling with `ds-badge` classes
- [ ] Replace icon sizes with `ds-icon-*` classes
- [ ] Update chart containers to `ds-chart-container`

## Examples

See these pages for reference:
- `/admin` - Dashboard (complete example)
- `/admin/customers` - CustomerManagement (table example)
- `/admin/sellers/active` - ActiveSellers (grid + cards example)

## Color Palette

### Primary Colors
- Primary: `bg-primary`, `text-primary`
- Success: `bg-green-*`, `text-green-*`
- Warning: `bg-yellow-*`, `text-yellow-*`
- Error: `bg-red-*`, `text-red-*`
- Info: `bg-blue-*`, `text-blue-*`

### Neutral Colors
- Gray scale: `bg-gray-50` through `bg-gray-900`
- Text: `text-gray-500`, `text-gray-700`, `text-gray-900`

## Best Practices

1. **Always use design system classes** - Avoid custom font sizes or spacing
2. **Maintain consistency** - Use the same patterns across all pages
3. **Component reuse** - Use PageHeader, StatCard, DataTable when possible
4. **Responsive design** - Use grid classes that adapt to screen sizes
5. **Accessibility** - Ensure proper contrast and semantic HTML
6. **Performance** - Keep components lightweight and efficient
