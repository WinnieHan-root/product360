import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { IsEmail, IsString, MinLength } from "class-validator";
import type { AuthUser } from "../common/auth-user";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get("me")
  me(@Req() req: { user: AuthUser }) {
    return this.auth.me(req.user.id);
  }
}
