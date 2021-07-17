<script lang="ts">
	import Message from './components/Message.svelte';
	import Calculation from './components/Calculation.svelte';
</script>

<main>
	<Calculation />
	<Message />
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: center;
		padding: 1em;
		margin: 0 auto;
		width: 60%;
		height: 100%;
	}

	@media (max-width: 768px) {
		main { width: 100%; }
	}
</style>
