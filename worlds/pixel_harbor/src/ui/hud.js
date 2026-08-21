/**
 * RPG HUD, built as ordinary DOM layered over the WebGL canvas.
 *
 * Keeping the UI out of the 3D scene means it stays sharp at native resolution
 * while the world underneath renders at a third of it -- which is exactly how
 * real pixel-art games ship their interface.
 */

const MAP_SIZE = 52;

export function createHud(stage, { onViewChange }) {
  const hud = document.createElement('div');
  hud.id = 'hud';
  stage.appendChild(hud);

  // ---------------------------------------------------------------- season
  // Top left: the corner the quest panel vacated. Seasons are world state that
  // the player changes, so this belongs with the other world controls rather
  // than in the developer panel.
  const seasonPanel = panel(hud, 'hud-season');
  seasonPanel.innerHTML = '<span class="label">Season</span>';
  const seasonRow = document.createElement('div');
  seasonRow.className = 'season-row';
  seasonPanel.appendChild(seasonRow);

  // ---------------------------------------------------------------- clock
  const clock = panel(hud, 'hud-clock');
  clock.innerHTML = `
    <div class="season">Spring 12</div>
    <div class="year">Yr 1</div>
    <div class="weather"><span class="icon">\u2600</span>Sunny</div>
    <div class="time">08:20</div>
  `;
  const timeEl = clock.querySelector('.time');

  // ---------------------------------------------------------------- tasks
  // The quest list is not displayed this phase: the debug bar now owns the top
  // left corner. The data is kept here so wiring it back to a panel later is a
  // one-line change rather than a rewrite.
  const TASKS = [
    { text: 'Repair the east pier planks', done: false },
    { text: 'Deliver 3 crates to the ferry', done: false },
    { text: 'Talk to the harbourmaster', done: true },
  ];

  // ---------------------------------------------------------------- map
  const map = panel(hud, 'hud-map');
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = MAP_SIZE;
  mapCanvas.height = MAP_SIZE;
  map.appendChild(mapCanvas);
  const mapLabel = document.createElement('div');
  mapLabel.className = 'maplabel';
  mapLabel.textContent = 'Pixel Harbor';
  map.appendChild(mapLabel);
  // A permanent, quiet north marker; the full N/E/S/W ring is a debug toggle.
  const compass = document.createElement('div');
  compass.className = 'compass';
  compass.innerHTML = '<span class="n">N</span><span class="e">E</span><span class="s">S</span><span class="w">W</span>';
  map.appendChild(compass);
  const mapCtx = mapCanvas.getContext('2d');
  mapCtx.imageSmoothingEnabled = false;

  // ---------------------------------------------------------------- view switch
  const view = panel(hud, 'hud-view');
  const btn2d = document.createElement('button');
  btn2d.textContent = '2D View';
  btn2d.className = 'active';
  const btn3d = document.createElement('button');
  btn3d.textContent = '3D View';
  view.append(btn2d, btn3d);

  btn2d.addEventListener('click', () => setView('2d'));
  btn3d.addEventListener('click', () => setView('3d'));

  function setView(mode) {
    btn2d.classList.toggle('active', mode === '2d');
    btn3d.classList.toggle('active', mode === '3d');
    onViewChange(mode);
  }

  // ---------------------------------------------------------------- style switcher
  // Sits with the view buttons, because it is the same class of control: how
  // you are looking at the world, not what is in it.
  const styleBar = panel(hud, 'hud-style');
  styleBar.innerHTML = '<span class="label">Style</span>';
  const styleSelect = document.createElement('select');
  styleSelect.id = 'style-select';
  styleBar.appendChild(styleSelect);

  // ---------------------------------------------------------------- audio
  const audioPanel = panel(hud, 'hud-audio');
  const muteButton = document.createElement('button');
  muteButton.type = 'button';
  muteButton.className = 'mute';
  muteButton.textContent = '\u266A off';
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '0'; volume.max = '1'; volume.step = '0.05'; volume.value = '0.5';
  volume.className = 'vol';
  audioPanel.append(muteButton, volume);

  // ---------------------------------------------------------------- readout
  const readout = panel(hud, 'hud-readout');

  // The readout is centred with translateX(-50%), which lands on a half pixel
  // whenever its width is odd. Pinning it to a whole-pixel `left` keeps every
  // glyph on the grid -- the same rule the renderer follows.
  function pinReadout() {
    readout.style.transform = 'none';
    const stageWidth = stage.clientWidth;
    const w = readout.offsetWidth;
    readout.style.left = `${Math.round((stageWidth - w) / 2)}px`;
  }
  const pinObserver = new ResizeObserver(pinReadout);
  pinObserver.observe(stage);

  // The clock lives in the world layer now (the sun derives its bearing from
  // the same number), so the panel only displays what it is handed.

  return {
    tasks: TASKS,
    setView,

    /** Build the season buttons from the registry. */
    buildSeasonPicker(seasons, current, onPick) {
      seasonRow.innerHTML = '';
      for (const name of seasons) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.season = name;
        button.textContent = name.slice(0, 2).toUpperCase();
        button.title = name;
        button.className = name === current ? 'active' : '';
        button.addEventListener('click', () => onPick(name));
        seasonRow.appendChild(button);
      }
    },
    syncSeason(name) {
      for (const b of seasonRow.querySelectorAll('button')) {
        b.classList.toggle('active', b.dataset.season === name);
      }
    },

    /** Populate the switcher from the registry, future styles included. */
    buildStyleSwitcher(styleManager) {
      styleSelect.innerHTML = '';
      for (const profile of styleManager.list) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.future ? `${profile.name} (future)` : profile.name;
        option.disabled = !!profile.future;
        option.title = profile.future ? profile.reason : profile.strategy;
        styleSelect.appendChild(option);
      }
      styleSelect.value = styleManager.current?.id ?? styleManager.list[0].id;
      styleSelect.addEventListener('change', () => {
        styleManager.apply(styleSelect.value);
      });
    },

    syncStyleSwitcher(styleManager) {
      if (styleManager.current) styleSelect.value = styleManager.current.id;
    },

    setStyleName() { /* the switcher itself already shows it */ },

    /**
     * Wire the audio controls. The first click is what actually starts the
     * AudioContext — browsers will not allow it any earlier.
     */
    bindAudio(audio) {
      muteButton.addEventListener('click', () => {
        if (!audio.ready) audio.start();
        else audio.setEnabled(!audio.enabled);
        muteButton.textContent = audio.enabled ? '\u266A on' : '\u266A off';
        muteButton.classList.toggle('active', audio.enabled);
      });
      volume.addEventListener('input', () => audio.setVolume(Number(volume.value)));
    },

    update(dt, info) {
      if (info.clock) timeEl.textContent = info.clock;
      if (info.seasonLabel) clock.querySelector('.season').textContent = info.seasonLabel;
      if (info.weather) clock.querySelector('.weather').innerHTML =
        `<span class="icon">${info.weatherIcon ?? '\u2600'}</span>${info.weather}`;

      readout.innerHTML =
        `<b>INTERNAL</b> ${info.internal} &nbsp;` +
        `<b>OUTPUT</b> ${info.output} &nbsp;` +
        `<b>SCALE</b> ${info.scale}x &nbsp;` +
        `<b>VIEW</b> ${info.view.toUpperCase()} &nbsp;` +
        `<b>BUFFER</b> ${info.debug} &nbsp;` +
        `<b>STYLE</b> ${info.style} &nbsp;` +
        `<b>FPS</b> ${info.fps}`;

      pinReadout();
      drawMiniMap(mapCtx, info.characterT, info.characterX);
    },
  };
}

function panel(parent, id) {
  const el = document.createElement('div');
  el.className = 'panel';
  el.id = id;
  parent.appendChild(el);
  return el;
}

/**
 * Placeholder mini map: a schematic top-down of the harbour drawn straight into
 * a 48x48 canvas, then upscaled by CSS with image-rendering: pixelated.
 */
function drawMiniMap(ctx, characterT, characterX) {
  const S = MAP_SIZE;
  ctx.clearRect(0, 0, S, S);

  // sea, in the same discrete bands the water shader uses
  ctx.fillStyle = '#1b4f74'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#2d7ba0'; ctx.fillRect(0, 4, S, 22);
  ctx.fillStyle = '#49a6bd'; ctx.fillRect(0, 22, S, 6);

  // beach + land
  ctx.fillStyle = '#dcc489'; ctx.fillRect(0, 27, S, 5);
  ctx.fillStyle = '#5f9c4c'; ctx.fillRect(0, 31, S, S - 31);

  // rocky headland, right
  ctx.fillStyle = '#8f9099'; ctx.fillRect(40, 24, 12, 8);

  // dirt path
  ctx.fillStyle = '#8a6b45';
  ctx.fillRect(14, 36, 14, 2);
  ctx.fillRect(26, 33, 3, 4);
  ctx.fillRect(28, 37, 10, 2);

  // pier
  ctx.fillStyle = '#b07f45'; ctx.fillRect(24, 5, 4, 27);
  ctx.fillStyle = '#6f4a26'; ctx.fillRect(24, 5, 4, 1);

  // buildings
  ctx.fillStyle = '#b8503f'; ctx.fillRect(12, 38, 7, 6);
  ctx.fillStyle = '#8f3c30'; ctx.fillRect(12, 38, 7, 1);
  ctx.fillStyle = '#44688f'; ctx.fillRect(33, 40, 6, 5);
  ctx.fillStyle = '#33506f'; ctx.fillRect(33, 40, 6, 1);

  // trees
  ctx.fillStyle = '#3a7238';
  for (const [x, y] of [[5, 39], [8, 43], [20, 45], [30, 46], [44, 38], [47, 43]]) {
    ctx.fillRect(x, y, 3, 3);
  }

  // boats
  ctx.fillStyle = '#eee5d0';
  ctx.fillRect(31, 13, 3, 4);
  ctx.fillRect(16, 9, 2, 3);

  // character marker: rides the pier lengthwise and shifts across its width
  const y = 30 - Math.max(0, Math.min(1, characterT)) * 24;
  const x = 24 + Math.max(0, Math.min(1, characterX ?? 0.5)) * 3;
  ctx.fillStyle = '#17222e'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 4, 4);
  ctx.fillStyle = '#e0b64a'; ctx.fillRect(Math.round(x), Math.round(y), 2, 2);

  // frame
  ctx.strokeStyle = '#6d4a2a';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
}
