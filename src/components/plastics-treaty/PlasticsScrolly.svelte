<!--
  sort units (by pop)
  make sure only needed countries are added to geoOneTen (adjust compositing)
  make json from composit (in other file), import json
  position/tweak unit chart
  remove interpolators for non-tranitioning countries (break countries into two groups?)
  axes
    x: affiliation
    y: countries? flags?
  base margins on w&h
  add typescript, fix errors
  install types
-->

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
	import { tweened } from "svelte/motion";
	import worldOneTen from "$data/worldOneTen.json";
	import worldFifty from "$data/worldFifty.json";
	import worldTen from "$data/worldTen.json";
	import countryData from "$data/populationAffiliation.csv";
	import { geoWinkel3 } from "d3-geo-projection";
	import { feature } from "topojson-client";
	import * as flubber from "flubber";

	const chapters = getContext("chapters");
	// let chapters = $state([]);

	// let loading = $state(true);
	// let error = $state<string | null>(null);

	// const chaptersUrl =
	// 	"https://docs.google.com/spreadsheets/d/e/2PACX-1vRkBD_sIXbVLDPBA2y5mlJviA-Xj2uDa6ZTGZQvr7By3Bf-H0uFpCGWh0RvglX-XtodPkQgQmcizFLC/pub?gid=569490652&single=true&output=csv";

	// onMount(() => {
	// 	const controller = new AbortController();

	// 	const fetchData = async (url: string) => {
	// 		loading = true;
	// 		error = null;

	// 		try {
	// 			const result = await csv(url, {
	// 				signal: controller.signal
	// 			});
	// 			chapters = result;
	// 		} catch (err) {
	// 			if (err instanceof Error && err.name === "AbortError") {
	// 				return; //Component unmounted
	// 			}
	// 			error = err instanceof Error ? err.message : "Failed to fetch data";
	// 			console.error(`error fetching data: ${err}`);
	// 		} finally {
	// 			loading = false;
	// 		}
	// 	};

	// 	fetchData(chaptersUrl);

	// 	return () => {
	// 		controller.abort();
	// 	};
	// });

	// $inspect("chapters", chapters);

	countryData.forEach((d) => {
		((d.LocationId = +d.LocationId),
			(d.Value = +d.Value),
			(d.affId = +d.affId));
	});

	const cDataFiltered = countryData.filter((d) => d.Affiliation);

	let step = $state(null);
	let width = $state(600);
	let height = $state(400);

	// Tweened progress (0 to 1) for smooth morphing animation
	const progress = tweened(0, {
		duration: 5800, // Animation duration in milliseconds
		easing: (t) => t * t * (3 - 2 * t) // Smoothstep easing
	});

	// Update progress when step changes
	$effect(() => {
		if (step === null || step === undefined || step < 4) {
			progress.set(0);
		} else if (step === 4) {
			progress.set(1);
		} else {
			progress.set(1);
		}
	});

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
	let projection = $derived(
		geoWinkel3().rotate([-10.2, 0]).fitSize([width, height], geojson)
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
	const margin = { top: 20, left: 300, bottom: 20, right: 300 };
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

	// Enhance countries with affiliation data and computed fill color
	let countries = $derived(
		geojson?.features.map((country) => {
			const d = countryIndex.get(country.id) || null;
			const affiliation = d?.Affiliation || "";
			const euExplicit = d?.euExplicit || "";
			const affId = d?.affId ?? null;
			const path1 = pathGenerator(country);

			let currentPath;

			if (!affiliation) {
				currentPath = path1;
			} else {
				// Validate all rectangle parameters before creating interpolator
				const x = xScale(affiliation) || xScale("hac");
				const y = yScale(affId);
				const width = xScale.bandwidth();
				const height = yScale.bandwidth();
				// Handle MultiPolygons using flubber.combine() to morph ALL pieces to rectangle
				if (country.geometry.type === "MultiPolygon" && browser) {
					// Extract all polygons from the MultiPolygon (not just the largest)
					const polygons = country.geometry.coordinates;
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
					// Create the target rectangle as an SVG path string
					const rectPath = `M${x},${y}L${x + width},${y}L${x + width},${y + height}L${x},${y + height}Z`;

					try {
						// Use flubber.combine to morph all polygon pieces into one rectangle
						const interpolator = flubber.combine(
							polygonPaths, // FROM: all pieces of the country (e.g., Russia's islands + mainland)
							rectPath, // TO: one rectangle
							{ single: true } // Return one combined path string
						);
						currentPath = interpolator($progress);
					} catch (error) {
						// console.warn("Failed to combine MultiPolygon");
						// console.warn(
						// 	`Failed to combine MultiPolygon for ${d?.Location}:`,
						// 	error
						// );
						currentPath = path1;
					}
				} else {
					// Single polygon: use toRect to morph directly to rectangle
					const interpolator = browser
						? flubber.toRect(path1, x, y, width, height)
						: null;

					currentPath =
						browser && interpolator ? interpolator($progress) : path1;
				}
			}

			let fill = "whitesmoke"; // default color

			if (step > 0 && affiliation === "hac") {
				fill = color("hac");
			}
			if (step > 1 && affiliation === "lmg") {
				fill = color("lmg");
			}
			if (step > 2 && euExplicit === "no") {
				fill = color("eu");
			}

			return {
				...country,
				path1,
				currentPath,
				affiliation,
				fill,
				Location: d?.Location
			};
		}) ?? []
	);
</script>

<section id="plastics-scrolly">
	<div id="viz-container" bind:clientWidth={width} bind:clientHeight={height}>
		<svg id="svg" {width} {height}>
			<g class="stack">
				{#each cDataFiltered as { Affiliation, Location, LocationId }, i}
					<rect
						x={xScale(Affiliation) || xScale("hac")}
						y={yStackScale(stack.get(LocationId).endValue)}
						width={xScale.bandwidth()}
						height={yStackScale(stack.get(LocationId).startValue) -
							yStackScale(stack.get(LocationId).endValue)}
						fill={Affiliation ? color(Affiliation) : "blue"}
					>
						<title>{Location}</title>
					</rect>
				{/each}
			</g>
			<!-- <g class="units">
				{#each cDataFiltered as { Affiliation, affId, Location }, i}
					<rect
						x={xScale(Affiliation) || xScale("hac")}
						y={yScale(affId)}
						width={xScale.bandwidth()}
						height={yScale.bandwidth()}
						fill={Affiliation ? color(Affiliation) : color("eu")}
					>
						<title>{Location}</title>
					</rect>
				{/each}
			</g> -->
			<!-- <g id="country-background">
				{#each countries as { path1, fill, Location }}
					<path d={path1}>
						{#if Location}
							<title>{Location}</title>
						{/if}
					</path>
				{/each}
			</g> -->
			<g id="country-group">
				{#each countries as { currentPath, fill, Location }}
					<path d={currentPath} {fill}>
						{#if Location}
							<title>{Location}</title>
						{/if}
					</path>
				{/each}
			</g>
		</svg>
	</div>
	<div class="spacer"></div>
	<div class="steps-container">
		<Scrolly bind:value={step}>
			{#each chapters as { chapter }, i}
				{@const active = step === i}
				<div class="step text-outline" class:active>
					<p>{chapter}</p>
				</div>
			{/each}
		</Scrolly>
	</div>
</section>

<style>
	#country-background {
		fill: blue;
	}

	#country-group {
		stroke: white;
	}

	#country-group path {
		transition: fill 0.16s ease-in-out;
	}

	#viz-container {
		position: sticky;
		top: 0em;
		border: 2px solid orangered;
		height: 100vh;
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
		height: 70vh;
		/*background: var(--color-gray-100);*/
		text-align: center;
		position: relative; /* needed? */
	}

	.step p {
		padding: 1rem;
		/*background: var(--color-gray-100);*/
	}
</style>
