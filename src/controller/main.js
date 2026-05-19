// Controller mode entry — runs on the mobile device at "/play"
// Step 1: route smoke-test only. Slot assignment + controller UI lands in Step 3.

const root = document.getElementById('controller-root');
root.innerHTML = `
  <div style="
    position:absolute; inset:0;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    gap:20px; text-align:center; padding:24px;
  ">
    <div style="
      font-size:32px; letter-spacing:4px;
      background:linear-gradient(90deg,#4dd2ff,#d966ff,#ffa64d);
      -webkit-background-clip:text; background-clip:text; color:transparent;
    ">NEXTIS LAB</div>
    <div style="font-size:14px; opacity:.55; letter-spacing:3px;">CONTROLLER · /play</div>
    <div style="font-size:12px; opacity:.35;">step 1 · routing skeleton</div>
  </div>
`;

console.log('[controller] mounted at', location.pathname);
