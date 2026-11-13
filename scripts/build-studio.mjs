import { build } from 'vite';

process.env.STUDIO_BASE_PATH = '/studio/';
process.env.VITE_STUDIO_STANDALONE ||= 'false';
process.env.VITE_STUDIO_GATEWAY_PROXY ||= 'true';
await build();
