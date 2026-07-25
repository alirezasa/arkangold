import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProductImage } from '../generated/prisma/client';

const PUBLIC_URL_PREFIX = '/uploads/products';

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);

  constructor(private prisma: PrismaService) {}

  async addImages(
    productId: string,
    files: Express.Multer.File[],
  ): Promise<ProductImage[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('محصول یافت نشد');
    if (!files || files.length === 0) {
      throw new BadRequestException('هیچ فایلی ارسال نشده است');
    }

    const existingCount = await this.prisma.productImage.count({
      where: { productId },
    });
    const alreadyHasPrimary =
      existingCount > 0 &&
      (await this.prisma.productImage.count({
        where: { productId, isPrimary: true },
      })) > 0;

    const created: ProductImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const image = await this.prisma.productImage.create({
        data: {
          productId,
          url: `${PUBLIC_URL_PREFIX}/${file.filename}`,
          fileSize: file.size,
          mimeType: file.mimetype,
          sortOrder: existingCount + i,
          isPrimary: !alreadyHasPrimary && existingCount === 0 && i === 0,
        },
      });
      created.push(image);
    }
    return created;
  }

  async listImages(productId: string) {
    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async setPrimary(imageId: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image) throw new NotFoundException('تصویر یافت نشد');

    await this.prisma.$transaction([
      this.prisma.productImage.updateMany({
        where: { productId: image.productId },
        data: { isPrimary: false },
      }),
      this.prisma.productImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
    ]);

    return { message: 'تصویر اصلی تنظیم شد' };
  }

  async updateAlt(imageId: string, altText: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image) throw new NotFoundException('تصویر یافت نشد');
    return this.prisma.productImage.update({
      where: { id: imageId },
      data: { altText },
    });
  }

  async reorder(productId: string, orderedIds: string[]) {
    const images = await this.prisma.productImage.findMany({
      where: { productId },
    });
    const validIds = new Set(images.map((i) => i.id));
    for (const id of orderedIds) {
      if (!validIds.has(id))
        throw new BadRequestException('شناسه تصویر نامعتبر است');
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.productImage.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return { message: 'ترتیب تصاویر بروزرسانی شد' };
  }

  async deleteImage(imageId: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image) throw new NotFoundException('تصویر یافت نشد');

    await this.prisma.productImage.delete({ where: { id: imageId } });

    const filePath = path.join(
      process.cwd(),
      'uploads',
      'products',
      path.basename(image.url),
    );
    fs.unlink(filePath).catch(() => {
      this.logger.warn(`حذف فایل فیزیکی ${filePath} ناموفق بود`);
    });

    if (image.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId: image.productId },
        orderBy: { sortOrder: 'asc' },
      });
      if (next) {
        await this.prisma.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { message: 'تصویر حذف شد' };
  }
}
