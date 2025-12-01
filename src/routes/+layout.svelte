<script>
	import "$styles/test-scoped-where.css";
	// import "$styles/app.css";
	// import "$styles/plastics-treaty-minimal.css";
	// import Header from "$components/Header.svelte";

	let { children } = $props();
</script>

<!-- <Header /> -->
<main id="content">
	{@render children?.()}
</main>
