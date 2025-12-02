<script>
	import "$styles/scoped-where.css";

	let { children } = $props();
</script>

<main id="content">
	{@render children?.()}
</main>
