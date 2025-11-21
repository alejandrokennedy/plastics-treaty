<script lang="ts">
	import {
		geoPath,
		scaleOrdinal,
		scaleBand,
		scaleLinear,
		index,
		rollup,
		range,
		csv,
		sum,
		color as d3color
	} from "d3";
	import Scrolly from "$components/helpers/Scrolly.svelte";
	import { getContext, onMount } from "svelte";
	import { browser } from "$app/environment";
	import { Tween } from "svelte/motion";
	import worldOneTen from "$data/worldOneTen.json";
	import worldFifty from "$data/worldFifty.json";
	import worldTen from "$data/worldTen.json";
	import countryData from "$data/populationAffiliation.csv";
	import { geoWinkel3 } from "d3-geo-projection";
	import { feature } from "topojson-client";
	import * as flubber from "flubber";
	import { fade } from "svelte/transition";

	// const chaptersRaw = getContext("chapters");
	// const chapters = chaptersRaw.map((c) => ({
	// 	...c,
	// 	progress1: c.progress1 != null ? +c.progress1 : 0,
	// 	progress2: c.progress2 != null ? +c.progress2 : 0
	// }));

	let chapters = $state([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const chaptersUrl =
		"https://docs.google.com/spreadsheets/d/e/2PACX-1vRa1NZXIvX-dy8v7LuKi6witAHmbcXtyWBm2Bs6jXNdX6Z28QhiFcC1h58B_Pj0Bnd1xBltCeNCZGSw/pub?gid=0&single=true&output=csv";

	onMount(() => {
		const controller = new AbortController();

		const fetchData = async (url: string) => {
			loading = true;
			error = null;

			try {
				const result = await csv(url, {
					signal: controller.signal
				});

				// Process the fetched data
				chapters = result.map((c) => ({
					...c,
					progress1: c.progress1 != null ? +c.progress1 : 0,
					progress2: c.progress2 != null ? +c.progress2 : 0
				}));

				// console.log("Fetched chapters:", chapters);
			} catch (err) {
				if (err instanceof Error && err.name === "AbortError") {
					return; // Component unmounted
				}
				error = err instanceof Error ? err.message : "Failed to fetch data";
				console.error(`Error fetching data:`, err);
			} finally {
				loading = false;
			}
		};

		fetchData(chaptersUrl);

		return () => {
			controller.abort();
		};
	});

	// $inspect("chapters", chapters);

	countryData.forEach((d) => {
		((d.LocationId = +d.LocationId),
			(d.Value = +d.Value),
			(d.affId = +d.affId));
	});

	let step = $state(null);
	let width = $state(600);
	let height = $state(400);

	const tweenConfig = {
		duration: 800,
		easing: (t) => t * t * (3 - 2 * t) // Smoothstep
	};

	const progress1 = new Tween(0, tweenConfig);
	const progress2 = new Tween(0, tweenConfig);

	// Multi-resolution compositing: combine features from all three resolutions
	// Start with 110m (smallest file), then add missing from 50m, then 10m
	const geoOneTen = feature(worldOneTen, worldOneTen.objects.countries);
	const geoFifty = feature(worldFifty, worldFifty.objects.countries);
	const geoTen = feature(worldTen, worldTen.objects.countries);

	// Convert all IDs from strings to numbers
	[geoOneTen, geoFifty, geoTen].forEach((geo) => {
		geo.features.forEach((f) => {
			f.id = +f.id;
		});
	});

	// Create index of existing IDs from 110m resolution
	const existingIds = new Set(geoOneTen.features.map((f) => f.id));

	// Add missing features from 50m resolution
	geoFifty.features.forEach((feature) => {
		if (!existingIds.has(feature.id)) {
			geoOneTen.features.push(feature);
			existingIds.add(feature.id);
		}
	});

	// Add missing features from 10m resolution
	geoTen.features.forEach((feature) => {
		if (!existingIds.has(feature.id)) {
			geoOneTen.features.push(feature);
			existingIds.add(feature.id);
		}
	});

	const processedGeo = geoOneTen;
	// console.log(
	// 	`Total countries after compositing: ${processedGeo.features.length}`
	// );
	// console.log("processedGeo", processedGeo);

	let geojson = $state(processedGeo);

	// let projection = $derived(
	// 	geoWinkel3().rotate([-10.2, 0]).fitSize([width, height], geojson)
	// );

	let leftSpace = $derived(width < 768 ? 0 : Math.min(width * 0.15, 150)); // No space on mobile
	let rightMapTrim = $derived((width + leftSpace) * 0.07);

	// $inspect("leftSpace", leftSpace);

	let projection = $derived(
		geoWinkel3()
			.rotate([-10.2, 0])
			.fitExtent(
				[
					[leftSpace, 0],
					[width + rightMapTrim, height]
					// [0, 0],
					// [width, height]
				],
				geojson
			)
	);

	let pathGenerator = $derived(geoPath(projection));
	let countryIndex = $derived(index(countryData, (d) => d.LocationId));
	let affiliationRollup = $derived(
		rollup(
			countryData,
			(v) => v.length,
			(d) => d.Affiliation
		)
	);

	// scales setup
	const maxXWidth = $derived(Math.max(Math.min(500, width * 0.7), 230));
	const margin = $derived({
		top: 20,
		left: width / 2 - maxXWidth / 2 + leftSpace,
		bottom: 20,
		right: width / 2 - maxXWidth / 2
	});
	let xScale = $derived(
		scaleBand()
			.domain(["hac", "lmg"])
			.range([margin.left, width - margin.right])
			.paddingInner(0.03)
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
	const popDiff = sum(lmgGroup, (d) => d.Value) - sum(hacGroup, (d) => d.Value);

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
			Location: c.Location || ""
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
					// console.warn("Failed to combine MultiPolygon");
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
				interpol1,
				interpol2,
				Location: d?.Location
			};
		}) ?? []
	);

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

	// Update tween targets based on step
	$effect(() => {
		const chapter = chapters[step];
		if (chapter) {
			progress1.target = chapter.progress1;
			progress2.target = chapter.progress2;
		}
	});

	const currentPaths = $derived.by(() => {
		if (step === null || step === undefined || step < 3) {
			return countries.map((c) => c.path1);
		}
		if (step >= 5) return paths2;
		if (step === 4) return progress2.current > 0 ? paths2 : paths1;
		if (step === 3) return paths1;
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
</script>

{#if chapters.length > 0}
	<section id="plastics-scrolly">
		<div id="viz-container" bind:clientWidth={width} bind:clientHeight={height}>
			<svg id="svg" {width} {height}>
				{#if step < 4 && step != null}
					<g transition:fade id="static-countries">
						{#each staticCountries as { path, Location }}
							<path d={path} fill="whitesmoke">
								{#if Location}
									<title>{Location}</title>
								{/if}
							</path>
						{/each}
					</g>
				{/if}
				{#if step != null}
					<g transition:fade id="country-group">
						{#each countries as { Location }, i}
							<path d={currentPaths[i]} fill={countryFills[i]}>
								{#if Location}
									<title>{Location}</title>
								{/if}
							</path>
						{/each}
					</g>
				{/if}
			</svg>
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
	#country-background {
		fill: blue;
	}

	#country-group {
		stroke: white;
		stroke-width: 0.7px;
	}

	#static-countries {
		stroke: white;
		fill: whitesmoke;
	}

	#country-group path {
		transition: fill 0.16s ease-in-out;
	}

	#viz-container {
		position: sticky;
		top: calc(65px + 56px);
		border: 2px solid orangered;
		/*height: 100vh;*/
		height: calc(100vh - calc(65px + 56px) - 70px);
		z-index: 1;
	}

	.units,
	.stack {
		opacity: 0.2;
	}

	.steps-container {
		position: relative;
		z-index: 2;
		/*opacity: 0.6;*/
		min-width: 15rem;
		width: 30vw;
		max-width: 50rem;
	}

	.step {
		padding-top: 20vh;
		padding-bottom: 60vh;
		/*border: 1px solid gold;*/
		text-align: center;
		position: relative; /* needed? */
	}

	.step p {
		padding: 1rem;
		background: var(--color-gray-100);
		font-size: 1rem;
		background: whitesmoke;
		color: #ccc;
		border-radius: 5px;
		transition: background 500ms ease;
		box-shadow: 1px 1px 10px rgba(0, 0, 0, 0.2);
		text-align: left;
		width: 75%;
		margin: auto;
		max-width: 500px;
		/*display: flex;
		flex-direction: column;
		justify-content: center;*/
	}

	.step p :global(span) {
		background-color: orange;
		padding: 0.1em 0.3em;
		border-radius: 4px;
	}

	.step.active p {
		background: white;
		color: black;
	}

	@media screen and (max-width: 768px) {
		/*.section-container {
			flex-direction: column-reverse;
		}*/

		/*#viz-container {
			width: 95%;
			margin: auto;
		}*/

		.steps-container {
			width: 100%;
		}
	}
</style>
