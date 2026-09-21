/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // O modo de desenvolvimento e o build de produção gravam em pastas
  // diferentes. Se dividissem a mesma, rodar `next dev` sobrescreveria os
  // pedaços do build e o `next start` seguinte quebraria com "Cannot find
  // module './XXX.js'".
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  // better-sqlite3 é um módulo nativo: não pode ser empacotado pelo bundler.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
