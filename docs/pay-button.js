// MUSD Books "Pay with MUSD" button for merchants.
// <div data-musd-pay data-to="0x..." data-amount="25" data-ref="INV-1" data-net="testnet"></div>
// <script async src="https://neimasilk.github.io/musd-books/pay-button.js"></script>
// Renders a link to the MUSD Books pay page. Nothing is sent anywhere until the customer opens it and signs in their own wallet.
(() => {
  const BASE = new URL('./', (document.currentScript && document.currentScript.src) || location.href).href;
  const ADDR = /^0x[0-9a-fA-F]{40}$/, AMOUNT = /^\d+(\.\d{1,18})?$/;
  const STYLE = 'display:inline-block;padding:10px 18px;border-radius:8px;font:600 15px system-ui,sans-serif;text-decoration:none;';
  const render = (el) => {
    const to = el.dataset.to || '', amount = el.dataset.amount || '', ref = el.dataset.ref || '', net = el.dataset.net === 'mainnet' ? 'mainnet' : 'testnet';
    const a = document.createElement('a');
    const bad = !ADDR.test(to) || !AMOUNT.test(amount) || Number(amount) <= 0 || !ref || new TextEncoder().encode(ref).length > 96;
    if (bad) {
      a.textContent = 'Pay with MUSD (invalid settings)';
      a.setAttribute('aria-disabled', 'true');
      a.style.cssText = STYLE + 'background:#ddd;color:#777;cursor:not-allowed';
    } else {
      a.href = BASE + '?' + new URLSearchParams({ pay: to, amount, ref, net }).toString();
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `Pay ${amount} MUSD`;
      a.style.cssText = STYLE + 'background:#f7931a;color:#1a1a1a';
    }
    el.replaceChildren(a);
  };
  const run = () => document.querySelectorAll('[data-musd-pay]').forEach(render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
