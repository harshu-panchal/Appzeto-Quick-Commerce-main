# Batch Update Admin Pages - Version 2
# This script applies design system updates to all remaining admin pages

$pagesDir = "frontend/src/modules/admin/pages"

# Define all pages that need updates
$pagesToUpdate = @(
    "ActiveSellers.jsx",
    "PendingSellers.jsx",
    "OrdersList.jsx",
    "OrderDetail.jsx",
    "FleetTracking.jsx",
    "WithdrawalRequests.jsx",
    "SellerTransactions.jsx",
    "SellerDetail.jsx",
    "FAQManagement.jsx",
    "NotificationComposer.jsx",
    "FleetRadar.jsx",
    "EnvSettings.jsx",
    "ReviewModeration.jsx",
    "SupportTickets.jsx",
    "SellerLocations.jsx",
    "DeliveryFunds.jsx",
    "CouponManagement.jsx",
    "ContentManager.jsx",
    "CustomerDetail.jsx",
    "CashCollection.jsx",
    "CategoryManagement.jsx",
    "ProductManagement.jsx",
    "ActiveDeliveryBoys.jsx",
    "PendingDeliveryBoys.jsx",
    "AdminProfile.jsx",
    "AdminSettings.jsx",
    "UserManagement.jsx"
)

# Define replacements
$replacements = @(
    # Wrapper spacing
    @{ Pattern = 'className="space-y-8'; Replacement = 'className="ds-section-spacing' },
    @{ Pattern = 'className="space-y-10'; Replacement = 'className="ds-section-spacing' },
    @{ Pattern = 'className="space-y-12'; Replacement = 'className="ds-section-spacing' },
    @{ Pattern = 'className="space-y-6 animate-in'; Replacement = 'className="ds-section-spacing animate-in' },
    
    # Padding
    @{ Pattern = ' p-12'; Replacement = ' p-5' },
    @{ Pattern = ' p-10'; Replacement = ' p-5' },
    @{ Pattern = ' p-8'; Replacement = ' p-4' },
    @{ Pattern = ' px-12'; Replacement = ' px-5' },
    @{ Pattern = ' px-10'; Replacement = ' px-5' },
    @{ Pattern = ' px-8'; Replacement = ' px-4' },
    @{ Pattern = ' py-12'; Replacement = ' py-5' },
    @{ Pattern = ' py-10'; Replacement = ' py-5' },
    @{ Pattern = ' py-8'; Replacement = ' py-4' },
    
    # Typography - Large headings
    @{ Pattern = ' text-6xl'; Replacement = ' text-3xl' },
    @{ Pattern = ' text-5xl'; Replacement = ' text-2xl' },
    @{ Pattern = ' text-4xl'; Replacement = ' text-xl' },
    @{ Pattern = ' text-3xl'; Replacement = ' ds-stat-large' },
    @{ Pattern = ' text-2xl'; Replacement = ' ds-h1' },
    @{ Pattern = ' text-xl'; Replacement = ' ds-h2' },
    @{ Pattern = ' text-lg'; Replacement = ' ds-h3' },
    
    # Gaps
    @{ Pattern = ' gap-12'; Replacement = ' gap-5' },
    @{ Pattern = ' gap-10'; Replacement = ' gap-5' },
    @{ Pattern = ' gap-8'; Replacement = ' gap-4' },
    
    # Rounded corners
    @{ Pattern = ' rounded-\[40px\]'; Replacement = ' rounded-2xl' },
    @{ Pattern = ' rounded-\[32px\]'; Replacement = ' rounded-xl' },
    @{ Pattern = ' rounded-\[28px\]'; Replacement = ' rounded-xl' },
    @{ Pattern = ' rounded-3xl'; Replacement = ' rounded-xl' },
    
    # Admin-specific classes to design system
    @{ Pattern = 'admin-h1'; Replacement = 'ds-h1' },
    @{ Pattern = 'admin-h2'; Replacement = 'ds-h2' },
    @{ Pattern = 'admin-description'; Replacement = 'ds-description' },
    @{ Pattern = 'admin-label'; Replacement = 'ds-label' },
    @{ Pattern = 'admin-stat-value'; Replacement = 'ds-stat-medium' },
    @{ Pattern = 'admin-table-header'; Replacement = 'ds-table-header-cell' }
)

Write-Host "Starting batch update of admin pages..." -ForegroundColor Cyan
Write-Host "Total pages to update: $($pagesToUpdate.Count)" -ForegroundColor Yellow
Write-Host ""

$updatedCount = 0
$errorCount = 0

foreach ($page in $pagesToUpdate) {
    $filePath = Join-Path $pagesDir $page
    
    if (Test-Path $filePath) {
        try {
            Write-Host "Processing: $page" -ForegroundColor Green
            
            # Read file content
            $content = Get-Content $filePath -Raw
            $originalContent = $content
            
            # Apply all replacements
            foreach ($replacement in $replacements) {
                $content = $content -replace $replacement.Pattern, $replacement.Replacement
            }
            
            # Only write if content changed
            if ($content -ne $originalContent) {
                Set-Content -Path $filePath -Value $content -NoNewline
                Write-Host "  Updated successfully" -ForegroundColor Green
                $updatedCount++
            } else {
                Write-Host "  No changes needed" -ForegroundColor Gray
            }
        }
        catch {
            Write-Host "  Error: $_" -ForegroundColor Red
            $errorCount++
        }
    }
    else {
        Write-Host "  File not found: $filePath" -ForegroundColor Red
        $errorCount++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Batch Update Complete!" -ForegroundColor Green
Write-Host "Updated: $updatedCount pages" -ForegroundColor Green
Write-Host "Errors: $errorCount pages" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Green" })
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Review the changes in each file" -ForegroundColor White
Write-Host "2. Add PageHeader component imports where needed" -ForegroundColor White
Write-Host "3. Replace custom headers with PageHeader component" -ForegroundColor White
Write-Host "4. Replace custom stat cards with StatCard component" -ForegroundColor White
Write-Host "5. Test all pages for visual consistency" -ForegroundColor White
