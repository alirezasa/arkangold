// api/src/common/file-security/file-security.module.ts
import { Global, Module } from '@nestjs/common';
import { AntivirusService } from './antivirus.service';
import { FileSecurityService } from './file-security.service';

@Global()
@Module({
  providers: [AntivirusService, FileSecurityService],
  exports: [AntivirusService, FileSecurityService],
})
export class FileSecurityModule {}
