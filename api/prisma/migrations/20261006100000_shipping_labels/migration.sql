-- CreateEnum
CREATE TYPE "LabelRepeat" AS ENUM ('ORDER', 'ITEM', 'UNIT');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "label_print_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "label_printed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "label_sizes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "width_mm" DOUBLE PRECISION NOT NULL,
    "height_mm" DOUBLE PRECISION NOT NULL,
    "dpi" INTEGER NOT NULL DEFAULT 203,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "label_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repeat" "LabelRepeat" NOT NULL DEFAULT 'ORDER',
    "size_id" UUID NOT NULL,
    "elements" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "label_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "label_templates_size_id_idx" ON "label_templates"("size_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode");

-- AddForeignKey
ALTER TABLE "label_templates" ADD CONSTRAINT "label_templates_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "label_sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
