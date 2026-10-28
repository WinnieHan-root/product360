import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC } from "./public.decorator";
import { PrismaService } from "../common/prisma.service";
import type { AuthUser } from "../common/auth-user";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: AuthUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("请先登录");
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(header.slice(7));
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException("请先登录");
      request.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        canViewCommercial: user.canViewCommercial,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("登录已失效");
    }
  }
}
