import path from 'path';

export const HOME = process.env.HOME || '/Users/bellette';
export const OPENCLAW_DIR = path.join(HOME, '.openclaw');
export const AGENTS_DIR = path.join(OPENCLAW_DIR, 'agents');
