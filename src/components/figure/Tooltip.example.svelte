<script>
	import Tooltip from "./Tooltip.svelte";

	// State for tooltip
	let showTooltip = $state(false);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let hoveredCountry = $state(null);

	// Sample SVG data
	const countries = [
		{ id: 1, name: "United States", affiliation: "hac" },
		{ id: 2, name: "France", affiliation: "eu" },
		{ id: 3, name: "Brazil", affiliation: "lmg" }
	];

	const paths = [
		"M 100,50 L 200,50 L 200,150 L 100,150 Z",
		"M 250,100 L 350,100 L 350,200 L 250,200 Z",
		"M 100,250 L 200,250 L 200,350 L 100,350 Z"
	];

	function handleMouseMove(event, country) {
		tooltipX = event.clientX;
		tooltipY = event.clientY;
		hoveredCountry = country;
		showTooltip = true;
	}

	function handleMouseLeave() {
		showTooltip = false;
		hoveredCountry = null;
	}
</script>

<div class="example-container">
	<h2>Figure.Tooltip.svelte - Svelte 5 Example</h2>

	<div class="visualization">
		<svg width="500" height="400">
			{#each countries as country, i}
				<path
					d={paths[i]}
					fill="steelblue"
					stroke="white"
					stroke-width="2"
					onmousemove={(e) => handleMouseMove(e, country)}
					onmouseleave={handleMouseLeave}
					style="cursor: pointer;"
					role="button"
					tabindex="0"
				/>
			{/each}
		</svg>

		{#if showTooltip && hoveredCountry}
			<Tooltip x={tooltipX} y={tooltipY}>
				{#snippet children()}
					<div class="tooltip-content">
						<strong>{hoveredCountry.name}</strong>
						<p>Affiliation: {hoveredCountry.affiliation}</p>
						<p>ID: {hoveredCountry.id}</p>
					</div>
				{/snippet}
			</Tooltip>
		{/if}
	</div>

	<div class="explanation">
		<h3>How It Works:</h3>
		<ol>
			<li>
				<strong>Track mouse coordinates</strong> using event.clientX and event.clientY
			</li>
			<li><strong>Store hovered data</strong> to display in the tooltip</li>
			<li>
				<strong>Conditionally render</strong> the tooltip only when needed
			</li>
			<li>
				<strong>Use Svelte 5 snippets</strong> to pass content to the component
			</li>
		</ol>

		<h3>Key Points:</h3>
		<ul>
			<li>The tooltip has pointer-events: none built-in</li>
			<li>Use clientX/clientY for HTML tooltips over SVG</li>
			<li>Svelte 5 uses snippets instead of slots</li>
			<li>Must destructure children from props</li>
		</ul>
	</div>
</div>

<style>
	.example-container {
		padding: 2rem;
		max-width: 900px;
		margin: 0 auto;
	}

	h2 {
		color: #333;
		margin-bottom: 1rem;
	}

	.visualization {
		position: relative;
		border: 2px solid #ccc;
		margin: 2rem 0;
		background: #f5f5f5;
	}

	svg {
		display: block;
	}

	.tooltip-content {
		background: white;
		padding: 0.75rem;
		border-radius: 4px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		font-size: 0.875rem;
		min-width: 150px;
	}

	.tooltip-content strong {
		display: block;
		margin-bottom: 0.5rem;
		color: #333;
	}

	.tooltip-content p {
		margin: 0.25rem 0;
		color: #666;
	}

	.explanation {
		background: #f9f9f9;
		padding: 1.5rem;
		border-radius: 8px;
		margin-top: 2rem;
	}

	.explanation h3 {
		margin-top: 0;
		color: #333;
	}

	.explanation ol,
	.explanation ul {
		line-height: 1.8;
		color: #555;
	}
</style>
