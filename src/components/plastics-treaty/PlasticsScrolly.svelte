<script lang="ts">
	import {
		geoPath,
		scaleOrdinal,
		scaleBand,
		scaleLinear,
		index,
		rollup,
		range,
		sum,
		randomInt,
		shuffle,
		color as d3color
	} from "d3";
	import Scrolly from "$components/helpers/Scrolly.svelte";
	import Tooltip from "$components/figure/Tooltip.svelte";
	import { onMount, getContext } from "svelte";
	import { browser } from "$app/environment";
	import { Tween } from "svelte/motion";
	import worldComposit from "$data/worldComposit.json";
	import countryData from "$data/populationAffiliation.csv";
	import { geoWinkel3 } from "d3-geo-projection";
	import * as flubber from "flubber";
	import { fade } from "svelte/transition";

	const chaptersRaw = browser ? getContext("chapters") : [];

	const chapters = Array.isArray(chaptersRaw)
		? chaptersRaw.map((c) => ({
				...c,
				progress1: c.progress1 != null ? +c.progress1 : 0,
				progress2: c.progress2 != null ? +c.progress2 : 0,
				progress3: c.progress3 != null ? +c.progress3 : 0
			}))
		: [];

	let barVisible = $state(false);

	onMount(() => {
		let closeButton = null;
		let listenerAttached = false;
		let userClosed = false;
		let observer = null;

		const handleClose = () => {
			userClosed = true;
			barVisible = false;
		};

		// Check for bar and attach listener
		const checkForBar = () => {
			const container = document.querySelector("#cen-main-metered-bar");
			const bar = document.querySelector("#article-meter");
			const newCloseButton = document.querySelector(
				"#article-meter .btn-close"
			);

			// Update barVisible state if bar appears (but not if user manually closed it)
			if (container && bar && !barVisible && !userClosed) {
				barVisible = true;

				// Once bar is detected, stop observing (we don't need to watch anymore)
				if (observer) {
					observer.disconnect();
				}
			}

			// Attach click listener if button found and not yet attached
			if (newCloseButton && !listenerAttached) {
				closeButton = newCloseButton;
				closeButton.addEventListener("click", handleClose);
				listenerAttached = true;
			}
		};

		// Initial check (in case bar already exists)
		checkForBar();

		// Watch for when the bar appears in the DOM
		observer = new MutationObserver(() => {
			checkForBar();
		});

		// Start observing the entire document for changes
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});

		// Cleanup when component unmounts
		return () => {
			if (observer) {
				observer.disconnect();
			}
			if (closeButton && listenerAttached) {
				closeButton.removeEventListener("click", handleClose);
			}
		};
	});

	countryData.forEach((d) => {
		((d.LocationId = +d.LocationId),
			(d.Value = +d.Value),
			(d.affId = +d.affId));
	});

	const countryIndex = index(countryData, (d) => d.LocationId);

	let step = $state(null);
	let width = $state(600);
	let height = $state(400);

	// Tooltip state
	let showTooltip = $state(false);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let hoveredCountry = $state(null);

	const tweenConfig = {
		duration: 800,
		easing: (t) => t * t * (3 - 2 * t) // Smoothstep
	};

	const progress1 = new Tween(0, tweenConfig);
	const progress2 = new Tween(0, tweenConfig);
	const progress3 = new Tween(0, tweenConfig);

	const processedGeo = worldComposit;

	let geojson = $state(processedGeo);

	let leftSpace = $derived(width < 768 ? 0 : Math.min(width * 0.1, 170)); // No space on mobile
	let leftMapTrim = $derived(leftSpace ? 0 : width * 0.13);
	let rightMapTrim = $derived(width * 0.075);
	let projection = $derived(
		geoWinkel3()
			.rotate([-10.2, 0])
			.fitExtent(
				[
					[leftSpace - leftMapTrim, 0],
					[width + rightMapTrim, height]
				],
				geojson
			)
	);

	let pathGenerator = $derived(geoPath(projection));
	let affiliationRollup = $derived(
		rollup(
			countryData,
			(v) => v.length,
			(d) => d.Affiliation
		)
	);

	// scales setup
	const maxXWidth = $derived(Math.max(Math.min(700, width * 0.7), 230));
	const margin = $derived({
		top: 30,
		left: width / 2 - maxXWidth / 2 + leftSpace,
		bottom: 10,
		right: width / 2 - maxXWidth / 2
	});
	let xScale = $derived(
		scaleBand()
			.domain(["hac", "lmg"])
			.range([margin.left, width - margin.right])
			.paddingInner(0.1)
			.paddingOuter(1.5)
	);
	let yMax = $derived(
		affiliationRollup.get("hac") + affiliationRollup.get("eu")
	);
	let yScale = $derived(
		scaleBand()
			.domain(range(0, yMax))
			.range([height - margin.bottom, margin.top])
			.paddingInner(0.2)
	);

	// stacks
	const hacGroup = countryData.filter(
		(d) => d.Affiliation === "hac" || d.Affiliation === "eu"
	);
	const lmgGroup = countryData.filter((d) => d.Affiliation === "lmg");
	const hacPop = sum(hacGroup, (d) => d.Value);
	const lmgPop = sum(lmgGroup, (d) => d.Value);
	const popDiff = lmgPop - hacPop;

	const makeStack = (data, val, name, buffer = 0) => {
		const total = sum(data, (d) => d[val]) + buffer;
		let value = 0;
		return index(
			data.map((d) => ({
				...d,
				name: d[name],
				value: d[val] / total,
				startValue: value / total,
				endValue: (value += d[val]) / total
			})),
			(d) => d.LocationId
		);
	};

	const hacStack = makeStack(hacGroup, "Value", "LocationId", popDiff);
	const lmgStack = makeStack(lmgGroup, "Value", "LocationId");
	const stack = new Map([...hacStack, ...lmgStack]);

	// Calculate the top position of each stack (maximum endValue in each group)
	const hacStackTop = Math.max(
		...Array.from(hacStack.values()).map((d) => d.endValue)
	);
	const lmgStackTop = Math.max(
		...Array.from(lmgStack.values()).map((d) => d.endValue)
	);

	const yStackScale = $derived(
		scaleLinear()
			.domain([0, 1])
			.range([height - margin.bottom, margin.top])
	);

	const hacColor = "orange",
		lmgColor = "green",
		euColor = d3color(hacColor).darker(0.7).formatHex();

	const color = scaleOrdinal()
		.domain(["hac", "lmg", "eu"])
		.range([hacColor, lmgColor, euColor]);

	// DocChart
	const numLines = 12;
	const lines = Array.from({ length: numLines }, (_, i) => i);
	const minSeg = 2;
	const maxSeg = 5;
	const randSegNum = randomInt(minSeg, maxSeg);

	const maxDocWidth = $derived(Math.max(Math.min(700, width * 0.4), 230));
	const docMargin = $derived({
		top: 40,
		left: width / 2 - maxDocWidth / 2 + leftSpace,
		bottom: 40,
		right: width / 2 - maxDocWidth / 2
	});

	const xDocScale = $derived(
		scaleLinear()
			.domain([0, 1])
			.range([docMargin.left, docMargin.left + maxDocWidth])
	);

	const yDocScale = $derived(
		scaleBand()
			.domain(lines)
			.range([docMargin.top, height - docMargin.bottom])
			.paddingInner(0.4)
	);

	const docData = [];

	const makeLineStack = (data, gapSize = 0.02) => {
		const numSegments = data.length;
		const totalGapSpace = (numSegments - 1) * gapSize; // gaps between segments
		const availableSpace = 1 - totalGapSpace; // remaining space for actual segments

		const total = sum(data, (d) => d.val);
		let value = 0;
		let cumulativeGap = 0; // track how much gap we've added so far

		return data.map((d, i) => {
			const normalizedValue = (d.val / total) * availableSpace; // scale to available space
			const startValue = (value / total) * availableSpace + cumulativeGap;
			value += d.val;
			const endValue = (value / total) * availableSpace + cumulativeGap;

			cumulativeGap += i < numSegments - 1 ? gapSize : 0; // add gap after each segment except last

			return {
				...d,
				value: normalizedValue,
				startValue,
				endValue
			};
		});
	};

	// First pass: create all segments without affiliation
	lines.forEach((ln, lineIndex) => {
		const segments = Array.from({ length: randSegNum() }, (_, i) => ({
			id: `${lineIndex}-${i}`, // Unique ID
			ln,
			val: Math.max(Math.random(), 0.2)
		}));
		const stack = makeLineStack(segments);
		stack.forEach((segment) => docData.push(segment));
	});

	// Second pass: create balanced affiliation array and shuffle
	const totalSegments = docData.length;
	const numHac = Math.floor(totalSegments / 2);
	const numLmg = totalSegments - numHac; // handles odd numbers

	// Create array with half HAC, half LMG
	const affiliations = [
		...Array(numHac).fill("hac"),
		...Array(numLmg).fill("lmg")
	];

	// Shuffle using D3's shuffle
	const shuffledAffiliations = shuffle(affiliations);

	// Assign shuffled affiliations to segments
	docData.forEach((segment, i) => {
		segment.name = shuffledAffiliations[i];
	});

	// Split countries into static (no data) and dynamic (with data)
	const { rawStaticCountries, rawCountries } = $derived.by(() => {
		if (!geojson?.features) return { rawStaticCountries: [], rawCountries: [] };

		const static_ = [];
		const dynamic = [];

		for (const country of geojson.features) {
			const metaData = countryIndex?.get(country.id) || null;
			if (metaData) {
				if (metaData.Affiliation) {
					dynamic.push({ ...country, ...metaData });
				} else {
					static_.push({ ...country, ...metaData });
				}
			} else {
				static_.push(country);
			}
		}

		return { rawStaticCountries: static_, rawCountries: dynamic };
	});

	const staticCountries = $derived(
		rawStaticCountries.map((c) => ({
			id: c.id,
			path: pathGenerator(c),
			Location: c.Location || "",
			Value: c.Value || null
		}))
	);

	// Enhance dynamic countries with affiliation data
	let countries = $derived(
		rawCountries.map((c) => {
			const d = countryIndex.get(c.id);
			const affiliation = d?.Affiliation || "";
			// const euExplicit = d?.euExplicit || "";
			const affId = d?.affId ?? null;
			const path1 = pathGenerator(c);

			let interpol1 = null;
			let interpol2 = null;
			let interpol3 = null;
			// Validate all rectangle parameters before creating interpolator
			const x = xScale(affiliation) || xScale("hac");
			const y = yScale(affId);
			const width = xScale.bandwidth();
			const height = yScale.bandwidth();

			const x2 = xScale(affiliation) || xScale("hac");
			const y2 = yStackScale(stack.get(c.id).endValue);
			const width2 = xScale.bandwidth();
			const height2 =
				yStackScale(stack.get(c.id).startValue) -
				yStackScale(stack.get(c.id).endValue);

			const stackRectPath = `M${x2},${y2}L${x2 + width2},${y2}L${x2 + width2},${y2 + height2}L${x2},${y2 + height2}Z`;

			// Create the target rectangle as an SVG path string
			const rectPath = `M${x},${y}L${x + width},${y}L${x + width},${y + height}L${x},${y + height}Z`;

			interpol2 = browser
				? flubber.toRect(rectPath, x2, y2, width2, height2)
				: null;
			// Handle MultiPolygons using flubber.combine() to morph ALL pieces to rectangle
			if (c.geometry.type === "MultiPolygon" && browser) {
				// Extract all polygons from the MultiPolygon (not just the largest)
				const polygons = c.geometry.coordinates;
				// Convert each polygon piece to an SVG path string
				const polygonPaths = polygons.map((polygonCoords) => {
					const polygonFeature = {
						type: "Feature",
						geometry: {
							type: "Polygon",
							coordinates: polygonCoords
						}
					};
					return pathGenerator(polygonFeature);
				});

				try {
					// Use flubber.combine to morph all polygon pieces into one rectangle
					interpol1 = flubber.combine(
						polygonPaths, // FROM: all pieces of the country (e.g., Russia's islands + mainland)
						rectPath, // TO: one rectangle
						{ single: true } // Return one combined path string
					);
				} catch (error) {
					console.warn(
						`Failed to combine MultiPolygon for ${d?.Location}:`,
						error
					);
					interpol1 = null;
				}
			} else {
				// Single polygon: use toRect to morph directly to rectangle
				interpol1 = browser ? flubber.toRect(path1, x, y, width, height) : null;
			}

			return {
				...c,
				path1,
				affiliation,
				stackRectPath,
				interpol1,
				interpol2,
				interpol3,
				Location: d?.Location
			};
		}) ?? []
	);

	// Batch countries for document transition
	const docBatches = $derived.by(() => {
		if (!docData.length || !countries.length) return [];

		// Separate HAC and LMG segments
		const hacSegments = docData.filter((d) => d.name === "hac");
		const lmgSegments = docData.filter((d) => d.name === "lmg");

		// Get countries by affiliation (from paths2, which are the stacked bar states)
		const hacCountries = countries
			.map((c, i) => ({ country: c, index: i }))
			.filter(
				({ country }) =>
					country.affiliation === "hac" || country.affiliation === "eu"
			);
		const lmgCountries = countries
			.map((c, i) => ({ country: c, index: i }))
			.filter(({ country }) => country.affiliation === "lmg");

		// Batch HAC countries - distribute evenly across all segments
		const baseCount = Math.floor(hacCountries.length / hacSegments.length);
		const remainder = hacCountries.length % hacSegments.length;

		let currentIndex = 0;
		const hacBatches = hacSegments.map((segment, i) => {
			// First 'remainder' segments get baseCount + 1, rest get baseCount
			const countriesInThisSegment = i < remainder ? baseCount + 1 : baseCount;
			const batch = hacCountries.slice(
				currentIndex,
				currentIndex + countriesInThisSegment
			);
			currentIndex += countriesInThisSegment;

			return {
				segment,
				sourcePaths: batch
					.map(({ country }) => country.stackRectPath)
					.filter((p) => p != null),
				sourceIndices: batch.map(({ index }) => index),
				affiliation: "hac"
			};
		});

		// Distribute LMG countries across LMG segments - Each segment gets one source country (some countries will be reused)
		const lmgBatches = lmgSegments.map((segment, i) => {
			// Cycle through LMG countries
			const countryIdx = i % lmgCountries.length;
			const { country, index } = lmgCountries[countryIdx];
			return {
				segment,
				sourcePaths: country.stackRectPath ? [country.stackRectPath] : [],
				sourceIndices: [index],
				affiliation: "lmg"
			};
		});

		return [...hacBatches, ...lmgBatches];
	});

	const interpolators3 = $derived.by(() => {
		if (!docBatches.length || !countries.length || !browser) {
			return countries.map(() => null);
		}

		// Create interpolator for each country based on their batch assignment
		const result = countries.map((country, i) => {
			const affiliation = country.affiliation;

			// HAC: Find which batch this country belongs to
			if (affiliation === "hac" || affiliation === "eu") {
				const hacBatch = docBatches.find(
					(batch) =>
						batch.affiliation === "hac" && batch.sourceIndices.includes(i)
				);

				if (!hacBatch) return null;

				// Create target rectangle from segment
				const { segment } = hacBatch;
				const x = xDocScale(segment.startValue);
				const y = yDocScale(segment.ln);
				const width =
					xDocScale(segment.endValue) - xDocScale(segment.startValue);
				const height = yDocScale.bandwidth();
				const targetRect = `M${x},${y}L${x + width},${y}L${x + width},${y + height}L${x},${y + height}Z`;

				// Interpolate from stack bar to document segment
				return flubber.interpolate(country.stackRectPath, targetRect);
			}

			// LMG: Find all batches for this country
			if (affiliation === "lmg") {
				const lmgBatches = docBatches.filter(
					(batch) =>
						batch.affiliation === "lmg" && batch.sourceIndices.includes(i)
				);

				if (lmgBatches.length === 0) return null;

				// Create array of target rectangles
				const targetRects = lmgBatches.map((batch) => {
					const { segment } = batch;
					const x = xDocScale(segment.startValue);
					const y = yDocScale(segment.ln);
					const width =
						xDocScale(segment.endValue) - xDocScale(segment.startValue);
					const height = yDocScale.bandwidth();
					return `M${x},${y}L${x + width},${y}L${x + width},${y + height}L${x},${y + height}Z`;
				});

				// Use flubber.separate to split one path into multiple rectangles
				return flubber.separate(country.stackRectPath, targetRects, {
					single: true
				});
			}

			return null;
		});

		return result;
	});

	const interpolators1 = $derived(countries.map((d) => d.interpol1));
	const interpolators2 = $derived(countries.map((d) => d.interpol2));

	const paths1 = $derived.by(() => {
		const p = progress1.current;
		return interpolators1.map((fn) => (fn ? fn(p) : null));
	});

	const paths2 = $derived.by(() => {
		const p = progress2.current;
		return interpolators2.map((fn) => (fn ? fn(p) : null));
	});

	const paths3 = $derived.by(() => {
		const p = progress3.current;
		return interpolators3.map((fn) => (fn ? fn(p) : null));
	});

	// Update tween targets based on step
	$effect(() => {
		const chapter = chapters[step];
		if (chapter) {
			progress1.target = chapter.progress1;
			progress2.target = chapter.progress2;
			progress3.target = chapter.progress3;
		}
	});

	// updated to reflect new text
	const currentPaths = $derived.by(() => {
		if (step === null || step === undefined || step < 4) {
			return countries.map((c) => c.path1);
		}
		// if (step >= 7) return paths3;
		// if (step >= 6) return paths2;
		if (step >= 7) return paths3;
		if (step === 6) return progress3.current > 0 ? paths3 : paths2;

		if (step === 5) return progress2.current > 0 ? paths2 : paths1;
		if (step === 4) return paths1;
		return countries.map((c) => c.path1);
	});

	const countryFills = $derived(
		countries.map((c) => {
			if (step > 0 && c.affiliation === "hac") return color("hac");
			if (step > 1 && c.affiliation === "eu") return color("eu");
			if (step > 2 && c.affiliation === "lmg") return color("lmg");
			return "whitesmoke";
		})
	);

	// Show unit labels only when on step 5, unit chart is showing, and both transitions have completed
	const showUnitLabels = $derived(
		step === 5 &&
			progress1.current > 0 &&
			Math.abs(progress1.current - progress1.target) < 0.01 &&
			Math.abs(progress2.current - progress2.target) < 0.01 &&
			progress2.current < 1
	);

	// Show stack labels only when on step 6 and both transitions have completed
	const showStackLabels = $derived(
		step === 6 &&
			Math.abs(progress1.current - progress1.target) < 0.01 &&
			Math.abs(progress2.current - progress2.target) < 0.01 &&
			progress2.current > 0
	);

	// Show affiliation labels (HAC/LMG) on steps 5 and 6
	const showAffiliationLabels = $derived(step === 5 || step === 6);

	// Tooltip handlers
	function handleCountryHover(event: MouseEvent, country: any) {
		if (step === 7) return; // Don't show tooltip on document view
		tooltipX = event.clientX;
		tooltipY = event.clientY;
		hoveredCountry = country;
		showTooltip = true;
	}

	function handleCountryLeave() {
		if (step === 7) return; // Don't handle leave on document view
		showTooltip = false;
		hoveredCountry = null;
	}

	$effect(() => {
		if (step === 7) {
			showTooltip = false;
			hoveredCountry = null;
		}
	});
</script>

{#if chapters.length > 0}
	<section id="plastics-scrolly">
		<div
			id="viz-container"
			bind:clientWidth={width}
			bind:clientHeight={height}
			style="height: calc(100vh - 65px - {barVisible ? 54.6 : 0}px);"
		>
			<svg id="svg" {width} {height}>
				{#if step < 5 && step != null}
					<g transition:fade id="static-countries">
						{#each staticCountries as country}
							{#if hoveredCountry?.id !== country.id}
								<path
									d={country.path}
									fill="whitesmoke"
									onmousemove={(e) => handleCountryHover(e, country)}
									onmouseleave={handleCountryLeave}
									role="img"
									aria-label={country.Location || "Country"}
								>
								</path>
							{/if}
						{/each}
					</g>
				{/if}
				{#if step != null}
					<g transition:fade id="country-group">
						{#each countries as country, i}
							{#if hoveredCountry?.id !== country.id}
								<path
									d={currentPaths[i]}
									fill={countryFills[i]}
									onmousemove={(e) => handleCountryHover(e, country)}
									onmouseleave={handleCountryLeave}
									role="img"
									aria-label={country.Location || "Country"}
								>
								</path>
							{/if}
						{/each}
					</g>
				{/if}

				{#if showUnitLabels && step === 5}
					<g id="stack-labels" transition:fade>
						<!-- Y-axis label -->
						<text
							x={xScale("hac") - 25}
							y={height / 2}
							text-anchor="middle"
							transform="rotate(-90, {xScale('hac') - 25}, {height / 2})"
							font-size="15"
							fill="#444"
							class="y-label"
						>
							Countries per group →
						</text>
						<!-- HAC unit label -->
						<text
							x={xScale("hac") - 5}
							y={yScale(hacGroup.length - 1)}
							text-anchor="end"
							class="stack-label"
							fill={color("hac")}
						>
							{hacGroup.length}
						</text>
						<!-- LMG unit label -->
						<text
							x={xScale("lmg") + xScale.bandwidth() + 5}
							y={yScale(lmgGroup.length - 1)}
							text-anchor="start"
							class="stack-label"
							fill={color("lmg")}
						>
							{lmgGroup.length}
						</text>
					</g>
				{/if}

				<!-- Stack labels when on step 6 -->
				{#if showStackLabels}
					<g id="stack-labels" transition:fade>
						<!-- Y-axis label -->
						<text
							x={xScale("hac") - 25}
							y={height / 2}
							text-anchor="middle"
							transform="rotate(-90, {xScale('hac') - 25}, {height / 2})"
							font-size="15"
							fill="#444"
							class="y-label"
						>
							Population per group →
						</text>
						<!-- HAC stack label -->
						<text
							x={xScale("hac") - 5}
							y={yStackScale(hacStackTop)}
							text-anchor="end"
							class="stack-label"
							fill={color("hac")}
						>
							{(hacPop / 1_000_000_000).toFixed(2)}B
						</text>
						<!-- LMG stack label -->
						<text
							x={xScale("lmg") + xScale.bandwidth() + 5}
							y={yStackScale(lmgStackTop)}
							text-anchor="start"
							class="stack-label"
							fill={color("lmg")}
						>
							{(lmgPop / 1_000_000_000).toFixed(2)}B
						</text>
					</g>
				{/if}

				<!-- Affiliation labels (x-axis style labels at bottom) -->
				{#if showAffiliationLabels}
					<g id="affiliation-labels" transition:fade>
						<!-- HAC label -->
						<text
							x={xScale("hac") - 5}
							y={height - 11}
							text-anchor="end"
							class="affiliation-label"
							fill={color("hac")}
							font-weight="bold"
						>
							HAC
						</text>
						<!-- LMG label -->
						<text
							x={xScale("lmg") + xScale.bandwidth() + 5}
							y={height - 11}
							text-anchor="start"
							class="affiliation-label"
							fill={color("lmg")}
							font-weight="bold"
						>
							LMG
						</text>
					</g>
				{/if}

				<!-- THIRD PASS: Render hovered country on top of EVERYTHING -->
				<!-- {#if showTooltip && hoveredCountry && step !== 7} -->
				{#if showTooltip && hoveredCountry}
					<g id="hovered-country">
						<!-- Check if hovered country is static -->
						{#if step < 5 && step != null}
							{#each staticCountries as country}
								{#if hoveredCountry?.id === country.id}
									<path
										d={country.path}
										fill="whitesmoke"
										class="hovered"
										onmousemove={(e) => handleCountryHover(e, country)}
										onmouseleave={handleCountryLeave}
										role="img"
										aria-label={country.Location || "Country"}
									>
									</path>
								{/if}
							{/each}
						{/if}
						<!-- Check if hovered country is dynamic -->
						{#if step != null}
							{#each countries as country, i}
								{#if hoveredCountry?.id === country.id}
									<path
										d={currentPaths[i]}
										fill={countryFills[i]}
										class="hovered"
										onmousemove={(e) => handleCountryHover(e, country)}
										onmouseleave={handleCountryLeave}
										role="img"
										aria-label={country.Location || "Country"}
									>
									</path>
								{/if}
							{/each}
						{/if}
					</g>
				{/if}
			</svg>

			<!-- Tooltip -->
			{#if showTooltip && hoveredCountry && step !== 7}
				<Tooltip x={tooltipX} y={tooltipY} offset={12}>
					{#snippet children()}
						<div class="country-tooltip">
							<strong>{hoveredCountry.Location}</strong>
							{#if hoveredCountry.Value}
								<p class="population">
									Pop: {(hoveredCountry.Value / 1_000_000).toFixed(1)}M
								</p>
							{/if}
							{#if hoveredCountry.affiliation}
								<p class="affiliation {hoveredCountry.affiliation}">
									{hoveredCountry.affiliation === "eu"
										? "HAC (EU)"
										: hoveredCountry.affiliation.toUpperCase()}
								</p>
							{/if}
						</div>
					{/snippet}
				</Tooltip>
			{/if}
		</div>
		<div class="spacer"></div>
		<div class="steps-container">
			<Scrolly bind:value={step}>
				{#each chapters as { chapter }, i}
					{@const active = step === i}
					<div class="step" class:active>
						<p>{@html chapter}</p>
					</div>
				{/each}
			</Scrolly>
		</div>
	</section>
{/if}

<style>
	#country-group {
		stroke: white;
		stroke-width: 0.7px;
	}

	#static-countries {
		stroke: white;
		fill: whitesmoke;
	}

	#country-group path {
		/*transition: fill 0.16s ease-in-out;*/
		transition:
			fill 0.16s ease-in-out,
			stroke 0.15s ease-in-out,
			stroke-width 0.15s ease-in-out,
			opacity 0.15s ease-in-out;
	}

	#hovered-country path {
		stroke: #555;
		/*stroke: white;*/
		stroke-width: 1.5px;
		opacity: 1;
		filter: brightness(1.05);
		paint-order: stroke fill;
	}

	#static-countries path {
		transition:
			stroke 0.15s ease-in-out,
			stroke-width 0.15s ease-in-out,
			opacity 0.15s ease-in-out;
	}

	#viz-container {
		position: sticky;
		/*top: calc(65px + 56px);*/
		top: 65px;
		/*border: 2px solid orangered;*/
		z-index: 1;
	}

	.units,
	.stack {
		opacity: 0.2;
	}

	.stack-label,
	.stack-labels,
	.y-label,
	.affiliation-label {
		font-family: sans-serif;
	}

	.steps-container {
		position: relative;
		z-index: 2;
		width: 30vw;
		max-width: 28rem;
		pointer-events: none;
	}

	.step {
		/*border: 1px solid gold;*/
		padding-top: 20vh;
		padding-bottom: 60vh;
		text-align: center;
		position: relative; /* needed? */
		margin: 0 auto;
	}

	.step p {
		/*border: 1px solid aqua;*/
		padding: 1rem;
		background: var(--color-gray-100);
		/*font-size: 1rem;*/
		background: whitesmoke;
		color: #aaa;
		opacity: 0.4;
		border-radius: 5px;
		transition:
			background 300ms ease,
			opacity 300ms ease;
		box-shadow: 1px 1px 10px rgba(0, 0, 0, 0.2);
		text-align: left;
		width: 75%;
		margin: auto;
		max-width: 500px;
	}

	.step p :global(span) {
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		font-weight: 600;
		letter-spacing: 0.5px;
	}

	.step.active p {
		background: white;
		color: black;
		opacity: 0.94;
	}

	/* .affiliation: Affiliation badges might need brighter colors */
	/*@media (prefers-color-scheme: dark) {
		.step p {
			background: #1a1a1a;
			color: #666;
		}

		.step.active p {
			background: #2a2a2a;
			color: #e0e0e0;
		}

		.country-tooltip {
			background: #2a2a2a;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
		}

		.country-tooltip strong {
			color: #e0e0e0;
		}

		.country-tooltip p {
			color: #aaa;
		}

		.country-tooltip .population {
			color: #bbb;
		}

		.country-tooltip .affiliation.hac {
			background: rgba(255, 165, 0, 0.25);
			color: #ffa500;
		}

		.country-tooltip .affiliation.eu {
			background: rgba(184, 92, 0, 0.25);
			color: #ff8c42;
		}

		.country-tooltip .affiliation.lmg {
			background: rgba(0, 200, 0, 0.25);
			color: #00c800;
		}
	}*/

	@media screen and (max-width: 768px) {
		.steps-container {
			width: 100%;
			max-width: 50rem;
		}
	}

	/* Tooltip styles */
	.country-tooltip {
		background: white;
		padding: 0.45rem 0.75rem;
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		font-size: 0.875rem;
		/*min-width: 140px;*/
		max-width: 250px;
	}

	.country-tooltip strong {
		display: block;
		color: #333;
		margin-bottom: 0.2rem;
		font-size: 0.9rem;
		line-height: 1.3;
	}

	.country-tooltip p {
		margin: 0.25rem 0;
		color: #666;
		font-size: 0.77rem;
	}

	.country-tooltip .population {
		color: #555;
		font-weight: 500;
	}

	.country-tooltip .affiliation {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.5px;
		margin-top: 0.25rem;
	}

	.country-tooltip .affiliation.hac {
		background: rgba(255, 165, 0, 0.15);
		color: darkorange;
	}

	.country-tooltip .affiliation.eu {
		background: rgba(184, 92, 0, 0.15);
		color: rgb(184, 92, 0);
	}

	.country-tooltip .affiliation.lmg {
		background: rgba(0, 128, 0, 0.15);
		color: darkgreen;
	}
</style>
