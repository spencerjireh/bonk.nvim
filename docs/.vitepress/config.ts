import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'bonk.nvim',
    description: 'AI code completion for Neovim, powered by Claude',
    base: '/bonk.nvim/',

    themeConfig: {
      nav: [
        { text: 'Guide', link: '/guide/architecture' },
        { text: 'Reference', link: '/reference/api' },
        { text: 'GitHub', link: 'https://github.com/spencerjireh/bonk.nvim' },
      ],

      sidebar: [
        {
          text: 'Guide',
          items: [
            { text: 'Architecture', link: '/guide/architecture' },
            { text: 'Context Strategy', link: '/guide/context' },
            { text: 'Completions', link: '/guide/completions' },
            { text: 'Chat', link: '/guide/chat' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Server API', link: '/reference/api' },
            { text: 'Configuration', link: '/reference/configuration' },
          ],
        },
      ],

      socialLinks: [
        { icon: 'github', link: 'https://github.com/spencerjireh/bonk.nvim' },
      ],

      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright 2026 Spencer Jireh G. Cebrian',
      },
    },
  }),
)
