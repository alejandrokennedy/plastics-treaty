<script>
	// Props using Svelte 5 $props() rune
	let { x = 0, y = 0, offset = 8, children } = $props();

	// Tooltip dimensions for smart positioning
	let tooltipWidth = $state(0);
	let tooltipHeight = $state(0);

	// Thresholds for flipping tooltip position
	const EDGE_THRESHOLD_RIGHT = 250; // Flip left when within 250px of right edge
	const EDGE_THRESHOLD_BOTTOM = 150; // Flip up when within 150px of bottom edge

	// Smart positioning: flip tooltip when near edges
	let left = $derived.by(() => {
		const viewportWidth =
			typeof window !== "undefined" ? window.innerWidth : 1920;
		const distanceFromRight = viewportWidth - x;

		// If too close to right edge, position tooltip to the left of cursor
		if (distanceFromRight < EDGE_THRESHOLD_RIGHT) {
			return `${x - tooltipWidth - offset}px`;
		}

		// Default: position to the right of cursor
		return `${x + offset}px`;
	});

	let top = $derived.by(() => {
		const viewportHeight =
			typeof window !== "undefined" ? window.innerHeight : 1080;
		const distanceFromBottom = viewportHeight - y;

		// If too close to bottom edge, position tooltip above cursor
		if (distanceFromBottom < EDGE_THRESHOLD_BOTTOM) {
			return `${y - tooltipHeight - offset}px`;
		}

		// Default: position below cursor
		return `${y + offset}px`;
	});
</script>

<div class="tooltip-container">
	<div
		class="tooltip-box"
		style:top
		style:left
		bind:clientWidth={tooltipWidth}
		bind:clientHeight={tooltipHeight}
	>
		{@render children()}
	</div>
</div>

<style>
	div {
		pointer-events: none;
	}
	.tooltip-box {
		position: fixed;
		/* IMPORTANT: Disable all transitions to prevent lag */
		transition: none !important;
		/* Ensure position properties update instantly */
		transform: translateZ(0); /* Force GPU acceleration */
		will-change: auto; /* Don't hint for optimization */
	}
</style>
