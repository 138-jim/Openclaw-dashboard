/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  env: {
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SLACK_NOTIFY_USER: process.env.SLACK_NOTIFY_USER,
  },
}
module.exports = nextConfig
