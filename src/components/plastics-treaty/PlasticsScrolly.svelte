<!--
  margin
  ordinal scale
  scale band
  draw rects
  derive unitPath
  add unitPath to countries object
  sort units (by pop)
  position/tweak unit chart
  axes
    x: affiliation
    y: countries? flags?
  base margins on w&h
-->
<script lang="ts">
	import { getContext } from "svelte";
	import Scrolly from "$components/helpers/Scrolly.svelte";
	import worldCountries from "$data/worldCountries.json";
	import countryData from "$data/populationAffiliation.csv";
	import {
		geoPath,
		scaleOrdinal,
		scaleBand,
		index,
		rollup,
		range,
		color as d3color
	} from "d3";
	import { geoWinkel3 } from "d3-geo-projection";
	import { feature, mesh } from "topojson-client";

	countryData.forEach((d) => {
		((d.LocationId = +d.LocationId),
			(d.Value = +d.Value),
			(d.affId = +d.affId));
	});
	$inspect("countryData", countryData);
	const cDataFiltered = countryData.filter(
		(d) => d.Affiliation || d.euExplicit
	);
	$inspect("cDataFiltered", cDataFiltered);
	// $inspect("cDataFiltered.length", cDataFiltered.length);

	const chapters = getContext("chapters");

	let step = $state(null);
	let width = $state(600);
	let height = $state(400);
	// Convert geometry IDs from strings to numbers
	const processedGeo = feature(
		worldCountries,
		worldCountries.objects.countries
	);
	processedGeo.features.forEach((f) => {
		f.id = +f.id; // Convert string IDs like "004" to numbers like 4
	});
	let geojson = $state(processedGeo);
	let projection = $derived(geoWinkel3().fitSize([width, height], geojson));
	let pathGenerator = $derived(geoPath(projection));
	let countryIndex = $derived(index(countryData, (d) => d.LocationId));
	let affiliationRollup = $derived(
		rollup(
			countryData,
			(v) => v.length,
			(d) => d.Affiliation
		)
	);
	let euExplicitRollup = $derived(
		rollup(
			countryData,
			(v) => v.length,
			(d) => d.euExplicit
		)
	);
	let yMax = $derived(
		affiliationRollup.get("hac") + euExplicitRollup.get("FALSE")
	);

	$inspect("affiliationRollup", affiliationRollup);
	$inspect("euExplicitRollup", euExplicitRollup);
	$inspect("yMax", yMax);

	// for unit chart
	const margin = { top: 20, left: 300, bottom: 20, right: 300 };
	let xScale = $derived(
		scaleBand()
			.domain(["hac", "lmg"])
			.range([margin.left, width - margin.right])
			.paddingInner(0.03)
			.paddingOuter(1.5)
	);
	let yScale = $derived(
		scaleBand()
			.domain(range(0, yMax))
			.range([height - margin.bottom, margin.top])
			.paddingInner(0.2)
	);

	// Enhance countries with affiliation data and computed fill color
	let countries = $derived(
		geojson?.features.map((country) => {
			const d = countryIndex.get(country.id) || null;
			const affiliation = d?.Affiliation || "";
			const euExplicit = d?.euExplicit || "";

			// console.log("---");
			// console.log("d", d);

			let fill = "whitesmoke"; // default color
			// if (step > 0 && affiliation === "hac") {
			if (step > 0 && affiliation === "hac") {
				fill = color("hac");
			}
			if (step > 1 && affiliation === "lmg") {
				fill = color("lmg");
			}
			if (step > 2 && euExplicit === "FALSE") {
				fill = color("hacAligned");
			}

			return {
				...country,
				path: pathGenerator(country),
				affiliation,
				fill
			};
		}) ?? []
	);

	const hacColor = "orange",
		lmgColor = "green";
	const alignedColor = d3color(hacColor).darker(0.7).formatHex();
	const color = scaleOrdinal()
		.domain(["hac", "lmg", "hacAligned"])
		.range([hacColor, lmgColor, alignedColor]);
</script>

<section id="plastics-scrolly">
	<div id="viz-container" bind:clientWidth={width} bind:clientHeight={height}>
		<svg id="svg" {width} {height}>
			<g id="units">
				{#each cDataFiltered as { Affiliation, affId }, i}
					{console.log(i)}
					{console.log("yScale(affId)", yScale(affId))}
					<rect
						x={xScale(Affiliation) || xScale("hac")}
						y={yScale(affId)}
						width={xScale.bandwidth()}
						height={yScale.bandwidth()}
						fill={Affiliation ? color(Affiliation) : color("hacAligned")}
					></rect>
				{/each}
			</g>
			<g id="country-group">
				{#each countries as { path, fill }}
					<path d={path} {fill}></path>
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
