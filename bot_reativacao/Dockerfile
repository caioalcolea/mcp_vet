FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./

# Instalar todas as dependências (incluindo devDependencies para build)
RUN npm install

# Copiar código fonte
COPY src ./src

# Build da aplicação
RUN npm run build

# Copiar arquivos estáticos para dist
RUN cp -r src/public dist/public

# Limpar devDependencies após build
RUN npm prune --production

# Expor porta
EXPOSE 2080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:2080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicialização
CMD ["npm", "start"]
