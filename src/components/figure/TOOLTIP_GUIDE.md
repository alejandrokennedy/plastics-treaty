# Tooltip - Complete Guide

A general-purpose Svelte 5 tooltip component optimized for SVG visualizations with smart edge detection and proper stroke rendering.

---

## Quick Start

```svelte
<script>
  import Tooltip from "$components/figure/Tooltip.svelte";
  
  let showTooltip = $state(false);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let hoveredData = $state(null);
</script>

<!-- Your SVG -->
<svg>
  <path
    onmousemove={(e) => {
      tooltipX = e.clientX;
      tooltipY = e.clientY;
      hoveredData = someData;
      showTooltip = true;
    }}
    onmouseleave={() => showTooltip = false}
  />
</svg>

<!-- Tooltip -->
{#if showTooltip}
  <Tooltip x={tooltipX} y={tooltipY} offset={12}>
    {#snippet children()}
      <div class="tooltip-content">
        <strong>{hoveredData.title}</strong>
        <p>{hoveredData.value}</p>
      </div>
    {/snippet}
  </Tooltip>
{/if}
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `x` | number | 0 | X coordinate (viewport) |
| `y` | number | 0 | Y coordinate (viewport) |
| `offset` | number | 8 | Distance from cursor (px) |
| `children` | snippet | required | Tooltip content |

---

## Key Features

### 1. Smart Edge Detection
Automatically flips position when near viewport edges:
- **Right edge** (<250px): Flips left
- **Bottom edge** (<150px): Flips up
- **Corner**: Flips both directions

### 2. Viewport Positioning
Uses `position: fixed` to match `event.clientX/clientY` coordinates. Never use `position: absolute` with these coordinates.

### 3. Non-Interfering
`pointer-events: none` built-in - tooltip won't interfere with mouse events.

### 4. Mouse Offset
Default 8px offset prevents tooltip from covering hover target (prevents flickering).

---

## SVG-Specific Usage

### Coordinate System
✅ **Use**: `event.clientX` and `event.clientY` (viewport coordinates)  
❌ **Don't use**: `event.layerX`, `event.offsetX` (wrong coordinate system)

### Hover Effect with Proper Stroke
To add a hover effect that doesn't cover the fill:

```svelte
<script>
  let hoveredId = $state(null);
</script>

<svg>
  <!-- Render non-hovered items first -->
  {#each items as item}
    {#if hoveredId !== item.id}
      <path d={item.path} fill={item.color} ... />
    {/if}
  {/each}
  
  <!-- Render hovered item LAST (paints on top) -->
  {#each items as item}
    {#if hoveredId === item.id}
      <path d={item.path} fill={item.color} class="hovered" ... />
    {/if}
  {/each}
</svg>

<style>
  path {
    stroke: white;
    stroke-width: 0.7px;
    transition: stroke 0.15s, stroke-width 0.15s;
  }
  
  path.hovered {
    stroke: #333;
    stroke-width: 2px;
    paint-order: stroke fill; /* Stroke pushes outward, doesn't cover fill */
  }
</style>
```

**Why this works:**
- **SVG has no z-index** - elements paint in DOM order
- **Render hovered last** - ensures its stroke paints on top of neighbors
- **`paint-order: stroke fill`** - stroke appears outside fill instead of covering it

---

## Svelte 4 → 5 Migration

```svelte
<!-- Svelte 4 -->
<script>
  export let x = 0;
  export let y = 0;
  $: left = `${x}px`;
  $: top = `${y}px`;
</script>
<div><slot /></div>

<!-- Svelte 5 -->
<script>
  let { x = 0, y = 0, children } = $props();
  let left = $derived(`${x}px`);
  let top = $derived(`${y}px`);
</script>
<div>{@render children()}</div>
```

---

## Complete Example: Map Tooltips

```svelte
<script>
  import Tooltip from "$components/figure/Tooltip.svelte";
  
  let showTooltip = $state(false);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let hoveredCountry = $state(null);
  
  const countries = [...]; // Your country data
  
  function handleHover(event, country) {
    tooltipX = event.clientX;
    tooltipY = event.clientY;
    hoveredCountry = country;
    showTooltip = true;
  }
</script>

<svg width={width} height={height}>
  <!-- Non-hovered countries -->
  {#each countries as country}
    {#if hoveredCountry?.id !== country.id}
      <path
        d={country.path}
        fill={country.color}
        onmousemove={(e) => handleHover(e, country)}
        onmouseleave={() => showTooltip = false}
      />
    {/if}
  {/each}
  
  <!-- Hovered country (renders last, paints on top) -->
  {#each countries as country}
    {#if hoveredCountry?.id === country.id}
      <path
        d={country.path}
        fill={country.color}
        class="hovered"
        onmousemove={(e) => handleHover(e, country)}
        onmouseleave={() => showTooltip = false}
      />
    {/if}
  {/each}
</svg>

<!-- Tooltip -->
{#if showTooltip && hoveredCountry}
  <Tooltip x={tooltipX} y={tooltipY} offset={12}>
    {#snippet children()}
      <div class="country-tooltip">
        <strong>{hoveredCountry.name}</strong>
        <p>Population: {(hoveredCountry.population / 1_000_000).toFixed(1)}M</p>
        {#if hoveredCountry.group}
          <span class="badge">{hoveredCountry.group}</span>
        {/if}
      </div>
    {/snippet}
  </Tooltip>
{/if}

<style>
  path {
    stroke: white;
    stroke-width: 0.7px;
    cursor: pointer;
    transition: stroke 0.15s, stroke-width 0.15s;
  }
  
  path.hovered {
    stroke: #333;
    stroke-width: 2px;
    paint-order: stroke fill;
  }
  
  .country-tooltip {
    background: white;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    font-size: 0.875rem;
    min-width: 140px;
  }
  
  .country-tooltip strong {
    display: block;
    margin-bottom: 0.5rem;
    color: #333;
  }
  
  .badge {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 700;
    background: rgba(0, 0, 0, 0.1);
    margin-top: 0.25rem;
  }
</style>
```

---

## Troubleshooting

### Tooltip appears in wrong position
- ✅ Use `event.clientX/clientY` not `event.offsetX/layerX`
- ✅ Tooltip uses `position: fixed` (matches viewport coordinates)

### Tooltip flickers on hover
- ✅ Increase `offset` prop (try 12 or 16)
- ✅ Tooltip has `pointer-events: none` built-in

### Tooltip cut off at edges
- ✅ Edge detection is automatic (250px right, 150px bottom thresholds)
- ✅ If still cut off, increase thresholds in component source

### Hover stroke covered by neighbors
- ✅ Render hovered element last (two-pass rendering)
- ✅ SVG paints in DOM order, not z-index

### Stroke darkens fill color
- ✅ Add `paint-order: stroke fill` to hovered element
- ✅ Makes stroke push outward instead of covering fill

---

## Performance Notes

- **Edge detection**: Simple arithmetic, zero overhead
- **Two-pass rendering**: Only 1 extra element rendered (the hovered one)
- **Svelte 5 reactivity**: Efficient updates, no manual DOM manipulation

---

## Browser Support

- ✅ All modern browsers (Chrome, Firefox, Safari, Edge)
- ✅ `paint-order` supported since 2014-2018
- ✅ `position: fixed` universal support

---

## Key Takeaways

1. **Use `clientX/clientY` with `position: fixed`** for viewport-relative tooltips
2. **Add offset** (8-12px) to prevent flickering
3. **Render hovered SVG element last** for proper stroke visibility
4. **Use `paint-order: stroke fill`** to prevent stroke from covering fill
5. **Edge detection is automatic** - tooltip flips near viewport edges
6. **Svelte 5 snippets** - use `{@render children()}` instead of `<slot>`

---

## Files Created

- `Tooltip.svelte` - Main component (Svelte 5)
- `Tooltip.example.svelte` - Interactive demo
- `migrate/Figure.Tooltip.svelte` - Original Svelte 4 version (reference)

**Note**: Previously named `Figure.Tooltip`, but the Figure context was never used. This is now a general-purpose tooltip that works anywhere, especially well with SVG.

**Status**: ✅ Production-ready