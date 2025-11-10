<script>
	import { getContext } from "svelte";
	import PlasticsTreaty from "$components/plastics-treaty/PlasticsTreaty.svelte";

	// const copy = getContext("copy");
	// const data = getContext("data");
</script>

<svelte:boundary onerror={(e) => console.error(e)}>
	<PlasticsTreaty />
</svelte:boundary>
