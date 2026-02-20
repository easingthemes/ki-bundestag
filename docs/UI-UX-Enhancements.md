# Frontend UI/UX Enhancements

## Overview

Comprehensive UI/UX improvements to the KI Bundestag frontend for better consistency, accessibility, and user experience.

## What's New

### 1. **CSS Design System** (`styles.css`)

Added CSS custom properties for consistent styling:

```css
:root {
  /* Colors */
  --color-primary: #004b91;
  --color-success: #28a745;
  --color-danger: #dc3545;
  --color-warning: #ffc107;
  
  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  
  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 350ms ease;
  
  /* Shadows & Radius */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
}
```

### 2. **Enhanced Button System**

New button classes with variants and sizes:

```tsx
<Button variant="primary" size="md">Primary Action</Button>
<Button variant="secondary" size="sm">Secondary</Button>
<Button variant="outline">Outlined</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger" loading>Delete...</Button>
```

**Features:**
- ✅ Focus-visible outlines for accessibility
- ✅ Hover animations (translateY lift + shadow)
- ✅ Loading spinner integration
- ✅ Disabled states with visual feedback

### 3. **Improved Form Controls**

Consistent form styling with enhanced states:

```tsx
<Input
  label="Display Name"
  placeholder="Enter name"
  error="Name is required"
  help="Visible to other party members"
/>

<Select
  label="Party"
  options={partyOptions}
  error={validationError}
/>

<Textarea
  label="Question"
  placeholder="Your question..."
  maxLength={500}
/>
```

**Features:**
- ✅ Focus ring with primary color
- ✅ Smooth border transitions on hover/focus
- ✅ Error and help text support
- ✅ Consistent padding and sizing

### 4. **Loading States & Skeletons**

Better loading feedback:

```tsx
<LoadingSpinner size="md" />
<SkeletonTitle />
<SkeletonText lines={3} />
<SkeletonCard />
```

**Features:**
- ✅ Spinning loader animation
- ✅ Shimmer effect on skeleton loaders
- ✅ Multiple skeleton variants

### 5. **Enhanced Navigation**

Sticky nav with smooth transitions:

- ✅ Sticky positioning at top
- ✅ Underline animation on active links
- ✅ Smooth hover effects
- ✅ Mobile-friendly horizontal scroll

### 6. **Interactive Card Enhancements**

Cards with hover feedback:

```css
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
```

- ✅ Lift effect on hover
- ✅ Enhanced shadow depth
- ✅ Smooth transitions

### 7. **Toast Notification System**

Improved toast styling:

```tsx
<div className="toast toast-success">
  <span className="toast-icon">✓</span>
  Success message
</div>
```

**Variants:**
- toast-success (green)
- toast-error (red)
- toast-warning (yellow)
- toast-info (blue)

### 8. **Accessibility Improvements**

- ✅ Focus-visible outlines on all interactive elements
- ✅ ARIA labels on form controls
- ✅ Screen reader only text utility (`.sr-only`)
- ✅ Semantic HTML throughout
- ✅ Keyboard navigation support

### 9. **Typography Scale**

Improved heading hierarchy:

```css
h1 { font-size: 1.75rem; font-weight: 700; }
h2 { font-size: 1.3rem; font-weight: 600; }
h3 { font-size: 1.1rem; font-weight: 600; }
```

### 10. **Responsive Enhancements**

Mobile-first improvements:

- ✅ Horizontal scroll for navigation
- ✅ Full-width buttons on mobile
- ✅ Adjusted padding for smaller screens
- ✅ Touch-friendly scroll behavior

## Component Library

New reusable components in `/components/ui.tsx`:

- `Button` - Flexible button with variants
- `Input` - Enhanced text input with labels
- `Select` - Styled select dropdown
- `Textarea` - Multi-line text input
- `LoadingSpinner` - Animated spinner
- `SkeletonText` - Loading placeholder
- `SkeletonCard` - Card loader
- `SkeletonTitle` - Title loader

## Updated Components

### Dashboard
- ✅ Skeleton loaders during initial load
- ✅ Enhanced "Ask a Party" widget with new form components
- ✅ Improved button styling

### Parties
- ✅ Hover effects on party cards
- ✅ Better visual affordance for clickable items

## Browser Support

All enhancements include vendor prefixes for:
- Chrome/Edge (Chromium)
- Firefox
- Safari/iOS Safari
- Samsung Internet

Progressive enhancement for features like:
- Smooth scrolling
- Custom scrollbars
- Advanced animations

## Performance

All transitions use GPU-accelerated properties:
- `transform` instead of `top/left`
- `opacity` for fades
- Hardware acceleration for smooth 60fps animations

## Migration Guide

To use new components in existing pages:

```tsx
// Old
<button style={{...}}>Click me</button>

// New
<Button variant="primary">Click me</Button>

// Old
<input type="text" style={{...}} />

// New
<Input label="Name" placeholder="Enter name" />
```

## Future Enhancements

Potential additions:
- [ ] Dark mode support
- [ ] More animation presets
- [ ] Tooltip component
- [ ] Modal/Dialog component
- [ ] Dropdown menu component
- [ ] Progress bar component
- [ ] Tabs component

## Testing

Verify improvements:
1. Start dev server: `npm run dev:web`
2. Check Dashboard for skeleton loaders
3. Test "Ask a Party" widget for new styling
4. Verify navigation sticky behavior
5. Test party card hover effects
6. Check form focus states
7. Verify button states (hover, active, disabled)
8. Test mobile responsiveness

## Files Modified

- `packages/web/src/styles.css` - Design system + enhancements
- `packages/web/src/components/ui.tsx` - New component library (created)
- `packages/web/src/pages/Dashboard.tsx` - Updated to use new components
