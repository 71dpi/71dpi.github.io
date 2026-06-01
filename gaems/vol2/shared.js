// All 100 microgame slugs in PDF order
const GAMES = [
  'shave','plug','sting','catch','sneeze','unroll','dunk','slice','defuse','balance',
  'zit','thread','stomp','swat','parallel','toast','lick','unlock','pluck','inflate',
  'sort','ref','vacuum','scare','whack','pour','stamp','wipe','crush','fish',
  'twist','duck','peel','squeeze','match','zip','flip','hammer','pet','brake',
  'sharpen','mow','blow','shred','aim','scrub','stir','pop','type','fold',
  'knock','clog','paint','haul','feed','drill','toss','squirt','chop','dial',
  'bake','sweep','tickle','jump','dodge','saw','crack','iron','stack','lasso',
  'charge','knead','wink','amp','spray','dig','cover','tune','swig','seal',
  'wrap','burst','melt','unbox','light','clip','paddle','grip','launch','shake',
  'flick','plant','score','sew','brush','erase','spin','lock','squash','win',
];

// Emoji and tagline for each game (used by hub grid and fallback art)
const GAME_META = {
  shave:    { emoji: '🧔', tag: 'Swipe down to shave the beard' },
  plug:     { emoji: '🔌', tag: 'Drag the cable to the port' },
  sting:    { emoji: '🐝', tag: 'Tap when the bee is over the flower' },
  catch:    { emoji: '🧤', tag: 'Tilt to catch the baseball' },
  sneeze:   { emoji: '🤧', tag: 'Tap to keep a finger under your nose' },
  unroll:   { emoji: '🧻', tag: 'Swipe to empty the toilet paper roll' },
  dunk:     { emoji: '🗑️', tag: 'Flick the paper ball into the bin' },
  slice:    { emoji: '🥕', tag: 'Swipe as the carrot crosses the line' },
  defuse:   { emoji: '💣', tag: 'Tap the wire that matches the note' },
  balance:  { emoji: '🍽️', tag: 'Tilt to keep the plate stack upright' },
  zit:      { emoji: '😬', tag: 'Pinch the blemish' },
  thread:   { emoji: '🧵', tag: 'Drag the thread through the needle' },
  stomp:    { emoji: '🪳', tag: 'Tap the cockroach before it escapes' },
  swat:     { emoji: '🪰', tag: 'Tap the fly' },
  parallel: { emoji: '🚗', tag: 'Drag the car into the parking spot' },
  toast:    { emoji: '🍞', tag: 'Tap when the bread pops up' },
  lick:     { emoji: '🍦', tag: 'Swipe to finish the ice cream' },
  unlock:   { emoji: '📱', tag: 'Draw the unlock pattern' },
  pluck:    { emoji: '👴', tag: 'Tap the gray hair' },
  inflate:  { emoji: '🎈', tag: 'Tap to inflate the balloon' },
  sort:     { emoji: '🧦', tag: 'Swipe left for red, right for blue' },
  ref:      { emoji: '⚽', tag: 'Tap the whistle when the foul happens' },
  vacuum:   { emoji: '🌀', tag: 'Drag the vacuum over all the dirt' },
  scare:    { emoji: '😱', tag: 'Wait, then tap to jump out' },
  whack:    { emoji: '🦔', tag: 'Tap the mole' },
  pour:     { emoji: '🍺', tag: 'Tilt to fill the glass to the line' },
  stamp:    { emoji: '📋', tag: 'Tap the paper as it slides by' },
  wipe:     { emoji: '🌫️', tag: 'Rub to clear the foggy window' },
  crush:    { emoji: '🔨', tag: 'Tap when the object is centered' },
  fish:     { emoji: '🎣', tag: 'Tap when the bobber dips' },
  twist:    { emoji: '🔧', tag: 'Rotate to tighten the screw' },
  duck:     { emoji: '💨', tag: 'Swipe down to dodge' },
  peel:     { emoji: '🍊', tag: 'Swipe in a spiral to peel the orange' },
  squeeze:  { emoji: '🍅', tag: 'Tap and hold to get the last drop' },
  match:    { emoji: '🎰', tag: 'Tap to stop the reels on the same icon' },
  zip:      { emoji: '🧥', tag: 'Swipe up to close the zipper' },
  flip:     { emoji: '🥞', tag: 'Swipe up to flip the pancake' },
  hammer:   { emoji: '🔨', tag: 'Tap when the hammer aligns with the nail' },
  pet:      { emoji: '🐱', tag: 'Swipe gently to make the cat purr' },
  brake:    { emoji: '🚗', tag: 'Hold the brake before hitting the wall' },
  sharpen:  { emoji: '✏️', tag: 'Rotate until the light turns green' },
  mow:      { emoji: '🌿', tag: 'Drag the mower over all the grass' },
  blow:     { emoji: '🎂', tag: 'Blow into the mic to put out candles' },
  shred:    { emoji: '📄', tag: 'Drag the file into the shredder' },
  aim:      { emoji: '☄️', tag: 'Tilt to align crosshairs on the asteroid' },
  scrub:    { emoji: '🐥', tag: 'Rub the duck until it shines' },
  stir:     { emoji: '🥘', tag: 'Draw circles to mix the soup' },
  pop:      { emoji: '💆', tag: 'Tap all the bubbles' },
  type:     { emoji: '⌨️', tag: 'Tap the letters in order' },
  fold:     { emoji: '👕', tag: 'Swipe corners to fold the shirt' },
  knock:    { emoji: '🚪', tag: 'Tap the door in the rhythm shown' },
  clog:     { emoji: '🚽', tag: 'Tap the plunger to clear the toilet' },
  paint:    { emoji: '🖌️', tag: 'Swipe to fill in the stencil' },
  haul:     { emoji: '💵', tag: 'Tap the falling dollar bill' },
  feed:     { emoji: '🐕', tag: 'Drag the bone into the dog\'s mouth' },
  drill:    { emoji: '🔩', tag: 'Hold to drill through the board' },
  toss:     { emoji: '🗑️', tag: 'Swipe the paper into the bin' },
  squirt:   { emoji: '🪴', tag: 'Tap the hose to water the plant' },
  chop:     { emoji: '🍉', tag: 'Swipe diagonally through the watermelon' },
  dial:     { emoji: '☎️', tag: 'Rotate the dial to the right number' },
  bake:     { emoji: '🫕', tag: 'Tap Off exactly when the timer hits zero' },
  sweep:    { emoji: '🧹', tag: 'Swipe dust into the dustpan' },
  tickle:   { emoji: '🦶', tag: 'Rub the foot to fill the laugh meter' },
  jump:     { emoji: '👾', tag: 'Tap to jump over the pit' },
  dodge:    { emoji: '🔫', tag: 'Tilt to avoid the lasers' },
  saw:      { emoji: '🪵', tag: 'Swipe back and forth to cut the log' },
  crack:    { emoji: '🥚', tag: 'Tap the egg at the right power' },
  iron:     { emoji: '👔', tag: 'Swipe to iron out the wrinkles' },
  stack:    { emoji: '🧱', tag: 'Drag blocks to build a tower' },
  lasso:    { emoji: '🐄', tag: 'Draw a circle around the running cow' },
  charge:   { emoji: '⚡', tag: 'Tap rapidly to fill the power bar' },
  knead:    { emoji: '🫓', tag: 'Pinch and pull the dough' },
  wink:     { emoji: '😉', tag: 'Tap the eye when the face looks at you' },
  amp:      { emoji: '🎸', tag: 'Drag the aux cord into the amp' },
  spray:    { emoji: '💈', tag: 'Hold until the hair stops moving' },
  dig:      { emoji: '🏖️', tag: 'Swipe to find the buried treasure' },
  cover:    { emoji: '☔', tag: 'Drag the umbrella over the pedestrian' },
  tune:     { emoji: '📻', tag: 'Rotate until the static clears' },
  swig:     { emoji: '🥤', tag: 'Tilt back to drink the soda' },
  seal:     { emoji: '✉️', tag: 'Swipe to seal the envelope' },
  wrap:     { emoji: '🎁', tag: 'Tap the four corners to wrap the gift' },
  burst:    { emoji: '🎆', tag: 'Tap the firework at its peak' },
  melt:     { emoji: '🧊', tag: 'Hold your finger on the ice cube' },
  unbox:    { emoji: '📦', tag: 'Swipe the cutter along the tape' },
  light:    { emoji: '🔥', tag: 'Swipe the match against the matchbox' },
  clip:     { emoji: '✂️', tag: 'Tap when the clipper is over the nail' },
  paddle:   { emoji: '🏓', tag: 'Swipe to return the ping pong ball' },
  grip:     { emoji: '🏋️', tag: 'Hold for 3 seconds' },
  launch:   { emoji: '🚀', tag: 'Tap exactly at countdown zero' },
  shake:    { emoji: '🍸', tag: 'Shake the phone to mix the martini' },
  flick:    { emoji: '🐞', tag: 'Flick the ladybug off the blanket' },
  plant:    { emoji: '🌱', tag: 'Tap holes and drag seeds into them' },
  score:    { emoji: '🏒', tag: 'Swipe the puck past the goalie' },
  sew:      { emoji: '🧷', tag: 'Tap the dots in sequence' },
  brush:    { emoji: '🦷', tag: 'Swipe to brush your teeth' },
  erase:    { emoji: '📝', tag: 'Rub to erase the drawing' },
  spin:     { emoji: '🎡', tag: 'Swipe to spin the merry-go-round' },
  lock:     { emoji: '🗝️', tag: 'Drag the key in and rotate' },
  squash:   { emoji: '🥔', tag: 'Tap the masher 5 times' },
  win:      { emoji: '🏆', tag: 'Tap the WIN button before time runs out' },
};

// Navigate to a random game, excluding the current one
function shuffle() {
  const current = location.pathname.replace(/\/$/, '').split('/').pop();
  const pool = GAMES.filter(g => g !== current);
  const next = pool[Math.floor(Math.random() * pool.length)];
  window.location.href = `/gaems/vol2/${next}/`;
}

// Share this game via Web Share API, falling back to clipboard copy
async function shareGame(slug) {
  const url = `https://71dpi.github.io/gaems/vol2/#${slug}`;
  const data = { url, title: slug.toUpperCase() };
  try {
    if (navigator.share) {
      await navigator.share(data);
    } else {
      await navigator.clipboard.writeText(url);
      showToast('Link copied!');
    }
  } catch {
    // user cancelled share — do nothing
  }
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '5rem', left: '50%',
    transform: 'translateX(-50%)',
    background: '#000', color: '#fff',
    padding: '0.5rem 1.25rem', borderRadius: '99px',
    fontFamily: 'Inter, sans-serif', fontWeight: '700',
    fontSize: '0.9rem', zIndex: 9999, pointerEvents: 'none',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

// Request device orientation permission (iOS 13+)
async function requestTilt() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const res = await DeviceOrientationEvent.requestPermission();
    return res === 'granted';
  }
  return true; // non-iOS always available
}

// Wire up the standard footer buttons — call after DOM ready
// pass the slug string for this game, e.g. wireFooter('shave')
function wireFooter(slug) {
  document.getElementById('btn-shuffle')?.addEventListener('click', shuffle);
  document.getElementById('btn-share')?.addEventListener('click', () => shareGame(slug));
}
