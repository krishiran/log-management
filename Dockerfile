FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
# ใช้ npm ci (ติดตั้งตรงตาม lockfile) ถ้ามี package-lock.json ไม่มีก็ใช้ npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

EXPOSE 3000

# เริ่มต้น: สร้าง/อัปเดตตาราง + ผู้ใช้เริ่มต้น แล้วค่อยเปิดเว็บ (ตัวรับ syslog แยกเป็นอีก service ใน docker-compose)
CMD ["sh", "-c", "node scripts/init.js && exec node_modules/.bin/next start -H 0.0.0.0 -p 3000"]
