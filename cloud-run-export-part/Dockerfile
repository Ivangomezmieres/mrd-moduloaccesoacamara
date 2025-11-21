# Usar imagen oficial de Node 18
FROM node:18-slim

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Exponer puerto 8080 (estándar de Cloud Run)
EXPOSE 8080

# Variables de entorno por defecto
ENV PORT=8080
ENV NODE_ENV=production

# Comando de inicio
CMD ["npm", "start"]
