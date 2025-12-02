<script>
	import "$styles/scoped-where.css";

	let { children } = $props();
</script>

<!-- <main id="content"> -->
<div id="content">
	{@render children?.()}
</div>
