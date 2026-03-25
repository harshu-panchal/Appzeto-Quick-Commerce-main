#!/bin/bash

# Batch Update Script for Admin Panel Pages
# This script applies consistent design system patterns across all admin pages

echo "🎨 Starting Admin Panel Design System Update..."
echo "================================================"

# Define the pages directory
PAGES_DIR="frontend/src/modules/admin/pages"

# Function to update a single file
update_file() {
    local file=$1
    echo "📝 Updating: $file"
    
    # Backup original file
    cp "$file" "$file.backup"
    
    # Apply replacements using sed
    
    # 1. Update large padding
    sed -i 's/className="\([^"]*\)p-12\([^"]*\)"/className="\1p-5\2"/g' "$file"
    sed -i 's/className="\([^"]*\)p-10\([^"]*\)"/className="\1p-5\2"/g' "$file"
    sed -i 's/className="\([^"]*\)p-8\([^"]*\)"/className="\1p-4\2"/g' "$file"
    sed -i 's/className="\([^"]*\)px-10\([^"]*\)"/className="\1px-5\2"/g' "$file"
    sed -i 's/className="\([^"]*\)px-8\([^"]*\)"/className="\1px-4\2"/g' "$file"
    sed -i 's/className="\([^"]*\)py-10\([^"]*\)"/className="\1py-5\2"/g' "$file"
    sed -i 's/className="\([^"]*\)py-8\([^"]*\)"/className="\1py-4\2"/g' "$file"
    
    # 2. Update large text sizes
    sed -i 's/className="\([^"]*\)text-6xl\([^"]*\)"/className="\1text-3xl\2"/g' "$file"
    sed -i 's/className="\([^"]*\)text-5xl\([^"]*\)"/className="\1text-2xl\2"/g' "$file"
    sed -i 's/className="\([^"]*\)text-4xl\([^"]*\)"/className="\1text-xl\2"/g' "$file"
    
    # 3. Update gaps
    sed -i 's/className="\([^"]*\)gap-10\([^"]*\)"/className="\1gap-5\2"/g' "$file"
    sed -i 's/className="\([^"]*\)gap-8\([^"]*\)"/className="\1gap-4\2"/g' "$file"
    
    # 4. Update rounded corners
    sed -i 's/className="\([^"]*\)rounded-\[40px\]\([^"]*\)"/className="\1rounded-2xl\2"/g' "$file"
    sed -i 's/className="\([^"]*\)rounded-\[32px\]\([^"]*\)"/className="\1rounded-xl\2"/g' "$file"
    sed -i 's/className="\([^"]*\)rounded-\[28px\]\([^"]*\)"/className="\1rounded-xl\2"/g' "$file"
    sed -i 's/className="\([^"]*\)rounded-3xl\([^"]*\)"/className="\1rounded-xl\2"/g' "$file"
    
    echo "✅ Updated: $file"
}

# List of files to update
files=(
    "$PAGES_DIR/ActiveSellers.jsx"
    "$PAGES_DIR/PendingSellers.jsx"
    "$PAGES_DIR/OrdersList.jsx"
    "$PAGES_DIR/OrderDetail.jsx"
    "$PAGES_DIR/FleetTracking.jsx"
    "$PAGES_DIR/WithdrawalRequests.jsx"
    "$PAGES_DIR/SellerTransactions.jsx"
    "$PAGES_DIR/SellerDetail.jsx"
    "$PAGES_DIR/FAQManagement.jsx"
    "$PAGES_DIR/NotificationComposer.jsx"
    "$PAGES_DIR/FleetRadar.jsx"
    "$PAGES_DIR/EnvSettings.jsx"
    "$PAGES_DIR/ReviewModeration.jsx"
    "$PAGES_DIR/SupportTickets.jsx"
    "$PAGES_DIR/SellerLocations.jsx"
    "$PAGES_DIR/DeliveryFunds.jsx"
    "$PAGES_DIR/CouponManagement.jsx"
    "$PAGES_DIR/ContentManager.jsx"
    "$PAGES_DIR/CustomerDetail.jsx"
    "$PAGES_DIR/CashCollection.jsx"
    "$PAGES_DIR/CategoryManagement.jsx"
    "$PAGES_DIR/ProductManagement.jsx"
    "$PAGES_DIR/ActiveDeliveryBoys.jsx"
    "$PAGES_DIR/PendingDeliveryBoys.jsx"
    "$PAGES_DIR/AdminProfile.jsx"
    "$PAGES_DIR/AdminSettings.jsx"
    "$PAGES_DIR/UserManagement.jsx"
)

# Update each file
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        update_file "$file"
    else
        echo "⚠️  File not found: $file"
    fi
done

echo ""
echo "================================================"
echo "✨ Design System Update Complete!"
echo "📊 Updated ${#files[@]} files"
echo "💾 Backups saved with .backup extension"
echo ""
echo "Next steps:"
echo "1. Review the changes"
echo "2. Test the pages"
echo "3. Remove .backup files if satisfied"
echo "================================================"
