CREATE TABLE IF NOT EXISTS landing_chat_threads (
  id SERIAL PRIMARY KEY,
  visitor_token VARCHAR(128) NOT NULL UNIQUE,
  visitor_name VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS landing_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id INT NOT NULL REFERENCES landing_chat_threads(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('visitor', 'system', 'superadmin')),
  sender_label VARCHAR(120),
  message TEXT NOT NULL,
  is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_chat_threads_last_message_at
  ON landing_chat_threads(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_chat_messages_thread_created
  ON landing_chat_messages(thread_id, created_at ASC);
