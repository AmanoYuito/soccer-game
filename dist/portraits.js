/* Deterministic, original pixel portraits. No external images or saved data. */
function portraitSVG(player, large = false) {
  const id = Math.abs(Number(player.id) || 0);
  const skins = ['#f2bf91', '#dca075', '#bd7c58', '#996447', '#e5ae80'];
  const hairs = ['#282a30', '#503527', '#74503a', '#403d34', '#a16b36'];
  const backs = ['#86a99a', '#a4a083', '#8296b5', '#b29387', '#789e9f'];
  const skin = skins[id % skins.length];
  const hair = hairs[Math.floor(id / 3) % hairs.length];
  const back = backs[Math.floor(id / 7) % backs.length];
  const hairStyle = id % 4;
  const jersey = player.pos === 'GK' ? '#e4ad4b' : '#e8e4c6';
  const hairTop = [
    '<path d="M12 20h4v-4h8v-4h20v4h8v8h-4v-4h-8v4h-8v-4H20v4h-8z"/>',
    '<path d="M12 24v-8h8v-4h20v4h8v4h4v12h-4v-8h-8v-4H24v4h-8v8h-4z"/>',
    '<path d="M12 28V16h8v-4h24v4h8v12h-4v-8H20v4h-4v8h-4z"/>',
    '<path d="M12 24v-4h4v-8h28v4h8v8h-4v-4H36v4H20v4h-4v4h-4z"/>'
  ][hairStyle];
  const brows = id % 3 === 0 ? '<path d="M20 30h8m8 0h8" stroke-width="3"/>' : '<path d="M20 30h8m8 0h8" stroke-width="2"/>';
  const mouth = id % 3 === 1 ? '<path d="M27 43h10v2H27z" fill="#8c4f49"/>' : '<path d="M28 43h8v2h-8z" fill="#8c4f49"/>';
  const name = String(player.name || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<svg class="player-portrait${large ? ' portrait-large' : ''}" viewBox="0 0 64 64" role="img" aria-label="${name}の顔" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="64" height="64" fill="${back}"/><path d="M0 52h64v12H0z" fill="#263e43"/><path d="M8 64V54h8v-4h32v4h8v10z" fill="${jersey}"/><path d="M24 50h16v6H24z" fill="${skin}"/><path d="M16 24h32v20h-4v4H20v-4h-4z" fill="${skin}"/><path d="M12 32h4v8h-4zm36 0h4v8h-4z" fill="${skin}"/><g fill="${hair}">${hairTop}</g><g stroke="${hair}">${brows}</g><path d="M23 34h4v4h-4zm14 0h4v4h-4z" fill="#26313a"/><path d="M31 38h2v4h-2z" fill="#a66f54"/>${mouth}<path d="M16 56h6v8h-6zm26 0h6v8h-6z" fill="${player.pos === 'GK' ? '#7a5836' : '#4b7191'}"/></svg>`;
}
