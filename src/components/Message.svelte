<script>
  import { calculations } from '../store.js'
  const value = `Un tattoo con esas características estaría ${$calculations.digitalPayment} si abonás con MercadoPago (permite pagar en cuotas, te recomiendo consultar en https://www.mercadopago.com.ar/ayuda/medios-de-pago-cuotas-promociones_264 qué promociones o recargos aplican para tu tarjeta y tu banco); o en efectivo / transferencia se aplicaría un descuento y quedaría en ${$calculations.cash}`;
</script>

<textarea {value}/>

<style>
  textarea {
    width: 100%;
    padding: var(--gap-md);
    border: none;
    border-radius: var(--radius);
    background-color: var(--lighter-gray);
    min-height: 300px;
    border: 2px solid transparent;
  }

  textarea:focus {
    outline: none;
    border-color: var(--blue);
    border-radius: var(--radius);
  }
</style>
