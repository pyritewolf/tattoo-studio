<script>
  import { calculations } from '../store.js';
  import { parseCoin } from '../utils.js';

  let studioPercentage = 0.7;
  let artistPercentage = 0.3;
  let startingCalc = {
    cash: 8500,
    digitalPaymentModifier: 1.1
  };
  
  calculations.set({...$calculations, ...startingCalc})
  $: studioCut = ($calculations && $calculations.cash || 0) * studioPercentage;
  $: artistCut = ($calculations && $calculations.cash || 0) * artistPercentage;

</script>

<form>
  <fieldset>
    <label for="cash">Efectivo</label>
    {#if $calculations}
      <input name="cash" bind:value={$calculations.cash} type="number"/>
    {/if}
  </fieldset>
  <fieldset>
    <label for="cash">Mercadopago</label>
    <div class="row">
      {#if $calculations}
        <input name="cash" bind:value={$calculations.digitalPaymentModifier} type="number"/>
      {/if}
      {$calculations && parseCoin($calculations.digitalPaymentModifier * $calculations.cash)}
    </div>
  </fieldset>
  <fieldset>
    <label for="cash">Estudio</label>
    <div class="row">
      {#if $calculations}
        <input name="cash" bind:value={studioPercentage} type="number"/>
      {/if}
      {parseCoin(studioCut)}
    </div>
  </fieldset>
  <fieldset>
    <label for="cash">Artista</label>
    <div class="row">
      {#if $calculations}
        <input name="cash" bind:value={artistPercentage} type="number"/>
      {/if}
      {parseCoin(artistCut)}
    </div>
  </fieldset>
</form>
<style>
  form {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--gap-md);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .row > * {
    flex-basis: 50%;
    width: 50%;
  }
  
  fieldset {
    border: none;
    padding: var(--gap-sm) var(--gap-md);
    margin: 0;
    border-right: 1px solid var(--light-gray);
  }

  fieldset:last-of-type {
    border: 0;
  }

  label {
    font-weight: bold;
    margin-bottom: var(--gap-sm);
  }

  input {
    display: block;
    padding: var(--gap-sm);
    border: none;
    border-radius: var(--radius);
    background-color: var(--lighter-gray);
    border: 2px solid transparent;
    margin: 0;
  }

  input:focus {
    outline: none;
    border-color: var(--blue);
    border-radius: var(--radius);
  }
</style>
