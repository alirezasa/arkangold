-- چت آنلاین پشتیبانی (جایگزین گفتینو): تنظیمات، دپارتمان‌ها، اپراتورها، بازدیدکنندگان و توکن‌های
-- دستگاه، گفتگوها و پیام‌ها، منوی ربات (پاسخ‌های آماده)، پاسخ‌های سریع، پایگاه دانش حالت هوشمند،
-- پرسش‌های بی‌پاسخ و پیام‌های خودکار.
-- CreateEnum
CREATE TYPE "LivechatOperatorStatus" AS ENUM ('ONLINE', 'AWAY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "LivechatConversationStatus" AS ENUM ('BOT', 'WAITING', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "LivechatSenderType" AS ENUM ('VISITOR', 'OPERATOR', 'BOT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LivechatMessageType" AS ENUM ('TEXT', 'FILE', 'OPTIONS', 'EVENT', 'RATING', 'FORM');

-- CreateEnum
CREATE TYPE "LivechatBotAction" AS ENUM ('MENU', 'ANSWER', 'HANDOFF', 'LINK', 'MAIN_MENU', 'CLOSE');

-- CreateTable
CREATE TABLE "livechat_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livechat_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livechat_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_operators" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "title" TEXT,
    "avatar_url" TEXT,
    "status" "LivechatOperatorStatus" NOT NULL DEFAULT 'OFFLINE',
    "max_concurrent_chats" INTEGER NOT NULL DEFAULT 5,
    "accepts_auto_assign" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livechat_operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_operator_departments" (
    "operator_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,

    CONSTRAINT "livechat_operator_departments_pkey" PRIMARY KEY ("operator_id","department_id")
);

-- CreateTable
CREATE TABLE "livechat_visitors" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "banned_reason" TEXT,
    "banned_at" TIMESTAMP(3),
    "last_ip" TEXT,
    "user_agent" TEXT,
    "current_url" TEXT,
    "current_title" TEXT,
    "referrer" TEXT,
    "visits_count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livechat_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_visitor_sessions" (
    "id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "livechat_visitor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_conversations" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "visitor_id" UUID NOT NULL,
    "status" "LivechatConversationStatus" NOT NULL DEFAULT 'BOT',
    "department_id" UUID,
    "operator_id" UUID,
    "subject" TEXT,
    "is_offline" BOOLEAN NOT NULL DEFAULT false,
    "is_missed" BOOLEAN NOT NULL DEFAULT false,
    "start_url" TEXT,
    "bot_node_id" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" INTEGER,
    "rating_comment" TEXT,
    "rated_at" TIMESTAMP(3),
    "unread_by_operator" INTEGER NOT NULL DEFAULT 0,
    "unread_by_visitor" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_preview" TEXT,
    "last_visitor_msg_at" TIMESTAMP(3),
    "queued_at" TIMESTAMP(3),
    "assigned_at" TIMESTAMP(3),
    "first_response_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livechat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_type" "LivechatSenderType" NOT NULL,
    "operator_id" UUID,
    "type" "LivechatMessageType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "client_message_id" TEXT,
    "attachment_key" TEXT,
    "attachment_name" TEXT,
    "attachment_mime" TEXT,
    "attachment_size" INTEGER,
    "seen_at" TIMESTAMP(3),
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "livechat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_bot_nodes" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "label" TEXT NOT NULL,
    "action" "LivechatBotAction" NOT NULL DEFAULT 'MENU',
    "reply_text" TEXT,
    "url" TEXT,
    "department_id" UUID,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livechat_bot_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_canned_responses" (
    "id" UUID NOT NULL,
    "shortcut" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "operator_id" UUID,
    "department_id" UUID,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livechat_canned_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_knowledge_items" (
    "id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "variants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answer" TEXT NOT NULL,
    "follow_up_node_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "helpful" INTEGER NOT NULL DEFAULT 0,
    "not_helpful" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livechat_knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_unanswered" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "conversation_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "last_asked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "livechat_unanswered_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livechat_triggers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url_contains" TEXT,
    "delay_seconds" INTEGER NOT NULL DEFAULT 15,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "only_when_online" BOOLEAN NOT NULL DEFAULT false,
    "open_widget" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livechat_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "livechat_operators_admin_user_id_key" ON "livechat_operators"("admin_user_id");

-- CreateIndex
CREATE INDEX "livechat_operator_departments_department_id_idx" ON "livechat_operator_departments"("department_id");

-- CreateIndex
CREATE INDEX "livechat_visitors_user_id_idx" ON "livechat_visitors"("user_id");

-- CreateIndex
CREATE INDEX "livechat_visitors_phone_idx" ON "livechat_visitors"("phone");

-- CreateIndex
CREATE INDEX "livechat_visitors_last_seen_at_idx" ON "livechat_visitors"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "livechat_visitor_sessions_token_hash_key" ON "livechat_visitor_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "livechat_visitor_sessions_visitor_id_idx" ON "livechat_visitor_sessions"("visitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "livechat_conversations_number_key" ON "livechat_conversations"("number");

-- CreateIndex
CREATE INDEX "livechat_conversations_visitor_id_status_idx" ON "livechat_conversations"("visitor_id", "status");

-- CreateIndex
CREATE INDEX "livechat_conversations_status_last_message_at_idx" ON "livechat_conversations"("status", "last_message_at");

-- CreateIndex
CREATE INDEX "livechat_conversations_operator_id_status_idx" ON "livechat_conversations"("operator_id", "status");

-- CreateIndex
CREATE INDEX "livechat_conversations_created_at_idx" ON "livechat_conversations"("created_at");

-- CreateIndex
CREATE INDEX "livechat_messages_conversation_id_created_at_idx" ON "livechat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "livechat_messages_conversation_id_client_message_id_key" ON "livechat_messages"("conversation_id", "client_message_id");

-- CreateIndex
CREATE INDEX "livechat_bot_nodes_parent_id_sort_order_idx" ON "livechat_bot_nodes"("parent_id", "sort_order");

-- CreateIndex
CREATE INDEX "livechat_canned_responses_operator_id_idx" ON "livechat_canned_responses"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "livechat_unanswered_normalized_key" ON "livechat_unanswered"("normalized");

-- CreateIndex
CREATE INDEX "livechat_unanswered_resolved_at_count_idx" ON "livechat_unanswered"("resolved_at", "count");

-- AddForeignKey
ALTER TABLE "livechat_operators" ADD CONSTRAINT "livechat_operators_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_operator_departments" ADD CONSTRAINT "livechat_operator_departments_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "livechat_operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_operator_departments" ADD CONSTRAINT "livechat_operator_departments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "livechat_departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_visitors" ADD CONSTRAINT "livechat_visitors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_visitor_sessions" ADD CONSTRAINT "livechat_visitor_sessions_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "livechat_visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_conversations" ADD CONSTRAINT "livechat_conversations_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "livechat_visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_conversations" ADD CONSTRAINT "livechat_conversations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "livechat_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_conversations" ADD CONSTRAINT "livechat_conversations_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "livechat_operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_messages" ADD CONSTRAINT "livechat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "livechat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_messages" ADD CONSTRAINT "livechat_messages_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "livechat_operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_bot_nodes" ADD CONSTRAINT "livechat_bot_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "livechat_bot_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_bot_nodes" ADD CONSTRAINT "livechat_bot_nodes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "livechat_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_canned_responses" ADD CONSTRAINT "livechat_canned_responses_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "livechat_operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livechat_canned_responses" ADD CONSTRAINT "livechat_canned_responses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "livechat_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

