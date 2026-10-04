-- CreateEnum
CREATE TYPE "AgentContractStatus" AS ENUM ('DRAFT', 'ISSUED', 'SIGNED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "agent_contract_templates" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_contracts" (
    "id" UUID NOT NULL,
    "contract_number" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "template_id" UUID,
    "template_version" INTEGER,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "body_hash" TEXT,
    "status" "AgentContractStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "sign_deadline" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3),
    "issued_by_id" UUID,
    "first_viewed_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "signer_admin_user_id" UUID,
    "signer_name" TEXT,
    "signer_national_code" TEXT,
    "signer_phone" TEXT,
    "signer_ip" TEXT,
    "signer_user_agent" TEXT,
    "signature_hash" TEXT,
    "otp_hash" TEXT,
    "otp_expires_at" TIMESTAMP(3),
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "otp_sent_at" TIMESTAMP(3),
    "otp_send_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_contract_events" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_contract_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_contracts_contract_number_key" ON "agent_contracts"("contract_number");

-- CreateIndex
CREATE INDEX "agent_contracts_agent_id_status_idx" ON "agent_contracts"("agent_id", "status");

-- CreateIndex
CREATE INDEX "agent_contracts_status_created_at_idx" ON "agent_contracts"("status", "created_at");

-- CreateIndex
CREATE INDEX "agent_contract_events_contract_id_created_at_idx" ON "agent_contract_events"("contract_id", "created_at");

-- AddForeignKey
ALTER TABLE "agent_contracts" ADD CONSTRAINT "agent_contracts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_contracts" ADD CONSTRAINT "agent_contracts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "agent_contract_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_contract_events" ADD CONSTRAINT "agent_contract_events_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "agent_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

