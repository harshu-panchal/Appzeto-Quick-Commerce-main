# Category Icons Feature

## Overview
Admins can now select from a library of 20 SVG icons when creating header categories, or upload custom images as before.

## Features

### Icon Library
- 20 pre-designed SVG icons for common categories
- Icons include: Electronics, Fashion, Home & Living, Food, Sports, Books, Beauty, Toys, Automotive, Pets, Health, Garden, Office, Music, Jewelry, Baby, Tools, Luggage, Art, and Grocery
- Searchable icon selector with visual preview
- Icons are stored as identifiers (not files) for better performance

### User Experience
1. When creating/editing a header category, admins see two options:
   - **Select Icon**: Choose from the SVG icon library
   - **Upload Image**: Upload a custom image (existing functionality)

2. Icon Selector Modal:
   - Grid layout showing all available icons
   - Search functionality to filter icons by name
   - Visual feedback for selected icon
   - Hover effects for better UX

3. Display Priority:
   - SVG icon (if selected) takes priority
   - Falls back to custom image if no icon selected
   - Shows placeholder if neither is available

## Technical Implementation

### New Files
1. `frontend/src/shared/constants/categoryIcons.js`
   - Icon library with 20 SVG icons
   - Helper functions: `getIconById()`, `getIconSvg()`

2. `frontend/src/shared/components/IconSelector.jsx`
   - Modal component for icon selection
   - Search and filter functionality
   - Animated with framer-motion

3. `frontend/src/shared/components/CategoryIcon.jsx`
   - Reusable component to display category icons
   - Handles priority: SVG > Image > Fallback

### Modified Files
1. `frontend/src/modules/admin/pages/categories/HeaderCategories.jsx`
   - Added icon selector integration
   - Updated form to include `iconId` field
   - Enhanced UI to show both icon and image options
   - Display icons in the category table

2. `backend/app/models/category.js`
   - Added `iconId` field to store selected icon identifier

## Usage

### For Admins
1. Navigate to Admin Panel > Category Management > Header Categories
2. Click "Add New Header" or edit existing category
3. Choose between:
   - Click "Select Icon" to browse SVG icons
   - Click "Upload" to use custom image
4. Save the category

### For Developers
```javascript
// Import the icon library
import { categoryIcons, getIconSvg } from '@shared/constants/categoryIcons';

// Get icon SVG by ID
const iconSvg = getIconSvg('electronics');

// Use the CategoryIcon component
import CategoryIcon from '@shared/components/CategoryIcon';

<CategoryIcon 
  iconId={category.iconId} 
  imageUrl={category.image?.url}
  alt={category.name}
  className="w-8 h-8"
/>
```

## Benefits
- Consistent visual design across categories
- Faster loading (SVG vs images)
- No storage costs for icons
- Easy to add more icons to the library
- Maintains backward compatibility with custom images
