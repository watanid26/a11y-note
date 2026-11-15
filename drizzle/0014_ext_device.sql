CREATE TABLE "a11y"."ext_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ext_device_token_uq" ON "a11y"."ext_device" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ext_device_owner_idx" ON "a11y"."ext_device" USING btree ("owner_email");--> statement-breakpoint
ALTER TABLE "a11y"."ext_device" ENABLE ROW LEVEL SECURITY;