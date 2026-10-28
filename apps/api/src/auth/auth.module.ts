import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

function readSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = resolve(process.cwd(), "../../.env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.startsWith("JWT_SECRET=")) return line.slice("JWT_SECRET=".length).trim();
    }
  }
  return "dev-only-change-me";
}

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: readSecret(),
      signOptions: { expiresIn: "12h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
