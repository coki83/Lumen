// Every translation Lumen ships with. English is the source: a key missing from another language
// simply shows the English text, so a half finished translation is still usable.
import { en } from './en';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { pt } from './pt';
import { pl } from './pl';
import { tr } from './tr';
import { ru } from './ru';
import { mk } from './mk';
import { sr } from './sr';
import { hr } from './hr';

export const DICTS: Record<string, Record<string, string>> = { en, de, es, fr, it, pt, pl, tr, ru, mk, sr, hr };
