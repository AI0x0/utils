import { defineConfig } from 'dumi';

const isWin = process.platform === 'win32';

const themeConfig = {
  footer: false,
  logo: '/images/logo.svg',
  metadata: {
    icons: {
      apple: '/images/logo.svg',
      icon: '/images/logo.svg',
      shortcut: '/images/logo.svg',
    },
  },
};

export default defineConfig({
  extraBabelPlugins: ['babel-plugin-antd-style'],
  mfsu: isWin ? undefined : {},
  npmClient: 'pnpm',
  outputPath: 'docs-dist',
  styles: [
    `html, body { background: transparent;  }

  @media (prefers-color-scheme: dark) {
    html, body { background: #000; }
  }`,
  ],
  themeConfig,
  title: 'AI0x0 Utils',
});
