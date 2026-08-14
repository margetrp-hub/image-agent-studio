import { build } from 'vite';

process.env.STUDIO_BASE_PATH = '/studio/';
process.env.VITE_STUDIO_STANDALONE = 'true';
await build();
