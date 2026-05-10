ALTER TABLE public.relay_messages ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.relay_messages ADD COLUMN IF NOT EXISTS draft_mode BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.relay_messages ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.relay_messages ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

UPDATE public.relay_messages
SET is_draft = false, draft_mode = false
WHERE sender_type = 'customer';

CREATE INDEX IF NOT EXISTS relay_messages_conversation_draft_idx
  ON public.relay_messages(conversation_id, is_draft, created_at);
