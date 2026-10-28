import "reflect-metadata";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function bootstrap() {
  loadEnv(resolve(process.cwd(), "../../.env"));
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  // 部署后浏览器与 API 同源（Nginx 反代 /api），这里只需放行开发期与显式声明的来源
  const origins = (process.env.APP_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
