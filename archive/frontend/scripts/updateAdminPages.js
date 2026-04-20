/**
 * Script to update all admin pages with consistent design system
 * 
 * This script provides regex patterns to find and replace old styling
 * with new design system classes across all admin panel pages.
 */

const replacements = [
    // Large padding replacements
    { find: /className="([^"]*)\bp-12\b([^"]*)"/g, replace: 'className="$1p-5$2"' },
    { find: /className="([^"]*)\bp-10\b([^"]*)"/g, replace: 'className="$1p-5$2"' },
    { find: /className="([^"]*)\bp-8\b([^"]*)"/g, replace: 'className="$1p-4$2"' },
    { find: /className="([^"]*)\bpx-10\b([^"]*)"/g, replace: 'className="$1px-5$2"' },
    { find: /className="([^"]*)\bpx-8\b([^"]*)"/g, replace: 'className="$1px-4$2"' },
    { find: /className="([^"]*)\bpy-10\b([^"]*)"/g, replace: 'className="$1py-5$2"' },
    { find: /className="([^"]*)\bpy-8\b([^"]*)"/g, replace: 'className="$1py-4$2"' },
    
    // Large text size replacements
    { find: /className="([^"]*)\btext-6xl\b([^"]*)"/g, replace: 'className="$1text-3xl$2"' },
    { find: /className="([^"]*)\btext-5xl\b([^"]*)"/g, replace: 'className="$1text-2xl$2"' },
    { find: /className="([^"]*)\btext-4xl\b([^"]*)"/g, replace: 'className="$1text-xl$2"' },
    { find: /className="([^"]*)\btext-3xl\b([^"]*)"/g, replace: 'className="$1ds-stat-large$2"' },
    { find: /className="([^"]*)\btext-2xl\b([^"]*)"/g, replace: 'className="$1ds-stat-medium$2"' },
    
    // Gap replacements
    { find: /className="([^"]*)\bgap-10\b([^"]*)"/g, replace: 'className="$1gap-5$2"' },
    { find: /className="([^"]*)\bgap-8\b([^"]*)"/g, replace: 'className="$1gap-4$2"' },
    
    // Space-y replacements
    { find: /className="([^"]*)\bspace-y-10\b([^"]*)"/g, replace: 'className="$1ds-section-spacing$2"' },
    { find: /className="([^"]*)\bspace-y-8\b([^"]*)"/g, replace: 'className="$1ds-section-spacing$2"' },
    { find: /className="([^"]*)\bspace-y-6\b([^"]*)"/g, replace: 'className="$1ds-section-spacing$2"' },
    
    // Rounded corners
    { find: /className="([^"]*)\brounded-\[40px\]\b([^"]*)"/g, replace: 'className="$1rounded-2xl$2"' },
    { find: /className="([^"]*)\brounded-\[32px\]\b([^"]*)"/g, replace: 'className="$1rounded-xl$2"' },
    { find: /className="([^"]*)\brounded-\[28px\]\b([^"]*)"/g, replace: 'className="$1rounded-xl$2"' },
    { find: /className="([^"]*)\brounded-3xl\b([^"]*)"/g, replace: 'className="$1rounded-xl$2"' },
];

// Manual replacements for specific patterns
const manualReplacements = {
    // Page headers
    pageHeader: {
        old: `<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl font-bold">Title</h1>
                    <p className="text-sm text-gray-500">Description</p>
                </div>
            </div>`,
        new: `<PageHeader
                title="Title"
                description="Description"
                actions={<>...</>}
            />`
    },
    
    // Stat cards
    statCard: {
        old: `<Card className="p-6">
                <div className="flex items-center gap-4">
                    <Icon className="h-6 w-6" />
                    <div>
                        <p className="text-xs">Label</p>
                        <h3 className="text-2xl">Value</h3>
                    </div>
                </div>
            </Card>`,
        new: `<StatCard
                label="Label"
                value="Value"
                icon={Icon}
                color="text-blue-600"
                bg="bg-blue-50"
            />`
    },
    
    // Tables
    table: {
        old: `<table className="w-full">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-4 text-xs">Header</th>
                    </tr>
                </thead>
            </table>`,
        new: `<table className="ds-table">
                <thead className="ds-table-header">
                    <tr>
                        <th className="ds-table-header-cell">Header</th>
                    </tr>
                </thead>
            </table>`
    }
};

console.log('Design System Update Patterns');
console.log('=============================\n');
console.log('Use these patterns to update admin pages:\n');

replacements.forEach((r, i) => {
    console.log(`${i + 1}. Find: ${r.find}`);
    console.log(`   Replace: ${r.replace}\n`);
});

export { replacements, manualReplacements };
