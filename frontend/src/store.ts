import { writable } from 'svelte/store'

export const calculations = writable({})

export const message = writable(localStorage.getItem("message") ||`Un tattoo con esas características estaría {{mercadopago}} si abonás con MercadoPago (permite pagar en cuotas, te recomiendo consultar en https://www.mercadopago.com.ar/ayuda/medios-de-pago-cuotas-promociones_264 qué promociones o recargos aplican para tu tarjeta y tu banco); o en efectivo / transferencia se aplicaría un descuento y quedaría en {{efectivo}}`)
