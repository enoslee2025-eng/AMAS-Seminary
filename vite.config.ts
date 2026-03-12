import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isUserPagesRepo = repositoryName?.endsWith('.github.io');
const base = repositoryName ? (isUserPagesRepo ? '/' : `/${repositoryName}/`) : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
});
