import { build } from 'vite';

process.env.STUDIO_BASE_PATH = '/studio/';
await build();
