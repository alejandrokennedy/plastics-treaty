<script>
	import { setContext } from "svelte";
	import { browser } from "$app/environment";
	import Meta from "$components/Meta.svelte";
	import Index from "$components/Index.svelte";
	import copy from "$data/copy.json";
	import version from "$utils/version.js";

	let { data } = $props();

	version();

	const preloadFont = [
		"https://rsms.me/inter/font-files/InterVariable.woff2?v=4.1"
	];

	const { title, description, url, keywords } = copy;
	setContext("copy", copy);
	setContext("data", data);
	setContext("chapters", data.chapters);
</script>

<Meta {title} {description} {url} {preloadFont} {keywords} />
<Index />
