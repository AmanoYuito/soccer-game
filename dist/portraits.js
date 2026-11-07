/* Original pixel portraits share each player's saved appearance with match sprites. */
function portraitSVG(player, large = false) {
  const look = appearanceFor(player);
  const skin = skinPalette[look.skin];
  const hair = hairPalette[look.hair];
  const back = portraitBacks[playerHash(playerIdentity(player)) % portraitBacks.length];
  const jersey = player.pos === 'GK' ? '#e4ad4b' : '#e8e4c6';
  const shoulder = [10, 8, 6][look.build];
  const hairTop = [
    '<path d="M12 20h4v-4h8v-4h20v4h8v8h-4v-4h-8v4h-8v-4H20v4h-8z"/>',
    '<path d="M12 24v-8h8v-4h20v4h8v4h4v12h-4v-8h-8v-4H24v4h-8v8h-4z"/>',
    '<path d="M12 28V16h8v-4h24v4h8v12h-4v-8H20v4h-8z"/>',
    '<path d="M12 24v-4h4v-8h28v4h8v8h-4v-4H36v4H20v4h-4v4h-4z"/>',
    '<path d="M12 24v-8h8v-4h24v4h8v8h-4v-4H36v4h-8v-4h-8v8h-4v4h-4z"/>'
  ][look.hairStyle];
  const accessory = look.accessory === 1
    ? '<path d="M19 32h12v8H19zm14 0h12v8H33z" fill="none" stroke="#303d42" stroke-width="2"/><path d="M31 34h2" stroke="#303d42" stroke-width="2"/>'
    : look.accessory === 2
      ? '<path d="M15 22h34v3H15z" fill="#ede5c8"/>' : '';
  const name = String(player.name || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  return `<svg class="player-portrait${large ? ' portrait-large' : ''}" viewBox="0 0 64 64" role="img" aria-label="${name}の顔" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="64" height="64" fill="${back}"/><path d="M0 52h64v12H0z" fill="#263e43"/><path d="M${shoulder} 64V54h8v-4h${64 - shoulder * 2 - 16}v4h8v10z" fill="${jersey}"/><path d="M24 50h16v6H24z" fill="${skin}"/><path d="M16 24h32v20h-4v4H20v-4h-4z" fill="${skin}"/><path d="M12 32h4v8h-4zm36 0h4v8h-4z" fill="${skin}"/><g fill="${hair}">${hairTop}</g>${accessory}<path d="M23 34h4v4h-4zm14 0h4v4h-4z" fill="#26313a"/><path d="M31 38h2v4h-2z" fill="#a66f54"/><path d="M27 43h10v2H27z" fill="#8c4f49"/><path d="M16 56h6v8h-6zm26 0h6v8h-6z" fill="${player.pos === 'GK' ? '#7a5836' : '#4b7191'}"/></svg>`;
}
