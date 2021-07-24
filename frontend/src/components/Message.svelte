<script>
  import { calculations, message } from '../store.js';
  import { parseCoin } from '../utils.js';

  const mapping = {
    '{{mercadopago}}': (val) => val && parseCoin(val.cash * val.digitalPaymentModifier),
    '{{efectivo}}': (val) => val && parseCoin(val.cash),
  };
  let copyButtonText = "Copiar";
  let parsedValue;
  const initialStauts = "Tu mensaje va a guardarse automáticamente mientras escribís.";
  let status = initialStauts;

  const parseMessage = (str, calc) => {
    Object.keys(mapping).forEach(keyword => {
      const regex = new RegExp(keyword, 'g');
      str = str.replace(regex, mapping[keyword](calc));
    })
    parsedValue = str;
  };

  $: parseMessage($message, {...$calculations});
  
  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
  
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }

  const copy = async () => {
    if (!navigator.clipboard)
      fallbackCopyTextToClipboard(parsedValue);
    else
      navigator.clipboard.writeText(parsedValue);
    copyButtonText = "Copiado! ✨"
    setTimeout(() => copyButtonText  = "Copiar", 3000)
  }

  let throttling;
  let changingMessage;
  const throttledSave = (e) => {
    if (throttling) clearTimeout(throttling);
    console.log(e)
    throttling = setTimeout(() => {
      status = "Guardando..."
      message.update(() => {
        localStorage.setItem("message", e.target.value);
        return e.target.value;
      });
      status = "Guardado!"
      if (changingMessage) clearTimeout(changingMessage);
      changingMessage = setTimeout(() => status = initialStauts, 2000);
    }, 250)
  }
</script>
<div>
  <p class="status">{status}</p>
  <textarea bind:value={$message} on:input={throttledSave}/>
  <div class="row">
    <h2>Vista previa</h2>
    <button type="button" on:click={copy}>{copyButtonText}</button>
  </div>
  <p>{parsedValue}</p>
</div>
<style>
  .status {
    font-size: var(--font-sm);
  }
  
  textarea {
    width: 100%;
    padding: var(--gap-md);
    border: none;
    border-radius: var(--radius);
    background-color: var(--lighter-gray);
    min-height: 200px;
    border: 2px solid transparent;
  }

  textarea:focus {
    outline: none;
    border-color: var(--blue);
    border-radius: var(--radius);
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .row button {
    width: 30%;
    background: var(--blue);
    color: var(--lighter-gray);
    border: none;
    border-radius: var(--radius);
    height: 4rem;
    text-transform: uppercase;
    cursor: pointer;
  }
</style>
