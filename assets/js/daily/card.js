// What the score card says and shows, as plain data. A pure function so the layout choices are tested;
// card-draw.js turns the result into pixels. No DOM. (docs/DAILY_SPEC.md, "v3.2: score card share")
import { MODE_LABEL } from './config.js';

/** Square colours: the share text's green and red squares, in the site palette (CLAUDE.md rule 6). */
export const WIN_COLOR = '#3f7a34'; // bush green
export const LOSS_COLOR = '#c94a32'; // hat red
export const FOOTER = 'gnomesweetgnome.app';

/** The file the card is saved or shared as. */
export const cardFileName = (number, mode) => `gnome-sweet-gnome-${number}-${mode}.png`;

/**
 * { number, mode, score, tries, hint, archive, beat, streak } -> what the card shows. `tries` is [{ won }].
 * `beat` is a whole number or null (the card shows the line exactly when the share text does). `streak` is the
 * current streak for the mode; it shows from 2 up, and never on archive days.
 */
export function cardModel({ number, mode, score, tries, hint, archive = false, beat = null, streak = 0 }) {
  const showBeat = Number.isInteger(beat) && beat >= 0 && beat <= 100;
  const showStreak = !archive && Number.isInteger(streak) && streak >= 2;
  return {
    wordmark: 'Gnome Sweet Gnome',
    title: `#${number}${archive ? ' (archive)' : ''} ${MODE_LABEL[mode] ?? mode}`,
    score: `${score}/100`,
    hint: Boolean(hint),
    squares: tries.map((t) => ({ won: Boolean(t.won), color: t.won ? WIN_COLOR : LOSS_COLOR })),
    caption: score >= 100 ? 'Fenced in perfectly.' : score > 0 ? 'Fenced in.' : 'He made it home.',
    beat: showBeat ? `Beat ${beat}% of players` : null,
    streak: showStreak ? `${streak}-day streak` : null,
    toad: score === 0 ? 'toad-front-smug' : 'toad-front-point', // he won on a 0
    footer: FOOTER,
    fileName: cardFileName(number, mode),
  };
}
