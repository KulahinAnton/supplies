import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Global because every resource module will inject it, and threading an import
 * through forty modules communicates nothing. This is the one exception —
 * anything else that wants to be global should be argued for individually.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
