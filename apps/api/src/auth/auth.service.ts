import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import { ROLE_LABEL } from "@product360/shared";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async profile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { scopes: { select: { scopeType: true, scopeCode: true } } },
    });
    if (!user) throw new UnauthorizedException("请先登录");
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleLabel: ROLE_LABEL[user.role],
      canViewCommercial: user.canViewCommercial,
      scopes: user.scopes.map((scope) => ({
        scopeType: scope.scopeType,
        scopeCode: scope.scopeCode,
      })),
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException("邮箱或密码不正确");
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return { accessToken, user: await this.profile(user.id) };
  }

  me(userId: string) {
    return this.profile(userId);
  }
}
