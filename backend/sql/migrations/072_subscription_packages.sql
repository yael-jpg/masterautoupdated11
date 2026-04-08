CREATE TABLE IF NOT EXISTS subscription_packages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  duration VARCHAR(80) NOT NULL,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  status BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_packages_status ON subscription_packages(status);
CREATE INDEX IF NOT EXISTS idx_subscription_packages_created_at ON subscription_packages(created_at DESC);
