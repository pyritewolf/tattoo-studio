<script>
  import { calculations } from '../store.js'

  const cash = 8500;
  const digitalPaymentModifier = 1.1;
  const studioPercentage = 0.7;
  const artistPercentage = 0.3;
  
  $: digitalPayment = cash * digitalPaymentModifier;
  $: studioCut = cash * studioPercentage;
  $: artistCut = cash * artistPercentage;

  $: calculations.set({...$calculations, cash })
  $: calculations.set({...$calculations, digitalPayment })
</script>

Efectivo: {cash}
Mercadopago: {digitalPayment}

Estudio: {studioCut}
Artista: {artistCut}

<style>
</style>
