-- Add unique access token for company-specific onboarding links
ALTER TABLE onboarding_sessions 
ADD COLUMN IF NOT EXISTS access_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex');

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_access_token ON onboarding_sessions(access_token);